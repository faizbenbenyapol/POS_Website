import type { RowDataPacket } from 'mysql2/promise';
import { execute, queryOne } from '@/lib/db';
import { roundBaht } from '@/lib/billing';
import { maskPromptPayId } from '@/lib/promptpay';
import { findPaymentProvider } from '@/lib/payments/provider';

/** สถานะของคำขอรับเงิน ตรงกับ ENUM ในตาราง payment_requests */
export type PaymentRequestStatus = 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED';

/** คำขอรับเงิน 1 ครั้ง ตามที่หน้าปิดบิลต้องใช้ */
export type PaymentRequestRow = RowDataPacket & {
  id: number;
  branch_id: number;
  session_id: number;
  provider: string;
  provider_ref: string;
  amount: string;
  qr_payload: string;
  status: PaymentRequestStatus;
  expires_at: string;
  paid_at: string | null;
  confirmed_by: number | null;
  confirmed_by_name: string | null;
  used_in_payment: number;
  promptpay_id: string | null;
  promptpay_name: string | null;
};

/**
 * อ่านคำขอรับเงิน และเปลี่ยนเป็นหมดอายุให้เองถ้าเลยเวลาแล้วยังไม่มีใครจ่าย
 * ทำแบบขี้เกียจ (ตอนมีคนอ่าน) แทนการตั้ง cron เพราะสถานะมีความหมายเฉพาะตอนมีคนเปิดดูอยู่
 *
 * @param id - รหัสคำขอรับเงิน
 * @returns คำขอพร้อมชื่อผู้ยืนยันและสถานะว่าถูกใช้ปิดบิลไปแล้วหรือยัง หรือ null เมื่อไม่พบ
 */
export async function getPaymentRequest(id: number): Promise<PaymentRequestRow | null> {
  await execute(
    `UPDATE payment_requests SET status = 'EXPIRED'
      WHERE id = ? AND status = 'PENDING' AND expires_at < NOW()`,
    [id],
  );
  return queryOne<PaymentRequestRow>(
    `SELECT pr.id, pr.branch_id, pr.session_id, pr.provider, pr.provider_ref, pr.amount, pr.qr_payload,
            pr.status, pr.expires_at, pr.paid_at, pr.confirmed_by, u.full_name AS confirmed_by_name,
            EXISTS(SELECT 1 FROM payments p WHERE p.payment_request_id = pr.id) AS used_in_payment,
            b.promptpay_id, b.promptpay_name
       FROM payment_requests pr
       JOIN branches b ON b.id = pr.branch_id
       LEFT JOIN users u ON u.id = pr.confirmed_by
      WHERE pr.id = ?`,
    [id],
  );
}

/** ผลการเปลี่ยนคำขอเป็นจ่ายแล้ว */
export type MarkPaidResult =
  | { ok: true; alreadyPaid: boolean }
  | { ok: false; reason: 'NOT_FOUND' | 'AMOUNT_MISMATCH' | 'CANCELLED' };

/**
 * เปลี่ยนคำขอรับเงินเป็น "จ่ายแล้ว" ใช้ทั้งกับ webhook ของผู้ให้บริการ ปุ่มจำลอง และการยืนยันของแคชเชียร์
 *
 * รับคำขอที่หมดอายุไปแล้วด้วย เพราะถ้าเงินเข้าจริงก็ต้องนับว่าจ่ายแล้ว ลูกค้าอาจสแกนก่อน QR หมดอายุไม่กี่วินาที
 * ถ้ายอดที่ผู้ให้บริการยืนยันไม่ตรงกับยอดในคำขอจะไม่เปลี่ยนสถานะ ต้องให้คนมาตรวจ
 * เรียกซ้ำกับคำขอที่จ่ายแล้วได้โดยไม่เกิดผลข้างเคียง (webhook มักถูกส่งซ้ำ)
 *
 * @param where - ค้นด้วย id ของคำขอ หรือด้วยผู้ให้บริการกับรหัสอ้างอิงของผู้ให้บริการ
 * @param confirmedAmount - ยอดที่ผู้ให้บริการยืนยัน ไม่ส่งมาเมื่อแคชเชียร์ยืนยันเอง
 * @param confirmedBy - ผู้ใช้ที่กดยืนยัน null เมื่อมาจากผู้ให้บริการ
 * @returns ผลการเปลี่ยนสถานะ
 */
export async function markPaymentRequestPaid(
  where: { id: number } | { provider: string; providerRef: string },
  confirmedAmount: number | null,
  confirmedBy: number | null,
): Promise<MarkPaidResult> {
  const row = await queryOne<RowDataPacket & { id: number; amount: string; status: PaymentRequestStatus }>(
    'id' in where
      ? 'SELECT id, amount, status FROM payment_requests WHERE id = ?'
      : 'SELECT id, amount, status FROM payment_requests WHERE provider = ? AND provider_ref = ?',
    'id' in where ? [where.id] : [where.provider, where.providerRef],
  );
  if (!row) return { ok: false, reason: 'NOT_FOUND' };
  if (row.status === 'PAID') return { ok: true, alreadyPaid: true };
  if (row.status === 'CANCELLED') return { ok: false, reason: 'CANCELLED' };
  if (confirmedAmount !== null && roundBaht(confirmedAmount) !== roundBaht(Number(row.amount))) {
    return { ok: false, reason: 'AMOUNT_MISMATCH' };
  }

  await execute(
    `UPDATE payment_requests SET status = 'PAID', paid_at = NOW(), confirmed_by = ?
      WHERE id = ? AND status IN ('PENDING', 'EXPIRED')`,
    [confirmedBy, row.id],
  );
  return { ok: true, alreadyPaid: false };
}

/** คำขอรับเงินในรูปที่ส่งให้หน้าปิดบิล */
export type ClientPaymentRequest = {
  id: number;
  status: PaymentRequestStatus;
  amount: number;
  qrPayload: string;
  provider: string;
  providerLabel: string;
  autoConfirm: boolean;
  canSimulate: boolean;
  expiresAt: string;
  paidAt: string | null;
  confirmedByName: string | null;
  /** true เมื่อคำขอนี้ถูกใช้ปิดบิลไปแล้ว ใช้ซ้ำไม่ได้ */
  used: boolean;
  accountName: string | null;
  /** เลขพร้อมเพย์ที่ปิดบังบางส่วนแล้ว ให้ลูกค้าเทียบกับแอปธนาคาร */
  maskedPromptPayId: string | null;
};

/**
 * แปลงแถวคำขอรับเงินเป็นข้อมูลสำหรับหน้าจอ ไม่ส่งรหัสอ้างอิงของผู้ให้บริการออกไป
 *
 * @param row - แถวที่อ่านจาก getPaymentRequest
 * @returns ข้อมูลคำขอพร้อมความสามารถของผู้ให้บริการที่สร้างคำขอนี้
 */
export function toClientPaymentRequest(row: PaymentRequestRow): ClientPaymentRequest {
  const provider = findPaymentProvider(row.provider);
  return {
    id: row.id,
    status: row.status,
    amount: Number(row.amount),
    qrPayload: row.qr_payload,
    provider: row.provider,
    providerLabel: provider?.label ?? row.provider,
    autoConfirm: provider?.autoConfirm ?? false,
    canSimulate: provider?.canSimulate ?? false,
    expiresAt: row.expires_at,
    paidAt: row.paid_at,
    confirmedByName: row.confirmed_by_name,
    used: Number(row.used_in_payment) === 1,
    accountName: row.promptpay_name,
    maskedPromptPayId: row.promptpay_id ? maskPromptPayId(row.promptpay_id) : null,
  };
}
