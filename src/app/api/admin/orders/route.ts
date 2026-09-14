import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, serverError, authFailureResponse } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { query } from '@/lib/db';
import { getEffectiveBranchId, getBranchById } from '@/lib/branch';
import {
  getBusinessDayRange,
  getBusinessDayRangeFromDateString,
} from '@/lib/format';

export type BoardOrderRow = RowDataPacket & {
  id: number;
  branch_id: number;
  branch_name: string;
  branch_address: string | null;
  branch_phone: string | null;
  order_code: string;
  order_type: string;
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
  category_name?: string | null;
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
    const activeBranch = branchId ? await getBranchById(branchId) : null;
    const params = request.nextUrl.searchParams;
    const status = params.get('status') ?? '';
    const tableNo = (params.get('tableNo') ?? '').trim();
    const dateParam = params.get('date')?.trim();

    // หากระบุวันที่ ให้คำนวณช่วงวันทำการของวันนั้น หากไม่ระบุให้ใช้ค่าตั้งต้นเป็นวันทำการปัจจุบัน
    const range = dateParam
      ? getBusinessDayRangeFromDateString(dateParam, activeBranch?.businessDayCutoffHour)
      : getBusinessDayRange(undefined, activeBranch?.businessDayCutoffHour);

    const [orders, items] = await Promise.all([
      query<BoardOrderRow>(
        `SELECT o.id, o.branch_id, b.name AS branch_name, b.address AS branch_address, b.phone AS branch_phone,
                o.order_code, o.order_type, o.status, o.total_amount, o.created_at, o.session_id, s.status AS session_status,
                t.table_no
           FROM orders o
           JOIN table_sessions s ON s.id = o.session_id
           JOIN dining_tables t ON t.id = s.table_id
           LEFT JOIN branches b ON b.id = o.branch_id
          WHERE (? IS NULL OR o.branch_id = ?)
            AND (? = '' OR o.status = ?)
            AND (? = '' OR t.table_no = ?)
            AND o.created_at >= ? AND o.created_at < ?
          ORDER BY (o.order_type = 'DINE_IN') DESC, o.id DESC
          LIMIT 100`,
        [branchId, branchId, status, status, tableNo, tableNo, range.startSql, range.endSql],
      ),
      query<BoardItemRow>(
        `SELECT oi.id, oi.order_id, oi.item_name, oi.unit_price, oi.quantity, oi.note, oi.status,
                c.name AS category_name
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           JOIN table_sessions s ON s.id = o.session_id
           JOIN dining_tables t ON t.id = s.table_id
           LEFT JOIN menu_items m ON m.id = oi.menu_item_id
           LEFT JOIN categories c ON c.id = m.category_id
          WHERE (? IS NULL OR o.branch_id = ?)
            AND (? = '' OR o.status = ?)
            AND (? = '' OR t.table_no = ?)
            AND o.created_at >= ? AND o.created_at < ?
          ORDER BY oi.id`,
        [branchId, branchId, status, status, tableNo, tableNo, range.startSql, range.endSql],
      ),
    ]);


    return apiOk({ orders, items });
  } catch (err) {
    return serverError(err, 'GET /api/admin/orders');
  }
}
