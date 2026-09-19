import type { NextRequest } from 'next/server';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { apiOk, apiError, authFailureResponse, serverError, ERROR_CODES, parseId } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { execute, queryOne } from '@/lib/db';
import { roundBaht } from '@/lib/billing';
import { normalizePromptPayId } from '@/lib/promptpay';
import { getPaymentProvider } from '@/lib/payments/provider';
import { getPaymentRequest, toClientPaymentRequest } from '@/lib/payments/requests';
import { firstErrorMessage } from '@/lib/validation';

/** พารามิเตอร์เส้นทางของ Next.js 15 เป็น Promise จึงต้อง await ก่อนใช้ */
type RouteContext = { params: Promise<{ id: string }> };

/** ยอดที่ขอรับผ่าน QR ต้องมากกว่า 0 และไม่เกินที่คอลัมน์ DECIMAL(10,2) รองรับ */
const createPaymentRequestSchema = z.object({
  amount: z.coerce
    .number()
    .positive('ยอดที่จะรับผ่าน QR ต้องมากกว่า 0')
    .max(99999999, 'ยอดสูงเกินกว่าที่ระบบรองรับ'),
});

/**
 * สร้าง QR รับเงินโอนสำหรับบิลที่ยังเปิดอยู่ ตามยอดของช่องทางโอนเงินที่แคชเชียร์กรอก
 *
 * QR ผูกกับรอบการนั่งและยอดเงิน ใช้ปิดบิลอื่นหรือปิดยอดอื่นไม่ได้
 * สาขาที่ยังไม่ได้ตั้งเลขพร้อมเพย์จะสร้าง QR ไม่ได้ ต้องไปตั้งที่หน้า "จัดการสาขา" ก่อน
 *
 * @param request - คำขอที่มี body { amount }
 * @param context - พารามิเตอร์เส้นทางที่มี id ของรอบการนั่ง
 * @returns คำขอรับเงินพร้อมข้อความ QR และความสามารถของผู้ให้บริการ
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireStaff();
  if (!auth.ok) return authFailureResponse(auth.reason);

  const sessionId = parseId((await context.params).id);
  if (!sessionId) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, 'รหัสรอบการนั่งไม่ถูกต้อง กรุณารีเฟรชกระดานใหม่');
  }

  const parsed = createPaymentRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, firstErrorMessage(parsed.error));
  }
  const amount = roundBaht(parsed.data.amount);

  try {
    const session = await queryOne<
      RowDataPacket & {
        status: string;
        branch_id: number;
        promptpay_id: string | null;
      }
    >(
      `SELECT s.status, s.branch_id, b.promptpay_id
         FROM table_sessions s
         JOIN branches b ON b.id = s.branch_id
        WHERE s.id = ?`,
      [sessionId],
    );
    if (!session) return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบรอบการนั่งนี้ กรุณารีเฟรชกระดานใหม่', 404);
    if (auth.user.branchId && auth.user.branchId !== session.branch_id) {
      return apiError(ERROR_CODES.FORBIDDEN, 'ไม่มีสิทธิ์รับเงินของสาขาอื่น', 403);
    }
    if (session.status !== 'OPEN') {
      return apiError(ERROR_CODES.VALIDATION_ERROR, 'บิลของโต๊ะนี้ปิดไปแล้ว กรุณารีเฟรชกระดาน', 409);
    }
    if (!session.promptpay_id || !normalizePromptPayId(session.promptpay_id).ok) {
      return apiError(
        ERROR_CODES.VALIDATION_ERROR,
        'สาขานี้ยังไม่ได้ตั้งเลขพร้อมเพย์ที่ใช้ได้ ให้ผู้ดูแลระบบตั้งที่หน้า "จัดการสาขา" ก่อน',
        409,
      );
    }

    const provider = getPaymentProvider();
    const charge = await provider.createCharge({
      amount,
      promptPayId: session.promptpay_id,
      reference: `S${sessionId}`,
    });

    const inserted = await execute(
      `INSERT INTO payment_requests
         (branch_id, session_id, provider, provider_ref, amount, qr_payload, status, expires_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING', DATE_ADD(NOW(), INTERVAL ? MINUTE), ?)`,
      [
        session.branch_id,
        sessionId,
        provider.id,
        charge.providerRef,
        amount,
        charge.qrPayload,
        provider.expiresInMinutes,
        auth.user.id,
      ],
    );

    const row = await getPaymentRequest((inserted as ResultSetHeader).insertId);
    if (!row) throw new Error('payment request vanished right after insert');
    return apiOk(toClientPaymentRequest(row), 201);
  } catch (err) {
    return serverError(err, 'POST /api/admin/sessions/[id]/payment-requests');
  }
}
