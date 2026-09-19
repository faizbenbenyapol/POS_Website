import type { RowDataPacket } from 'mysql2/promise';
import type { NextRequest } from 'next/server';
import { apiOk, serverError, authFailureResponse } from '@/lib/api';
import { requireCapability } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { getEffectiveBranchId, getBranchById } from '@/lib/branch';
import { getBusinessDayRange, getYesterdayBusinessDayRange } from '@/lib/format';
import { LOW_STOCK_THRESHOLD } from '@/lib/stock';
import { summarizeGrossProfit, type MenuSalesRow } from '@/lib/profit';

/** ออเดอร์ที่ค้างสถานะรอครัวรับนานเกินกี่นาทีถึงจะขึ้นแถบเตือน */
const STALE_PENDING_MINUTES = 10;

/** จำนวนเมนูขายดีที่แสดงบน Dashboard */
const TOP_MENU_LIMIT = 5;

/** จำนวนเมนูใกล้หมดสูงสุดที่ยกขึ้นมาแสดงบนแถบเตือน มากกว่านี้ให้ไปดูที่หน้าสต๊อก */
const LOW_STOCK_ALERT_LIMIT = 8;

/**
 * อ่านเมนูที่ของใกล้หมดหรือหมดแล้วของสาขาที่กำลังดูอยู่
 * นับเฉพาะเมนูที่ตั้งจำนวนคงเหลือไว้ ส่วนเมนูที่ไม่จำกัดจำนวนไม่มีวันหมดจึงไม่ต้องเตือน
 *
 * @param branchId - รหัสสาขาที่ต้องการดู ส่ง null เพื่อรวมทุกสาขา
 * @returns เมนูที่เหลือน้อยที่สุดเรียงจากน้อยไปมาก ไม่เกิน LOW_STOCK_ALERT_LIMIT รายการ
 */
function queryLowStockItems(branchId: number | null) {
  return query<LowStockRow>(
    `SELECT m.id AS menu_item_id, m.name, bma.stock_qty, b.name AS branch_name
       FROM branch_menu_availability bma
       JOIN menu_items m ON m.id = bma.menu_item_id
       LEFT JOIN branches b ON b.id = bma.branch_id
      WHERE (? IS NULL OR bma.branch_id = ?)
        AND bma.stock_qty IS NOT NULL
        AND bma.stock_qty <= ?
      ORDER BY bma.stock_qty ASC, m.name ASC
      LIMIT ${LOW_STOCK_ALERT_LIMIT}`,
    [branchId, branchId, LOW_STOCK_THRESHOLD],
  );
}

/** จำนวนวัตถุดิบใกล้หมดสูงสุดที่ยกขึ้นมาแสดงบนแถบเตือน มากกว่านี้ให้ไปดูที่หน้าวัตถุดิบ */
const LOW_INGREDIENT_ALERT_LIMIT = 8;

/** วัตถุดิบที่ใกล้หมดหรือติดลบ ใช้ขึ้นแถบเตือนให้ครัวสั่งของหรือไปนับของจริง */
type LowIngredientRow = RowDataPacket & {
  ingredient_id: number;
  name: string;
  unit: string;
  quantity: string;
  low_stock_threshold: string | null;
  branch_name: string | null;
  total_count: number;
};

/**
 * อ่านวัตถุดิบที่ใกล้หมดหรือยอดติดลบของสาขาที่กำลังดูอยู่
 * เกณฑ์ตรงกับ isIngredientLow ใน src/lib/recipe.ts: ติดลบหรือเป็นศูนย์ หรือไม่เกินเกณฑ์เตือนที่ตั้งไว้
 * นับเฉพาะวัตถุดิบที่เปิดใช้และสาขานั้นนับอยู่ ยอดติดลบขึ้นก่อนเพราะแปลว่ายอดในระบบไม่ตรงของจริงแล้ว
 *
 * @param branchId - รหัสสาขาที่ต้องการดู ส่ง null เพื่อรวมทุกสาขา
 * @returns วัตถุดิบที่ต้องจัดการ ไม่เกิน LOW_INGREDIENT_ALERT_LIMIT รายการ พร้อมจำนวนทั้งหมดใน total_count
 */
function queryLowIngredients(branchId: number | null) {
  return query<LowIngredientRow>(
    `SELECT i.id AS ingredient_id, i.name, i.unit, s.quantity, i.low_stock_threshold,
            b.name AS branch_name, COUNT(*) OVER () AS total_count
       FROM branch_ingredient_stock s
       JOIN ingredients i ON i.id = s.ingredient_id
       LEFT JOIN branches b ON b.id = s.branch_id
      WHERE (? IS NULL OR s.branch_id = ?)
        AND i.is_active = 1
        AND (s.quantity <= 0 OR (i.low_stock_threshold IS NOT NULL AND s.quantity <= i.low_stock_threshold))
      ORDER BY (s.quantity <= 0) DESC, s.quantity / NULLIF(i.low_stock_threshold, 0) ASC, i.name ASC
      LIMIT ${LOW_INGREDIENT_ALERT_LIMIT}`,
    [branchId, branchId],
  );
}

/**
 * แปลงผลวัตถุดิบใกล้หมดเป็นข้อมูลสำหรับแถบเตือน
 *
 * @param rows - แถวจาก queryLowIngredients
 * @returns รายการวัตถุดิบและจำนวนทั้งหมด (รวมที่ไม่ได้ยกขึ้นมาแสดง)
 */
function toLowIngredientAlert(rows: LowIngredientRow[]) {
  return {
    lowIngredientCount: Number(rows[0]?.total_count ?? 0),
    lowIngredients: rows.map((r) => ({
      ingredient_id: r.ingredient_id,
      name: r.name,
      unit: r.unit,
      quantity: Number(r.quantity),
      branch_name: r.branch_name,
    })),
  };
}

/**
 * ยอดขายและจำนวนบิลของช่วงเวลาหนึ่ง
 *
 * จำนวนบิลนับจาก session_id ที่ไม่ซ้ำกัน ไม่ใช่จำนวนแถวใน payments
 * เพราะบิลใบเดียวแบ่งจ่ายหลายช่องทางได้ (เงินสดครึ่ง โอนครึ่ง) ซึ่งเก็บเป็นหลายแถว
 * และนับเฉพาะแถวที่เป็นยอดรับเงินจริง (total_amount > 0) เพื่อไม่ให้แถวคืนเงินติดลบ
 * ของบิลเก่าถูกนับเป็นบิลใหม่ของวันที่คืนเงิน
 */
type RevenueRow = RowDataPacket & { total: string | null; bill_count: number };
type TrendRow = RowDataPacket & { sale_date: string; total: string };
type TopMenuRow = RowDataPacket & { item_name: string; quantity: number; amount: string };
type StaleOrderRow = RowDataPacket & {
  id: number;
  branch_id: number;
  branch_name: string;
  order_code: string;
  table_no: string;
  created_at: string;
  waiting_minutes: number;
};
type TicketSummaryRow = RowDataPacket & { open_count: number; urgent_open_count: number };
/** เมนูที่ของใกล้หมดหรือหมดแล้ว ใช้ขึ้นแถบเตือนให้ครัวเติมของก่อนลูกค้าสั่งไม่ได้ */
type LowStockRow = RowDataPacket & {
  menu_item_id: number;
  name: string;
  stock_qty: number;
  branch_name: string | null;
};
type MonthRow = RowDataPacket & { month: string };
type BranchComparisonRow = RowDataPacket & {
  id: number;
  code: string;
  name: string;
  today_revenue: string;
  today_bills: number;
  monthly_revenue: string;
  monthly_bills: number;
};

function getPreviousYearMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const date = new Date(y, m - 1 - 1, 1);
  const prevY = date.getFullYear();
  const prevM = String(date.getMonth() + 1).padStart(2, '0');
  return `${prevY}-${prevM}`;
}

/**
 * รวบข้อมูลทั้งหมดที่ Dashboard ต้องใช้ รัน query แบบ Parallel ทั้งหมดพร้อมกัน
 * รองรับการกรองตามสาขาที่เลือก หรือแสดงภาพรวมทุกสาขาสำหรับ HQ Admin
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireCapability('dashboard.view');
    if (!auth.ok) return authFailureResponse(auth.reason);

    const branchId = await getEffectiveBranchId(request, auth.user);
    const activeBranch = branchId ? await getBranchById(branchId) : null;

    const todayRange = getBusinessDayRange(undefined, activeBranch?.businessDayCutoffHour);
    const yesterdayRange = getYesterdayBusinessDayRange(undefined, activeBranch?.businessDayCutoffHour);

    // ทุกบทบาทที่ไม่ใช่ ADMIN (พนักงาน แคชเชียร์ ครัว บาร์) ได้เฉพาะข้อมูลปฏิบัติการหน้าร้าน
    // ไม่เปิดเผยตัวเลขรายได้ ยอดขาย และกำไร ตรวจแบบ "ไม่ใช่ ADMIN" เพื่อให้บทบาทที่เพิ่มในอนาคตปลอดภัยไว้ก่อน
    if (auth.user.role !== 'ADMIN') {
      const [orderCount, openTables, staleOrders, tickets, lowStockItems, lowIngredients] = await Promise.all([
        queryOne<RowDataPacket & { total: number }>(
          `SELECT COUNT(*) AS total FROM orders
            WHERE (? IS NULL OR branch_id = ?)
              AND created_at >= ? AND created_at < ? AND status <> 'CANCELLED'`,
          [branchId, branchId, todayRange.startSql, todayRange.endSql],
        ),
        queryOne<RowDataPacket & { total: number }>(
          `SELECT COUNT(*) AS total FROM table_sessions
            WHERE (? IS NULL OR branch_id = ?) AND status = 'OPEN'`,
          [branchId, branchId],
        ),
        query<StaleOrderRow>(
          `SELECT o.id, o.branch_id, b.name AS branch_name, o.order_code, t.table_no, o.created_at,
                  TIMESTAMPDIFF(MINUTE, o.created_at, NOW()) AS waiting_minutes
             FROM orders o
             JOIN table_sessions s ON s.id = o.session_id
             JOIN dining_tables t ON t.id = s.table_id
             LEFT JOIN branches b ON b.id = o.branch_id
            WHERE (? IS NULL OR o.branch_id = ?)
              AND o.status = 'PENDING'
              AND s.status = 'OPEN'
              AND o.created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
            ORDER BY o.created_at`,
          [branchId, branchId, STALE_PENDING_MINUTES],
        ),
        queryOne<TicketSummaryRow>(
          `SELECT
             COUNT(*) AS open_count,
             COALESCE(SUM(CASE WHEN priority = 'URGENT' THEN 1 ELSE 0 END), 0) AS urgent_open_count
            FROM tickets
           WHERE (? IS NULL OR branch_id = ?) AND status = 'OPEN'`,
          [branchId, branchId],
        ),
        queryLowStockItems(branchId),
        queryLowIngredients(branchId),
      ]);

      return apiOk({
        ...toLowIngredientAlert(lowIngredients),
        isStaff: true,
        userRole: auth.user.role,
        userFullName: auth.user.fullName,
        branchId,
        branchName: activeBranch?.name ?? 'สาขาปัจจุบัน',
        todayOrderCount: Number(orderCount?.total ?? 0),
        openTableCount: Number(openTables?.total ?? 0),
        openTicketCount: Number(tickets?.open_count ?? 0),
        urgentOpenTicketCount: Number(tickets?.urgent_open_count ?? 0),
        stalePendingMinutes: STALE_PENDING_MINUTES,
        staleOrders,
        lowStockThreshold: LOW_STOCK_THRESHOLD,
        lowStockItems,
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
      branchComparison,
      lowStockItems,
      lowIngredients,
      menuSales,
      discountRow,
    ] = await Promise.all([
      // 1. ยอดขายประจำเดือนที่เลือก
      queryOne<RevenueRow>(
        `SELECT COALESCE(SUM(total_amount), 0) AS total,
                COUNT(DISTINCT IF(total_amount > 0, session_id, NULL)) AS bill_count
           FROM payments
          WHERE (? IS NULL OR branch_id = ?)
            AND DATE_FORMAT(paid_at, '%Y-%m') = ?`,
        [branchId, branchId, selectedMonth],
      ),
      // 2. ยอดขายเดือนก่อนหน้า
      queryOne<RevenueRow>(
        `SELECT COALESCE(SUM(total_amount), 0) AS total,
                COUNT(DISTINCT IF(total_amount > 0, session_id, NULL)) AS bill_count
           FROM payments
          WHERE (? IS NULL OR branch_id = ?)
            AND DATE_FORMAT(paid_at, '%Y-%m') = ?`,
        [branchId, branchId, prevMonth],
      ),
      // 3. รายชื่อเดือนที่มีในฐานข้อมูล
      query<MonthRow>(
        `SELECT DISTINCT DATE_FORMAT(paid_at, '%Y-%m') AS month FROM payments WHERE (? IS NULL OR branch_id = ?)
         UNION
         SELECT DISTINCT DATE_FORMAT(created_at, '%Y-%m') AS month FROM orders WHERE (? IS NULL OR branch_id = ?)
         ORDER BY month DESC`,
        [branchId, branchId, branchId, branchId],
      ),
      // 4. ยอดขายวันนี้ (ตามวันทำการ 04:00 - 03:59 น.)
      queryOne<RevenueRow>(
        `SELECT COALESCE(SUM(total_amount), 0) AS total,
                COUNT(DISTINCT IF(total_amount > 0, session_id, NULL)) AS bill_count
           FROM payments
          WHERE (? IS NULL OR branch_id = ?)
            AND paid_at >= ? AND paid_at < ?`,
        [branchId, branchId, todayRange.startSql, todayRange.endSql],
      ),
      // 5. ยอดขายเมื่อวาน (ตามวันทำการก่อนหน้า)
      queryOne<RevenueRow>(
        `SELECT COALESCE(SUM(total_amount), 0) AS total,
                COUNT(DISTINCT IF(total_amount > 0, session_id, NULL)) AS bill_count
           FROM payments
          WHERE (? IS NULL OR branch_id = ?)
            AND paid_at >= ? AND paid_at < ?`,
        [branchId, branchId, yesterdayRange.startSql, yesterdayRange.endSql],
      ),
      // 6. จำนวนออเดอร์วันนี้
      queryOne<RowDataPacket & { total: number }>(
        `SELECT COUNT(*) AS total FROM orders
          WHERE (? IS NULL OR branch_id = ?)
            AND created_at >= ? AND created_at < ? AND status <> 'CANCELLED'`,
        [branchId, branchId, todayRange.startSql, todayRange.endSql],
      ),
      // 7. โต๊ะที่เปิดอยู่
      queryOne<RowDataPacket & { total: number }>(
        `SELECT COUNT(*) AS total FROM table_sessions
          WHERE (? IS NULL OR branch_id = ?) AND status = 'OPEN'`,
        [branchId, branchId],
      ),
      // 8. ยอดค้างชำระ
      queryOne<RowDataPacket & { total: string | null }>(
        `SELECT COALESCE(SUM(oi.unit_price * oi.quantity), 0) AS total
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           JOIN table_sessions s ON s.id = o.session_id
          WHERE (? IS NULL OR o.branch_id = ?)
            AND s.status = 'OPEN' AND oi.status <> 'CANCELLED'`,
        [branchId, branchId],
      ),
      // 9. ออเดอร์รอครัวรับค้างเกินเวลา
      query<StaleOrderRow>(
        `SELECT o.id, o.branch_id, b.name AS branch_name, o.order_code, t.table_no, o.created_at,
                TIMESTAMPDIFF(MINUTE, o.created_at, NOW()) AS waiting_minutes
           FROM orders o
           JOIN table_sessions s ON s.id = o.session_id
           JOIN dining_tables t ON t.id = s.table_id
           LEFT JOIN branches b ON b.id = o.branch_id
          WHERE (? IS NULL OR o.branch_id = ?)
            AND o.status = 'PENDING'
            AND s.status = 'OPEN'
            AND o.created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
          ORDER BY o.created_at`,
        [branchId, branchId, STALE_PENDING_MINUTES],
      ),
      // 10. เมนูขายดีประจำเดือน
      query<TopMenuRow>(
        `SELECT oi.item_name,
                SUM(oi.quantity) AS quantity,
                SUM(oi.unit_price * oi.quantity) AS amount
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
          WHERE (? IS NULL OR o.branch_id = ?)
            AND DATE_FORMAT(o.created_at, '%Y-%m') = ? AND oi.status <> 'CANCELLED'
          GROUP BY oi.item_name
          ORDER BY quantity DESC, amount DESC
          LIMIT ?`,
        [branchId, branchId, selectedMonth, TOP_MENU_LIMIT],
      ),
      // 11. ยอดขายรายวันประจำเดือน
      query<TrendRow>(
        `SELECT DATE_FORMAT(paid_at, '%Y-%m-%d') AS sale_date, SUM(total_amount) AS total
           FROM payments
          WHERE (? IS NULL OR branch_id = ?)
            AND DATE_FORMAT(paid_at, '%Y-%m') = ?
          GROUP BY DATE_FORMAT(paid_at, '%Y-%m-%d')
          ORDER BY sale_date`,
        [branchId, branchId, selectedMonth],
      ),
      // 12. สรุปรายการ ticket
      queryOne<TicketSummaryRow>(
        `SELECT SUM(status <> 'CLOSED') AS open_count,
                SUM(status = 'OPEN' AND priority = 'URGENT') AS urgent_open_count
           FROM tickets
          WHERE (? IS NULL OR branch_id = ?)`,
        [branchId, branchId],
      ),
      // 13. การเปรียบเทียบยอดขายรายสาขาทั้งวันนี้และประจำเดือน (สำหรับภาพรวม HQ Admin)
      query<BranchComparisonRow>(
        `SELECT b.id, b.code, b.name,
                COALESCE(SUM(CASE WHEN p.paid_at >= ? AND p.paid_at < ? THEN p.total_amount ELSE 0 END), 0) AS today_revenue,
                COUNT(DISTINCT CASE WHEN p.paid_at >= ? AND p.paid_at < ? AND p.total_amount > 0
                                    THEN p.session_id ELSE NULL END) AS today_bills,
                COALESCE(SUM(CASE WHEN DATE_FORMAT(p.paid_at, '%Y-%m') = ? THEN p.total_amount ELSE 0 END), 0) AS monthly_revenue,
                COUNT(DISTINCT CASE WHEN DATE_FORMAT(p.paid_at, '%Y-%m') = ? AND p.total_amount > 0
                                    THEN p.session_id ELSE NULL END) AS monthly_bills
           FROM branches b
           LEFT JOIN payments p ON p.branch_id = b.id
          WHERE b.is_active = 1
          GROUP BY b.id, b.code, b.name
          ORDER BY today_revenue DESC, monthly_revenue DESC, b.id ASC`,
        [todayRange.startSql, todayRange.endSql, todayRange.startSql, todayRange.endSql, selectedMonth, selectedMonth],
      ),
      // 14. เมนูที่ของใกล้หมดหรือหมดแล้ว สำหรับแถบเตือนให้ครัวเติมของ
      queryLowStockItems(branchId),
      // 15. วัตถุดิบที่ใกล้หมดหรือยอดติดลบ
      queryLowIngredients(branchId),
      // 16. ยอดขายและต้นทุนรายเมนูของบิลที่ปิดในเดือนที่เลือก (ไม่นับบิลที่คืนเงินและรายการที่ยกเลิก)
      //     ใช้เดือนที่ปิดบิล ไม่ใช่เดือนที่สั่ง ให้ตรงกับยอดขายที่นับจากวันที่รับเงิน
      query<MenuSalesRow & RowDataPacket>(
        `SELECT oi.item_name,
                SUM(oi.quantity) AS quantity,
                SUM(oi.unit_price * oi.quantity) AS sales,
                SUM(IF(oi.unit_cost IS NULL, 0, oi.unit_price * oi.quantity)) AS costed_sales,
                SUM(COALESCE(oi.unit_cost, 0) * oi.quantity) AS cost
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           JOIN table_sessions s ON s.id = o.session_id
          WHERE (? IS NULL OR o.branch_id = ?)
            AND s.status = 'CLOSED' AND s.refunded_at IS NULL
            AND oi.status <> 'CANCELLED'
            AND DATE_FORMAT(s.closed_at, '%Y-%m') = ?
          GROUP BY oi.item_name`,
        [branchId, branchId, selectedMonth],
      ),
      // 17. ส่วนลดท้ายบิลรวมของเดือนเดียวกัน แสดงคู่กับกำไรขั้นต้นเพราะยังไม่ได้หักในตัวเลขรายเมนู
      queryOne<RowDataPacket & { total: string | null }>(
        `SELECT COALESCE(SUM(discount_amount), 0) AS total
           FROM table_sessions
          WHERE (? IS NULL OR branch_id = ?)
            AND status = 'CLOSED' AND refunded_at IS NULL
            AND DATE_FORMAT(closed_at, '%Y-%m') = ?`,
        [branchId, branchId, selectedMonth],
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
      branchId,
      branchName: activeBranch?.name ?? 'ทุกสาขา (ภาพรวมองค์กร)',
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
      lowStockThreshold: LOW_STOCK_THRESHOLD,
      lowStockItems,
      ...toLowIngredientAlert(lowIngredients),
      grossProfit: summarizeGrossProfit(menuSales),
      monthlyDiscountTotal: Number(discountRow?.total ?? 0),
      topMenus,
      salesTrend,
      openTicketCount: Number(tickets?.open_count ?? 0),
      urgentOpenTicketCount: Number(tickets?.urgent_open_count ?? 0),
      branchComparison: branchId === null ? branchComparison : [],
    });
  } catch (err) {
    return serverError(err, 'GET /api/admin/dashboard');
  }
}
