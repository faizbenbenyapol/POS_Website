import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, apiError, authFailureResponse, serverError, ERROR_CODES } from '@/lib/api';
import { requireCapability, requireStaff } from '@/lib/auth';
import { execute, query } from '@/lib/db';
import { getBranchById, getEffectiveBranchId } from '@/lib/branch';
import { isIngredientLow } from '@/lib/recipe';
import { ingredientSchema, firstErrorMessage } from '@/lib/validation';

/** แถววัตถุดิบพร้อมยอดคงเหลือของสาขาที่กำลังดู */
type IngredientRow = RowDataPacket & {
  id: number;
  name: string;
  unit: string;
  cost_per_unit: string;
  low_stock_threshold: string | null;
  is_active: number;
  /** ยอดคงเหลือของสาขา null คือสาขานี้ยังไม่ได้นับวัตถุดิบตัวนี้ */
  quantity: string | null;
  recipe_count: number;
};

/**
 * อ่านรายการวัตถุดิบทั้งหมด พร้อมยอดคงเหลือของสาขาที่กำลังดู
 *
 * HQ Admin ที่ดูภาพรวมทุกสาขาจะเห็นรายชื่อและต้นทุน แต่ไม่มียอดคงเหลือ
 * เพราะยอดเป็นของแต่ละสาขา (หน้าจอจะให้เลือกสาขาก่อนรับของเข้าหรือปรับยอด)
 * เรียงวัตถุดิบที่ใกล้หมดหรือติดลบไว้บนสุด เพราะเป็นสิ่งแรกที่คนเปิดหน้านี้ต้องเห็น
 *
 * @param request - คำขอ อาจมี query branchId สำหรับ HQ Admin
 * @returns สาขาที่กำลังดูและรายการวัตถุดิบ
 */
export async function GET(request: NextRequest) {
  const auth = await requireCapability('ingredients.stock');
  if (!auth.ok) return authFailureResponse(auth.reason);

  try {
    const branchId = await getEffectiveBranchId(request, auth.user);
    const branch = branchId ? await getBranchById(branchId) : null;

    const rows = await query<IngredientRow>(
      `SELECT i.id, i.name, i.unit, i.cost_per_unit, i.low_stock_threshold, i.is_active,
              s.quantity,
              (SELECT COUNT(*) FROM menu_recipes r WHERE r.ingredient_id = i.id) AS recipe_count
         FROM ingredients i
         LEFT JOIN branch_ingredient_stock s ON s.ingredient_id = i.id AND s.branch_id = ?
        ORDER BY i.is_active DESC, i.name`,
      [branchId ?? 0],
    );

    const items = rows
      .map((row) => {
        const quantity = row.quantity === null ? null : Number(row.quantity);
        const threshold = row.low_stock_threshold === null ? null : Number(row.low_stock_threshold);
        return {
          id: row.id,
          name: row.name,
          unit: row.unit,
          costPerUnit: Number(row.cost_per_unit),
          lowStockThreshold: threshold,
          isActive: row.is_active === 1,
          quantity,
          isLow: quantity !== null && isIngredientLow(quantity, threshold),
          recipeCount: Number(row.recipe_count),
        };
      })
      .sort((a, b) => Number(b.isActive) - Number(a.isActive) || Number(b.isLow) - Number(a.isLow));

    return apiOk({
      branchId: branch?.id ?? null,
      branchName: branch?.name ?? null,
      items,
    });
  } catch (err) {
    return serverError(err, 'GET /api/admin/ingredients');
  }
}

/**
 * เพิ่มวัตถุดิบใหม่ในรายชื่อของแบรนด์ ใช้ได้เฉพาะแอดมินเพราะต้นทุนมีผลกับกำไรทุกเมนู
 *
 * @param request - คำขอที่มี body ตาม ingredientSchema
 * @returns id ของวัตถุดิบที่สร้าง หรือ error พร้อมข้อความไทย
 */
export async function POST(request: NextRequest) {
  const auth = await requireStaff('ADMIN');
  if (!auth.ok) return authFailureResponse(auth.reason);

  const parsed = ingredientSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, firstErrorMessage(parsed.error));
  }

  try {
    const { name, unit, costPerUnit, lowStockThreshold, isActive } = parsed.data;
    const result = await execute(
      `INSERT INTO ingredients (name, unit, cost_per_unit, low_stock_threshold, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [name, unit, costPerUnit, lowStockThreshold ?? null, isActive ? 1 : 0],
    );
    return apiOk({ id: result.insertId }, 201);
  } catch (err) {
    if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
      return apiError(ERROR_CODES.VALIDATION_ERROR, 'มีวัตถุดิบชื่อนี้อยู่แล้ว กรุณาใช้ชื่ออื่นหรือแก้ไขของเดิม', 409);
    }
    return serverError(err, 'POST /api/admin/ingredients');
  }
}
