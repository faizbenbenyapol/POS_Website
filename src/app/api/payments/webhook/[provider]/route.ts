import type { NextRequest } from 'next/server';
import { apiOk, apiError, serverError, ERROR_CODES } from '@/lib/api';
import { findPaymentProvider } from '@/lib/payments/provider';
import { markPaymentRequestPaid } from '@/lib/payments/requests';

/** พารามิเตอร์เส้นทางของ Next.js 15 เป็น Promise จึงต้อง await ก่อนใช้ */
type RouteContext = { params: Promise<{ provider: string }> };

/**
 * รับแจ้งผลการชำระเงินจากผู้ให้บริการ (webhook) เส้นทางนี้ไม่ต้องล็อกอิน
 * ความปลอดภัยมาจากลายเซ็นที่ผู้ให้บริการเซ็นมาเท่านั้น ลายเซ็นไม่ผ่านต้องไม่แตะฐานข้อมูลเลย
 *
 * ตอบ 200 กับเหตุการณ์ที่รับแล้วหรือเคยรับไปแล้ว (ผู้ให้บริการส่งซ้ำได้)
 * ตอบ 401 เมื่อลายเซ็นไม่ผ่าน และ 409 เมื่อยอดไม่ตรงกับคำขอ เพื่อให้ผู้ให้บริการแจ้งเตือนคนมาตรวจ
 *
 * @param request - คำขอดิบจากผู้ให้บริการ ต้องอ่าน body เป็นข้อความก่อนตรวจลายเซ็น
 * @param context - พารามิเตอร์เส้นทางที่มีรหัสผู้ให้บริการ
 * @returns ผลการรับ webhook
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const provider = findPaymentProvider((await context.params).provider);
  if (!provider) return apiError(ERROR_CODES.NOT_FOUND, 'unknown payment provider', 404);

  try {
    const rawBody = await request.text();
    let event;
    try {
      event = provider.parseWebhook(rawBody, request.headers);
    } catch {
      event = null;
    }
    if (!event) return apiError(ERROR_CODES.UNAUTHORIZED, 'invalid webhook signature', 401);

    // ผู้ให้บริการแจ้งว่าจ่ายไม่สำเร็จ ปล่อยให้ QR หมดอายุไปเอง แคชเชียร์จะเห็นว่ายังไม่ได้รับเงิน
    if (event.status !== 'PAID') return apiOk({ received: true });

    const result = await markPaymentRequestPaid(
      { provider: provider.id, providerRef: event.providerRef },
      event.amount,
      null,
    );
    if (!result.ok && result.reason === 'NOT_FOUND') {
      return apiError(ERROR_CODES.NOT_FOUND, 'payment request not found', 404);
    }
    if (!result.ok) {
      console.error(`[payments] webhook ${provider.id} ${event.providerRef} rejected: ${result.reason}`);
      return apiError(ERROR_CODES.VALIDATION_ERROR, result.reason, 409);
    }
    return apiOk({ received: true, alreadyPaid: result.alreadyPaid });
  } catch (err) {
    return serverError(err, 'POST /api/payments/webhook/[provider]');
  }
}
