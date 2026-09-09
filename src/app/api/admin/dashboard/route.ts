import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, authFailureResponse } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';

/** ออเดอร์ที่ค้างสถานะรอครัวรับนานเกินกี่นาทีถึงจะขึ้นแถบเตือน ตามหัวข้อ 13 */
const STALE_PENDING_MINUTES = 10;

/** จำนวนเมนูขายดีที่แสดงบน Dashboard */
const TOP_MENU_LIMIT = 5;

/** จำนวนวันย้อนหลังของกราฟยอดขายรายวัน */
const SALES_TREND_DAYS = 7;

/** ยอดขายรวมของช่วงเวลาหนึ่ง อ่านจากตาราง payments ซึ่งคือเงินที่เก็บได้จริง */
type RevenueRow = RowDataPacket & { total: string | null; bill_count: number };

/** ยอดขายรายวันสำหรับกราฟเส้น */
type TrendRow = RowDataPacket & { sale_date: string; total: string };

/** เมนูขายดีของวัน นับเฉพาะรายการที่ไม่ถูกยกเลิก */
type TopMenuRow = RowDataPacket & { item_name: string; quantity: number; amount: string };

/** ออเดอร์ที่ค้างรอครัวรับนานเกินเกณฑ์ */
type StaleOrderRow = RowDataPacket & {
  id: number;
  order_code: string;
  table_no: string;
  created_at: string;
  waiting_minutes: number;
};

/** ticket ที่ยังไม่ปิด แยกนับตัวที่เร่งด่วนไว้ต่างหากเพื่อทำแถบเตือน */
type TicketSummaryRow = RowDataPacket & { open_count: number; urgent_open_count: number };

/**
 * อ่านยอดขายที่เก็บเงินได้จริงของวันที่กำหนด
 * ใช้ตาราง payments เพราะยอดขายคือเงินที่เก็บแล้ว ไม่ใช่ยอดที่ลูกค้าสั่งแต่ยังไม่จ่าย
 *
 * @param dayOffset - 0 คือวันนี้ 1 คือเมื่อวาน
 * @returns ยอดรวมและจำนวนบิลของวันนั้น
 */
async function revenueOfDay(dayOffset: number): Promise<{ total: number; billCount: number }> {
  const row = await queryOne<RevenueRow>(
    `SELECT COALESCE(SUM(total_amount), 0) AS total, COUNT(*) AS bill_count
       FROM payments
      WHERE DATE(paid_at) = DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
    [dayOffset],
  );
  return { total: Number(row?.total ?? 0), billCount: Number(row?.bill_count ?? 0) };
}

/**
 * รวบข้อมูลทั้งหมดที่ Dashboard ต้องใช้ในการเรียกครั้งเดียว
 * รวมไว้ที่ endpoint เดียวเพื่อให้ตัวเลขทุกตัวมาจากช่วงเวลาเดียวกัน
 * ถ้าแยกหลาย endpoint ตัวเลขอาจไม่ตรงกันเมื่อมีบิลปิดระหว่างที่หน้าจอกำลังโหลด
 *
 * @returns ข้อมูลสรุปทั้งชุดตามหัวข้อ 13
 */
export async function GET() {
  const auth = await requireStaff();
  if (!auth.ok) return authFailureResponse(auth.reason);

  const today = await revenueOfDay(0);
  const yesterday = await revenueOfDay(1);

  const orderCount = await queryOne<RowDataPacket & { total: number }>(
    "SELECT COUNT(*) AS total FROM orders WHERE DATE(created_at) = CURDATE() AND status <> 'CANCELLED'",
  );

  const openTables = await queryOne<RowDataPacket & { total: number }>(
    "SELECT COUNT(*) AS total FROM table_sessions WHERE status = 'OPEN'",
  );

  // ยอดที่ลูกค้าสั่งแล้วแต่ยังไม่ปิดบิล คิดจากรายการที่ยังไม่ถูกยกเลิกของรอบที่ยังเปิดอยู่
  const unpaid = await queryOne<RowDataPacket & { total: string | null }>(
    `SELECT COALESCE(SUM(oi.unit_price * oi.quantity), 0) AS total
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN table_sessions s ON s.id = o.session_id
      WHERE s.status = 'OPEN' AND oi.status <> 'CANCELLED'`,
  );

  const staleOrders = await query<StaleOrderRow>(
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
  );

  const topMenus = await query<TopMenuRow>(
    `SELECT oi.item_name,
            SUM(oi.quantity) AS quantity,
            SUM(oi.unit_price * oi.quantity) AS amount
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
      WHERE DATE(o.created_at) = CURDATE() AND oi.status <> 'CANCELLED'
      GROUP BY oi.item_name
      ORDER BY quantity DESC, amount DESC
      LIMIT ?`,
    [TOP_MENU_LIMIT],
  );

  const salesTrend = await query<TrendRow>(
    `SELECT DATE(paid_at) AS sale_date, SUM(total_amount) AS total
       FROM payments
      WHERE paid_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(paid_at)
      ORDER BY sale_date`,
    [SALES_TREND_DAYS - 1],
  );

  const tickets = await queryOne<TicketSummaryRow>(
    `SELECT SUM(status <> 'CLOSED') AS open_count,
            SUM(status = 'OPEN' AND priority = 'URGENT') AS urgent_open_count
       FROM tickets`,
  );

  return apiOk({
    todayRevenue: today.total,
    todayBillCount: today.billCount,
    yesterdayRevenue: yesterday.total,
    yesterdayBillCount: yesterday.billCount,
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
}
