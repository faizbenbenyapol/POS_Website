import type { NextRequest } from 'next/server';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { apiOk, apiError, authFailureResponse, ERROR_CODES } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { query, withTransaction } from '@/lib/db';
import { generateTicketCode } from '@/lib/ticket';
import { staffTicketSchema, firstErrorMessage } from '@/lib/validation';

/** เรื่องแจ้งปัญหา 1 เรื่องพร้อมชื่อโต๊ะและชื่อผู้เกี่ยวข้อง */
export type TicketRow = RowDataPacket & {
  id: number;
  ticket_code: string;
  source: string;
  table_no: string | null;
  created_by_name: string | null;
  assigned_to: number | null;
  assigned_to_name: string | null;
  category: string;
  subject: string;
  detail: string;
  priority: string;
  status: string;
  created_at: string;
  updated_at: string;
};

/** ข้อความในไทม์ไลน์ของเรื่อง รวมทั้งคำตอบของพนักงานและบันทึกการเปลี่ยนสถานะ */
export type TicketReplyRow = RowDataPacket & {
  id: number;
  ticket_id: number;
  user_name: string | null;
  message: string;
  created_at: string;
};

/**
 * อ่านเรื่องแจ้งปัญหาทั้งหมด กรองตามสถานะและความเร่งด่วนได้
 * ส่งข้อความตอบกลับของทุกเรื่องมาพร้อมกันในคำตอบเดียว เพื่อให้เปิดดูรายละเอียด
 * ได้ทันทีโดยไม่ต้องยิงคำขอเพิ่ม (สเปกไม่ได้กำหนด endpoint สำหรับอ่านคำตอบแยก)
 *
 * @param request - คำขอที่อาจมี query string status และ priority
 * @returns { tickets, replies } เรียงเรื่องเร่งด่วนและเรื่องใหม่ขึ้นก่อน
 */
export async function GET(request: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return authFailureResponse(auth.reason);

  const params = request.nextUrl.searchParams;
  const status = params.get('status') ?? '';
  const priority = params.get('priority') ?? '';

  const tickets = await query<TicketRow>(
    `SELECT k.id, k.ticket_code, k.source, t.table_no,
            creator.full_name AS created_by_name,
            k.assigned_to, assignee.full_name AS assigned_to_name,
            k.category, k.subject, k.detail, k.priority, k.status,
            k.created_at, k.updated_at
       FROM tickets k
       LEFT JOIN dining_tables t ON t.id = k.table_id
       LEFT JOIN users creator ON creator.id = k.created_by
       LEFT JOIN users assignee ON assignee.id = k.assigned_to
      WHERE (? = '' OR k.status = ?)
        AND (? = '' OR k.priority = ?)
      ORDER BY FIELD(k.priority, 'URGENT', 'NORMAL', 'LOW'), k.id DESC`,
    [status, status, priority, priority],
  );

  if (tickets.length === 0) return apiOk({ tickets, replies: [] });

  const replies = await query<TicketReplyRow>(
    `SELECT r.id, r.ticket_id, u.full_name AS user_name, r.message, r.created_at
       FROM ticket_replies r
       JOIN tickets k ON k.id = r.ticket_id
       LEFT JOIN users u ON u.id = r.user_id
      WHERE (? = '' OR k.status = ?)
        AND (? = '' OR k.priority = ?)
      ORDER BY r.id`,
    [status, status, priority, priority],
  );

  return apiOk({ tickets, replies });
}

/**
 * เปิดเรื่องแจ้งปัญหาจากฝั่งพนักงาน ผูก created_by กับบัญชีที่ล็อกอินอยู่
 *
 * @param request - คำขอที่มี body เป็น JSON ตาม staffTicketSchema
 * @returns รหัส ticket ที่สร้าง หรือ error พร้อมข้อความไทย
 */
export async function POST(request: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return authFailureResponse(auth.reason);

  const parsed = staffTicketSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, firstErrorMessage(parsed.error));
  }

  const { category, subject, detail, priority, tableId } = parsed.data;
  const created = await withTransaction(async (conn) => {
    const ticketCode = await generateTicketCode(conn);
    const [result] = await conn.execute<ResultSetHeader>(
      `INSERT INTO tickets (ticket_code, source, table_id, created_by, category, subject, detail, priority)
       VALUES (?, 'STAFF', ?, ?, ?, ?, ?, ?)`,
      [ticketCode, tableId || null, auth.user.id, category, subject, detail, priority],
    );
    return { id: result.insertId, ticketCode };
  });

  return apiOk(created, 201);
}
