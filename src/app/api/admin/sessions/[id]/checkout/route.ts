import type { NextRequest } from 'next/server';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { apiOk, apiError, authFailureResponse, ERROR_CODES, parseId } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { withTransaction } from '@/lib/db';
import { checkoutSchema, firstErrorMessage } from '@/lib/validation';

/** พารามิเตอร์เส้นทางของ Next.js 15 เป็น Promise จึงต้อง await ก่อนใช้ */
type RouteContext = { params: Promise<{ id: string }> };

/** เหตุผลที่ปิดบิลไม่ได้ แยกรหัสเพื่อให้หน้าจอบอกพนักงานได้ตรงกรณี */
type CheckoutFailure = 'NOT_FOUND' | 'ALREADY_CLOSED' | 'NOTHING_TO_PAY';

/**
 * รวมยอดที่ต้องเก็บของรอบการนั่งหนึ่ง โดยไม่นับรายการที่ถูกยกเลิก
 * คิดจาก order_items โดยตรง ไม่ใช่จาก orders.total_amount เพราะยอดในใบสั่ง
 * เป็นค่าที่คำนวณไว้ล่วงหน้า ส่วนเงินที่เก็บจริงต้องมาจากของที่เสิร์ฟจริง
 *
 * @param conn - connection ที่อยู่ใน transaction เดียวกับการปิดบิล
 * @param sessionId - รหัสรอบการนั่ง
 * @returns ยอดรวมเป็นตัวเลขบาท
 */
async function sumSessionTotal(conn: PoolConnection, sessionId: number): Promise<number> {
  const [rows] = await conn.execute<(RowDataPacket & { total: string | null })[]>(
    `SELECT COALESCE(SUM(oi.unit_price * oi.quantity), 0) AS total
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
      WHERE o.session_id = ? AND oi.status <> 'CANCELLED'`,
    [sessionId],
  );
  return Number(rows[0]?.total ?? 0);
}

/**
 * ปิดบิลของรอบการนั่ง บันทึกการชำระเงินและปิด session ให้โต๊ะกลับมาว่าง
 * ทำใน transaction เดียวเพื่อไม่ให้เกิดกรณีบันทึกเงินแล้วแต่ session ยังเปิดค้าง
 *
 * ปิดแล้วห้ามแก้ออเดอร์ของ session นั้นอีก ตามกฎในหัวข้อ 10
 * การกันไว้ที่ทั้ง endpoint เปลี่ยนสถานะออเดอร์และรายการอาหาร
 *
 * @param request - คำขอที่มี body เป็น JSON { method }
 * @param context - พารามิเตอร์เส้นทางที่มี id ของรอบการนั่ง
 * @returns ยอดที่เก็บและวิธีชำระ หรือ error พร้อมข้อความไทยบอกสาเหตุ
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireStaff();
  if (!auth.ok) return authFailureResponse(auth.reason);

  const sessionId = parseId((await context.params).id);
  if (!sessionId) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, 'รหัสรอบการนั่งไม่ถูกต้อง กรุณารีเฟรชกระดานใหม่');
  }

  const parsed = checkoutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, firstErrorMessage(parsed.error));
  }

  const result = await withTransaction<
    { ok: true; total: number } | { ok: false; reason: CheckoutFailure }
  >(async (conn) => {
    const [sessions] = await conn.execute<(RowDataPacket & { status: string; branch_id: number })[]>(
      'SELECT status, branch_id FROM table_sessions WHERE id = ? FOR UPDATE',
      [sessionId],
    );
    const session = sessions[0];
    if (!session) return { ok: false, reason: 'NOT_FOUND' };
    if (session.status === 'CLOSED') return { ok: false, reason: 'ALREADY_CLOSED' };

    const total = await sumSessionTotal(conn, sessionId);
    if (total <= 0) return { ok: false, reason: 'NOTHING_TO_PAY' };

    await conn.execute(
      'INSERT INTO payments (session_id, branch_id, method, total_amount, received_by) VALUES (?, ?, ?, ?, ?)',
      [sessionId, session.branch_id ?? 1, parsed.data.method, total, auth.user.id],
    );
    await conn.execute(
      "UPDATE table_sessions SET status = 'CLOSED', closed_at = NOW(), closed_by = ? WHERE id = ?",
      [auth.user.id, sessionId],
    );
    return { ok: true, total };
  });

  if (!result.ok) {
    if (result.reason === 'ALREADY_CLOSED') {
      return apiError(
        ERROR_CODES.VALIDATION_ERROR,
        'บิลของโต๊ะนี้ถูกปิดไปแล้ว กรุณารีเฟรชกระดานเพื่อดูสถานะล่าสุด',
        409,
      );
    }
    if (result.reason === 'NOTHING_TO_PAY') {
      return apiError(
        ERROR_CODES.VALIDATION_ERROR,
        'โต๊ะนี้ยังไม่มีรายการที่ต้องเก็บเงิน (ทุกรายการถูกยกเลิกหรือยังไม่ได้สั่ง) กรุณาตรวจออเดอร์อีกครั้ง',
        409,
      );
    }
    return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบรอบการนั่งนี้ กรุณารีเฟรชกระดานใหม่', 404);
  }

  return apiOk({ sessionId, method: parsed.data.method, total: result.total }, 201);
}
