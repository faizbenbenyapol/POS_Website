import type { NextRequest } from 'next/server';
import { apiOk, apiError, authFailureResponse, serverError, ERROR_CODES, parseId } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { findPaymentProvider } from '@/lib/payments/provider';
import {
  getPaymentRequest,
  markPaymentRequestPaid,
  toClientPaymentRequest,
} from '@/lib/payments/requests';

/** พารามิเตอร์เส้นทางของ Next.js 15 เป็น Promise จึงต้อง await ก่อนใช้ */
type RouteContext = { params: Promise<{ id: string }> };

/**
 * อ่านสถานะของคำขอรับเงิน หน้าปิดบิลเรียกซ้ำทุกไม่กี่วินาทีระหว่างรอลูกค้าโอน
 *
 * @param _request - คำขอ ไม่ได้ใช้พารามิเตอร์ใด
 * @param context - พารามิเตอร์เส้นทางที่มี id ของคำขอรับเงิน
 * @returns สถานะล่าสุดของคำขอ
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireStaff();
  if (!auth.ok) return authFailureResponse(auth.reason);

  const id = parseId((await context.params).id);
  if (!id) return apiError(ERROR_CODES.VALIDATION_ERROR, 'รหัสคำขอรับเงินไม่ถูกต้อง');

  try {
    const row = await getPaymentRequest(id);
    if (!row) return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบคำขอรับเงินนี้', 404);
    if (auth.user.branchId && auth.user.branchId !== row.branch_id) {
      return apiError(ERROR_CODES.FORBIDDEN, 'ไม่มีสิทธิ์ดูการรับเงินของสาขาอื่น', 403);
    }
    return apiOk(toClientPaymentRequest(row));
  } catch (err) {
    return serverError(err, 'GET /api/admin/payment-requests/[id]');
  }
}

/** คำสั่งที่ทำกับคำขอรับเงินได้ */
type PaymentRequestAction = 'CONFIRM' | 'SIMULATE';

/**
 * ยืนยันว่าได้รับเงินแล้ว มีสองแบบ
 *
 * CONFIRM  แคชเชียร์เปิดแอปธนาคารเห็นเงินเข้าแล้วกดยืนยันเอง บันทึกชื่อผู้ยืนยันไว้ตรวจย้อนหลัง
 *          ใช้กับพร้อมเพย์เข้าบัญชีตรงที่ไม่มีใครแจ้งกลับ ส่วนผู้ให้บริการที่แจ้งกลับเองได้
 *          สงวนให้แอดมินกดแทนเท่านั้น (กรณีระบบผู้ให้บริการล่ม) ไม่อย่างนั้นการยืนยันอัตโนมัติไม่มีความหมาย
 * SIMULATE จำลองว่าลูกค้าโอนแล้ว ใช้ทดสอบกับผู้ให้บริการจำลองบนเครื่องพัฒนาเท่านั้น
 *
 * @param request - คำขอที่มี body { action }
 * @param context - พารามิเตอร์เส้นทางที่มี id ของคำขอรับเงิน
 * @returns สถานะล่าสุดของคำขอหลังยืนยัน
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireStaff();
  if (!auth.ok) return authFailureResponse(auth.reason);

  const id = parseId((await context.params).id);
  if (!id) return apiError(ERROR_CODES.VALIDATION_ERROR, 'รหัสคำขอรับเงินไม่ถูกต้อง');

  const body = (await request.json().catch(() => null)) as { action?: PaymentRequestAction } | null;
  const action = body?.action;
  if (action !== 'CONFIRM' && action !== 'SIMULATE') {
    return apiError(ERROR_CODES.VALIDATION_ERROR, 'คำสั่งไม่ถูกต้อง');
  }

  try {
    const row = await getPaymentRequest(id);
    if (!row) return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบคำขอรับเงินนี้', 404);
    if (auth.user.branchId && auth.user.branchId !== row.branch_id) {
      return apiError(ERROR_CODES.FORBIDDEN, 'ไม่มีสิทธิ์ยืนยันการรับเงินของสาขาอื่น', 403);
    }

    const provider = findPaymentProvider(row.provider);
    if (action === 'SIMULATE') {
      if (!provider?.canSimulate) {
        return apiError(ERROR_CODES.FORBIDDEN, 'ผู้ให้บริการนี้จำลองการจ่ายเงินไม่ได้', 403);
      }
      // จำลองเส้นทางเดียวกับ webhook จริง คือยืนยันด้วยยอดที่ผู้ให้บริการรับได้ ไม่มีชื่อพนักงาน
      await markPaymentRequestPaid({ id }, Number(row.amount), null);
    } else {
      if (provider?.autoConfirm && auth.user.role !== 'ADMIN') {
        return apiError(
          ERROR_CODES.FORBIDDEN,
          'ช่องทางนี้ระบบยืนยันการรับเงินให้เอง หากเงินเข้าแล้วแต่สถานะไม่เปลี่ยน กรุณาให้ผู้จัดการยืนยันแทน',
          403,
        );
      }
      const result = await markPaymentRequestPaid({ id }, null, auth.user.id);
      if (!result.ok) {
        return apiError(ERROR_CODES.VALIDATION_ERROR, 'คำขอรับเงินนี้ถูกยกเลิกไปแล้ว กรุณาสร้าง QR ใหม่', 409);
      }
    }

    const updated = await getPaymentRequest(id);
    return apiOk(toClientPaymentRequest(updated!));
  } catch (err) {
    return serverError(err, 'POST /api/admin/payment-requests/[id]');
  }
}
