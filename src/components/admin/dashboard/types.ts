import { formatBahtWithSign } from '@/lib/format';

/** ออเดอร์ที่ค้างรอครัวรับนานเกินเกณฑ์กำหนด */
export type StaleOrder = {
  id: number;
  order_code: string;
  table_no: string;
  created_at: string;
  waiting_minutes: number;
};

/** ข้อมูลเมนูขายดีสำหรับจัดอันดับ Leaderboard */
export type TopMenu = {
  item_name: string;
  quantity: number;
  amount: string;
};

/** ข้อมูลยอดขายรายวันสำหรับกราฟแนวโน้ม */
export type TrendPoint = {
  sale_date: string;
  total: string;
};

/** ข้อมูลสำหรับพนักงานปฏิบัติการหน้าร้าน (ไม่มีข้อมูลยอดขาย/การเงิน) */
export type StaffDashboardData = {
  isStaff: true;
  userRole: 'STAFF';
  userFullName: string;
  branchId?: number | null;
  branchName?: string;
  todayOrderCount: number;
  openTableCount: number;
  openTicketCount: number;
  urgentOpenTicketCount: number;
  stalePendingMinutes: number;
  staleOrders: StaleOrder[];
};

export type BranchComparison = {
  id: number;
  code: string;
  name: string;
  today_revenue: string;
  today_bills: number;
};

/** ข้อมูลสรุปภาพรวมยอดขายและการเงินสำหรับผู้ดูแลระบบ (ADMIN) */
export type AdminDashboardData = {
  isStaff: false;
  userRole: 'ADMIN';
  branchId?: number | null;
  branchName?: string;
  selectedMonth: string;
  availableMonths: string[];
  monthlyRevenue: number;
  monthlyBillCount: number;
  monthlyAvgBill: number;
  prevMonth: string;
  prevMonthlyRevenue: number;
  prevMonthlyBillCount: number;
  monthGrowthPercent: number;
  todayRevenue: number;
  todayBillCount: number;
  yesterdayRevenue: number;
  yesterdayBillCount: number;
  todayOrderCount: number;
  openTableCount: number;
  unpaidAmount: number;
  stalePendingMinutes: number;
  staleOrders: StaleOrder[];
  topMenus: TopMenu[];
  salesTrend: TrendPoint[];
  openTicketCount: number;
  urgentOpenTicketCount: number;
  branchComparison?: BranchComparison[];
};

export type DashboardData = StaffDashboardData | AdminDashboardData;

/**
 * แปลงข้อความรูปแบบ YYYY-MM เป็นชื่อเดือนภาษาไทยพร้อม พ.ศ. (เช่น 2026-09 -> กันยายน 2569)
 */
export function formatThaiMonthYear(yearMonth: string): string {
  if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) return yearMonth;
  const [y, m] = yearMonth.split('-').map(Number);
  const date = new Date(y, m - 1, 1);
  return new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(date);
}

/**
 * เปรียบเทียบผลต่างยอดขายวันนี้เทียบกับเมื่อวาน
 */
export function compareWithYesterday(today: number, yesterday: number): string {
  if (yesterday === 0 && today === 0) {
    return 'ยังไม่มียอดขายทั้งวันนี้และเมื่อวาน';
  }
  if (yesterday === 0) {
    return `เมื่อวานยังไม่มีบิลปิด วันนี้เก็บได้แล้ว ${formatBahtWithSign(today)}`;
  }
  const diff = today - yesterday;
  if (diff === 0) {
    return `เท่ากับเมื่อวานพอดี (เมื่อวาน ${formatBahtWithSign(yesterday)})`;
  }
  const direction = diff > 0 ? 'มากกว่า' : 'น้อยกว่า';
  return `${direction}เมื่อวาน ${formatBahtWithSign(Math.abs(diff))} (เมื่อวาน ${formatBahtWithSign(yesterday)})`;
}
