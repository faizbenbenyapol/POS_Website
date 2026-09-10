import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, authFailureResponse } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { query } from '@/lib/db';

export type BoardOrderRow = RowDataPacket & {
  id: number;
  order_code: string;
  status: string;
  total_amount: string;
  created_at: string;
  session_id: number;
  session_status: string;
  table_no: string;
};

export type BoardItemRow = RowDataPacket & {
  id: number;
  order_id: number;
  item_name: string;
  unit_price: string;
  quantity: number;
  note: string | null;
  status: string;
};

/**
 * อ่านออเดอร์และรายการอาหารสำหรับกระดานฝั่งร้านโดยยิงขนานกันผ่าน Promise.all
 */
export async function GET(request: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return authFailureResponse(auth.reason);

  const params = request.nextUrl.searchParams;
  const status = params.get('status') ?? '';
  const date = params.get('date') ?? '';

  const [orders, items] = await Promise.all([
    query<BoardOrderRow>(
      `SELECT o.id, o.order_code, o.status, o.total_amount, o.created_at,
              o.session_id, s.status AS session_status, t.table_no
         FROM orders o
         JOIN table_sessions s ON s.id = o.session_id
         JOIN dining_tables t ON t.id = s.table_id
        WHERE (? = '' OR o.status = ?)
          AND (? = '' OR DATE(o.created_at) = ?)
        ORDER BY o.id DESC`,
      [status, status, date, date],
    ),
    query<BoardItemRow>(
      `SELECT oi.id, oi.order_id, oi.item_name, oi.unit_price, oi.quantity, oi.note, oi.status
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN table_sessions s ON s.id = o.session_id
        WHERE (? = '' OR o.status = ?)
          AND (? = '' OR DATE(o.created_at) = ?)
        ORDER BY oi.id`,
      [status, status, date, date],
    ),
  ]);

  return apiOk({ orders, items });
}
