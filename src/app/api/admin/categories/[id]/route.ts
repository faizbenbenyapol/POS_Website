import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, apiError, authFailureResponse, ERROR_CODES, parseId } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { execute, queryOne } from '@/lib/db';
import { categorySchema, firstErrorMessage } from '@/lib/validation';

/** พารามิเตอร์เส้นทางของ Next.js 15 เป็น Promise จึงต้อง await ก่อนใช้ */
type RouteContext = { params: Promise<{ id: string }> };

/**
 * แก้ไขหมวดหมู่ที่มีอยู่ ใช้ได้เฉพาะแอดมิน
 *
 * @param request - คำขอที่มี body เป็น JSON ตาม categorySchema
 * @param context - พารามิเตอร์เส้นทางที่มี id ของหมวดหมู่
 * @returns ผลสำเร็จ หรือ error เมื่อไม่พบหมวดหมู่หรือข้อมูลไม่ถูกต้อง
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireStaff('ADMIN');
  if (!auth.ok) return authFailureResponse(auth.reason);

  const id = parseId((await context.params).id);
  if (!id) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, 'รหัสหมวดหมู่ไม่ถูกต้อง กรุณากลับไปเลือกใหม่');
  }

  const parsed = categorySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, firstErrorMessage(parsed.error));
  }

  const { name, sortOrder, isActive } = parsed.data;
  const result = await execute(
    'UPDATE categories SET name = ?, sort_order = ?, is_active = ? WHERE id = ?',
    [name, sortOrder, isActive ? 1 : 0, id],
  );
  if (result.affectedRows === 0) {
    return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบหมวดหมู่นี้ อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า', 404);
  }
  return apiOk({ id });
}

/**
 * ลบหมวดหมู่ ถ้ายังมีเมนูผูกอยู่จะเปลี่ยนเป็นปิดใช้งานแทนการลบจริง
 * เพื่อไม่ให้ประวัติออเดอร์ที่อ้างถึงเมนูในหมวดนี้พัง
 *
 * @param _request - ไม่ได้ใช้ body แต่ต้องรับไว้ตามลายเซ็นของ route handler
 * @param context - พารามิเตอร์เส้นทางที่มี id ของหมวดหมู่
 * @returns mode บอกว่าลบจริงหรือปิดใช้งาน พร้อมข้อความอธิบายให้แสดงบนหน้าจอ
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await requireStaff('ADMIN');
  if (!auth.ok) return authFailureResponse(auth.reason);

  const id = parseId((await context.params).id);
  if (!id) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, 'รหัสหมวดหมู่ไม่ถูกต้อง กรุณากลับไปเลือกใหม่');
  }

  const usage = await queryOne<RowDataPacket & { menu_item_count: number }>(
    'SELECT COUNT(*) AS menu_item_count FROM menu_items WHERE category_id = ?',
    [id],
  );

  if ((usage?.menu_item_count ?? 0) > 0) {
    const result = await execute('UPDATE categories SET is_active = 0 WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบหมวดหมู่นี้ อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า', 404);
    }
    return apiOk({
      mode: 'DEACTIVATED' as const,
      message: `หมวดหมู่นี้มีเมนูอยู่ ${usage?.menu_item_count} รายการ จึงเปลี่ยนเป็นปิดใช้งานแทนการลบ เพื่อไม่ให้ประวัติออเดอร์เดิมเสียหาย`,
    });
  }

  const result = await execute('DELETE FROM categories WHERE id = ?', [id]);
  if (result.affectedRows === 0) {
    return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบหมวดหมู่นี้ อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า', 404);
  }
  return apiOk({ mode: 'DELETED' as const, message: 'ลบหมวดหมู่เรียบร้อยแล้ว' });
}
