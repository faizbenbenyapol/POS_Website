import type { NextRequest } from 'next/server';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { apiOk, apiError, authFailureResponse, ERROR_CODES } from '@/lib/api';
import { requireCapability } from '@/lib/auth';
import { query, queryOne, withTransaction } from '@/lib/db';
import { generateTicketCode } from '@/lib/ticket';
import { staffTicketSchema, firstErrorMessage } from '@/lib/validation';
import { getEffectiveBranchId } from '@/lib/branch';

export type TicketRow = RowDataPacket & {
  id: number;
  branch_id: number;
  branch_name: string;
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

export type TicketReplyRow = RowDataPacket & {
  id: number;
  ticket_id: number;
  user_name: string | null;
  message: string;
  created_at: string;
};

/**
 * อ่านเรื่องแจ้งปัญหาและรายการคำตอบขนานกันผ่าน Promise.all
 * รองรับการกรองตามสาขาที่เลือก (หรือแสดงทุกสาขาสำหรับ HQ Admin)
 */
export async function GET(request: NextRequest) {
  const auth = await requireCapability('tickets');
  if (!auth.ok) return authFailureResponse(auth.reason);

  const branchId = await getEffectiveBranchId(request, auth.user);
  const params = request.nextUrl.searchParams;
  const status = params.get('status') ?? '';
  const priority = params.get('priority') ?? '';

  const [tickets, replies] = await Promise.all([
    query<TicketRow>(
      `SELECT k.id, k.branch_id, b.name AS branch_name, k.ticket_code, k.source, t.table_no,
              creator.full_name AS created_by_name,
              k.assigned_to, assignee.full_name AS assigned_to_name,
              k.category, k.subject, k.detail, k.priority, k.status,
              k.created_at, k.updated_at
         FROM tickets k
         LEFT JOIN dining_tables t ON t.id = k.table_id
         LEFT JOIN branches b ON b.id = k.branch_id
         LEFT JOIN users creator ON creator.id = k.created_by
         LEFT JOIN users assignee ON assignee.id = k.assigned_to
        WHERE (? IS NULL OR k.branch_id = ?)
          AND (? = '' OR k.status = ?)
          AND (? = '' OR k.priority = ?)
        ORDER BY FIELD(k.priority, 'URGENT', 'NORMAL', 'LOW'), k.id DESC`,
      [branchId, branchId, status, status, priority, priority],
    ),
    query<TicketReplyRow>(
      `SELECT r.id, r.ticket_id, u.full_name AS user_name, r.message, r.created_at
         FROM ticket_replies r
         JOIN tickets k ON k.id = r.ticket_id
         LEFT JOIN users u ON u.id = r.user_id
        WHERE (? IS NULL OR k.branch_id = ?)
          AND (? = '' OR k.status = ?)
          AND (? = '' OR k.priority = ?)
        ORDER BY r.id`,
      [branchId, branchId, status, status, priority, priority],
    ),
  ]);

  return apiOk({ tickets, replies });
}

export async function POST(request: NextRequest) {
  const auth = await requireCapability('tickets');
  if (!auth.ok) return authFailureResponse(auth.reason);

  const parsed = staffTicketSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, firstErrorMessage(parsed.error));
  }

  const { category, subject, detail, priority, tableId } = parsed.data;
  const effectiveBranchId = await getEffectiveBranchId(request, auth.user);
  let targetBranchId = effectiveBranchId ?? auth.user.branchId ?? 1;

  if (tableId) {
    const table = await queryOne<RowDataPacket & { id: number; branch_id: number }>(
      'SELECT id, branch_id FROM dining_tables WHERE id = ?',
      [tableId],
    );
    if (!table) {
      return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบโต๊ะที่ระบุ');
    }
    if (auth.user.branchId && table.branch_id !== auth.user.branchId) {
      return apiError(ERROR_CODES.FORBIDDEN, 'ไม่มีสิทธิ์เปิดเรื่องแจ้งปัญหาสำหรับโต๊ะของสาขาอื่น');
    }
    if (!effectiveBranchId) {
      targetBranchId = table.branch_id;
    }
  }

  const created = await withTransaction(async (conn) => {
    const ticketCode = await generateTicketCode(conn);
    const [result] = await conn.execute<ResultSetHeader>(
      `INSERT INTO tickets (ticket_code, branch_id, source, table_id, created_by, category, subject, detail, priority)
       VALUES (?, ?, 'STAFF', ?, ?, ?, ?, ?, ?)`,
      [ticketCode, targetBranchId, tableId || null, auth.user.id, category, subject, detail, priority],
    );
    return { id: result.insertId, ticketCode };
  });

  return apiOk(created, 201);
}
