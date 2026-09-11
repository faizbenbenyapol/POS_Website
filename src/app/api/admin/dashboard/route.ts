import type { RowDataPacket } from 'mysql2/promise';
import type { NextRequest } from 'next/server';
import { apiOk, apiError, ERROR_CODES, authFailureResponse } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';

/** ออเดอร์ที่ค้างสถานะรอครัวรับนานเกินกี่นาทีถึงจะขึ้นแถบเตือน */
const STALE_PENDING_MINUTES = 10;

/** จำนวนเมนูขายดีที่แสดงบน Dashboard */
const TOP_MENU_LIMIT = 5;

type RevenueRow = RowDataPacket & { total: string | null; bill_count: number };
type TrendRow = RowDataPacket & { sale_date: string; total: string };
type TopMenuRow = RowDataPacket & { item_name: string; quantity: number; amount: string };
type StaleOrderRow = RowDataPacket & {
  id: number;
  order_code: string;
  table_no: string;
  created_at: string;
  waiting_minutes: number;
};
type TicketSummaryRow = RowDataPacket & { open_count: number; urgent_open_count: number };
type MonthRow = RowDataPacket & { month: string };

function getPreviousYearMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const date = new Date(y, m - 1 - 1, 1);
  const prevY = date.getFullYear();
  const prevM = String(date.getMonth() + 1).padStart(2, '0');
  return `${prevY}-${prevM}`;
}

/**
 * รวบข้อมูลทั้งหมดที่ Dashboard ต้องใช้ รัน query แบบ Parallel ทั้งหมดพร้อมกัน
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireStaff();
    if (!auth.ok) return authFailureResponse(auth.reason);

    // หากเป็นพนักงาน (STAFF) ให้ส่งเฉพาะข้อมูลปฏิบัติการหน้าร้าน (ไม่เปิดเผยตัวเลขรายได้/ยอดขาย)
    if (auth.user.role === 'STAFF') {
      const [orderCount, openTables, staleOrders, tickets] = await Promise.all([
        queryOne<RowDataPacket & { total: number }>(
          "SELECT COUNT(*) AS total FROM orders WHERE DATE(created_at) = CURDATE() AND status <> 'CANCELLED'",
        ),
        queryOne<RowDataPacket & { total: number }>(
          "SELECT COUNT(*) AS total FROM table_sessions WHERE status = 'OPEN'",
        ),
        query<StaleOrderRow>(
          `SELECT o.id, o.order_code, t.table_no, o.created_at,
                  TIMESTAMPDIFF(MINUTE, o.created_at, NOW()) AS waiting_minutes
             FROM orders o
             JOIN table_sessions s ON s.id = o.session_id
             JOIN dining_tables t ON t.id = s.table_id
            WHERE o.status = 'PENDING'
              AND s.status = 'OPEN'
              AND o.created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
            ORDER BY o.created_at`,
          [STALE_PENDING_MINUTES],
        ),
        queryOne<TicketSummaryRow>(
          `SELECT
             COUNT(*) AS open_count,
             COALESCE(SUM(CASE WHEN priority = 'URGENT' THEN 1 ELSE 0 END), 0) AS urgent_open_count
            FROM tickets WHERE status = 'OPEN'`,
        ),
      ]);

      return apiOk({
        isStaff: true,
        userRole: 'STAFF',
        userFullName: auth.user.fullName,
        todayOrderCount: Number(orderCount?.total ?? 0),
        openTableCount: Number(openTables?.total ?? 0),
        openTicketCount: Number(tickets?.open_count ?? 0),
        urgentOpenTicketCount: Number(tickets?.urgent_open_count ?? 0),
        stalePendingMinutes: STALE_PENDING_MINUTES,
        staleOrders,
      });
    }

    const nowStr = new Date().toISOString().slice(0, 7);
    const searchMonth = request.nextUrl.searchParams.get('month');
    const selectedMonth = searchMonth && /^\d{4}-\d{2}$/.test(searchMonth) ? searchMonth : nowStr;
    const prevMonth = getPreviousYearMonth(selectedMonth);

    // ยิง SQL ทุกคำสั่งขนานกันผ่าน Promise.all เพื่อลด Latency เหลือต่ำกว่า 50ms
    const [
      monthlyRevRow,
      prevRevRow,
      dbMonths,
      todayRevRow,
      yesterdayRevRow,
      orderCount,
      openTables,
      unpaid,
      staleOrders,
      topMenus,
      salesTrend,
      tickets,
    ] = await Promise.all([
      // 1. ยอดขายประจำเดือนที่เลือก
      queryOne<RevenueRow>(
        `SELECT COALESCE(SUM(total_amount), 0) AS total, COUNT(*) AS bill_count
           FROM payments WHERE DATE_FORMAT(paid_at, '%Y-%m') = ?`,
        [selectedMonth],
      ),
      // 2. ยอดขายเดือนก่อนหน้า
      queryOne<RevenueRow>(
        `SELECT COALESCE(SUM(total_amount), 0) AS total, COUNT(*) AS bill_count
           FROM payments WHERE DATE_FORMAT(paid_at, '%Y-%m') = ?`,
        [prevMonth],
      ),
      // 3. รายชื่อเดือนที่มีในฐานข้อมูล
      query<MonthRow>(
        `SELECT DISTINCT DATE_FORMAT(paid_at, '%Y-%m') AS month FROM payments
         UNION
         SELECT DISTINCT DATE_FORMAT(created_at, '%Y-%m') AS month FROM orders
         ORDER BY month DESC`,
      ),
      // 4. ยอดขายวันนี้
      queryOne<RevenueRow>(
        `SELECT COALESCE(SUM(total_amount), 0) AS total, COUNT(*) AS bill_count
           FROM payments WHERE DATE(paid_at) = CURDATE()`,
      ),
      // 5. ยอดขายเมื่อวาน
      queryOne<RevenueRow>(
        `SELECT COALESCE(SUM(total_amount), 0) AS total, COUNT(*) AS bill_count
           FROM payments WHERE DATE(paid_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)`,
      ),
      // 6. จำนวนออเดอร์วันนี้
      queryOne<RowDataPacket & { total: number }>(
        "SELECT COUNT(*) AS total FROM orders WHERE DATE(created_at) = CURDATE() AND status <> 'CANCELLED'",
      ),
      // 7. โต๊ะที่เปิดอยู่
      queryOne<RowDataPacket & { total: number }>(
        "SELECT COUNT(*) AS total FROM table_sessions WHERE status = 'OPEN'",
      ),
      // 8. ยอดค้างชำระ
      queryOne<RowDataPacket & { total: string | null }>(
        `SELECT COALESCE(SUM(oi.unit_price * oi.quantity), 0) AS total
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           JOIN table_sessions s ON s.id = o.session_id
          WHERE s.status = 'OPEN' AND oi.status <> 'CANCELLED'`,
      ),
      // 9. ออเดอร์รอครัวรับค้างเกินเวลา
      query<StaleOrderRow>(
        `SELECT o.id, o.order_code, t.table_no, o.created_at,
                TIMESTAMPDIFF(MINUTE, o.created_at, NOW()) AS waiting_minutes
           FROM orders o
           JOIN table_sessions s ON s.id = o.session_id
           JOIN dining_tables t ON t.id = s.table_id
          WHERE o.status = 'PENDING'
            AND s.status = 'OPEN'
            AND o.created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
          ORDER BY o.created_at`,
        [STALE_PENDING_MINUTES],
      ),
      // 10. เมนูขายดีประจำเดือน
      query<TopMenuRow>(
        `SELECT oi.item_name,
                SUM(oi.quantity) AS quantity,
                SUM(oi.unit_price * oi.quantity) AS amount
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
          WHERE DATE_FORMAT(o.created_at, '%Y-%m') = ? AND oi.status <> 'CANCELLED'
          GROUP BY oi.item_name
          ORDER BY quantity DESC, amount DESC
          LIMIT ?`,
        [selectedMonth, TOP_MENU_LIMIT],
      ),
      // 11. ยอดขายรายวันประจำเดือน
      query<TrendRow>(
        `SELECT DATE_FORMAT(paid_at, '%Y-%m-%d') AS sale_date, SUM(total_amount) AS total
           FROM payments
          WHERE DATE_FORMAT(paid_at, '%Y-%m') = ?
          GROUP BY DATE_FORMAT(paid_at, '%Y-%m-%d')
          ORDER BY sale_date`,
        [selectedMonth],
      ),
      // 12. สรุปรายการ ticket
      queryOne<TicketSummaryRow>(
        `SELECT SUM(status <> 'CLOSED') AS open_count,
                SUM(status = 'OPEN' AND priority = 'URGENT') AS urgent_open_count
           FROM tickets`,
      ),
    ]);

    const monthlyRevenue = Number(monthlyRevRow?.total ?? 0);
    const monthlyBillCount = Number(monthlyRevRow?.bill_count ?? 0);
    const monthlyAvgBill = monthlyBillCount > 0 ? monthlyRevenue / monthlyBillCount : 0;

    const prevMonthlyRevenue = Number(prevRevRow?.total ?? 0);
    const prevMonthlyBillCount = Number(prevRevRow?.bill_count ?? 0);

    let monthGrowthPercent = 0;
    if (prevMonthlyRevenue > 0) {
      monthGrowthPercent = ((monthlyRevenue - prevMonthlyRevenue) / prevMonthlyRevenue) * 100;
    } else if (monthlyRevenue > 0) {
      monthGrowthPercent = 100;
    }

    const monthSet = new Set(dbMonths.map((m) => m.month));
    monthSet.add(nowStr);
    monthSet.add(selectedMonth);
    const availableMonths = Array.from(monthSet).sort().reverse();

    return apiOk({
      isStaff: false,
      userRole: 'ADMIN',
      selectedMonth,
      availableMonths,
      monthlyRevenue,
      monthlyBillCount,
      monthlyAvgBill,
      prevMonth,
      prevMonthlyRevenue,
      prevMonthlyBillCount,
      monthGrowthPercent,
      todayRevenue: Number(todayRevRow?.total ?? 0),
      todayBillCount: Number(todayRevRow?.bill_count ?? 0),
      yesterdayRevenue: Number(yesterdayRevRow?.total ?? 0),
      yesterdayBillCount: Number(yesterdayRevRow?.bill_count ?? 0),
      todayOrderCount: Number(orderCount?.total ?? 0),
      openTableCount: Number(openTables?.total ?? 0),
      unpaidAmount: Number(unpaid?.total ?? 0),
      stalePendingMinutes: STALE_PENDING_MINUTES,
      staleOrders,
      topMenus,
      salesTrend,
      openTicketCount: Number(tickets?.open_count ?? 0),
      urgentOpenTicketCount: Number(tickets?.urgent_open_count ?? 0),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดภายในระบบ';
    return apiError(ERROR_CODES.SERVER_ERROR, message, 500);
  }
}
