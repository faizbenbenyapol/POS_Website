import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, apiError, authFailureResponse, ERROR_CODES, parseId } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { execute, queryOne } from '@/lib/db';
import { tableSchema, firstErrorMessage } from '@/lib/validation';

/** พารามิเตอร์เส้นทางของ Next.js 15 เป็น Promise จึงต้อง await ก่อนใช้ */
type RouteContext = { params: Promise<{ id: string }> };

/**
 * แก้ไขข้อมูลโต๊ะ ไม่แตะ qr_token เพราะ QR ที่ติดอยู่บนโต๊ะจริงจะใช้ไม่ได้ทันที
 *
 * @param request - คำขอที่มี body เป็น JSON ตาม tableSchema
 * @param context - พารามิเตอร์เส้นทางที่มี id ของโต๊ะ
 * @returns ผลสำเร็จ หรือ error เมื่อเลขโต๊ะซ้ำหรือไม่พบโต๊ะ
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireStaff('ADMIN');
  if (!auth.ok) return authFailureResponse(auth.reason);

  const id = parseId((await context.params).id);
  if (!id) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, 'รหัสโต๊ะไม่ถูกต้อง กรุณากลับไปเลือกใหม่');
  }

  const parsed = tableSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, firstErrorMessage(parsed.error));
  }

  const { tableNo, seats, isActive, branchId } = parsed.data;

  const currentTable = await queryOne<RowDataPacket & { branch_id: number }>(
    'SELECT branch_id FROM dining_tables WHERE id = ? LIMIT 1',
    [id],
  );
  if (!currentTable) {
    return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบโต๊ะนี้ อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า', 404);
  }

  // ตรวจสอบ tenant isolation: แอดมินประจำสาขาไม่สามารถแก้ไขโต๊ะของสาขาอื่น หรือย้ายโต๊ะข้ามสาขา
  if (auth.user.branchId !== null && auth.user.branchId !== undefined) {
    if (currentTable.branch_id !== auth.user.branchId) {
      return apiError(ERROR_CODES.FORBIDDEN, 'ไม่มีสิทธิ์แก้ไขโต๊ะของสาขาอื่น', 403);
    }
    if (branchId && branchId !== auth.user.branchId) {
      return apiError(ERROR_CODES.FORBIDDEN, 'ไม่สามารถย้ายโต๊ะไปสาขาอื่นได้', 403);
    }
  }

  const targetBranchId = auth.user.branchId ?? branchId ?? currentTable.branch_id;

  const duplicate = await queryOne<RowDataPacket & { id: number }>(
    'SELECT id FROM dining_tables WHERE branch_id = ? AND table_no = ? AND id <> ? LIMIT 1',
    [targetBranchId, tableNo, id],
  );
  if (duplicate) {
    return apiError(
      ERROR_CODES.VALIDATION_ERROR,
      `มีโต๊ะเลข ${tableNo} ในสาขานี้อยู่แล้ว กรุณาตั้งเลขโต๊ะที่ไม่ซ้ำกับของเดิม`,
    );
  }

  const result = await execute(
    'UPDATE dining_tables SET branch_id = ?, table_no = ?, seats = ?, is_active = ? WHERE id = ?',
    [targetBranchId, tableNo, seats, isActive ? 1 : 0, id],
  );
  if (result.affectedRows === 0) {
    return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบโต๊ะนี้ อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า', 404);
  }
  return apiOk({ id });
}

/**
 * ลบโต๊ะ ถ้าเคยมีลูกค้านั่งแล้วจะเปลี่ยนเป็นปิดใช้งานแทน เพราะบิลเก่าอ้างถึงโต๊ะนี้อยู่
 * และห้ามลบ/ปิดโต๊ะที่กำลังมีลูกค้านั่ง เพราะจะทำให้ลูกค้าสั่งต่อไม่ได้กลางคัน
 *
 * @param _request - ไม่ได้ใช้ body แต่ต้องรับไว้ตามลายเซ็นของ route handler
 * @param context - พารามิเตอร์เส้นทางที่มี id ของโต๊ะ
 * @returns mode บอกว่าลบจริงหรือปิดใช้งาน พร้อมข้อความอธิบายให้แสดงบนหน้าจอ
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await requireStaff('ADMIN');
  if (!auth.ok) return authFailureResponse(auth.reason);

  const id = parseId((await context.params).id);
  if (!id) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, 'รหัสโต๊ะไม่ถูกต้อง กรุณากลับไปเลือกใหม่');
  }

  // ตรวจสอบว่าโต๊ะมีอยู่จริงและสังกัดสาขาใด
  const currentTable = await queryOne<RowDataPacket & { branch_id: number }>(
    'SELECT branch_id FROM dining_tables WHERE id = ? LIMIT 1',
    [id],
  );
  if (!currentTable) {
    return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบโต๊ะนี้ อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า', 404);
  }

  // ตรวจสอบ tenant isolation: แอดมินประจำสาขาไม่สามารถลบโต๊ะของสาขาอื่น
  if (auth.user.branchId !== null && auth.user.branchId !== undefined) {
    if (currentTable.branch_id !== auth.user.branchId) {
      return apiError(ERROR_CODES.FORBIDDEN, 'ไม่มีสิทธิ์ลบโต๊ะของสาขาอื่น', 403);
    }
  }

  // นับทั้งรอบการนั่งและ ticket ที่ผูกโต๊ะนี้ เพราะทั้งสองตารางอ้างถึง dining_tables ด้วย foreign key
  const usage = await queryOne<
    RowDataPacket & { session_count: number; open_count: number; ticket_count: number }
  >(
    `SELECT
       (SELECT COUNT(*) FROM table_sessions s WHERE s.table_id = ?) AS session_count,
       (SELECT COUNT(*) FROM table_sessions s WHERE s.table_id = ? AND s.status = 'OPEN') AS open_count,
       (SELECT COUNT(*) FROM tickets k WHERE k.table_id = ?) AS ticket_count`,
    [id, id, id],
  );

  if (Number(usage?.open_count ?? 0) > 0) {
    return apiError(
      ERROR_CODES.VALIDATION_ERROR,
      'โต๊ะนี้กำลังมีลูกค้านั่งอยู่ กรุณาปิดบิลของโต๊ะให้เรียบร้อยก่อนแล้วค่อยลบ',
      409,
    );
  }

  const historyCount = Number(usage?.session_count ?? 0) + Number(usage?.ticket_count ?? 0);
  if (historyCount > 0) {
    const result = await execute('UPDATE dining_tables SET is_active = 0 WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบโต๊ะนี้ อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า', 404);
    }
    return apiOk({
      mode: 'DEACTIVATED' as const,
      message: `โต๊ะนี้มีประวัติผูกอยู่แล้ว (นั่ง ${usage?.session_count} รอบ, แจ้งปัญหา ${usage?.ticket_count} เรื่อง) จึงเปลี่ยนเป็นปิดใช้งานแทนการลบ QR เดิมจะสแกนไม่ได้ แต่บิลเก่ายังอ่านได้ครบ`,
    });
  }

  const result = await execute('DELETE FROM dining_tables WHERE id = ?', [id]);
  if (result.affectedRows === 0) {
    return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบโต๊ะนี้ อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า', 404);
  }
  return apiOk({ mode: 'DELETED' as const, message: 'ลบโต๊ะเรียบร้อยแล้ว' });
}
