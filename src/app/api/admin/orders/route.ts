import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, serverError, authFailureResponse } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { query } from '@/lib/db';
import { getEffectiveBranchId } from '@/lib/branch';
import {
  getBusinessDayRange,
  getBusinessDayRangeFromDateString,
} from '@/lib/format';

export type BoardOrderRow = RowDataPacket & {
  id: number;
  branch_id: number;
  branch_name: string;
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
 * รองรับการกรองตามสาขาที่เลือก (หรือแสดงทุกสาขาสำหรับ HQ Admin)
 * บังคับกรองตามช่วงวันทำการ (Business Day Range) เพื่อให้ใช้ Index บน created_at ได้เต็มประสิทธิภาพ
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireStaff();
    if (!auth.ok) return authFailureResponse(auth.reason);

    const branchId = await getEffectiveBranchId(request, auth.user);
    const params = request.nextUrl.searchParams;
    const status = params.get('status') ?? '';
    const dateParam = params.get('date')?.trim();

    // หากระบุวันที่ ให้คำนวณช่วงวันทำการของวันนั้น หากไม่ระบุให้ใช้ค่าตั้งต้นเป็นวันทำการปัจจุบัน
    const range = dateParam
      ? getBusinessDayRangeFromDateString(dateParam)
      : getBusinessDayRange();

    const [orders, items] = await Promise.all([
      query<BoardOrderRow>(
        `SELECT o.id, o.branch_id, b.name AS branch_name, o.order_code, o.status,
                o.total_amount, o.created_at, o.session_id, s.status AS session_status,
                t.table_no
           FROM orders o
           JOIN table_sessions s ON s.id = o.session_id
           JOIN dining_tables t ON t.id = s.table_id
           LEFT JOIN branches b ON b.id = o.branch_id
          WHERE (? IS NULL OR o.branch_id = ?)
            AND (? = '' OR o.status = ?)
            AND o.created_at >= ? AND o.created_at < ?
          ORDER BY o.id DESC
          LIMIT 100`,
        [branchId, branchId, status, status, range.startSql, range.endSql],
      ),
      query<BoardItemRow>(
        `SELECT oi.id, oi.order_id, oi.item_name, oi.unit_price, oi.quantity, oi.note, oi.status
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           JOIN table_sessions s ON s.id = o.session_id
          WHERE (? IS NULL OR o.branch_id = ?)
            AND (? = '' OR o.status = ?)
            AND o.created_at >= ? AND o.created_at < ?
          ORDER BY oi.id`,
        [branchId, branchId, status, status, range.startSql, range.endSql],
      ),
    ]);

    return apiOk({ orders, items });
  } catch (err) {
    return serverError(err, 'GET /api/admin/orders');
  }
}
