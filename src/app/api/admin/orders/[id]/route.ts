import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, apiError, authFailureResponse, ERROR_CODES, parseId } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { execute, queryOne } from '@/lib/db';
import { orderStatusSchema, firstErrorMessage } from '@/lib/validation';

/** พารามิเตอร์เส้นทางของ Next.js 15 เป็น Promise จึงต้อง await ก่อนใช้ */
type RouteContext = { params: Promise<{ id: string }> };

/**
 * เปลี่ยนสถานะของออเดอร์ทั้งใบ และปรับสถานะรายการอาหารในใบนั้นตามไปด้วย
 * เพราะบนกระดานพนักงานกดที่ใบสั่งทีเดียว ไม่ควรต้องไล่กดทีละรายการ
 *
 * รายการที่ถูกยกเลิกไปแล้วจะไม่ถูกปลุกกลับมา เพราะการยกเลิกเป็นการตัดสินใจที่ทำไปแล้ว
 *
 * @param request - คำขอที่มี body เป็น JSON { status }
 * @param context - พารามิเตอร์เส้นทางที่มี id ของออเดอร์
 * @returns ผลสำเร็จ หรือ error เมื่อบิลถูกปิดไปแล้วหรือไม่พบออเดอร์
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireStaff();
  if (!auth.ok) return authFailureResponse(auth.reason);

  const id = parseId((await context.params).id);
  if (!id) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, 'รหัสออเดอร์ไม่ถูกต้อง กรุณารีเฟรชกระดานใหม่');
  }

  const parsed = orderStatusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, firstErrorMessage(parsed.error));
  }

  type OrderDetail = RowDataPacket & {
    session_status: string;
    order_code: string;
    total_amount: number;
    table_no: string;
  };

  const order = await queryOne<OrderDetail>(
    `SELECT s.status AS session_status, o.order_code, o.total_amount, t.table_no
       FROM orders o
       JOIN table_sessions s ON s.id = o.session_id
       JOIN dining_tables t ON t.id = s.table_id
      WHERE o.id = ? LIMIT 1`,
    [id],
  );
  if (!order) {
    return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบออเดอร์นี้ กรุณารีเฟรชกระดานใหม่', 404);
  }
  if (order.session_status === 'CLOSED') {
    return apiError(
      ERROR_CODES.VALIDATION_ERROR,
      'บิลของโต๊ะนี้ปิดไปแล้ว แก้ไขออเดอร์ย้อนหลังไม่ได้ ถ้าคิดเงินผิดให้เปิดเรื่องแจ้งปัญหาแทน',
      409,
    );
  }

  const { status } = parsed.data;

  // การยกเลิกออเดอร์ทั้งใบ (Void Order) ต้องทำโดยเจ้าของร้าน/ผู้จัดการเท่านั้น เพื่อป้องกันการทุจริต
  if (status === 'CANCELLED' && auth.user.role !== 'ADMIN') {
    return apiError(
      ERROR_CODES.FORBIDDEN,
      'การยกเลิกออเดอร์ทั้งใบสงวนสิทธิ์เฉพาะเจ้าของร้าน (ADMIN) หากมีข้อผิดพลาดกรุณาแจ้งผู้จัดการ',
      403,
    );
  }

  await execute(
    "UPDATE order_items SET status = ? WHERE order_id = ? AND status <> 'CANCELLED'",
    [status, id],
  );
  // คำนวณยอดของใบสั่งใหม่จากรายการที่ยังไม่ถูกยกเลิก เพื่อไม่ให้ยอดค้างอยู่หลังกดยกเลิกทั้งใบ
  await execute(
    `UPDATE orders SET status = ?,
            total_amount = (SELECT COALESCE(SUM(IF(oi.status = 'CANCELLED', 0, oi.unit_price * oi.quantity)), 0)
                              FROM order_items oi WHERE oi.order_id = orders.id)
      WHERE id = ?`,
    [status, id],
  );

  // บันทึก Cancellation Audit Log ป้องกันการทุจริตเมื่อมีการ Void ออเดอร์ทั้งใบ
  if (status === 'CANCELLED') {
    const reason = parsed.data.reason?.trim() || 'ยกเลิกออเดอร์ทั้งใบ (Void Order)';
    try {
      await execute(
        `INSERT INTO cancellation_audit_logs 
          (entity_type, entity_id, order_code, table_no, item_name, quantity, amount, reason, cancelled_by)
         VALUES ('ORDER', ?, ?, ?, NULL, NULL, ?, ?, ?)`,
        [
          id,
          order.order_code,
          order.table_no,
          Number(order.total_amount || 0),
          reason,
          auth.user.id,
        ],
      );
    } catch {
      // หากตารางยังไม่ถูก migrate ในสภาพแวดล้อม dev ให้การทำงานหลักยังดำเนินต่อไปได้
    }
  }

  return apiOk({ id, status });
}
