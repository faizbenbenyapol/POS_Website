import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, apiError, authFailureResponse, ERROR_CODES, parseId } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { withTransaction } from '@/lib/db';
import { refundSchema, firstErrorMessage } from '@/lib/validation';
import { findSettlement } from '@/lib/settlement';
import { businessDayRange, getBusinessCutoffHour } from '@/lib/format';

/** พารามิเตอร์เส้นทางของ Next.js 15 เป็น Promise จึงต้อง await ก่อนใช้ */
type RouteContext = { params: Promise<{ id: string }> };

/** เหตุผลที่คืนเงินไม่ได้ แยกรหัสเพื่อให้หน้าจอบอกพนักงานได้ตรงกรณี */
type RefundFailure =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'NOT_CLOSED'
  | 'ALREADY_REFUNDED'
  | 'NOTHING_TO_REFUND'
  | 'DAY_CLOSED';

/** ยอดเงินที่ต้องจ่ายคืนแยกตามช่องทางที่เคยรับมา */
type RefundLine = {
  method: 'CASH' | 'TRANSFER' | 'CARD';
  amount: number;
};

/**
 * คืนเงินและทำให้บิลที่ปิดไปแล้วเป็นโมฆะทั้งใบ
 *
 * ไม่ลบหรือแก้แถวเงินเดิมทิ้ง แต่บันทึกแถวคืนเงินเป็นยอดติดลบตามช่องทางที่เคยรับมา
 * รายงานทุกหน้าที่บวก SUM(total_amount) จึงหักยอดคืนให้เองโดยไม่ต้องแก้สูตร
 * และเงินสดในลิ้นชักตามใบปิดยอดตรงกับเงินจริงที่จ่ายคืนออกไป
 *
 * แถวคืนเงินลงเวลา ณ ตอนที่กดคืน ไม่ใช่วันที่ของบิลเดิม เพื่อไม่ให้ไปแก้ยอดของ
 * วันทำการที่ปิดยอด (Z-Report) ไปแล้ว ด้วยเหตุผลเดียวกับที่ห้ามรับเงินย้อนหลัง
 * แต่ถ้าวันทำการปัจจุบันปิดยอดไปแล้วก็คืนเงินไม่ได้เช่นกัน ต้องรอวันทำการถัดไป
 *
 * สงวนสิทธิ์เฉพาะเจ้าของร้าน (ADMIN) และบังคับระบุเหตุผลทุกครั้ง
 * ให้สอดคล้องกับนโยบายของการยกเลิกออเดอร์ทั้งใบและการให้ส่วนลด
 *
 * @param request - คำขอที่มี body เป็น JSON { reason }
 * @param context - พารามิเตอร์เส้นทางที่มี id ของรอบการนั่ง
 * @returns ยอดที่คืนและรายละเอียดแยกตามช่องทาง หรือ error พร้อมข้อความไทยบอกสาเหตุ
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireStaff('ADMIN');
  if (!auth.ok) return authFailureResponse(auth.reason);

  const sessionId = parseId((await context.params).id);
  if (!sessionId) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, 'รหัสรอบการนั่งไม่ถูกต้อง กรุณารีเฟรชกระดานใหม่');
  }

  const parsed = refundSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, firstErrorMessage(parsed.error));
  }
  const reason = parsed.data.reason;

  const result = await withTransaction<
    | { ok: true; refundAmount: number; lines: RefundLine[]; tableNo: string }
    | { ok: false; reason: RefundFailure; zNumber?: number }
  >(async (conn) => {
    const [sessions] = await conn.execute<
      (RowDataPacket & {
        status: string;
        branch_id: number;
        table_no: string;
        refunded_at: string | null;
        cutoff_hour: number | null;
      })[]
    >(
      `SELECT s.status, s.branch_id, s.refunded_at, t.table_no,
              b.business_day_cutoff_hour AS cutoff_hour
         FROM table_sessions s
         JOIN dining_tables t ON t.id = s.table_id
         LEFT JOIN branches b ON b.id = s.branch_id
        WHERE s.id = ? FOR UPDATE`,
      [sessionId],
    );
    const session = sessions[0];
    if (!session) return { ok: false, reason: 'NOT_FOUND' };

    // ตรวจสอบ tenant isolation: ผู้จัดการสาขาคืนเงินบิลของสาขาอื่นไม่ได้
    if (auth.user.branchId && auth.user.branchId !== session.branch_id) {
      return { ok: false, reason: 'FORBIDDEN' };
    }
    if (session.status !== 'CLOSED') return { ok: false, reason: 'NOT_CLOSED' };
    if (session.refunded_at) return { ok: false, reason: 'ALREADY_REFUNDED' };

    const branchOfSession = session.branch_id ?? 1;
    const cutoffHour = Number(session.cutoff_hour ?? getBusinessCutoffHour());

    // วันทำการปัจจุบันปิดยอดไปแล้ว ห้ามจ่ายเงินออกจากลิ้นชักอีก
    // ไม่อย่างนั้นใบ Z ที่แช่แข็งไว้จะไม่ตรงกับเงินที่เหลือจริง
    const settled = await findSettlement(
      branchOfSession,
      businessDayRange(undefined, cutoffHour).businessDate,
      conn,
    );
    if (settled) {
      return { ok: false, reason: 'DAY_CLOSED', zNumber: Number(settled.z_number) };
    }

    // อ่านเฉพาะแถวรับเงินจริง เพื่อคืนเงินกลับตามช่องทางที่ลูกค้าจ่ายมาแต่ละทาง
    const [paidRows] = await conn.execute<
      (RowDataPacket & { method: 'CASH' | 'TRANSFER' | 'CARD'; paid_total: string })[]
    >(
      `SELECT method, SUM(total_amount) AS paid_total
         FROM payments
        WHERE session_id = ? AND total_amount > 0
        GROUP BY method`,
      [sessionId],
    );

    const lines: RefundLine[] = paidRows
      .map((row) => ({ method: row.method, amount: Number(row.paid_total) }))
      .filter((line) => line.amount > 0);
    if (lines.length === 0) return { ok: false, reason: 'NOTHING_TO_REFUND' };

    const refundAmount = lines.reduce((sum, line) => sum + line.amount, 0);

    for (const line of lines) {
      await conn.execute(
        `INSERT INTO payments
           (session_id, branch_id, method, total_amount, received_amount, change_amount, received_by)
         VALUES (?, ?, ?, ?, NULL, 0, ?)`,
        [sessionId, branchOfSession, line.method, -line.amount, auth.user.id],
      );
    }

    await conn.execute(
      `UPDATE table_sessions
          SET refunded_at = NOW(), refunded_by = ?, refund_reason = ?, refund_amount = ?
        WHERE id = ?`,
      [auth.user.id, reason, refundAmount, sessionId],
    );

    // บันทึกลง Audit Trail ชุดเดียวกับการยกเลิกออเดอร์ เพื่อให้ใบปิดยอดรวมความเสียหาย
    // จากการยกเลิกทุกประเภทไว้ที่เดียว ตรวจย้อนหลังได้ว่าใครสั่งคืนเงินบิลไหนเพราะอะไร
    await conn.execute(
      `INSERT INTO cancellation_audit_logs
        (entity_type, entity_id, branch_id, order_code, table_no, item_name, quantity, amount, reason, cancelled_by)
       VALUES ('SESSION', ?, ?, NULL, ?, NULL, NULL, ?, ?, ?)`,
      [
        sessionId,
        branchOfSession,
        session.table_no,
        refundAmount,
        `คืนเงินบิลที่ปิดแล้ว: ${reason}`,
        auth.user.id,
      ],
    );

    return { ok: true, refundAmount, lines, tableNo: session.table_no };
  });

  if (!result.ok) {
    if (result.reason === 'FORBIDDEN') {
      return apiError(ERROR_CODES.FORBIDDEN, 'ไม่มีสิทธิ์คืนเงินบิลของสาขาอื่น', 403);
    }
    if (result.reason === 'NOT_CLOSED') {
      return apiError(
        ERROR_CODES.VALIDATION_ERROR,
        'บิลของโต๊ะนี้ยังไม่ได้ปิด จึงยังไม่มีเงินให้คืน ถ้าต้องการล้างรายการให้ยกเลิกออเดอร์แทน',
        409,
      );
    }
    if (result.reason === 'ALREADY_REFUNDED') {
      return apiError(
        ERROR_CODES.VALIDATION_ERROR,
        'บิลใบนี้ถูกคืนเงินไปแล้ว คืนซ้ำไม่ได้ กรุณารีเฟรชกระดานเพื่อดูสถานะล่าสุด',
        409,
      );
    }
    if (result.reason === 'NOTHING_TO_REFUND') {
      return apiError(
        ERROR_CODES.VALIDATION_ERROR,
        'บิลใบนี้ไม่มียอดรับเงินที่จะคืนได้ กรุณาตรวจประวัติการชำระเงินอีกครั้ง',
        409,
      );
    }
    if (result.reason === 'DAY_CLOSED') {
      return apiError(
        ERROR_CODES.VALIDATION_ERROR,
        `วันทำการนี้ปิดยอดประจำวันไปแล้ว (ใบที่ Z-${result.zNumber}) จึงจ่ายเงินคืนออกจากลิ้นชักไม่ได้ กรุณาคืนเงินในวันทำการถัดไป`,
        409,
      );
    }
    return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบรอบการนั่งนี้ กรุณารีเฟรชกระดานใหม่', 404);
  }

  return apiOk(
    {
      sessionId,
      tableNo: result.tableNo,
      refundAmount: result.refundAmount,
      lines: result.lines,
    },
    201,
  );
}
