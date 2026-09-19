import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, apiError, authFailureResponse, serverError, ERROR_CODES, parseId } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { query, queryOne, withTransaction } from '@/lib/db';
import { getEffectiveBranchId } from '@/lib/branch';
import { roundQty } from '@/lib/recipe';
import { ingredientStockSchema, firstErrorMessage } from '@/lib/validation';

/** พารามิเตอร์เส้นทางของ Next.js 15 เป็น Promise จึงต้อง await ก่อนใช้ */
type RouteContext = { params: Promise<{ id: string }> };

/** จำนวนประวัติล่าสุดที่แสดงต่อวัตถุดิบ */
const LOG_LIMIT = 50;

/**
 * อ่านประวัติการเข้าออกของวัตถุดิบในสาขาที่กำลังดู ล่าสุดก่อน
 *
 * @param request - คำขอ อาจมี query branchId สำหรับ HQ Admin
 * @param context - พารามิเตอร์เส้นทางที่มี id ของวัตถุดิบ
 * @returns ประวัติล่าสุดไม่เกิน 50 แถว พร้อมชื่อผู้ทำและรหัสออเดอร์ที่เกี่ยวข้อง
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireStaff();
  if (!auth.ok) return authFailureResponse(auth.reason);

  const ingredientId = parseId((await context.params).id);
  if (!ingredientId) return apiError(ERROR_CODES.VALIDATION_ERROR, 'รหัสวัตถุดิบไม่ถูกต้อง');

  const branchId = await getEffectiveBranchId(request, auth.user);
  if (!branchId) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, 'ประวัติวัตถุดิบเป็นของแต่ละสาขา กรุณาเลือกสาขาก่อน');
  }

  try {
    const logs = await query<RowDataPacket>(
      `SELECT l.id, l.change_type, l.quantity, l.qty_before, l.qty_after, l.unit_cost, l.note,
              l.created_at, u.full_name AS changed_by_name, o.order_code
         FROM ingredient_stock_logs l
         LEFT JOIN users u ON u.id = l.changed_by
         LEFT JOIN orders o ON o.id = l.order_id
        WHERE l.branch_id = ? AND l.ingredient_id = ?
        ORDER BY l.id DESC
        LIMIT ${LOG_LIMIT}`,
      [branchId, ingredientId],
    );
    return apiOk(logs);
  } catch (err) {
    return serverError(err, 'GET /api/admin/ingredients/[id]/stock');
  }
}

/**
 * แก้ยอดวัตถุดิบของสาขา พนักงานใช้ได้ เพราะคนที่รับของและนับของคือคนในครัว
 *
 * RECEIVE รับของเข้า (บวกเพิ่ม) / ADJUST ตั้งยอดตามที่นับได้จริง / WASTE ตัดของเสียทิ้ง
 * สาขาที่ยังไม่เคยนับวัตถุดิบตัวนี้จะเริ่มนับตั้งแต่คำสั่งนี้ (สร้างแถวยอดให้เอง)
 *
 * ต้นทุนต่อหน่วยที่แนบมากับการรับของ: ถ้าเป็นแอดมินจะอัปเดตเป็นต้นทุนล่าสุดของวัตถุดิบด้วย
 * ถ้าเป็นพนักงานจะบันทึกไว้ในประวัติอย่างเดียว เพราะต้นทุนกลางกระทบกำไรของทุกเมนูทุกสาขา
 *
 * @param request - คำขอที่มี body ตาม ingredientStockSchema
 * @param context - พารามิเตอร์เส้นทางที่มี id ของวัตถุดิบ
 * @returns ยอดก่อนและหลังแก้
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireStaff();
  if (!auth.ok) return authFailureResponse(auth.reason);

  const ingredientId = parseId((await context.params).id);
  if (!ingredientId) return apiError(ERROR_CODES.VALIDATION_ERROR, 'รหัสวัตถุดิบไม่ถูกต้อง');

  const branchId = await getEffectiveBranchId(request, auth.user);
  if (!branchId) {
    return apiError(
      ERROR_CODES.VALIDATION_ERROR,
      'ยอดวัตถุดิบเป็นของแต่ละสาขา กรุณาเลือกสาขาที่ต้องการก่อนรับของเข้าหรือปรับยอด',
    );
  }

  const parsed = ingredientStockSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, firstErrorMessage(parsed.error));
  }
  const { mode, quantity, unitCost, note } = parsed.data;

  try {
    const ingredient = await queryOne<RowDataPacket & { id: number; is_active: number }>(
      'SELECT id, is_active FROM ingredients WHERE id = ? LIMIT 1',
      [ingredientId],
    );
    if (!ingredient) return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบวัตถุดิบนี้ กรุณารีเฟรชหน้า', 404);
    if (ingredient.is_active !== 1) {
      return apiError(ERROR_CODES.VALIDATION_ERROR, 'วัตถุดิบนี้ถูกปิดใช้งานแล้ว เปิดใช้ก่อนจึงจะแก้ยอดได้', 409);
    }

    const result = await withTransaction(async (conn) => {
      // สร้างแถวยอดให้สาขาที่เพิ่งเริ่มนับ แล้วล็อกไว้ก่อนอ่านยอด กันสองคนแก้พร้อมกันแล้วยอดเพี้ยน
      await conn.execute(
        `INSERT INTO branch_ingredient_stock (branch_id, ingredient_id, quantity)
         VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE quantity = quantity`,
        [branchId, ingredientId],
      );
      const [rows] = await conn.execute<(RowDataPacket & { quantity: string })[]>(
        'SELECT quantity FROM branch_ingredient_stock WHERE branch_id = ? AND ingredient_id = ? FOR UPDATE',
        [branchId, ingredientId],
      );
      const before = Number(rows[0]?.quantity ?? 0);
      const after =
        mode === 'RECEIVE'
          ? roundQty(before + quantity)
          : mode === 'WASTE'
            ? roundQty(before - quantity)
            : roundQty(quantity);
      // ปรับยอดบันทึกส่วนต่าง (ติดลบได้) ส่วนรับเข้าและของเสียบันทึกจำนวนที่กรอก
      const logged = mode === 'ADJUST' ? roundQty(after - before) : quantity;

      await conn.execute(
        'UPDATE branch_ingredient_stock SET quantity = ? WHERE branch_id = ? AND ingredient_id = ?',
        [after, branchId, ingredientId],
      );
      await conn.execute(
        `INSERT INTO ingredient_stock_logs
           (branch_id, ingredient_id, change_type, quantity, qty_before, qty_after, unit_cost, changed_by, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          branchId,
          ingredientId,
          mode,
          logged,
          before,
          after,
          mode === 'RECEIVE' ? (unitCost ?? null) : null,
          auth.user.id,
          note || null,
        ],
      );
      if (mode === 'RECEIVE' && unitCost !== null && unitCost !== undefined && auth.user.role === 'ADMIN') {
        await conn.execute('UPDATE ingredients SET cost_per_unit = ? WHERE id = ?', [
          unitCost,
          ingredientId,
        ]);
      }
      return { before, after };
    });

    return apiOk({ ingredientId, branchId, ...result });
  } catch (err) {
    return serverError(err, 'POST /api/admin/ingredients/[id]/stock');
  }
}
