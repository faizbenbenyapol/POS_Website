import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, apiError, authFailureResponse, ERROR_CODES, parseId } from '@/lib/api';
import { hashPassword, requireStaff } from '@/lib/auth';
import { execute, queryOne } from '@/lib/db';
import { updateUserSchema, firstErrorMessage } from '@/lib/validation';

/** พารามิเตอร์เส้นทางของ Next.js 15 เป็น Promise จึงต้อง await ก่อนใช้ */
type RouteContext = { params: Promise<{ id: string }> };

/**
 * แก้ไขผู้ใช้ระบบ เว้นช่องรหัสผ่านว่างไว้แปลว่าไม่เปลี่ยนรหัสผ่านเดิม
 * กันแอดมินลดสิทธิ์หรือปิดบัญชีตัวเอง เพราะจะทำให้ล็อกตัวเองออกจากระบบทันที
 *
 * @param request - คำขอที่มี body เป็น JSON ตาม updateUserSchema
 * @param context - พารามิเตอร์เส้นทางที่มี id ของผู้ใช้
 * @returns ผลสำเร็จ หรือ error พร้อมข้อความไทยบอกสาเหตุ
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireStaff('ADMIN');
  if (!auth.ok) return authFailureResponse(auth.reason);

  const id = parseId((await context.params).id);
  if (!id) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, 'รหัสผู้ใช้ไม่ถูกต้อง กรุณากลับไปเลือกใหม่');
  }

  const parsed = updateUserSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, firstErrorMessage(parsed.error));
  }

  const { username, password, fullName, role, isActive } = parsed.data;
  if (id === auth.user.id && (role !== 'ADMIN' || !isActive)) {
    return apiError(
      ERROR_CODES.VALIDATION_ERROR,
      'ลดสิทธิ์หรือปิดบัญชีของตัวเองไม่ได้ ให้แอดมินคนอื่นเป็นผู้ดำเนินการแทน',
      409,
    );
  }

  const duplicate = await queryOne<RowDataPacket & { id: number }>(
    'SELECT id FROM users WHERE username = ? AND id <> ? LIMIT 1',
    [username, id],
  );
  if (duplicate) {
    return apiError(
      ERROR_CODES.VALIDATION_ERROR,
      `มีชื่อผู้ใช้ ${username} อยู่แล้ว กรุณาตั้งชื่อผู้ใช้อื่น`,
    );
  }

  const result = password
    ? await execute(
        'UPDATE users SET username = ?, full_name = ?, role = ?, is_active = ?, password_hash = ? WHERE id = ?',
        [username, fullName, role, isActive ? 1 : 0, await hashPassword(password), id],
      )
    : await execute(
        'UPDATE users SET username = ?, full_name = ?, role = ?, is_active = ? WHERE id = ?',
        [username, fullName, role, isActive ? 1 : 0, id],
      );

  if (result.affectedRows === 0) {
    return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบผู้ใช้นี้ อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า', 404);
  }
  return apiOk({ id });
}

/**
 * ลบผู้ใช้ระบบ ถ้าเคยปิดบิล รับเงิน หรือแตะ ticket แล้วจะเปลี่ยนเป็นปิดใช้งานแทน
 * เพราะประวัติเหล่านั้นอ้างถึงผู้ใช้คนนี้ ถ้าลบจริงจะสืบย้อนไม่ได้ว่าใครทำ
 *
 * @param _request - ไม่ได้ใช้ body แต่ต้องรับไว้ตามลายเซ็นของ route handler
 * @param context - พารามิเตอร์เส้นทางที่มี id ของผู้ใช้
 * @returns mode บอกว่าลบจริงหรือปิดใช้งาน พร้อมข้อความอธิบายให้แสดงบนหน้าจอ
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await requireStaff('ADMIN');
  if (!auth.ok) return authFailureResponse(auth.reason);

  const id = parseId((await context.params).id);
  if (!id) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, 'รหัสผู้ใช้ไม่ถูกต้อง กรุณากลับไปเลือกใหม่');
  }
  if (id === auth.user.id) {
    return apiError(
      ERROR_CODES.VALIDATION_ERROR,
      'ลบบัญชีที่กำลังใช้งานอยู่ไม่ได้ ให้แอดมินคนอื่นเป็นผู้ลบบัญชีนี้แทน',
      409,
    );
  }

  const usage = await queryOne<RowDataPacket & { activity_count: number }>(
    `SELECT (SELECT COUNT(*) FROM table_sessions s WHERE s.closed_by = ? OR s.opened_by = ?)
          + (SELECT COUNT(*) FROM payments p WHERE p.received_by = ?)
          + (SELECT COUNT(*) FROM tickets k WHERE k.created_by = ? OR k.assigned_to = ?)
          + (SELECT COUNT(*) FROM ticket_replies r WHERE r.user_id = ?) AS activity_count`,
    [id, id, id, id, id, id],
  );

  if (Number(usage?.activity_count ?? 0) > 0) {
    const result = await execute('UPDATE users SET is_active = 0 WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบผู้ใช้นี้ อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า', 404);
    }
    return apiOk({
      mode: 'DEACTIVATED' as const,
      message: `บัญชีนี้มีประวัติการทำงานในระบบแล้ว ${usage?.activity_count} รายการ จึงเปลี่ยนเป็นปิดใช้งานแทนการลบ ผู้ใช้จะล็อกอินไม่ได้ แต่ยังสืบย้อนได้ว่าใครทำรายการไหน`,
    });
  }

  const result = await execute('DELETE FROM users WHERE id = ?', [id]);
  if (result.affectedRows === 0) {
    return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบผู้ใช้นี้ อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า', 404);
  }
  return apiOk({ mode: 'DELETED' as const, message: 'ลบผู้ใช้เรียบร้อยแล้ว' });
}
