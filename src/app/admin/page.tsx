'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { TableSkeleton, EmptyState, ErrorState } from '@/components/DataState';
import SalesTrend from '@/components/SalesTrend';
import { apiFetch } from '@/lib/client';
import { downloadCsvFile } from '@/lib/exportCsv';
import { formatBaht, formatBahtWithSign, formatThaiTime } from '@/lib/format';

import CustomSelect from '@/components/Select';

import {
  DownloadIcon,
  MoneyIcon,
  CheckIcon,
  CalendarIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  RefreshIcon,
  TableIcon,
  CartIcon,
  FoodMenuIcon,
  TicketIcon,
} from '@/components/Icons';


/** ออเดอร์ที่ค้างรอครัวรับนานเกินเกณฑ์ */
type StaleOrder = {
  id: number;
  order_code: string;
  table_no: string;
  created_at: string;
  waiting_minutes: number;
};

/** เมนูขายดีประจำเดือน ใช้วาดแท่งแนวนอน */
type TopMenu = { item_name: string; quantity: number; amount: string };

/** ยอดขาย 1 วันสำหรับกราฟเส้น */
type TrendPoint = { sale_date: string; total: string };

/** ข้อมูลทั้งชุดที่ GET /api/admin/dashboard คืนมา */
type DashboardData = {
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
};

/** ระยะเวลาระหว่างการดึงข้อมูลใหม่อัตโนมัติ */
const POLL_INTERVAL_MS = 30000;

/**
 * แปลงข้อความรูปแบบ YYYY-MM เป็นชื่อเดือนภาษาไทยพร้อม พ.ศ.
 * เช่น 2026-09 -> กันยายน 2569
 */
function formatThaiMonthYear(yearMonth: string): string {
  if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) return yearMonth;
  const [y, m] = yearMonth.split('-').map(Number);
  const date = new Date(y, m - 1, 1);
  return new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(date);
}

/**
 * เขียนประโยคเปรียบเทียบยอดขายวันนี้กับเมื่อวานเป็นภาษาคน
 */
function compareWithYesterday(today: number, yesterday: number): string {
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

/**
 * หน้า Dashboard สรุปผลการดำเนินงานและยอดขายประจำเดือน
 */
export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [loadError, setLoadError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  /**
   * ดึงข้อมูลสรุปทั้งชุดจากเซิร์ฟเวอร์
   */
  const load = useCallback(async (targetMonth: string, showSkeleton: boolean) => {
    if (showSkeleton) {
      setData(null);
      setLoadError('');
    }
    setIsRefreshing(true);
    try {
      const url = targetMonth
        ? `/api/admin/dashboard?month=${encodeURIComponent(targetMonth)}`
        : '/api/admin/dashboard';
      const result = await apiFetch<DashboardData>(url);
      if (result.ok) {
        setData(result.data);
        if (!targetMonth) {
          setSelectedMonth(result.data.selectedMonth);
        }
        setLoadError('');
      } else {
        setLoadError(result.message);
      }
    } catch {
      setLoadError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(selectedMonth, true);
    const timer = window.setInterval(() => load(selectedMonth, false), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [load, selectedMonth]);

  const handleMonthChange = (newMonth: string) => {
    setSelectedMonth(newMonth);
    load(newMonth, true);
  };

  /**
   * สร้างและดาวน์โหลดรายงานสรุปยอดขายของ Dashboard เป็นไฟล์ CSV
   */
  function handleExportCsv() {
    if (!data) return;
    const filename = `sales-report-${data.selectedMonth}.csv`;
    const thaiMonthStr = formatThaiMonthYear(data.selectedMonth);

    const headers = ['หัวข้อรายงาน', 'ข้อมูล / รายละเอียด', 'จำนวน / ยอดขาย (บาท)'];
    const rows: (string | number)[][] = [
      [`รายงานสรุปประจำเดือน ${thaiMonthStr} (${data.selectedMonth})`, '', ''],
      ['ยอดขายรวมประจำเดือน', 'ยอดขายสุทธิที่ปิดบิลแล้ว', data.monthlyRevenue],
      ['จำนวนบิลประจำเดือน', 'จำนวนบิลที่ชำระเงินแล้ว', data.monthlyBillCount],
      ['เฉลี่ยต่อบิล', 'ยอดขายเฉลี่ยต่อบิลประจำเดือน', Math.round(data.monthlyAvgBill)],
      ['เปรียบเทียบเดือนก่อนหน้า', `เดือน ${formatThaiMonthYear(data.prevMonth)}`, data.prevMonthlyRevenue],
      ['อัตราเติบโตจากเดือนก่อน', 'เปอร์เซ็นต์เปลี่ยนแปลง', `${data.monthGrowthPercent.toFixed(1)}%`],
      ['', '', ''],
      ['ยอดขายวันนี้', 'ยอดขายสุทธิของวันนี้', data.todayRevenue],
      ['จำนวนบิลวันนี้', 'จำนวนบิลชำระเงินวันนี้', data.todayBillCount],
      ['ยอดขายเมื่อวาน', 'ยอดขายสุทธิของเมื่อวาน', data.yesterdayRevenue],
      ['ยอดค้างชำระปัจจุบัน', 'ยอดรวมของโต๊ะที่ยังเปิด session อยู่', data.unpaidAmount],
      ['', '', ''],
      [`--- ยอดขายรายวันประจำเดือน ${thaiMonthStr} ---`, '', ''],
      ...data.salesTrend.map((pt) => [`วันที่ ${pt.sale_date}`, 'ยอดขายประจำวัน', pt.total]),
      ['', '', ''],
      [`--- 5 อันดับเมนูขายดีประจำเดือน ${thaiMonthStr} ---`, '', ''],
      ...data.topMenus.map((m) => [m.item_name, `ขายได้ ${m.quantity} รายการ`, m.amount]),
    ];

    downloadCsvFile(filename, headers, rows);
  }

  if (loadError || data === null) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slip">แดชบอร์ดสรุปยอดขาย</h1>
        </div>
        {loadError ? (
          <ErrorState message={loadError} onRetry={() => load(selectedMonth, true)} />
        ) : (
          <TableSkeleton rows={6} />
        )}
      </div>
    );
  }

  const maxQuantity = Math.max(1, ...data.topMenus.map((menu) => menu.quantity));

  return (
    <div className="flex flex-col gap-5 pb-8">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">ภาพรวมยอดขาย</h1>
          <p className="mt-0.5 text-xs text-zinc-400">
            {formatThaiMonthYear(data.selectedMonth)} · อัปเดตทุก 30 วินาที
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="w-52">
            <CustomSelect
              id="month-selector"
              value={data.selectedMonth}
              onChange={handleMonthChange}
              icon={<CalendarIcon className="w-3.5 h-3.5" />}
              options={data.availableMonths.map((m) => ({
                value: m,
                label: formatThaiMonthYear(m),
              }))}
            />
          </div>

          <button
            type="button"
            onClick={() => load(selectedMonth, false)}
            disabled={isRefreshing}
            title="รีเฟรช"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-500 transition-colors hover:bg-zinc-50 disabled:opacity-40"
          >
            <RefreshIcon className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="flex h-9 items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
          >
            <DownloadIcon className="w-3.5 h-3.5" />
            <span>ส่งออก CSV</span>
          </button>
        </div>
      </div>

      {/* Alert Banners */}
      {data.urgentOpenTicketCount > 0 && (
        <div role="alert" className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-xs">
          <div className="flex items-center gap-2 text-red-700">
            <TicketIcon className="w-3.5 h-3.5 shrink-0" />
            <span>
              มีเรื่องแจ้งปัญหาเร่งด่วนที่ยังไม่มีใครรับ{' '}
              <strong>{data.urgentOpenTicketCount}</strong> เรื่อง
            </span>
          </div>
          <Link href="/admin/tickets" className="font-semibold text-red-700 underline underline-offset-2 hover:text-red-800">
            ดูเรื่องแจ้ง
          </Link>
        </div>
      )}

      {data.staleOrders.length > 0 && (
        <div role="alert" className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs">
          <p className="font-semibold text-amber-800">
            ออเดอร์รอครัวรับเกิน {data.stalePendingMinutes} นาที:{' '}
            {data.staleOrders.map((o) => (
              <span key={o.id} className="ml-2 font-normal text-amber-700">
                โต๊ะ <strong>{o.table_no}</strong> ({o.waiting_minutes} นาที)
              </span>
            ))}
          </p>
          <Link href="/admin/orders" className="mt-1 block font-semibold text-amber-800 underline underline-offset-2 hover:text-amber-900">
            ไปกระดานออเดอร์
          </Link>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {/* Monthly Revenue — hero stat */}
        <div className="col-span-2 rounded-lg border border-zinc-200 bg-white p-5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
            ยอดขายประจำเดือน · {formatThaiMonthYear(data.selectedMonth)}
          </p>
          <p className="num mt-1.5 text-3xl font-bold text-zinc-900 tracking-tight">
            {formatBahtWithSign(data.monthlyRevenue)}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <span className={`inline-flex items-center gap-1 rounded text-xs font-semibold px-1.5 py-0.5 ${
              data.monthGrowthPercent >= 0
                ? 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-700'
            }`}>
              {data.monthGrowthPercent >= 0 ? (
                <TrendingUpIcon className="w-3 h-3" />
              ) : (
                <TrendingDownIcon className="w-3 h-3" />
              )}
              {data.monthGrowthPercent >= 0 ? '+' : ''}{data.monthGrowthPercent.toFixed(1)}%
            </span>
            <span className="text-xs text-zinc-400">จากเดือนก่อน ({formatBaht(data.prevMonthlyRevenue)})</span>
          </div>
          <div className="mt-3 flex gap-5 border-t border-zinc-100 pt-3">
            <div>
              <p className="text-[11px] text-zinc-400">จำนวนบิล</p>
              <p className="num text-sm font-semibold text-zinc-800">{data.monthlyBillCount} บิล</p>
            </div>
            <div>
              <p className="text-[11px] text-zinc-400">เฉลี่ยต่อบิล</p>
              <p className="num text-sm font-semibold text-zinc-800">{formatBaht(data.monthlyAvgBill)}</p>
            </div>
          </div>
        </div>

        {/* Today Revenue */}
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">ยอดวันนี้</p>
          <p className="num mt-1.5 text-2xl font-bold text-zinc-900">{formatBahtWithSign(data.todayRevenue)}</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">
            {compareWithYesterday(data.todayRevenue, data.yesterdayRevenue)}
          </p>
          <div className="mt-2 flex items-center justify-between border-t border-zinc-100 pt-2">
            <span className="text-[11px] text-zinc-400">บิลวันนี้</span>
            <span className="num text-xs font-semibold text-zinc-700">{data.todayBillCount} บิล</span>
          </div>
        </div>

        {/* Live operational stats */}
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">สถานะตอนนี้</p>
          <div className="mt-2 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                <CartIcon className="w-3.5 h-3.5 shrink-0" />
                <span>ออเดอร์วันนี้</span>
              </div>
              <span className="num text-xs font-semibold text-zinc-800">{data.todayOrderCount} ใบ</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                <TableIcon className="w-3.5 h-3.5 shrink-0" />
                <span>โต๊ะเปิดอยู่</span>
              </div>
              <span className="num text-xs font-semibold text-zinc-800">{data.openTableCount} โต๊ะ</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                <MoneyIcon className="w-3.5 h-3.5 shrink-0" />
                <span>ค้างชำระ</span>
              </div>
              <span className={`num text-xs font-semibold ${data.unpaidAmount > 0 ? 'text-amber-700' : 'text-zinc-800'}`}>
                {formatBahtWithSign(data.unpaidAmount)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                <TicketIcon className="w-3.5 h-3.5 shrink-0" />
                <span>แจ้งปัญหา</span>
              </div>
              <span className={`num text-xs font-semibold ${data.openTicketCount > 0 ? 'text-red-600' : 'text-zinc-800'}`}>
                {data.openTicketCount} เรื่อง
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Chart + Top Menu */}
      <div className="grid gap-4 md:grid-cols-12">
        {/* Sales Trend */}
        <section className="rounded-lg border border-zinc-200 bg-white p-5 md:col-span-8">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-800">ยอดขายรายวัน</h2>
              <p className="text-xs text-zinc-400">{formatThaiMonthYear(data.selectedMonth)}</p>
            </div>
            <span className="rounded border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] text-zinc-500">
              {data.salesTrend.length} วันมียอด
            </span>
          </div>
          <SalesTrend points={data.salesTrend} selectedMonth={data.selectedMonth} />
        </section>

        {/* Top 5 Menus */}
        <section className="rounded-lg border border-zinc-200 bg-white p-5 md:col-span-4 flex flex-col">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-zinc-800">5 เมนูขายดี</h2>
            <p className="text-xs text-zinc-400">{formatThaiMonthYear(data.selectedMonth)}</p>
          </div>

          {data.topMenus.length === 0 ? (
            <EmptyState message="ยังไม่มีรายการอาหารที่สั่งในเดือนนี้" />
          ) : (
            <ol className="flex flex-col gap-3">
              {data.topMenus.map((menu, index) => (
                <li key={menu.item_name} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-4 shrink-0 text-xs font-semibold text-zinc-400">{index + 1}</span>
                      <span className="truncate text-xs font-medium text-zinc-800">{menu.item_name}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 text-xs">
                      <span className="num font-semibold text-zinc-800">{menu.quantity}</span>
                      <span className="text-zinc-400">จาน</span>
                    </div>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className="h-full rounded-full bg-green-600"
                      style={{ width: `${(menu.quantity / maxQuantity) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ol>
          )}

          <div className="mt-auto pt-5 border-t border-zinc-100">
            <Link
              href="/pos"
              className="flex w-full h-9 items-center justify-center gap-1.5 rounded-md bg-green-600 text-xs font-semibold text-white transition-colors hover:bg-green-700"
            >
              <CheckIcon className="w-3.5 h-3.5" />
              หน้าขายหน้าร้าน (POS)
            </Link>
          </div>
        </section>
      </div>

      {/* Quick Navigation */}
      <section className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
        {[
          { href: '/admin/orders', icon: CartIcon, label: 'กระดานออเดอร์', sub: 'ติดตามสถานะอาหาร' },
          { href: '/admin/tables', icon: TableIcon, label: 'จัดการโต๊ะ', sub: 'เปิดโต๊ะ พิมพ์ QR code' },
          { href: '/admin/menu', icon: FoodMenuIcon, label: 'เมนูอาหาร', sub: 'เพิ่มเมนู ปรับราคา' },
          { href: '/admin/tickets', icon: TicketIcon, label: 'แจ้งปัญหา', sub: 'เรื่องร้องเรียน' },
        ].map(({ href, icon: Icon, label, sub }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-md border border-zinc-200 bg-white px-4 py-3 transition-colors hover:bg-zinc-50 hover:border-zinc-300"
          >
            <Icon className="w-4 h-4 shrink-0 text-zinc-400" />
            <div>
              <p className="text-xs font-medium text-zinc-800">{label}</p>
              <p className="text-[11px] text-zinc-400">{sub}</p>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
