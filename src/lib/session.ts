import type { RowDataPacket } from 'mysql2/promise';
import { execute, queryOne } from '@/lib/db';

/** ข้อมูลโต๊ะและรอบการนั่งที่ฝั่งลูกค้าต้องใช้ทุกหน้า */
export type TableSession = {
  tableId: number;
  tableNo: string;
  sessionId: number;
};

/** แถวโต๊ะที่ค้นด้วย qr_token */
type TableRow = RowDataPacket & {
  id: number;
  table_no: string;
  is_active: number;
};

/** แถวรอบการนั่งที่กำลังเปิดอยู่ของโต๊ะ */
type SessionRow = RowDataPacket & { id: number };

/**
 * สาเหตุที่ token ใช้ไม่ได้ แยกเป็นรหัสเพื่อให้หน้าจอบอกวิธีแก้ได้ตรงกรณี
 */
export type SessionError = 'TABLE_NOT_FOUND' | 'TABLE_INACTIVE';

/**
 * ตรวจ qr_token จากลิงก์ QR แล้วคืนรอบการนั่งที่เปิดอยู่ของโต๊ะนั้น
 * ถ้ายังไม่มีรอบที่เปิดอยู่จะเปิดรอบใหม่ให้เลย เพราะลูกค้ากลุ่มใหม่เพิ่งนั่งลง
 *
 * นี่คือด่านตรวจสิทธิ์เดียวของฝั่งลูกค้า ทุก API ฝั่งลูกค้าต้องเรียกฟังก์ชันนี้ก่อนเสมอ
 * เพื่อไม่ให้ลูกค้าโต๊ะหนึ่งอ่านหรือแก้ข้อมูลของโต๊ะอื่นได้
 *
 * @param token - qr_token 32 ตัวอักษรที่ติดมากับลิงก์
 * @returns ข้อมูลโต๊ะและ session id เมื่อ token ใช้ได้ หรือรหัสสาเหตุเมื่อใช้ไม่ได้
 */
export async function resolveTableSession(
  token: string,
): Promise<{ ok: true; session: TableSession } | { ok: false; reason: SessionError }> {
  const table = await queryOne<TableRow>(
    'SELECT id, table_no, is_active FROM dining_tables WHERE qr_token = ? LIMIT 1',
    [token],
  );
  if (!table) return { ok: false, reason: 'TABLE_NOT_FOUND' };
  if (table.is_active !== 1) return { ok: false, reason: 'TABLE_INACTIVE' };

  const open = await queryOne<SessionRow>(
    "SELECT id FROM table_sessions WHERE table_id = ? AND status = 'OPEN' ORDER BY id DESC LIMIT 1",
    [table.id],
  );

  const sessionId =
    open?.id ??
    (await execute('INSERT INTO table_sessions (table_id, status) VALUES (?, ?)', [
      table.id,
      'OPEN',
    ])).insertId;

  return {
    ok: true,
    session: { tableId: table.id, tableNo: table.table_no, sessionId },
  };
}

/**
 * ตรวจ token โดยไม่เปิดรอบการนั่งใหม่ ใช้กับหน้าที่แค่อ่านข้อมูล เช่นหน้าสถานะออเดอร์
 * แยกจาก resolveTableSession เพื่อไม่ให้การกดดูสถานะเฉย ๆ ไปเปิดรอบใหม่ให้โต๊ะที่เพิ่งปิดบิล
 *
 * @param token - qr_token 32 ตัวอักษรที่ติดมากับลิงก์
 * @returns ข้อมูลโต๊ะและ session id ที่เปิดอยู่ (เป็น null ถ้าไม่มีรอบเปิด) หรือรหัสสาเหตุ
 */
export async function findTableSession(
  token: string,
): Promise<
  | { ok: true; tableId: number; tableNo: string; sessionId: number | null }
  | { ok: false; reason: SessionError }
> {
  const table = await queryOne<TableRow>(
    'SELECT id, table_no, is_active FROM dining_tables WHERE qr_token = ? LIMIT 1',
    [token],
  );
  if (!table) return { ok: false, reason: 'TABLE_NOT_FOUND' };
  if (table.is_active !== 1) return { ok: false, reason: 'TABLE_INACTIVE' };

  const open = await queryOne<SessionRow>(
    "SELECT id FROM table_sessions WHERE table_id = ? AND status = 'OPEN' ORDER BY id DESC LIMIT 1",
    [table.id],
  );
  return { ok: true, tableId: table.id, tableNo: table.table_no, sessionId: open?.id ?? null };
}

/**
 * แปลงสาเหตุที่ token ใช้ไม่ได้ให้เป็นข้อความไทยที่บอกลูกค้าว่าต้องทำอะไรต่อ
 * ลูกค้าอยู่หน้าโต๊ะ จึงต้องบอกวิธีแก้ที่ทำได้จริงตรงนั้น ไม่ใช่ศัพท์เทคนิค
 *
 * @param reason - รหัสสาเหตุจาก resolveTableSession หรือ findTableSession
 * @returns ข้อความภาษาไทยพร้อมแสดงบนหน้าจอ
 */
export function sessionErrorMessage(reason: SessionError): string {
  if (reason === 'TABLE_INACTIVE') {
    return 'โต๊ะนี้ปิดใช้งานชั่วคราว กรุณาแจ้งพนักงานเพื่อย้ายโต๊ะหรือเปิดโต๊ะให้ใหม่';
  }
  return 'ไม่พบโต๊ะนี้ในระบบ กรุณาสแกน QR บนโต๊ะอีกครั้ง หรือแจ้งพนักงานให้ช่วยตรวจสอบ';
}
