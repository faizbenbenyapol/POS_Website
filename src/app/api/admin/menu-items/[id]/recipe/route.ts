import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, apiError, authFailureResponse, serverError, ERROR_CODES, parseId } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { query, queryOne, withTransaction } from '@/lib/db';
import { grossMargin, recipeUnitCost } from '@/lib/recipe';
import { menuRecipeSchema, firstErrorMessage } from '@/lib/validation';

/** พารามิเตอร์เส้นทางของ Next.js 15 เป็น Promise จึงต้อง await ก่อนใช้ */
type RouteContext = { params: Promise<{ id: string }> };

/** บรรทัดสูตรพร้อมชื่อ หน่วย และต้นทุนต่อหน่วยของวัตถุดิบ */
type RecipeRow = RowDataPacket & {
  ingredient_id: number;
  name: string;
  unit: string;
  quantity: string;
  cost_per_unit: string;
  is_active: number;
};

/**
 * อ่านสูตรของเมนูพร้อมต้นทุนต่อจานและกำไรขั้นต้นเทียบกับราคาขายกลาง
 *
 * @param menuItemId - id ของเมนู
 * @returns สูตร ต้นทุนต่อจาน และกำไร หรือ null เมื่อไม่พบเมนู
 */
async function loadRecipe(menuItemId: number) {
  const menu = await queryOne<RowDataPacket & { price: string }>(
    'SELECT price FROM menu_items WHERE id = ? LIMIT 1',
    [menuItemId],
  );
  if (!menu) return null;

  const rows = await query<RecipeRow>(
    `SELECT r.ingredient_id, i.name, i.unit, r.quantity, i.cost_per_unit, i.is_active
       FROM menu_recipes r
       JOIN ingredients i ON i.id = r.ingredient_id
      WHERE r.menu_item_id = ?
      ORDER BY i.name`,
    [menuItemId],
  );
  const lines = rows.map((r) => ({
    ingredientId: r.ingredient_id,
    name: r.name,
    unit: r.unit,
    quantity: Number(r.quantity),
    costPerUnit: Number(r.cost_per_unit),
    isActive: r.is_active === 1,
  }));
  const unitCost = recipeUnitCost(lines.filter((l) => l.isActive));
  const price = Number(menu.price);
  return {
    price,
    lines,
    unitCost,
    margin: unitCost === null ? null : grossMargin(price, unitCost),
  };
}

/**
 * อ่านสูตรและต้นทุนต่อจานของเมนู
 *
 * @param _request - คำขอ ไม่ได้ใช้พารามิเตอร์ใด
 * @param context - พารามิเตอร์เส้นทางที่มี id ของเมนู
 * @returns สูตร ต้นทุนต่อจาน และกำไรขั้นต้น
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireStaff();
  if (!auth.ok) return authFailureResponse(auth.reason);

  const menuItemId = parseId((await context.params).id);
  if (!menuItemId) return apiError(ERROR_CODES.VALIDATION_ERROR, 'รหัสเมนูไม่ถูกต้อง');

  try {
    const recipe = await loadRecipe(menuItemId);
    if (!recipe) return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบเมนูนี้ กรุณารีเฟรชหน้า', 404);
    return apiOk(recipe);
  } catch (err) {
    return serverError(err, 'GET /api/admin/menu-items/[id]/recipe');
  }
}

/**
 * บันทึกสูตรของเมนูทั้งชุด (แทนที่ของเดิม) ใช้ได้เฉพาะแอดมิน
 * ออเดอร์เก่าไม่กระทบ เพราะต้นทุนถูกแช่แข็งใน order_items.unit_cost ตอนสั่ง
 * และการคืนวัตถุดิบตอนยกเลิกอ่านจากประวัติการตัด ไม่ได้อ่านจากสูตรปัจจุบัน
 *
 * @param request - คำขอที่มี body ตาม menuRecipeSchema ส่ง lines ว่างเพื่อลบสูตร
 * @param context - พารามิเตอร์เส้นทางที่มี id ของเมนู
 * @returns สูตรชุดใหม่พร้อมต้นทุนต่อจาน
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireStaff('ADMIN');
  if (!auth.ok) return authFailureResponse(auth.reason);

  const menuItemId = parseId((await context.params).id);
  if (!menuItemId) return apiError(ERROR_CODES.VALIDATION_ERROR, 'รหัสเมนูไม่ถูกต้อง');

  const parsed = menuRecipeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, firstErrorMessage(parsed.error));
  }

  try {
    const menu = await queryOne<RowDataPacket & { id: number }>(
      'SELECT id FROM menu_items WHERE id = ? LIMIT 1',
      [menuItemId],
    );
    if (!menu) return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบเมนูนี้ กรุณารีเฟรชหน้า', 404);

    const ingredientIds = parsed.data.lines.map((l) => l.ingredientId);
    if (ingredientIds.length > 0) {
      const found = await query<RowDataPacket & { id: number }>(
        `SELECT id FROM ingredients WHERE id IN (${ingredientIds.map(() => '?').join(',')})`,
        ingredientIds,
      );
      if (found.length !== ingredientIds.length) {
        return apiError(
          ERROR_CODES.VALIDATION_ERROR,
          'มีวัตถุดิบในสูตรที่ถูกลบไปแล้ว กรุณาปิดหน้าต่างแล้วเปิดใหม่',
          409,
        );
      }
    }

    await withTransaction(async (conn) => {
      await conn.execute('DELETE FROM menu_recipes WHERE menu_item_id = ?', [menuItemId]);
      for (const line of parsed.data.lines) {
        await conn.execute(
          'INSERT INTO menu_recipes (menu_item_id, ingredient_id, quantity) VALUES (?, ?, ?)',
          [menuItemId, line.ingredientId, line.quantity],
        );
      }
    });

    return apiOk(await loadRecipe(menuItemId));
  } catch (err) {
    return serverError(err, 'PUT /api/admin/menu-items/[id]/recipe');
  }
}
