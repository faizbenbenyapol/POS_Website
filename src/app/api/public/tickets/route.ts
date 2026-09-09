import type { NextRequest } from 'next/server';
import type { ResultSetHeader } from 'mysql2/promise';
import { apiOk, apiError, ERROR_CODES } from '@/lib/api';
import { withTransaction } from '@/lib/db';
import { findTableSession, sessionErrorMessage } from '@/lib/session';
import { generateTicketCode } from '@/lib/ticket';
import { customerTicketSchema, firstErrorMessage } from '@/lib/validation';

/**
 * รับเรื่องแจ้งปัญหาจากลูกค้าที่นั่งอยู่ที่โต๊ะ แล้วคืนรหัส ticket ให้เก็บไว้อ้างอิง
 * ผูก table_id จาก token เสมอ ไม่ให้ลูกค้าระบุโต๊ะเอง เพราะจะแอบอ้างโต๊ะอื่นได้
 *
 * ความเร่งด่วนใช้ค่าตั้งต้น NORMAL ให้พนักงานเป็นคนปรับหลังอ่านเรื่อง
 *
 * @param request - คำขอที่มี body เป็น JSON { token, category, subject, detail }
 * @returns รหัส ticket ที่สร้าง หรือ error พร้อมข้อความไทย
 */
export async function POST(request: NextRequest) {
  const parsed = customerTicketSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, firstErrorMessage(parsed.error));
  }

  const found = await findTableSession(parsed.data.token);
  if (!found.ok) {
    return apiError(ERROR_CODES.NOT_FOUND, sessionErrorMessage(found.reason), 404);
  }

  const created = await withTransaction(async (conn) => {
    const ticketCode = await generateTicketCode(conn);
    const [result] = await conn.execute<ResultSetHeader>(
      `INSERT INTO tickets (ticket_code, source, table_id, category, subject, detail)
       VALUES (?, 'CUSTOMER', ?, ?, ?, ?)`,
      [
        ticketCode,
        found.tableId,
        parsed.data.category,
        parsed.data.subject,
        parsed.data.detail,
      ],
    );
    return { id: result.insertId, ticketCode };
  });

  return apiOk(created, 201);
}
