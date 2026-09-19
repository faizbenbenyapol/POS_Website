import type { NextRequest } from 'next/server';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { apiOk, apiError, authFailureResponse, ERROR_CODES, parseId } from '@/lib/api';
import { requireCapability } from '@/lib/auth';
import { withTransaction } from '@/lib/db';
import { checkoutSchema, firstErrorMessage } from '@/lib/validation';
import { findSettlement } from '@/lib/settlement';
import { businessDayRange, getBusinessCutoffHour } from '@/lib/format';
import {
  calculateBill,
  roundBaht,
  validatePayments,
  type BillTotals,
  type BranchMoneySettings,
  type DiscountInput,
  type PaymentInput,
} from '@/lib/billing';

/** พารามิเตอร์เส้นทางของ Next.js 15 เป็น Promise จึงต้อง await ก่อนใช้ */
type RouteContext = { params: Promise<{ id: string }> };

/** เหตุผลที่ปิดบิลไม่ได้ แยกรหัสเพื่อให้หน้าจอบอกพนักงานได้ตรงกรณี */
type CheckoutFailure =
  | 'NOT_FOUND'
  | 'ALREADY_CLOSED'
  | 'NOTHING_TO_PAY'
  | 'FORBIDDEN'
  | 'DAY_CLOSED'
  | 'DISCOUNT_FORBIDDEN'
  | 'DISCOUNT_NO_REASON'
  | 'PAYMENT_MISMATCH'
  | 'TRANSFER_UNCONFIRMED';

/** แถวรายการอาหารเท่าที่การคิดเงินต้องใช้ */
type BillItemRow = RowDataPacket & {
  unit_price: string;
  quantity: number;
  status: string;
};

/**
 * ดึงรายการอาหารที่ต้องคิดเงินของรอบการนั่ง ไม่รวมรายการที่ถูกยกเลิก
 * คิดจาก order_items โดยตรง ไม่ใช่จาก orders.total_amount เพราะยอดในใบสั่ง
 * เป็นค่าที่คำนวณไว้ล่วงหน้า ส่วนเงินที่เก็บจริงต้องมาจากของที่เสิร์ฟจริง
 *
 * @param conn - connection ที่อยู่ใน transaction เดียวกับการปิดบิล
 * @param sessionId - รหัสรอบการนั่ง
 * @returns รายการอาหารพร้อมราคาต่อหน่วยและจำนวน
 */
async function loadBillItems(conn: PoolConnection, sessionId: number): Promise<BillItemRow[]> {
  const [rows] = await conn.execute<BillItemRow[]>(
    `SELECT oi.unit_price, oi.quantity, oi.status
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
      WHERE o.session_id = ? AND oi.status <> 'CANCELLED'`,
    [sessionId],
  );
  return rows;
}

/**
 * ตรวจว่าทุกแถวเงินโอนผูกกับคำขอรับเงินที่ใช้ได้ ล็อกคำขอไว้ใน transaction เดียวกับการปิดบิล
 * กันสองเครื่องเอา QR ใบเดียวกันไปปิดคนละบิลพร้อมกัน (มี UNIQUE ที่ payments ซ้ำอีกชั้น)
 *
 * @param conn - connection ที่อยู่ใน transaction เดียวกับการปิดบิล
 * @param sessionId - รอบการนั่งที่กำลังปิดบิล
 * @param payments - แถวชำระเงินที่แคชเชียร์กรอก
 * @returns ข้อความไทยบอกว่าผิดตรงไหน หรือ null เมื่อทุกแถวเงินโอนผ่าน
 */
async function verifyTransferPayments(
  conn: PoolConnection,
  sessionId: number,
  payments: { method: string; amount: number; paymentRequestId: number | null }[],
): Promise<string | null> {
  const transfers = payments.filter((p) => p.method === 'TRANSFER');
  if (transfers.some((p) => p.paymentRequestId === null)) {
    return 'ช่องทางโอนเงินต้องสร้าง QR และได้รับการยืนยันว่าเงินเข้าแล้วก่อนปิดบิล';
  }
  const ids = transfers.map((p) => p.paymentRequestId as number);
  if (new Set(ids).size !== ids.length) {
    return 'ใช้ QR รับเงินใบเดียวกันซ้ำในบิลเดียวกันไม่ได้';
  }

  for (const payment of transfers) {
    const [rows] = await conn.execute<
      (RowDataPacket & { session_id: number; amount: string; status: string; used: number })[]
    >(
      `SELECT pr.session_id, pr.amount, pr.status,
              EXISTS(SELECT 1 FROM payments p WHERE p.payment_request_id = pr.id) AS used
         FROM payment_requests pr WHERE pr.id = ? FOR UPDATE`,
      [payment.paymentRequestId],
    );
    const request = rows[0];
    if (!request || request.session_id !== sessionId) {
      return 'QR รับเงินที่เลือกไม่ใช่ของบิลนี้ กรุณาสร้าง QR ใหม่';
    }
    if (request.status !== 'PAID') {
      return 'ยังไม่ได้รับการยืนยันว่าเงินโอนเข้าแล้ว กรุณารอสถานะ "ได้รับเงินแล้ว" ก่อนปิดบิล';
    }
    if (Number(request.used) === 1) {
      return 'QR รับเงินใบนี้ถูกใช้ปิดบิลไปแล้ว';
    }
    if (roundBaht(Number(request.amount)) !== roundBaht(payment.amount)) {
      return `ยอดที่โอนผ่าน QR (${Number(request.amount).toFixed(2)} บาท) ไม่ตรงกับยอดที่ตัดเข้าช่องทางโอนเงิน`;
    }
  }
  return null;
}

/**
 * อ่านค่าตั้งเรื่อง VAT และค่าบริการของสาขา เพื่อใช้คิดบิลของรอบการนั่งนี้
 *
 * @param conn - connection ที่อยู่ใน transaction เดียวกับการปิดบิล
 * @param branchId - รหัสสาขาของรอบการนั่ง
 * @returns ค่าตั้งเรื่องเงินของสาขา
 */
async function loadBranchMoneySettings(
  conn: PoolConnection,
  branchId: number,
): Promise<BranchMoneySettings & { cutoffHour: number }> {
  const [rows] = await conn.execute<
    (RowDataPacket & {
      business_day_cutoff_hour: number;
      vat_rate: string;
      vat_inclusive: number;
      service_charge_rate: string;
    })[]
  >(
    `SELECT business_day_cutoff_hour, vat_rate, vat_inclusive, service_charge_rate
       FROM branches WHERE id = ?`,
    [branchId],
  );
  const row = rows[0];
  return {
    cutoffHour: Number(row?.business_day_cutoff_hour ?? getBusinessCutoffHour()),
    vatRate: Number(row?.vat_rate ?? 7),
    vatInclusive: Number(row?.vat_inclusive ?? 1) === 1,
    serviceChargeRate: Number(row?.service_charge_rate ?? 0),
  };
}

/**
 * ปิดบิลของรอบการนั่ง บันทึกการชำระเงินและปิด session ให้โต๊ะกลับมาว่าง
 * ทำใน transaction เดียวเพื่อไม่ให้เกิดกรณีบันทึกเงินแล้วแต่ session ยังเปิดค้าง
 *
 * ยอดบิลทั้งใบ (ส่วนลด ค่าบริการ VAT) คำนวณใหม่ที่เซิร์ฟเวอร์เสมอ
 * ไม่เชื่อตัวเลขที่หน้าจอส่งมา หน้าจอส่งมาเฉพาะ "เจตนา" คือส่วนลดที่ให้และเงินที่รับ
 * แล้วเก็บผลลัพธ์แช่แข็งไว้ในแถว table_sessions เพื่อไม่ให้ยอดย้อนหลังขยับตามราคาเมนูที่แก้ทีหลัง
 *
 * ปิดแล้วห้ามแก้ออเดอร์ของ session นั้นอีก ตามกฎในหัวข้อ 10
 * การกันไว้ที่ทั้ง endpoint เปลี่ยนสถานะออเดอร์และรายการอาหาร
 *
 * @param request - คำขอที่มี body เป็น JSON { payments, discount }
 * @param context - พารามิเตอร์เส้นทางที่มี id ของรอบการนั่ง
 * @returns ยอดบิลที่คิดได้ เงินทอน และรายการชำระเงิน หรือ error พร้อมข้อความไทยบอกสาเหตุ
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireCapability('checkout');
  if (!auth.ok) return authFailureResponse(auth.reason);

  const sessionId = parseId((await context.params).id);
  if (!sessionId) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, 'รหัสรอบการนั่งไม่ถูกต้อง กรุณารีเฟรชกระดานใหม่');
  }

  const parsed = checkoutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, firstErrorMessage(parsed.error));
  }

  const discountInput: DiscountInput = parsed.data.discount
    ? {
        type: parsed.data.discount.type,
        value: parsed.data.discount.value,
        reason: parsed.data.discount.reason ?? null,
      }
    : { type: 'NONE', value: 0, reason: null };

  const paymentInputs: (PaymentInput & { paymentRequestId: number | null })[] =
    parsed.data.payments.map((p) => ({
      method: p.method,
      amount: p.amount,
      receivedAmount: p.receivedAmount ?? null,
      paymentRequestId: p.method === 'TRANSFER' ? (p.paymentRequestId ?? null) : null,
    }));

  const result = await withTransaction<
    | { ok: true; bill: BillTotals; changeDue: number }
    | { ok: false; reason: CheckoutFailure; zNumber?: number; message?: string }
  >(async (conn) => {
    const [sessions] = await conn.execute<(RowDataPacket & { status: string; branch_id: number })[]>(
      'SELECT status, branch_id FROM table_sessions WHERE id = ? FOR UPDATE',
      [sessionId],
    );
    const session = sessions[0];
    if (!session) return { ok: false, reason: 'NOT_FOUND' };
    // ตรวจสอบ tenant isolation: พนักงานประจำสาขาไม่สามารถปิดบิลของสาขาอื่นได้
    if (auth.user.branchId && auth.user.branchId !== session.branch_id) {
      return { ok: false, reason: 'FORBIDDEN' };
    }
    if (session.status === 'CLOSED') return { ok: false, reason: 'ALREADY_CLOSED' };

    // ส่วนลดเป็นช่องทางทุจริตเช่นเดียวกับการยกเลิกบิล จึงสงวนสิทธิ์ให้เจ้าของร้านเท่านั้น
    // และบังคับระบุเหตุผลทุกครั้ง ให้สอดคล้องกับนโยบายของการยกเลิกออเดอร์ทั้งใบ
    if (discountInput.type !== 'NONE' && discountInput.value > 0) {
      if (auth.user.role !== 'ADMIN') {
        return { ok: false, reason: 'DISCOUNT_FORBIDDEN' };
      }
      if (!discountInput.reason) {
        return { ok: false, reason: 'DISCOUNT_NO_REASON' };
      }
    }

    const branchOfSession = session.branch_id ?? 1;
    const settings = await loadBranchMoneySettings(conn, branchOfSession);

    // วันทำการที่ปิดยอด (Z-Report) ไปแล้ว ห้ามรับเงินเพิ่มอีก
    // ไม่อย่างนั้นรายงานที่แช่แข็งไว้จะไม่ตรงกับเงินที่เก็บได้จริง
    const settled = await findSettlement(
      branchOfSession,
      businessDayRange(undefined, settings.cutoffHour).businessDate,
      conn,
    );
    if (settled) {
      return { ok: false, reason: 'DAY_CLOSED', zNumber: Number(settled.z_number) };
    }

    const items = await loadBillItems(conn, sessionId);
    const bill = calculateBill(
      items.map((i) => ({ unit_price: i.unit_price, quantity: i.quantity, status: i.status })),
      settings,
      discountInput,
    );
    if (bill.grandTotal <= 0) return { ok: false, reason: 'NOTHING_TO_PAY' };

    const paymentCheck = validatePayments(paymentInputs, bill.grandTotal);
    if (!paymentCheck.ok) {
      return { ok: false, reason: 'PAYMENT_MISMATCH', message: paymentCheck.message };
    }

    // เงินโอนต้องผูกกับ QR ที่ยืนยันแล้วว่าเงินเข้า ของบิลนี้ ยอดเดียวกัน และยังไม่เคยใช้ปิดบิลใด
    // กันแคชเชียร์กด "โอนเงิน" แล้วปิดบิลไปทั้งที่ยังไม่มีเงินเข้าบัญชีร้านจริง
    const transferCheck = await verifyTransferPayments(conn, sessionId, paymentInputs);
    if (transferCheck) {
      return { ok: false, reason: 'TRANSFER_UNCONFIRMED', message: transferCheck };
    }

    for (const payment of paymentInputs) {
      const received =
        payment.method === 'CASH' ? (payment.receivedAmount ?? payment.amount) : null;
      const change =
        payment.method === 'CASH' ? Math.max(0, Number(received) - payment.amount) : 0;
      await conn.execute(
        `INSERT INTO payments
           (session_id, branch_id, method, total_amount, received_amount, change_amount, payment_request_id, received_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          sessionId,
          branchOfSession,
          payment.method,
          payment.amount,
          received,
          change,
          payment.paymentRequestId,
          auth.user.id,
        ],
      );
    }

    // แช่แข็งยอดบิลไว้กับรอบการนั่ง เปิดดูย้อนหลังแล้วตัวเลขจะไม่ขยับอีก
    await conn.execute(
      `UPDATE table_sessions
          SET status = 'CLOSED', closed_at = NOW(), closed_by = ?,
              subtotal_amount = ?, discount_type = ?, discount_value = ?, discount_amount = ?,
              discount_reason = ?, discount_by = ?,
              service_charge_rate = ?, service_charge_amount = ?,
              vat_rate = ?, vat_inclusive = ?, vat_amount = ?, grand_total = ?
        WHERE id = ?`,
      [
        auth.user.id,
        bill.subtotal,
        bill.discountType,
        bill.discountValue,
        bill.discountAmount,
        bill.discountAmount > 0 ? discountInput.reason : null,
        bill.discountAmount > 0 ? auth.user.id : null,
        bill.serviceChargeRate,
        bill.serviceChargeAmount,
        bill.vatRate,
        bill.vatInclusive ? 1 : 0,
        bill.vatAmount,
        bill.grandTotal,
        sessionId,
      ],
    );

    return { ok: true, bill, changeDue: paymentCheck.changeDue };
  });

  if (!result.ok) {
    if (result.reason === 'FORBIDDEN') {
      return apiError(ERROR_CODES.FORBIDDEN, 'ไม่มีสิทธิ์ปิดบิลของสาขาอื่น', 403);
    }
    if (result.reason === 'DISCOUNT_FORBIDDEN') {
      return apiError(
        ERROR_CODES.FORBIDDEN,
        'การให้ส่วนลดสงวนสิทธิ์เฉพาะเจ้าของร้าน (ADMIN) หากต้องลดราคาบิลนี้ กรุณาแจ้งผู้จัดการ',
        403,
      );
    }
    if (result.reason === 'DISCOUNT_NO_REASON') {
      return apiError(
        ERROR_CODES.VALIDATION_ERROR,
        'ต้องระบุเหตุผลของส่วนลดทุกครั้ง เพื่อให้ตรวจสอบย้อนหลังได้',
        400,
      );
    }
    if (result.reason === 'TRANSFER_UNCONFIRMED') {
      return apiError(ERROR_CODES.VALIDATION_ERROR, result.message ?? 'ยังไม่ได้ยืนยันเงินโอน', 409);
    }
    if (result.reason === 'PAYMENT_MISMATCH') {
      return apiError(ERROR_CODES.VALIDATION_ERROR, result.message ?? 'ยอดชำระไม่ตรงกับยอดบิล', 409);
    }
    if (result.reason === 'DAY_CLOSED') {
      return apiError(
        ERROR_CODES.VALIDATION_ERROR,
        `วันทำการนี้ปิดยอดประจำวันไปแล้ว (ใบที่ Z-${result.zNumber}) จึงรับชำระเงินเพิ่มไม่ได้ หากต้องเก็บเงินโต๊ะนี้จริง กรุณาแจ้งผู้ดูแลระบบ`,
        409,
      );
    }
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

  return apiOk(
    {
      sessionId,
      bill: result.bill,
      changeDue: result.changeDue,
      payments: paymentInputs.map(({ method, amount, receivedAmount }) => ({
        method,
        amount,
        receivedAmount,
      })),
      // คงชื่อฟิลด์ total ไว้เพื่อให้ข้อความแจ้งผลบนกระดานออเดอร์อ่านยอดสุทธิได้เหมือนเดิม
      total: result.bill.grandTotal,
    },
    201,
  );
}

/**
 * คืนยอดบิลปัจจุบันของรอบการนั่งแบบพรีวิว ยังไม่บันทึกอะไรลงฐานข้อมูล
 * หน้าจอปิดบิลเรียกตอนเปิดหน้าต่าง เพื่อให้ได้ค่าตั้ง VAT และค่าบริการของสาขาที่ถูกต้อง
 * แล้วใช้ calculateBill ตัวเดียวกันคำนวณสดขณะพนักงานพิมพ์ส่วนลด
 *
 * @param _request - คำขอ ไม่ได้ใช้พารามิเตอร์ใด
 * @param context - พารามิเตอร์เส้นทางที่มี id ของรอบการนั่ง
 * @returns ยอดบิลปัจจุบันและค่าตั้งเรื่องเงินของสาขา
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireCapability('checkout');
  if (!auth.ok) return authFailureResponse(auth.reason);

  const sessionId = parseId((await context.params).id);
  if (!sessionId) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, 'รหัสรอบการนั่งไม่ถูกต้อง กรุณารีเฟรชกระดานใหม่');
  }

  const preview = await withTransaction<
    { ok: true; bill: BillTotals; settings: BranchMoneySettings } | { ok: false }
  >(async (conn) => {
    const [sessions] = await conn.execute<(RowDataPacket & { branch_id: number })[]>(
      'SELECT branch_id FROM table_sessions WHERE id = ?',
      [sessionId],
    );
    const session = sessions[0];
    if (!session) return { ok: false };
    if (auth.user.branchId && auth.user.branchId !== session.branch_id) return { ok: false };

    const settings = await loadBranchMoneySettings(conn, session.branch_id ?? 1);
    const items = await loadBillItems(conn, sessionId);
    const bill = calculateBill(
      items.map((i) => ({ unit_price: i.unit_price, quantity: i.quantity, status: i.status })),
      settings,
    );
    return {
      ok: true,
      bill,
      settings: {
        vatRate: settings.vatRate,
        vatInclusive: settings.vatInclusive,
        serviceChargeRate: settings.serviceChargeRate,
      },
    };
  });

  if (!preview.ok) {
    return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบรอบการนั่งนี้ กรุณารีเฟรชกระดานใหม่', 404);
  }
  return apiOk({ sessionId, bill: preview.bill, settings: preview.settings });
}
