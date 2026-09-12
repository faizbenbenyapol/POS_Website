import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, apiError, authFailureResponse, ERROR_CODES, parseId } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { execute, queryOne } from '@/lib/db';
import { ticketReplySchema, firstErrorMessage } from '@/lib/validation';

/** พารามิเตอร์เส้นทางของ Next.js 15 เป็น Promise จึงต้อง await ก่อนใช้ */
type RouteContext = { params: Promise<{ id: string }> };

/**
 * บันทึกข้อความตอบกลับของพนักงานในเรื่องแจ้งปัญหา
 * ตอบเรื่องที่ปิดไปแล้วไม่ได้ ถ้ามีเรื่องเพิ่มให้เปิดเรื่องใหม่ เพื่อไม่ให้ประวัติที่ปิดแล้วขยับ
 *
 * @param request - คำขอที่มี body เป็น JSON { message }
 * @param context - พารามิเตอร์เส้นทางที่มี id ของเรื่อง
 * @returns id ของข้อความที่บันทึก หรือ error พร้อมข้อความไทย
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireStaff();
  if (!auth.ok) return authFailureResponse(auth.reason);

  const id = parseId((await context.params).id);
  if (!id) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, 'รหัสเรื่องแจ้งปัญหาไม่ถูกต้อง กรุณารีเฟรชหน้า');
  }

  const parsed = ticketReplySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, firstErrorMessage(parsed.error));
  }

  const ticket = await queryOne<RowDataPacket & { status: string; branch_id: number }>(
    'SELECT status, branch_id FROM tickets WHERE id = ? LIMIT 1',
    [id],
  );
  if (!ticket) {
    return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบเรื่องแจ้งปัญหานี้ กรุณารีเฟรชหน้า', 404);
  }

  // ตรวจสอบ tenant isolation: พนักงานประจำสาขาไม่สามารถตอบกลับเรื่องของสาขาอื่นได้
  if (auth.user.branchId && auth.user.branchId !== ticket.branch_id) {
    return apiError(ERROR_CODES.FORBIDDEN, 'ไม่มีสิทธิ์ตอบกลับเรื่องแจ้งปัญหาของสาขาอื่น', 403);
  }
  if (ticket.status === 'CLOSED') {
    return apiError(
      ERROR_CODES.VALIDATION_ERROR,
      'เรื่องนี้ปิดไปแล้ว ตอบกลับเพิ่มไม่ได้ ถ้ายังมีปัญหาให้เปิดเรื่องใหม่',
      409,
    );
  }

  const result = await execute(
    'INSERT INTO ticket_replies (ticket_id, user_id, message) VALUES (?, ?, ?)',
    [id, auth.user.id, parsed.data.message],
  );
  // แตะ updated_at ให้ขยับ เพื่อให้เรียงลำดับตามความเคลื่อนไหวล่าสุดได้ถูกต้อง
  await execute('UPDATE tickets SET updated_at = NOW() WHERE id = ?', [id]);
  return apiOk({ id: result.insertId }, 201);
}
