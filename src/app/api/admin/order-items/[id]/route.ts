import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, apiError, authFailureResponse, ERROR_CODES, parseId } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { execute, queryOne } from '@/lib/db';
import { orderStatusSchema, firstErrorMessage } from '@/lib/validation';

/** พารามิเตอร์เส้นทางของ Next.js 15 เป็น Promise จึงต้อง await ก่อนใช้ */
type RouteContext = { params: Promise<{ id: string }> };

/**
 * เปลี่ยนสถานะของอาหารรายจาน ใช้ตอนที่ในใบสั่งเดียวกันบางจานเสร็จก่อน
 * หรือครัวทำจานหนึ่งไม่ได้แล้วต้องยกเลิกเฉพาะจานนั้น
 *
 * หลังอัปเดตจะคำนวณสถานะของใบสั่งใหม่จากรายการที่เหลือ เพื่อให้หัวบิลตรงกับของจริงเสมอ
 * และปรับ total_amount ให้ไม่รวมรายการที่ยกเลิก ตามกฎในหัวข้อ 10
 *
 * @param request - คำขอที่มี body เป็น JSON { status }
 * @param context - พารามิเตอร์เส้นทางที่มี id ของรายการอาหาร
 * @returns สถานะใหม่ของรายการและของใบสั่ง หรือ error เมื่อบิลปิดไปแล้ว
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireStaff();
  if (!auth.ok) return authFailureResponse(auth.reason);

  const id = parseId((await context.params).id);
  if (!id) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, 'รหัสรายการอาหารไม่ถูกต้อง กรุณารีเฟรชกระดานใหม่');
  }

  const parsed = orderStatusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, firstErrorMessage(parsed.error));
  }

  type ItemDetail = RowDataPacket & {
    order_id: number;
    item_name: string;
    unit_price: number;
    quantity: number;
    session_status: string;
    order_code: string;
    table_no: string;
  };

  const found = await queryOne<ItemDetail>(
    `SELECT oi.order_id, oi.item_name, oi.unit_price, oi.quantity,
            s.status AS session_status, o.order_code, t.table_no
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN table_sessions s ON s.id = o.session_id
       JOIN dining_tables t ON t.id = s.table_id
      WHERE oi.id = ? LIMIT 1`,
    [id],
  );
  if (!found) {
    return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบรายการอาหารนี้ กรุณารีเฟรชกระดานใหม่', 404);
  }
  if (found.session_status === 'CLOSED') {
    return apiError(
      ERROR_CODES.VALIDATION_ERROR,
      'บิลของโต๊ะนี้ปิดไปแล้ว แก้ไขรายการย้อนหลังไม่ได้ ถ้าคิดเงินผิดให้เปิดเรื่องแจ้งปัญหาแทน',
      409,
    );
  }

  await execute('UPDATE order_items SET status = ? WHERE id = ?', [parsed.data.status, id]);
  const orderStatus = await recalculateOrder(found.order_id);

  // บันทึก Cancellation Audit Log ป้องกันการทุจริตเมื่อมีการยกเลิกรายการอาหาร
  if (parsed.data.status === 'CANCELLED') {
    const reason = parsed.data.reason?.trim() || 'ไม่ระบุเหตุผล';
    const amount = Number(found.unit_price) * found.quantity;
    try {
      await execute(
        `INSERT INTO cancellation_audit_logs 
          (entity_type, entity_id, order_code, table_no, item_name, quantity, amount, reason, cancelled_by)
         VALUES ('ORDER_ITEM', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          found.order_code,
          found.table_no,
          found.item_name,
          found.quantity,
          amount,
          reason,
          auth.user.id,
        ],
      );
    } catch {
      // หากตารางยังไม่ถูก migrate ในสภาพแวดล้อม dev ให้การทำงานหลักยังดำเนินต่อไปได้
    }
  }

  return apiOk({ id, status: parsed.data.status, orderStatus });
}

/**
 * คำนวณสถานะและยอดรวมของใบสั่งใหม่จากรายการอาหารที่อยู่ในใบนั้น
 * กฎ: ยกเลิกหมดทั้งใบ = ใบนั้นยกเลิก, เสิร์ฟครบทุกจานที่เหลือ = เสิร์ฟแล้ว,
 * มีจานไหนกำลังทำ = กำลังทำ, นอกนั้นคือรอครัวรับ
 *
 * @param orderId - รหัสใบสั่งที่ต้องคำนวณใหม่
 * @returns สถานะใหม่ของใบสั่ง
 */
async function recalculateOrder(orderId: number): Promise<string> {
  const summary = await queryOne<
    RowDataPacket & {
      total: number;
      cancelled: number;
      served: number;
      preparing: number;
      amount: string | null;
    }
  >(
    `SELECT COUNT(*) AS total,
            SUM(status = 'CANCELLED') AS cancelled,
            SUM(status = 'SERVED') AS served,
            SUM(status = 'PREPARING') AS preparing,
            SUM(IF(status = 'CANCELLED', 0, unit_price * quantity)) AS amount
       FROM order_items WHERE order_id = ?`,
    [orderId],
  );

  const total = Number(summary?.total ?? 0);
  const cancelled = Number(summary?.cancelled ?? 0);
  const served = Number(summary?.served ?? 0);
  const preparing = Number(summary?.preparing ?? 0);
  const active = total - cancelled;

  let status = 'PENDING';
  if (total > 0 && active === 0) status = 'CANCELLED';
  else if (active > 0 && served === active) status = 'SERVED';
  else if (preparing > 0) status = 'PREPARING';

  await execute('UPDATE orders SET status = ?, total_amount = ? WHERE id = ?', [
    status,
    Number(summary?.amount ?? 0),
    orderId,
  ]);
  return status;
}
