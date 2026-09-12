import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, apiError, authFailureResponse, ERROR_CODES, parseId } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { execute, queryOne } from '@/lib/db';
import { TICKET_STATUS_LABELS } from '@/lib/ticket';
import { ticketUpdateSchema, firstErrorMessage } from '@/lib/validation';

/** พารามิเตอร์เส้นทางของ Next.js 15 เป็น Promise จึงต้อง await ก่อนใช้ */
type RouteContext = { params: Promise<{ id: string }> };

/**
 * เปลี่ยนสถานะและผู้รับผิดชอบของเรื่องแจ้งปัญหา
 * ปิดเรื่อง (CLOSED) ทำได้เฉพาะแอดมินตามหัวข้อ 12
 *
 * ทุกครั้งที่สถานะเปลี่ยน จะบันทึกเป็นข้อความหนึ่งบรรทัดลง ticket_replies ด้วย
 * เพราะสเปกกำหนดให้เห็นการเปลี่ยนสถานะเรียงตามเวลาในหน้ารายละเอียด
 * แต่ไม่มีตารางเก็บประวัติสถานะแยก จึงใช้ไทม์ไลน์เดียวกับคำตอบ
 *
 * @param request - คำขอที่มี body เป็น JSON { status, assignedTo }
 * @param context - พารามิเตอร์เส้นทางที่มี id ของเรื่อง
 * @returns สถานะใหม่ หรือ error พร้อมข้อความไทยบอกสาเหตุ
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireStaff();
  if (!auth.ok) return authFailureResponse(auth.reason);

  const id = parseId((await context.params).id);
  if (!id) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, 'รหัสเรื่องแจ้งปัญหาไม่ถูกต้อง กรุณารีเฟรชหน้า');
  }

  const parsed = ticketUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, firstErrorMessage(parsed.error));
  }

  const { status, assignedTo } = parsed.data;
  if (status === 'CLOSED' && auth.user.role !== 'ADMIN') {
    return apiError(
      ERROR_CODES.FORBIDDEN,
      'ปิดเรื่องได้เฉพาะผู้ดูแลระบบ พนักงานเปลี่ยนเป็น "แก้ไขแล้ว" ไว้ก่อนได้',
      403,
    );
  }

  const current = await queryOne<RowDataPacket & { status: string; branch_id: number }>(
    'SELECT status, branch_id FROM tickets WHERE id = ? LIMIT 1',
    [id],
  );
  if (!current) {
    return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบเรื่องแจ้งปัญหานี้ กรุณารีเฟรชหน้า', 404);
  }

  // ตรวจสอบ tenant isolation: พนักงานประจำสาขาไม่สามารถจัดการตั๋วของสาขาอื่นได้
  if (auth.user.branchId && auth.user.branchId !== current.branch_id) {
    return apiError(ERROR_CODES.FORBIDDEN, 'ไม่มีสิทธิ์จัดการเรื่องแจ้งปัญหาของสาขาอื่น', 403);
  }

  // ตรวจว่าผู้รับผิดชอบที่เลือกยังมีอยู่และยังใช้งานได้ ก่อนเขียนลงคอลัมน์ที่มี foreign key
  // ถ้าปล่อยให้ชนที่ระดับฐานข้อมูล ผู้ใช้จะเห็นแค่หน้าพัง ไม่รู้ว่าต้องแก้อะไร
  if (assignedTo) {
    const assignee = await queryOne<RowDataPacket & { id: number }>(
      'SELECT id FROM users WHERE id = ? AND is_active = 1 LIMIT 1',
      [assignedTo],
    );
    if (!assignee) {
      return apiError(
        ERROR_CODES.VALIDATION_ERROR,
        'ผู้รับผิดชอบที่เลือกไม่มีอยู่แล้วหรือถูกปิดใช้งาน กรุณาเลือกคนใหม่จากรายการ',
      );
    }
  }

  await execute('UPDATE tickets SET status = ?, assigned_to = ? WHERE id = ?', [
    status,
    assignedTo || null,
    id,
  ]);

  if (current.status !== status) {
    await execute('INSERT INTO ticket_replies (ticket_id, user_id, message) VALUES (?, ?, ?)', [
      id,
      auth.user.id,
      `เปลี่ยนสถานะจาก "${TICKET_STATUS_LABELS[current.status] ?? current.status}" เป็น "${TICKET_STATUS_LABELS[status] ?? status}"`,
    ]);
  }

  return apiOk({ id, status });
}
