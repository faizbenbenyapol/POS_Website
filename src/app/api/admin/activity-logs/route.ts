import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, serverError, authFailureResponse } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { query } from '@/lib/db';
import { getEffectiveBranchId, getActiveBranch } from '@/lib/branch';
import { getBusinessDayRangeFromDateString, getBusinessDayRange } from '@/lib/format';

/** จำนวนรายการสูงสุดที่คืนต่อ 1 คำขอ กันดึงยกฐานข้อมูลมาทั้งก้อน */
const MAX_LOGS = 200;

/** ประเภทกิจกรรมที่หน้าบันทึกการทำงานแสดงได้ */
export type ActivityKind = 'ORDER_STATUS' | 'CHECKOUT';

/** กิจกรรม 1 บรรทัดบนหน้าบันทึกการทำงาน รวมมาจากหลายตาราง */
export type ActivityLog = {
  id: string;
  kind: ActivityKind;
  createdAt: string;
  actorName: string;
  branchName: string | null;
  tableNo: string | null;
  orderCode: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  amount: number | null;
  method: string | null;
};

/** แถวดิบจากตาราง order_status_logs */
type OrderLogRow = RowDataPacket & {
  id: number;
  order_code: string;
  table_no: string;
  from_status: string | null;
  to_status: string;
  created_at: string;
  actor_name: string;
  branch_name: string | null;
};

/** แถวดิบจากตาราง payments */
type PaymentLogRow = RowDataPacket & {
  id: number;
  method: string;
  total_amount: string;
  created_at: string;
  actor_name: string;
  branch_name: string | null;
  table_no: string;
};

/**
 * ดึงบันทึกการทำงานของพนักงานสำหรับให้เจ้าของร้านตรวจย้อนหลัง
 * รวม 2 เรื่องไว้ในไทม์ไลน์เดียว: ใครเปลี่ยนสถานะออเดอร์ (รับออเดอร์/เสิร์ฟ/ยกเลิก)
 * และใครเป็นคนปิดบิลรับเงิน
 *
 * @param request - คำขอที่อาจระบุ date (YYYY-MM-DD) และ kind (ORDER_STATUS | CHECKOUT) ใน query string
 * @returns รายการกิจกรรมเรียงจากใหม่ไปเก่า สูงสุด 200 รายการ
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireStaff('ADMIN');
    if (!auth.ok) return authFailureResponse(auth.reason);

    const branchId = await getEffectiveBranchId(request, auth.user);
    const activeBranch = await getActiveBranch(request, auth.user);
    const cutoffHour = activeBranch?.businessDayCutoffHour;

    const params = request.nextUrl.searchParams;
    const dateStr = (params.get('date') ?? '').trim();
    const kind = (params.get('kind') ?? '').trim();

    // ไม่ระบุวันที่ให้ใช้วันทำการปัจจุบัน เพื่อให้ query ใช้ index บน created_at ได้เสมอ
    const range = dateStr
      ? getBusinessDayRangeFromDateString(dateStr, cutoffHour)
      : getBusinessDayRange(undefined, cutoffHour);

    const wantOrders = kind === '' || kind === 'ORDER_STATUS';
    const wantCheckouts = kind === '' || kind === 'CHECKOUT';

    const [orderLogs, paymentLogs] = await Promise.all([
      wantOrders
        ? query<OrderLogRow>(
            `SELECT l.id, l.order_code, l.table_no, l.from_status, l.to_status, l.created_at,
                    u.full_name AS actor_name, b.name AS branch_name
               FROM order_status_logs l
               JOIN users u ON u.id = l.changed_by
               LEFT JOIN branches b ON b.id = l.branch_id
              WHERE (? IS NULL OR l.branch_id = ?)
                AND l.created_at >= ? AND l.created_at < ?
              ORDER BY l.id DESC
              LIMIT ${MAX_LOGS}`,
            [branchId, branchId, range.startSql, range.endSql],
          )
        : Promise.resolve([]),
      wantCheckouts
        ? query<PaymentLogRow>(
            `SELECT p.id, p.method, p.total_amount, p.paid_at AS created_at,
                    u.full_name AS actor_name, b.name AS branch_name, t.table_no
               FROM payments p
               JOIN users u ON u.id = p.received_by
               JOIN table_sessions s ON s.id = p.session_id
               JOIN dining_tables t ON t.id = s.table_id
               LEFT JOIN branches b ON b.id = p.branch_id
              WHERE (? IS NULL OR p.branch_id = ?)
                AND p.paid_at >= ? AND p.paid_at < ?
              ORDER BY p.id DESC
              LIMIT ${MAX_LOGS}`,
            [branchId, branchId, range.startSql, range.endSql],
          )
        : Promise.resolve([]),
    ]);

    const merged: ActivityLog[] = [
      ...orderLogs.map((row) => ({
        id: `order-${row.id}`,
        kind: 'ORDER_STATUS' as const,
        createdAt: row.created_at,
        actorName: row.actor_name,
        branchName: row.branch_name,
        tableNo: row.table_no,
        orderCode: row.order_code,
        fromStatus: row.from_status,
        toStatus: row.to_status,
        amount: null,
        method: null,
      })),
      ...paymentLogs.map((row) => ({
        id: `payment-${row.id}`,
        kind: 'CHECKOUT' as const,
        createdAt: row.created_at,
        actorName: row.actor_name,
        branchName: row.branch_name,
        tableNo: row.table_no,
        orderCode: null,
        fromStatus: null,
        toStatus: null,
        amount: Number(row.total_amount),
        method: row.method,
      })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, MAX_LOGS);

    return apiOk(merged);
  } catch (err) {
    return serverError(err, 'GET /api/admin/activity-logs');
  }
}
