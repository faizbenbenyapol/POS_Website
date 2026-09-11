'use client';

import { useCallback, useEffect, useState } from 'react';
import { TableSkeleton, ErrorState } from '@/components/DataState';
import SalesTrend from '@/components/SalesTrend';
import CustomSelect from '@/components/Select';
import { apiFetch } from '@/lib/client';
import { downloadCsvFile } from '@/lib/exportCsv';
import { CalendarIcon, RefreshIcon, DownloadIcon } from '@/components/Icons';

import StaffOperationalView from '@/components/admin/dashboard/StaffOperationalView';
import DashboardAlertBanners from '@/components/admin/dashboard/DashboardAlertBanners';
import AdminKpiStrip from '@/components/admin/dashboard/AdminKpiStrip';
import TopMenuLeaderboard from '@/components/admin/dashboard/TopMenuLeaderboard';
import DashboardQuickNav from '@/components/admin/dashboard/DashboardQuickNav';
import {
  formatThaiMonthYear,
  type DashboardData,
} from '@/components/admin/dashboard/types';

/** ระยะเวลาระหว่างการดึงข้อมูลใหม่อัตโนมัติ (30 วินาที) */
const POLL_INTERVAL_MS = 30000;

/**
 * แดชบอร์ดศูนย์กลางของระบบ POS รองรับทั้งมุมมองพนักงาน (STAFF) และเจ้าของร้าน (ADMIN)
 */
export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [loadError, setLoadError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  /** ดึงข้อมูลสรุป Dashboard จากเซิร์ฟเวอร์ */
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
        if (!result.data.isStaff && !targetMonth) {
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
    if (data?.isStaff) return;
    setSelectedMonth(newMonth);
    load(newMonth, true);
  };

  /** สร้างและดาวน์โหลดรายงานสรุปยอดขายของ Dashboard เป็นไฟล์ CSV */
  function handleExportCsv() {
    if (!data || data.isStaff) return;
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

  if (data.isStaff) {
    return <StaffOperationalView data={data} />;
  }

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
      <DashboardAlertBanners
        urgentOpenTicketCount={data.urgentOpenTicketCount}
        staleOrders={data.staleOrders}
        stalePendingMinutes={data.stalePendingMinutes}
      />

      {/* KPI Metric Strip */}
      <AdminKpiStrip data={data} />

      {/* Sales Trend Chart + Top 5 Menus Leaderboard */}
      <div className="grid gap-5 lg:grid-cols-12">
        <section className="col-span-12 lg:col-span-8 flex flex-col gap-3">
          <div className="flex items-center justify-between px-0.5">
            <div>
              <h2 className="text-sm font-bold text-zinc-900">วิเคราะห์ยอดขายรายวัน</h2>
              <p className="text-xs text-zinc-400">
                {formatThaiMonthYear(data.selectedMonth)} · ข้อมูลเรียลไทม์
              </p>
            </div>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
              {data.salesTrend.length} วันมียอดเข้า
            </span>
          </div>
          <SalesTrend points={data.salesTrend} selectedMonth={data.selectedMonth} />
        </section>

        <TopMenuLeaderboard
          topMenus={data.topMenus}
          selectedMonth={data.selectedMonth}
        />
      </div>

      {/* Quick Navigation */}
      <DashboardQuickNav />
    </div>
  );
}
