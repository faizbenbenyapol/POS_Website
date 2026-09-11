import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, apiError, authFailureResponse, ERROR_CODES, parseId } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { execute, queryOne } from '@/lib/db';
import { menuItemSchema, firstErrorMessage } from '@/lib/validation';

/** พารามิเตอร์เส้นทางของ Next.js 15 เป็น Promise จึงต้อง await ก่อนใช้ */
type RouteContext = { params: Promise<{ id: string }> };

/**
 * แก้ไขเมนูที่มีอยู่ ราคาที่แก้จะมีผลกับออเดอร์ใหม่เท่านั้น
 * ออเดอร์เก่าใช้ราคาที่คัดลอกไว้ใน order_items จึงไม่เปลี่ยนย้อนหลัง
 *
 * @param request - คำขอที่มี body เป็น JSON ตาม menuItemSchema
 * @param context - พารามิเตอร์เส้นทางที่มี id ของเมนู
 * @returns ผลสำเร็จ หรือ error เมื่อไม่พบเมนูหรือข้อมูลไม่ถูกต้อง
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireStaff('ADMIN');
  if (!auth.ok) return authFailureResponse(auth.reason);

  const id = parseId((await context.params).id);
  if (!id) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, 'รหัสเมนูไม่ถูกต้อง กรุณากลับไปเลือกใหม่');
  }

  const parsed = menuItemSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, firstErrorMessage(parsed.error));
  }

  const { categoryId, name, description, price, imageUrl, isAvailable } = parsed.data;
  const result = await execute(
    `UPDATE menu_items
        SET category_id = ?, name = ?, description = ?, price = ?, image_url = ?, is_available = ?
      WHERE id = ?`,
    [categoryId, name, description || null, price, imageUrl || null, isAvailable ? 1 : 0, id],
  );
  if (result.affectedRows === 0) {
    return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบเมนูนี้ อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า', 404);
  }
  return apiOk({ id });
}

/**
 * สลับสถานะ มีขาย / หมด ของเมนูอาหาร
 * ทั้ง ADMIN และ STAFF สามารถกดสลับได้ เพื่อให้พนักงานหน้าร้านและครัวแจ้งของหมดได้ทันที
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireStaff();
  if (!auth.ok) return authFailureResponse(auth.reason);

  const id = parseId((await context.params).id);
  if (!id) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, 'รหัสเมนูไม่ถูกต้อง กรุณากลับไปเลือกใหม่');
  }

  const body = (await request.json().catch(() => ({}))) as { isAvailable?: boolean };
  if (typeof body.isAvailable !== 'boolean') {
    return apiError(ERROR_CODES.VALIDATION_ERROR, 'สถานะความพร้อมจำหน่ายไม่ถูกต้อง');
  }

  const result = await execute('UPDATE menu_items SET is_available = ? WHERE id = ?', [
    body.isAvailable ? 1 : 0,
    id,
  ]);

  if (result.affectedRows === 0) {
    return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบเมนูนี้ อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า', 404);
  }

  return apiOk({ id, isAvailable: body.isAvailable });
}

/**
 * ลบเมนู ถ้าเคยถูกสั่งแล้วจะเปลี่ยนเป็นปิดขาย (is_available = 0) แทนการลบจริง
 * เพราะ order_items อ้างถึงเมนูนี้อยู่ ถ้าลบจริงบิลเก่าจะพัง
 *
 * @param _request - ไม่ได้ใช้ body แต่ต้องรับไว้ตามลายเซ็นของ route handler
 * @param context - พารามิเตอร์เส้นทางที่มี id ของเมนู
 * @returns mode บอกว่าลบจริงหรือปิดขาย พร้อมข้อความอธิบายให้แสดงบนหน้าจอ
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await requireStaff('ADMIN');
  if (!auth.ok) return authFailureResponse(auth.reason);

  const id = parseId((await context.params).id);
  if (!id) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, 'รหัสเมนูไม่ถูกต้อง กรุณากลับไปเลือกใหม่');
  }

  const usage = await queryOne<RowDataPacket & { order_count: number }>(
    'SELECT COUNT(*) AS order_count FROM order_items WHERE menu_item_id = ?',
    [id],
  );

  if ((usage?.order_count ?? 0) > 0) {
    const result = await execute('UPDATE menu_items SET is_available = 0 WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบเมนูนี้ อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า', 404);
    }
    return apiOk({
      mode: 'DEACTIVATED' as const,
      message: `เมนูนี้เคยถูกสั่งแล้ว ${usage?.order_count} ครั้ง จึงเปลี่ยนเป็นปิดขายแทนการลบ ลูกค้าจะไม่เห็นเมนูนี้แล้ว แต่บิลเก่ายังอ่านได้ครบ`,
    });
  }

  const result = await execute('DELETE FROM menu_items WHERE id = ?', [id]);
  if (result.affectedRows === 0) {
    return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบเมนูนี้ อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า', 404);
  }
  return apiOk({ mode: 'DELETED' as const, message: 'ลบเมนูเรียบร้อยแล้ว' });
}
