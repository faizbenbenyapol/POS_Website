import { randomBytes } from 'node:crypto';
import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, apiError, authFailureResponse, ERROR_CODES } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { execute, query } from '@/lib/db';
import { tableSchema, firstErrorMessage } from '@/lib/validation';

/** ความยาว qr_token เป็น 32 ตัวอักษรฐานสิบหก ตรงกับคอลัมน์ CHAR(32) */
const QR_TOKEN_BYTES = 16;

/** แถวโต๊ะพร้อมจำนวนรอบการนั่งที่เคยเกิดขึ้น ใช้ตัดสินว่าลบจริงได้ไหม */
export type TableRow = RowDataPacket & {
  id: number;
  table_no: string;
  seats: number;
  qr_token: string;
  is_active: number;
  session_count: number;
  has_open_session: number;
};

/**
 * สุ่ม token ประจำโต๊ะสำหรับใส่ในลิงก์ QR
 * ใช้ randomBytes ของ Node ไม่ใช่ Math.random เพราะ token นี้คือกุญแจเข้าถึงโต๊ะ
 * ถ้าเดาได้ คนนอกจะสั่งอาหารลงโต๊ะคนอื่นได้
 *
 * @returns ข้อความฐานสิบหก 32 ตัวอักษร
 */
function generateQrToken(): string {
  return randomBytes(QR_TOKEN_BYTES).toString('hex');
}

/**
 * อ่านโต๊ะทั้งหมด พร้อมบอกว่าโต๊ะไหนกำลังมีลูกค้านั่งอยู่
 *
 * @returns รายการโต๊ะเรียงตามเลขโต๊ะ
 */
export async function GET() {
  const auth = await requireStaff();
  if (!auth.ok) return authFailureResponse(auth.reason);

  const rows = await query<TableRow>(
    `SELECT t.id, t.table_no, t.seats, t.qr_token, t.is_active,
            (SELECT COUNT(*) FROM table_sessions s WHERE s.table_id = t.id) AS session_count,
            (SELECT COUNT(*) FROM table_sessions s
              WHERE s.table_id = t.id AND s.status = 'OPEN') AS has_open_session
       FROM dining_tables t
      ORDER BY t.table_no`,
  );
  return apiOk(rows);
}

/**
 * เพิ่มโต๊ะใหม่ พร้อมสร้าง qr_token อัตโนมัติให้เลย ผู้ใช้ไม่ต้องกรอกเอง
 *
 * @param request - คำขอที่มี body เป็น JSON ตาม tableSchema
 * @returns id และ qr_token ของโต๊ะที่สร้าง หรือ error เมื่อเลขโต๊ะซ้ำ
 */
export async function POST(request: NextRequest) {
  const auth = await requireStaff('ADMIN');
  if (!auth.ok) return authFailureResponse(auth.reason);

  const parsed = tableSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, firstErrorMessage(parsed.error));
  }

  const { tableNo, seats, isActive } = parsed.data;
  const duplicate = await query<RowDataPacket & { id: number }>(
    'SELECT id FROM dining_tables WHERE table_no = ? LIMIT 1',
    [tableNo],
  );
  if (duplicate.length > 0) {
    return apiError(
      ERROR_CODES.VALIDATION_ERROR,
      `มีโต๊ะเลข ${tableNo} อยู่แล้ว กรุณาตั้งเลขโต๊ะที่ไม่ซ้ำกับของเดิม`,
    );
  }

  const qrToken = generateQrToken();
  const result = await execute(
    'INSERT INTO dining_tables (table_no, seats, qr_token, is_active) VALUES (?, ?, ?, ?)',
    [tableNo, seats, qrToken, isActive ? 1 : 0],
  );
  return apiOk({ id: result.insertId, qrToken }, 201);
}
