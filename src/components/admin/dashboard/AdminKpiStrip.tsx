'use client';

import {
  TrendingUpIcon,
  TrendingDownIcon,
  CartIcon,
  TableIcon,
  MoneyIcon,
  TicketIcon,
} from '@/components/Icons';
import { formatBaht, formatBahtWithSign } from '@/lib/format';
import { formatThaiMonthYear, compareWithYesterday, type AdminDashboardData } from './types';

type AdminKpiStripProps = {
  data: AdminDashboardData;
};

export default function AdminKpiStrip({ data }: AdminKpiStripProps) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {/* Monthly Revenue — Hero Metric Card */}
      <div className="col-span-2 rounded-lg border border-zinc-200 bg-white p-5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
          ยอดขายประจำเดือน · {formatThaiMonthYear(data.selectedMonth)}
        </p>
        <p className="num mt-1.5 text-3xl font-bold text-zinc-900 tracking-tight">
          {formatBahtWithSign(data.monthlyRevenue)}
        </p>
        <div className="mt-2 flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1 rounded text-xs font-semibold px-1.5 py-0.5 ${
              data.monthGrowthPercent >= 0
                ? 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-700'
            }`}
          >
            {data.monthGrowthPercent >= 0 ? (
              <TrendingUpIcon className="w-3 h-3" />
            ) : (
              <TrendingDownIcon className="w-3 h-3" />
            )}
            {data.monthGrowthPercent >= 0 ? '+' : ''}
            {data.monthGrowthPercent.toFixed(1)}%
          </span>
          <span className="text-xs text-zinc-400">
            จากเดือนก่อน ({formatBaht(data.prevMonthlyRevenue)})
          </span>
        </div>
        <div className="mt-3 flex gap-5 border-t border-zinc-100 pt-3">
          <div>
            <p className="text-[11px] text-zinc-400">จำนวนบิล</p>
            <p className="num text-sm font-semibold text-zinc-800">
              {data.monthlyBillCount} บิล
            </p>
          </div>
          <div>
            <p className="text-[11px] text-zinc-400">เฉลี่ยต่อบิล</p>
            <p className="num text-sm font-semibold text-zinc-800">
              {formatBaht(data.monthlyAvgBill)}
            </p>
          </div>
        </div>
      </div>

      {/* Today Revenue */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">ยอดวันนี้</p>
        <p className="num mt-1.5 text-2xl font-bold text-zinc-900">
          {formatBahtWithSign(data.todayRevenue)}
        </p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">
          {compareWithYesterday(data.todayRevenue, data.yesterdayRevenue)}
        </p>
        <div className="mt-2 flex items-center justify-between border-t border-zinc-100 pt-2">
          <span className="text-[11px] text-zinc-400">บิลวันนี้</span>
          <span className="num text-xs font-semibold text-zinc-700">
            {data.todayBillCount} บิล
          </span>
        </div>
      </div>

      {/* Live Operational Status */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">สถานะตอนนี้</p>
        <div className="mt-2 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              <CartIcon className="w-3.5 h-3.5 shrink-0" />
              <span>ออเดอร์วันนี้</span>
            </div>
            <span className="num text-xs font-semibold text-zinc-800">
              {data.todayOrderCount} ใบ
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              <TableIcon className="w-3.5 h-3.5 shrink-0" />
              <span>โต๊ะเปิดอยู่</span>
            </div>
            <span className="num text-xs font-semibold text-zinc-800">
              {data.openTableCount} โต๊ะ
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              <MoneyIcon className="w-3.5 h-3.5 shrink-0" />
              <span>ค้างชำระ</span>
            </div>
            <span
              className={`num text-xs font-semibold ${
                data.unpaidAmount > 0 ? 'text-amber-700' : 'text-zinc-800'
              }`}
            >
              {formatBahtWithSign(data.unpaidAmount)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              <TicketIcon className="w-3.5 h-3.5 shrink-0" />
              <span>แจ้งปัญหา</span>
            </div>
            <span
              className={`num text-xs font-semibold ${
                data.openTicketCount > 0 ? 'text-red-600' : 'text-zinc-800'
              }`}
            >
              {data.openTicketCount} เรื่อง
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
