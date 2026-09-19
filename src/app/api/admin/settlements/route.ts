import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, serverError, authFailureResponse } from '@/lib/api';
import { requireCapability } from '@/lib/auth';
import { query } from '@/lib/db';
import { getEffectiveBranchId, getActiveBranch } from '@/lib/branch';
import { businessDayRange, getBusinessCutoffHour } from '@/lib/format';

/** ใบปิดยอดหนึ่งใบในรายการประวัติ */
export type SettlementHistoryRow = {
  id: number;
  branchId: number;
  branchName: string;
  branchCode: string;
  businessDate: string;
  zNumber: number;
  totalRevenue: number;
  totalBills: number;
  cashTotal: number;
  transferTotal: number;
  cardTotal: number;
  voidCount: number;
  voidAmount: number;
  countedCash: number | null;
  cashDifference: number | null;
  note: string | null;
  closedAt: string;
  closedByName: string;
};

/** ยอดรวมและสถิติของใบปิดยอดทั้งหมดในช่วงที่เลือก */
export type SettlementHistorySummary = {
  settlementCount: number;
  totalRevenue: number;
  totalBills: number;
  cashTotal: number;
  transferTotal: number;
  cardTotal: number;
  voidCount: number;
  voidAmount: number;
  cashDifferenceTotal: number;
  daysWithCashCount: number;
  avgRevenuePerDay: number;
  bestDay: { businessDate: string; totalRevenue: number } | null;
};

/** ผลลัพธ์ของ endpoint ประวัติการปิดยอด */
export type SettlementHistoryResponse = {
  branchName: string;
  branchCode: string;
  from: string;
  to: string;
  rows: SettlementHistoryRow[];
  summary: SettlementHistorySummary;
};

/** จำนวนวันย้อนหลังที่แสดงเมื่อผู้ใช้ไม่ระบุช่วงวันที่ */
const DEFAULT_RANGE_DAYS = 30;

/** รูปแบบวันที่ที่ยอมรับใน query string */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * แปลงค่าจากคอลัมน์ DATE ของ MySQL ให้เป็นข้อความ YYYY-MM-DD
 * เพราะไดรเวอร์คืนค่ามาเป็นอ็อบเจกต์ Date ตามโซนเวลาเครื่อง ไม่ใช่ข้อความ
 *
 * @param value - ค่าที่ได้จากฐานข้อมูล อาจเป็น Date หรือข้อความ
 * @returns ข้อความวันที่รูปแบบ YYYY-MM-DD
 */
function toDateString(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * เลื่อนวันที่ถอยหลังตามจำนวนวันที่กำหนด ใช้คำนวณวันเริ่มต้นของช่วงตั้งต้น
 *
 * @param dateStr - วันที่ตั้งต้นรูปแบบ YYYY-MM-DD
 * @param days - จำนวนวันที่ต้องการถอยหลัง
 * @returns วันที่ใหม่รูปแบบ YYYY-MM-DD
 */
function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - days);
  return toDateString(date);
}

/**
 * ดึงประวัติใบปิดยอด (Z-Report) ย้อนหลังตามช่วงวันทำการที่เลือก พร้อมยอดรวมของช่วงนั้น
 * อ่านจากตาราง settlements ที่แช่แข็งตัวเลขไว้แล้ว จึงไม่ต้องคำนวณยอดขายใหม่ทั้งช่วง
 *
 * @param request - คำขอที่อาจระบุ query string from=YYYY-MM-DD และ to=YYYY-MM-DD
 * @returns รายการใบปิดยอดเรียงจากวันล่าสุด พร้อมยอดรวมและสถิติของช่วง
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireCapability('settlement');
    if (!auth.ok) return authFailureResponse(auth.reason);

    const branchId = await getEffectiveBranchId(request, auth.user);
    const activeBranch = await getActiveBranch(request, auth.user);
    const cutoffHour = activeBranch?.businessDayCutoffHour ?? getBusinessCutoffHour();

    const params = request.nextUrl.searchParams;
    const rawFrom = (params.get('from') ?? '').trim();
    const rawTo = (params.get('to') ?? '').trim();

    // ช่วงตั้งต้นคือ 30 วันทำการล่าสุด นับจากวันทำการปัจจุบันของสาขา
    const today = businessDayRange(undefined, cutoffHour).businessDate;
    const to = DATE_PATTERN.test(rawTo) ? rawTo : today;
    const from = DATE_PATTERN.test(rawFrom) ? rawFrom : shiftDate(to, DEFAULT_RANGE_DAYS);

    const rows = await query<
      RowDataPacket & {
        id: number;
        branch_id: number;
        branch_name: string;
        branch_code: string;
        business_date: Date | string;
        z_number: number;
        total_revenue: string;
        total_bills: number;
        cash_total: string;
        transfer_total: string;
        card_total: string;
        void_count: number;
        void_amount: string;
        counted_cash: string | null;
        cash_difference: string | null;
        note: string | null;
        closed_at: Date | string;
        closed_by_name: string;
      }
    >(
      `SELECT s.id,
              s.branch_id,
              b.name AS branch_name,
              b.code AS branch_code,
              s.business_date,
              s.z_number,
              s.total_revenue,
              s.total_bills,
              s.cash_total,
              s.transfer_total,
              s.card_total,
              s.void_count,
              s.void_amount,
              s.counted_cash,
              s.cash_difference,
              s.note,
              s.closed_at,
              u.full_name AS closed_by_name
         FROM settlements s
         JOIN branches b ON b.id = s.branch_id
         JOIN users u ON u.id = s.closed_by
        WHERE (? IS NULL OR s.branch_id = ?)
          AND s.business_date >= ? AND s.business_date <= ?
        ORDER BY s.business_date DESC, s.z_number DESC`,
      [branchId, branchId, from, to],
    );

    const history: SettlementHistoryRow[] = rows.map((r) => ({
      id: r.id,
      branchId: r.branch_id,
      branchName: r.branch_name,
      branchCode: r.branch_code,
      businessDate: toDateString(r.business_date),
      zNumber: Number(r.z_number),
      totalRevenue: Number(r.total_revenue || 0),
      totalBills: Number(r.total_bills || 0),
      cashTotal: Number(r.cash_total || 0),
      transferTotal: Number(r.transfer_total || 0),
      cardTotal: Number(r.card_total || 0),
      voidCount: Number(r.void_count || 0),
      voidAmount: Number(r.void_amount || 0),
      countedCash: r.counted_cash === null ? null : Number(r.counted_cash),
      cashDifference: r.cash_difference === null ? null : Number(r.cash_difference),
      note: r.note,
      closedAt: new Date(r.closed_at).toISOString(),
      closedByName: r.closed_by_name,
    }));

    const summary: SettlementHistorySummary = {
      settlementCount: history.length,
      totalRevenue: 0,
      totalBills: 0,
      cashTotal: 0,
      transferTotal: 0,
      cardTotal: 0,
      voidCount: 0,
      voidAmount: 0,
      cashDifferenceTotal: 0,
      daysWithCashCount: 0,
      avgRevenuePerDay: 0,
      bestDay: null,
    };

    for (const row of history) {
      summary.totalRevenue += row.totalRevenue;
      summary.totalBills += row.totalBills;
      summary.cashTotal += row.cashTotal;
      summary.transferTotal += row.transferTotal;
      summary.cardTotal += row.cardTotal;
      summary.voidCount += row.voidCount;
      summary.voidAmount += row.voidAmount;
      // นับเฉพาะวันที่แคชเชียร์กรอกยอดนับเงินไว้ วันที่ไม่ได้กรอกไม่ควรถูกนับเป็นผลต่างศูนย์
      if (row.cashDifference !== null) {
        summary.cashDifferenceTotal += row.cashDifference;
        summary.daysWithCashCount += 1;
      }
      if (!summary.bestDay || row.totalRevenue > summary.bestDay.totalRevenue) {
        summary.bestDay = { businessDate: row.businessDate, totalRevenue: row.totalRevenue };
      }
    }

    summary.avgRevenuePerDay = history.length > 0 ? summary.totalRevenue / history.length : 0;

    const payload: SettlementHistoryResponse = {
      branchName: activeBranch?.name ?? 'ทุกสาขา (ภาพรวมส่วนกลาง)',
      branchCode: activeBranch?.code ?? 'ALL',
      from,
      to,
      rows: history,
      summary,
    };

    return apiOk(payload);
  } catch (err) {
    return serverError(err, 'GET /api/admin/settlements');
  }
}
