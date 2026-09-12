import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, apiError, authFailureResponse, serverError, ERROR_CODES, parseId } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import { openTableSession } from '@/lib/session';

/** พารามิเตอร์เส้นทางของ Next.js 15 เป็น Promise จึงต้อง await ก่อนใช้ */
type RouteContext = { params: Promise<{ id: string }> };

/**
 * เปิดโต๊ะ (สร้างรอบการนั่งใหม่) สำหรับพนักงานกด 1 แตะ
 * ถ้าโต๊ะเปิดอยู่แล้วจะคืน session เดิมโดยไม่สร้างซ้ำ (idempotent)
 *
 * @param _request - ไม่ต้องมี body
 * @param context - พารามิเตอร์เส้นทางที่มี id ของโต๊ะ
 * @returns sessionId ของรอบการนั่งที่เปิดอยู่
 */
export async function POST(_request: NextRequest, context: RouteContext) {
  const auth = await requireStaff();
  if (!auth.ok) return authFailureResponse(auth.reason);

  const tableId = parseId((await context.params).id);
  if (!tableId) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, 'รหัสโต๊ะไม่ถูกต้อง กรุณารีเฟรชหน้าใหม่');
  }

  try {
    // ตรวจว่าโต๊ะมีอยู่จริงและเปิดใช้งานอยู่
    const table = await queryOne<RowDataPacket & { is_active: number; branch_id: number }>(
      'SELECT is_active, branch_id FROM dining_tables WHERE id = ? LIMIT 1',
      [tableId],
    );
    if (!table) {
      return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบโต๊ะนี้ กรุณารีเฟรชรายการโต๊ะ', 404);
    }
    // ตรวจสอบ tenant isolation: พนักงานประจำสาขาไม่สามารถเปิดโต๊ะของสาขาอื่นได้
    if (auth.user.branchId && auth.user.branchId !== table.branch_id) {
      return apiError(ERROR_CODES.FORBIDDEN, 'ไม่มีสิทธิ์เปิดโต๊ะของสาขาอื่น', 403);
    }
    if (table.is_active !== 1) {
      return apiError(
        ERROR_CODES.VALIDATION_ERROR,
        'โต๊ะนี้ถูกปิดใช้งานอยู่ กรุณาเปิดใช้งานโต๊ะก่อนแล้วค่อยเปิดรอบการนั่ง',
        409,
      );
    }

    const result = await openTableSession(tableId, auth.user.id);
    return apiOk(
      {
        sessionId: result.sessionId,
        created: result.created,
        message: result.created ? 'เปิดโต๊ะเรียบร้อยแล้ว' : 'โต๊ะนี้เปิดอยู่แล้ว',
      },
      result.created ? 201 : 200,
    );
  } catch (err) {
    return serverError(err, 'POST /api/admin/tables/[id]/open');
  }
}
