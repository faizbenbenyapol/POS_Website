import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, apiError, authFailureResponse, ERROR_CODES } from '@/lib/api';
import { hashPassword, requireStaff } from '@/lib/auth';
import { execute, query, queryOne } from '@/lib/db';
import { createUserSchema, firstErrorMessage } from '@/lib/validation';

/** แถวผู้ใช้ที่ส่งให้หน้าจอ — ไม่ส่ง password_hash ออกไปเด็ดขาด */
export type UserListRow = RowDataPacket & {
  id: number;
  username: string;
  full_name: string;
  role: 'ADMIN' | 'STAFF';
  is_active: number;
  created_at: string;
  activity_count: number;
};

/**
 * อ่านผู้ใช้ระบบทั้งหมด พร้อมนับร่องรอยการทำงาน (ปิดบิล/รับเงิน/ticket)
 * ใช้บอกว่าลบบัญชีจริงได้ไหม หรือต้องปิดใช้งานแทน
 *
 * @returns รายการผู้ใช้เรียงตามบทบาทแล้วตามชื่อผู้ใช้
 */
export async function GET() {
  const auth = await requireStaff('ADMIN');
  if (!auth.ok) return authFailureResponse(auth.reason);

  const rows = await query<UserListRow>(
    `SELECT u.id, u.username, u.full_name, u.role, u.is_active, u.created_at,
            (SELECT COUNT(*) FROM table_sessions s WHERE s.closed_by = u.id)
          + (SELECT COUNT(*) FROM payments p WHERE p.received_by = u.id)
          + (SELECT COUNT(*) FROM tickets k WHERE k.created_by = u.id OR k.assigned_to = u.id)
          + (SELECT COUNT(*) FROM ticket_replies r WHERE r.user_id = u.id) AS activity_count
       FROM users u
      ORDER BY u.role, u.username`,
  );
  return apiOk(rows);
}

/**
 * สร้างผู้ใช้ระบบใหม่ รหัสผ่านถูก hash ด้วย bcrypt ก่อนบันทึกเสมอ
 *
 * @param request - คำขอที่มี body เป็น JSON ตาม createUserSchema
 * @returns id ของผู้ใช้ที่สร้าง หรือ error เมื่อชื่อผู้ใช้ซ้ำ
 */
export async function POST(request: NextRequest) {
  const auth = await requireStaff('ADMIN');
  if (!auth.ok) return authFailureResponse(auth.reason);

  const parsed = createUserSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, firstErrorMessage(parsed.error));
  }

  const { username, password, fullName, role, isActive } = parsed.data;
  const duplicate = await queryOne<RowDataPacket & { id: number }>(
    'SELECT id FROM users WHERE username = ? LIMIT 1',
    [username],
  );
  if (duplicate) {
    return apiError(
      ERROR_CODES.VALIDATION_ERROR,
      `มีชื่อผู้ใช้ ${username} อยู่แล้ว กรุณาตั้งชื่อผู้ใช้อื่น`,
    );
  }

  const result = await execute(
    'INSERT INTO users (username, password_hash, full_name, role, is_active) VALUES (?, ?, ?, ?, ?)',
    [username, await hashPassword(password), fullName, role, isActive ? 1 : 0],
  );
  return apiOk({ id: result.insertId }, 201);
}
