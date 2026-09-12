import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, serverError, authFailureResponse } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { query } from '@/lib/db';
import { getEffectiveBranchId, getActiveBranch } from '@/lib/branch';
import {
  businessDayRange,
  getBusinessDayRangeFromDateString,
  getBusinessCutoffHour,
} from '@/lib/format';

/** ข้อมูลสรุปช่องทางชำระเงิน */
export type PaymentMethodSummary = {
  method: 'CASH' | 'TRANSFER' | 'CARD';
  count: number;
  total: number;
};

/** ข้อมูลสรุปรายแคชเชียร์ */
export type CashierSummary = {
  cashierId: number;
  cashierName: string;
  method: 'CASH' | 'TRANSFER' | 'CARD';
  count: number;
  total: number;
};

/** ข้อมูลสรุปยอดขายแยกตามหมวดหมู่ */
export type CategorySalesSummary = {
  categoryId: number | null;
  categoryName: string;
  quantity: number;
  total: number;
};

/** ข้อมูลสรุปเมนูขายดี */
export type TopSellingItemSummary = {
  menuItemId: number;
  itemName: string;
  quantity: number;
  total: number;
};

/** ข้อมูลสรุปการยกเลิกตามสาเหตุ */
export type VoidReasonSummary = {
  reason: string;
  count: number;
  total: number;
};

/** ข้อมูลสรุปปิดยอดประจำวันเต็มรูปแบบ */
export type DailySettlementReport = {
  branchId: number | null;
  branchName: string;
  branchCode: string;
  cutoffHour: number;
  businessDate: string;
  startTime: string;
  endTime: string;
  generatedAt: string;
  // ภาพรวมยอดขาย
  totalRevenue: number;
  totalBills: number;
  avgBillAmount: number;
  firstPaymentTime: string | null;
  lastPaymentTime: string | null;
  // ช่องทางชำระเงิน
  paymentMethods: PaymentMethodSummary[];
  cashTotal: number;
  transferTotal: number;
  cardTotal: number;
  // โต๊ะค้างชำระปัจจุบัน
  unpaidSessionsCount: number;
  unpaidEstimatedAmount: number;
  // ยอดรับเงินรายแคชเชียร์
  cashiers: CashierSummary[];
  // ยอดขายตามหมวดหมู่
  categorySales: CategorySalesSummary[];
  // เมนูขายดี 10 อันดับ
  topItems: TopSellingItemSummary[];
  // ความเสียหายจากการยกเลิก (Void Loss)
  totalVoidCount: number;
  totalVoidAmount: number;
  voidReasons: VoidReasonSummary[];
};

/**
 * ดึงรายงานสรุปปิดยอดประจำวัน (End-of-Day Settlement / Z-Report)
 * คำนวณยอดขายตามช่วงวันทำการ (Business Day Cutoff Hour) ของสาขา
 *
 * @param request - คำขอที่อาจระบุ query string date=YYYY-MM-DD
 * @returns รายงานสรุปปิดยอดประจำวันสมบูรณ์
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireStaff();
    if (!auth.ok) return authFailureResponse(auth.reason);

    const branchId = await getEffectiveBranchId(request, auth.user);
    const activeBranch = await getActiveBranch(request, auth.user);
    const cutoffHour = activeBranch?.businessDayCutoffHour ?? getBusinessCutoffHour();

    const params = request.nextUrl.searchParams;
    const rawDate = (params.get('date') ?? '').trim();

    // หากไม่ระบุวันที่ ให้ใช้วันทำการปัจจุบันของสาขา
    const targetDate = rawDate || businessDayRange(undefined, cutoffHour).businessDate;
    const range = getBusinessDayRangeFromDateString(targetDate, cutoffHour);

    // 1. สรุปยอดเงินตามช่องทางชำระ
    const paymentRows = await query<
      RowDataPacket & {
        method: 'CASH' | 'TRANSFER' | 'CARD';
        transaction_count: number;
        total_amount: string;
        min_paid: string | null;
        max_paid: string | null;
      }
    >(
      `SELECT p.method,
              COUNT(p.id) AS transaction_count,
              COALESCE(SUM(p.total_amount), 0) AS total_amount,
              MIN(p.paid_at) AS min_paid,
              MAX(p.paid_at) AS max_paid
         FROM payments p
        WHERE (? IS NULL OR p.branch_id = ?)
          AND p.paid_at >= ? AND p.paid_at < ?
        GROUP BY p.method`,
      [branchId, branchId, range.startSql, range.endSql],
    );

    const paymentMethods: PaymentMethodSummary[] = [
      { method: 'CASH', count: 0, total: 0 },
      { method: 'TRANSFER', count: 0, total: 0 },
      { method: 'CARD', count: 0, total: 0 },
    ];

    let totalRevenue = 0;
    let totalBills = 0;
    let firstPaymentTime: string | null = null;
    let lastPaymentTime: string | null = null;

    for (const row of paymentRows) {
      const amt = Number(row.total_amount || 0);
      const cnt = Number(row.transaction_count || 0);
      totalRevenue += amt;
      totalBills += cnt;

      const target = paymentMethods.find((m) => m.method === row.method);
      if (target) {
        target.count = cnt;
        target.total = amt;
      }

      if (row.min_paid) {
        if (!firstPaymentTime || new Date(row.min_paid) < new Date(firstPaymentTime)) {
          firstPaymentTime = String(row.min_paid);
        }
      }
      if (row.max_paid) {
        if (!lastPaymentTime || new Date(row.max_paid) > new Date(lastPaymentTime)) {
          lastPaymentTime = String(row.max_paid);
        }
      }
    }

    const cashTotal = paymentMethods.find((m) => m.method === 'CASH')?.total ?? 0;
    const transferTotal = paymentMethods.find((m) => m.method === 'TRANSFER')?.total ?? 0;
    const cardTotal = paymentMethods.find((m) => m.method === 'CARD')?.total ?? 0;
    const avgBillAmount = totalBills > 0 ? totalRevenue / totalBills : 0;

    // 2. โต๊ะที่ยังเปิดค้างชำระอยู่ ณ ปัจจุบันในสาขา
    const unpaidRows = await query<
      RowDataPacket & {
        open_count: number;
        estimated_total: string;
      }
    >(
      `SELECT COUNT(DISTINCT s.id) AS open_count,
              COALESCE(SUM(oi.unit_price * oi.quantity), 0) AS estimated_total
         FROM table_sessions s
         LEFT JOIN orders o ON o.session_id = s.id
         LEFT JOIN order_items oi ON oi.order_id = o.id AND oi.status <> 'CANCELLED'
        WHERE s.status = 'OPEN'
          AND (? IS NULL OR s.branch_id = ?)`,
      [branchId, branchId],
    );

    const unpaidSessionsCount = Number(unpaidRows[0]?.open_count || 0);
    const unpaidEstimatedAmount = Number(unpaidRows[0]?.estimated_total || 0);

    // 3. ยอดรับเงินรายพนักงานแคชเชียร์
    const cashierRows = await query<
      RowDataPacket & {
        received_by: number;
        cashier_name: string;
        method: 'CASH' | 'TRANSFER' | 'CARD';
        count: number;
        total: string;
      }
    >(
      `SELECT p.received_by,
              u.full_name AS cashier_name,
              p.method,
              COUNT(p.id) AS count,
              COALESCE(SUM(p.total_amount), 0) AS total
         FROM payments p
         JOIN users u ON u.id = p.received_by
        WHERE (? IS NULL OR p.branch_id = ?)
          AND p.paid_at >= ? AND p.paid_at < ?
        GROUP BY p.received_by, u.full_name, p.method
        ORDER BY u.full_name ASC, p.method ASC`,
      [branchId, branchId, range.startSql, range.endSql],
    );

    const cashiers: CashierSummary[] = cashierRows.map((r) => ({
      cashierId: r.received_by,
      cashierName: r.cashier_name,
      method: r.method,
      count: Number(r.count || 0),
      total: Number(r.total || 0),
    }));

    // 4. ยอดขายตามหมวดหมู่
    const categoryRows = await query<
      RowDataPacket & {
        category_id: number | null;
        category_name: string | null;
        total_quantity: string;
        total_amount: string;
      }
    >(
      `SELECT c.id AS category_id,
              COALESCE(c.name, 'ไม่ระบุหมวดหมู่') AS category_name,
              COALESCE(SUM(oi.quantity), 0) AS total_quantity,
              COALESCE(SUM(oi.unit_price * oi.quantity), 0) AS total_amount
         FROM payments p
         JOIN orders o ON o.session_id = p.session_id
         JOIN order_items oi ON oi.order_id = o.id AND oi.status <> 'CANCELLED'
         JOIN menu_items m ON m.id = oi.menu_item_id
         LEFT JOIN categories c ON c.id = m.category_id
        WHERE (? IS NULL OR p.branch_id = ?)
          AND p.paid_at >= ? AND p.paid_at < ?
        GROUP BY c.id, c.name
        ORDER BY total_amount DESC`,
      [branchId, branchId, range.startSql, range.endSql],
    );

    const categorySales: CategorySalesSummary[] = categoryRows.map((r) => ({
      categoryId: r.category_id,
      categoryName: r.category_name || 'ไม่ระบุหมวดหมู่',
      quantity: Number(r.total_quantity || 0),
      total: Number(r.total_amount || 0),
    }));

    // 5. เมนูขายดี 10 อันดับ
    const topItemRows = await query<
      RowDataPacket & {
        menu_item_id: number;
        item_name: string;
        total_quantity: string;
        total_amount: string;
      }
    >(
      `SELECT oi.menu_item_id,
              oi.item_name,
              COALESCE(SUM(oi.quantity), 0) AS total_quantity,
              COALESCE(SUM(oi.unit_price * oi.quantity), 0) AS total_amount
         FROM payments p
         JOIN orders o ON o.session_id = p.session_id
         JOIN order_items oi ON oi.order_id = o.id AND oi.status <> 'CANCELLED'
        WHERE (? IS NULL OR p.branch_id = ?)
          AND p.paid_at >= ? AND p.paid_at < ?
        GROUP BY oi.menu_item_id, oi.item_name
        ORDER BY total_quantity DESC, total_amount DESC
        LIMIT 10`,
      [branchId, branchId, range.startSql, range.endSql],
    );

    const topItems: TopSellingItemSummary[] = topItemRows.map((r) => ({
      menuItemId: r.menu_item_id,
      itemName: r.item_name,
      quantity: Number(r.total_quantity || 0),
      total: Number(r.total_amount || 0),
    }));

    // 6. ความเสียหายและรายการยกเลิก (Void Losses) ประจำวันทำการ
    const voidRows = await query<
      RowDataPacket & {
        reason: string;
        void_count: number;
        void_amount: string;
      }
    >(
      `SELECT c.reason,
              COUNT(c.id) AS void_count,
              COALESCE(SUM(c.amount), 0) AS void_amount
         FROM cancellation_audit_logs c
        WHERE (? IS NULL OR c.branch_id = ?)
          AND c.created_at >= ? AND c.created_at < ?
        GROUP BY c.reason
        ORDER BY void_amount DESC`,
      [branchId, branchId, range.startSql, range.endSql],
    );

    let totalVoidCount = 0;
    let totalVoidAmount = 0;
    const voidReasons: VoidReasonSummary[] = voidRows.map((r) => {
      const cnt = Number(r.void_count || 0);
      const amt = Number(r.void_amount || 0);
      totalVoidCount += cnt;
      totalVoidAmount += amt;
      return {
        reason: r.reason,
        count: cnt,
        total: amt,
      };
    });

    const report: DailySettlementReport = {
      branchId,
      branchName: activeBranch?.name ?? 'ทุกสาขา (ภาพรวมส่วนกลาง)',
      branchCode: activeBranch?.code ?? 'ALL',
      cutoffHour,
      businessDate: range.businessDate,
      startTime: range.startSql,
      endTime: range.endSql,
      generatedAt: new Date().toISOString(),
      totalRevenue,
      totalBills,
      avgBillAmount,
      firstPaymentTime,
      lastPaymentTime,
      paymentMethods,
      cashTotal,
      transferTotal,
      cardTotal,
      unpaidSessionsCount,
      unpaidEstimatedAmount,
      cashiers,
      categorySales,
      topItems,
      totalVoidCount,
      totalVoidAmount,
      voidReasons,
    };

    return apiOk(report);
  } catch (err) {
    return serverError(err, 'GET /api/admin/settlement');
  }
}
