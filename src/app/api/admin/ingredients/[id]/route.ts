import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, apiError, authFailureResponse, serverError, ERROR_CODES, parseId } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { execute, queryOne } from '@/lib/db';
import { ingredientSchema, firstErrorMessage } from '@/lib/validation';

/** พารามิเตอร์เส้นทางของ Next.js 15 เป็น Promise จึงต้อง await ก่อนใช้ */
type RouteContext = { params: Promise<{ id: string }> };

/**
 * แก้ข้อมูลวัตถุดิบ (ชื่อ หน่วย ต้นทุนต่อหน่วย เกณฑ์เตือน) ใช้ได้เฉพาะแอดมิน
 * ต้นทุนที่แก้มีผลกับออเดอร์ใหม่เท่านั้น ต้นทุนของออเดอร์เก่าถูกแช่แข็งไว้แล้ว
 *
 * @param request - คำขอที่มี body ตาม ingredientSchema
 * @param context - พารามิเตอร์เส้นทางที่มี id ของวัตถุดิบ
 * @returns id ที่แก้ หรือ error พร้อมข้อความไทย
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireStaff('ADMIN');
  if (!auth.ok) return authFailureResponse(auth.reason);

  const id = parseId((await context.params).id);
  if (!id) return apiError(ERROR_CODES.VALIDATION_ERROR, 'รหัสวัตถุดิบไม่ถูกต้อง');

  const parsed = ingredientSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, firstErrorMessage(parsed.error));
  }

  try {
    const { name, unit, costPerUnit, lowStockThreshold, isActive } = parsed.data;
    const result = await execute(
      `UPDATE ingredients
          SET name = ?, unit = ?, cost_per_unit = ?, low_stock_threshold = ?, is_active = ?
        WHERE id = ?`,
      [name, unit, costPerUnit, lowStockThreshold ?? null, isActive ? 1 : 0, id],
    );
    if (result.affectedRows === 0) {
      return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบวัตถุดิบนี้ อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า', 404);
    }
    return apiOk({ id });
  } catch (err) {
    if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
      return apiError(ERROR_CODES.VALIDATION_ERROR, 'มีวัตถุดิบชื่อนี้อยู่แล้ว กรุณาใช้ชื่ออื่น', 409);
    }
    return serverError(err, 'PUT /api/admin/ingredients/[id]');
  }
}

/**
 * ลบวัตถุดิบ ถ้าอยู่ในสูตรหรือมีประวัติเข้าออกแล้วจะเปลี่ยนเป็นปิดใช้งานแทน
 * เพื่อไม่ให้สูตรของเมนูและประวัติสต๊อกย้อนหลังหายไป
 *
 * @param _request - ไม่ได้ใช้ body
 * @param context - พารามิเตอร์เส้นทางที่มี id ของวัตถุดิบ
 * @returns mode บอกว่าลบจริงหรือปิดใช้ พร้อมข้อความอธิบาย
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await requireStaff('ADMIN');
  if (!auth.ok) return authFailureResponse(auth.reason);

  const id = parseId((await context.params).id);
  if (!id) return apiError(ERROR_CODES.VALIDATION_ERROR, 'รหัสวัตถุดิบไม่ถูกต้อง');

  try {
    const usage = await queryOne<RowDataPacket & { recipes: number; logs: number }>(
      `SELECT (SELECT COUNT(*) FROM menu_recipes WHERE ingredient_id = ?) AS recipes,
              (SELECT COUNT(*) FROM ingredient_stock_logs WHERE ingredient_id = ?) AS logs`,
      [id, id],
    );
    const recipes = Number(usage?.recipes ?? 0);
    const logs = Number(usage?.logs ?? 0);

    if (recipes > 0 || logs > 0) {
      const result = await execute('UPDATE ingredients SET is_active = 0 WHERE id = ?', [id]);
      if (result.affectedRows === 0) {
        return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบวัตถุดิบนี้ กรุณารีเฟรชหน้า', 404);
      }
      return apiOk({
        mode: 'DEACTIVATED' as const,
        message:
          recipes > 0
            ? `วัตถุดิบนี้อยู่ในสูตร ${recipes} เมนู จึงเปลี่ยนเป็นปิดใช้งานแทนการลบ ระบบจะไม่นับต้นทุนและไม่ตัดยอดตัวนี้อีก`
            : 'วัตถุดิบนี้มีประวัติเข้าออกแล้ว จึงเปลี่ยนเป็นปิดใช้งานแทนการลบ เพื่อเก็บประวัติไว้ตรวจย้อนหลัง',
      });
    }

    const result = await execute('DELETE FROM ingredients WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบวัตถุดิบนี้ กรุณารีเฟรชหน้า', 404);
    }
    return apiOk({ mode: 'DELETED' as const, message: 'ลบวัตถุดิบเรียบร้อยแล้ว' });
  } catch (err) {
    return serverError(err, 'DELETE /api/admin/ingredients/[id]');
  }
}
