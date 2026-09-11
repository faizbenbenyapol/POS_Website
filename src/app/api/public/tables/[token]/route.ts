import type { NextRequest } from 'next/server';
import { apiOk, apiError, serverError, ERROR_CODES } from '@/lib/api';
import { resolveTableSession, sessionErrorMessage } from '@/lib/session';

/** พารามิเตอร์เส้นทางของ Next.js 15 เป็น Promise จึงต้อง await ก่อนใช้ */
type RouteContext = { params: Promise<{ token: string }> };

/**
 * ตรวจ token จากลิงก์ QR แล้วคืนข้อมูลโต๊ะพร้อมรอบการนั่งที่เปิดอยู่
 * ถ้าโต๊ะยังไม่มีรอบเปิด จะเปิดรอบใหม่ให้ทันที เพราะการสแกน QR แปลว่าลูกค้าเพิ่งนั่งลง
 *
 * @param _request - ไม่ได้ใช้ body แต่ต้องรับไว้ตามลายเซ็นของ route handler
 * @param context - พารามิเตอร์เส้นทางที่มี token ของโต๊ะ
 * @returns ข้อมูลโต๊ะและ sessionId หรือ error ที่บอกลูกค้าว่าต้องทำอะไรต่อ
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    const result = await resolveTableSession(token);
    if (!result.ok) {
      return apiError(ERROR_CODES.NOT_FOUND, sessionErrorMessage(result.reason), 404);
    }
    return apiOk(result.session);
  } catch (err) {
    return serverError(err, 'GET /api/public/tables/[token]');
  }
}
