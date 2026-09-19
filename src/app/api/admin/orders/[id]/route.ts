import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, apiError, authFailureResponse, ERROR_CODES, parseId } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { execute, query, queryOne } from '@/lib/db';
import { restoreStock } from '@/lib/stock';
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

  const order = await queryOne<
    RowDataPacket & {
      status: string;
      session_status: string;
      total_amount: string;
      order_code: string;
      table_no: string;
      branch_id: number;
    }
  >(
    `SELECT o.id, o.order_code, o.status, o.total_amount, o.branch_id, s.status AS session_status, t.table_no
       FROM orders o
       JOIN table_sessions s ON s.id = o.session_id
       JOIN dining_tables t ON t.id = s.table_id
      WHERE o.id = ? LIMIT 1`,
    [id],
  );
  if (!order) {
    return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบออเดอร์นี้ กรุณารีเฟรชกระดานใหม่', 404);
  }
  // ตรวจสอบ tenant isolation: พนักงานประจำสาขาไม่สามารถแก้ไขออเดอร์ของสาขาอื่นได้
  if (auth.user.branchId && auth.user.branchId !== order.branch_id) {
    return apiError(ERROR_CODES.FORBIDDEN, 'ไม่มีสิทธิ์จัดการออเดอร์ของสาขาอื่น', 403);
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

  // ใบที่ยกเลิกไปแล้ว: กดยกเลิกซ้ำตอบสำเร็จโดยไม่ทำอะไรเพิ่ม ส่วนการปลุกกลับมาทำไม่ได้
  // เพราะสต๊อกถูกคืนไปแล้วและมีบันทึกการยกเลิกแล้ว ปลุกกลับจะได้ใบสั่งยอดศูนย์ที่ไม่มีอาหาร
  if (order.status === 'CANCELLED') {
    if (status === 'CANCELLED') return apiOk({ id, status });
    return apiError(
      ERROR_CODES.VALIDATION_ERROR,
      'ออเดอร์นี้ถูกยกเลิกไปแล้ว เปลี่ยนสถานะกลับไม่ได้ ถ้าลูกค้ายังต้องการให้สั่งใหม่',
      409,
    );
  }

  const cancelledItems: { id: number; menu_item_id: number; quantity: number; amount: number }[] = [];

  if (status === 'CANCELLED') {
    // จองสิทธิ์การยกเลิกแบบมีเงื่อนไข ถ้าอีกเครื่องเพิ่งยกเลิกใบนี้ไปก่อน แถวจะไม่ถูกแก้
    // คนที่จองได้เท่านั้นที่คืนสต๊อกและเขียนบันทึก ทุกอย่างจึงเกิดครั้งเดียวแม้กดพร้อมกัน
    const claimed = await execute(
      "UPDATE orders SET status = 'CANCELLED' WHERE id = ? AND status <> 'CANCELLED'",
      [id],
    );
    if (claimed.affectedRows === 0) return apiOk({ id, status });

    const candidates = await query<
      RowDataPacket & { id: number; menu_item_id: number; quantity: number; unit_price: string }
    >(
      "SELECT id, menu_item_id, quantity, unit_price FROM order_items WHERE order_id = ? AND status <> 'CANCELLED'",
      [id],
    );
    // ยกเลิกทีละจานแบบมีเงื่อนไขเช่นกัน จานที่อีกเครื่องเพิ่งยกเลิกรายจานไปแล้วจะไม่ถูกนับซ้ำ
    for (const item of candidates) {
      const result = await execute(
        "UPDATE order_items SET status = 'CANCELLED' WHERE id = ? AND status <> 'CANCELLED'",
        [item.id],
      );
      if (result.affectedRows === 1) {
        cancelledItems.push({
          id: item.id,
          menu_item_id: item.menu_item_id,
          quantity: item.quantity,
          amount: Number(item.unit_price) * item.quantity,
        });
      }
    }
  } else {
    await execute(
      "UPDATE order_items SET status = ? WHERE order_id = ? AND status <> 'CANCELLED'",
      [status, id],
    );
  }

  // คำนวณยอดของใบสั่งใหม่จากรายการที่ยังไม่ถูกยกเลิก เพื่อไม่ให้ยอดค้างอยู่หลังกดยกเลิกทั้งใบ
  await execute(
    `UPDATE orders SET status = ?,
            total_amount = (SELECT COALESCE(SUM(IF(oi.status = 'CANCELLED', 0, oi.unit_price * oi.quantity)), 0)
                              FROM order_items oi WHERE oi.order_id = orders.id)
      WHERE id = ?`,
    [status, id],
  );

  // บันทึกว่าใครเปลี่ยนสถานะออเดอร์ใบนี้ ใช้ตรวจย้อนหลังว่าใครรับออเดอร์และใครกดเสิร์ฟ
  try {
    await execute(
      `INSERT INTO order_status_logs
        (branch_id, order_id, order_code, table_no, from_status, to_status, changed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        order.branch_id ?? 1,
        id,
        order.order_code,
        order.table_no,
        order.status,
        status,
        auth.user.id,
      ],
    );
  } catch {
    // หากตารางยังไม่ถูก migrate ในสภาพแวดล้อม dev ให้การทำงานหลักยังดำเนินต่อไปได้
  }

  // บันทึก Cancellation Audit Log ป้องกันการทุจริตเมื่อมีการ Void ออเดอร์ทั้งใบ
  if (status === 'CANCELLED') {
    const reason = parsed.data.reason?.trim() || 'ยกเลิกออเดอร์ทั้งใบ (Void Order)';

    // คืนจำนวนคงเหลือของทุกจานที่เพิ่งถูกยกเลิกไปพร้อมกับใบสั่งนี้
    await restoreStock(
      order.branch_id ?? 1,
      cancelledItems.map((i) => ({
        menuItemId: i.menu_item_id,
        quantity: i.quantity,
        orderItemId: i.id,
      })),
      id,
      auth.user.id,
      `ยกเลิกออเดอร์ทั้งใบ: ${reason}`,
    );

    // ยอดความเสียหายคิดจากจานที่ถูกยกเลิกรอบนี้จริง ไม่รวมจานที่ถูกยกเลิกรายจานและบันทึกไปก่อนแล้ว
    const voidAmount = cancelledItems.reduce((sum, i) => sum + i.amount, 0);
    try {
      await execute(
        `INSERT INTO cancellation_audit_logs
          (entity_type, entity_id, branch_id, order_code, table_no, item_name, quantity, amount, reason, cancelled_by)
         VALUES ('ORDER', ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
        [id, order.branch_id ?? 1, order.order_code, order.table_no, voidAmount, reason, auth.user.id],
      );
    } catch {
      // หากตารางยังไม่ถูก migrate ในสภาพแวดล้อม dev ให้การทำงานหลักยังดำเนินต่อไปได้
    }
  }

  return apiOk({ id, status });
}
