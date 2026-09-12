import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, serverError, authFailureResponse } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { query } from '@/lib/db';
import { getEffectiveBranchId, getActiveBranch } from '@/lib/branch';
import { getBusinessDayRangeFromDateString } from '@/lib/format';

export type CancellationLogRow = RowDataPacket & {
  id: number;
  branch_id: number;
  branch_name: string;
  entity_type: 'ORDER_ITEM' | 'ORDER' | 'SESSION';
  entity_id: number;
  order_code: string | null;
  table_no: string;
  item_name: string | null;
  quantity: number | null;
  amount: string;
  reason: string;
  cancelled_by: number;
  cancelled_by_name: string;
  created_at: string;
};

/**
 * ดึงรายการบันทึกประวัติการยกเลิกอาหารและออเดอร์ (Cancellation Audit Logs)
 * สำหรับให้ผู้จัดการ/เจ้าของร้านตรวจสอบการตัดเงินย้อนหลัง
 * รองรับการกรองตามสาขา, วันที่ (คำนวณตาม cutoffHour), โต๊ะ และสาเหตุการยกเลิก
 *
 * @param request - คำขอที่อาจระบุ date, reason, tableNo หรือ branchId ใน query string
 * @returns รายการ audit logs สูงสุด 200 รายการ
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireStaff();
    if (!auth.ok) return authFailureResponse(auth.reason);

    const branchId = await getEffectiveBranchId(request, auth.user);
    const activeBranch = await getActiveBranch(request, auth.user);
    const cutoffHour = activeBranch?.businessDayCutoffHour;

    const params = request.nextUrl.searchParams;
    const tableNo = (params.get('tableNo') ?? '').trim();
    const reason = (params.get('reason') ?? '').trim();
    const dateStr = (params.get('date') ?? '').trim();

    let dateStartSql: string | null = null;
    let dateEndSql: string | null = null;

    if (dateStr) {
      const range = getBusinessDayRangeFromDateString(dateStr, cutoffHour);
      dateStartSql = range.startSql;
      dateEndSql = range.endSql;
    }

    const rows = await query<CancellationLogRow>(
      `SELECT c.id, c.branch_id, b.name AS branch_name, c.entity_type, c.entity_id,
              c.order_code, c.table_no, c.item_name, c.quantity, c.amount, c.reason,
              c.cancelled_by, u.full_name AS cancelled_by_name, c.created_at
         FROM cancellation_audit_logs c
         JOIN users u ON u.id = c.cancelled_by
         LEFT JOIN branches b ON b.id = c.branch_id
        WHERE (? IS NULL OR c.branch_id = ?)
          AND (? = '' OR c.table_no = ?)
          AND (? = '' OR c.reason = ?)
          AND (? IS NULL OR (c.created_at >= ? AND c.created_at < ?))
        ORDER BY c.id DESC
        LIMIT 200`,
      [
        branchId,
        branchId,
        tableNo,
        tableNo,
        reason,
        reason,
        dateStartSql,
        dateStartSql,
        dateEndSql,
      ],
    );

    return apiOk(rows);
  } catch (err) {
    return serverError(err, 'GET /api/admin/cancellations');
  }
}

