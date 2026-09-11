'use client';

import Link from 'next/link';
import { CheckIcon } from '@/components/Icons';
import { EmptyState } from '@/components/DataState';
import { formatBaht } from '@/lib/format';
import { formatThaiMonthYear, type TopMenu } from './types';

type TopMenuLeaderboardProps = {
  topMenus: TopMenu[];
  selectedMonth: string;
};

export default function TopMenuLeaderboard({
  topMenus,
  selectedMonth,
}: TopMenuLeaderboardProps) {
  const maxQuantity = Math.max(1, ...(topMenus ?? []).map((m) => m.quantity));

  return (
    <section className="col-span-12 lg:col-span-4 rounded-xl border border-zinc-200 bg-white p-5 flex flex-col shadow-xs h-fit">
      <div className="mb-4 flex items-start justify-between border-b border-zinc-100 pb-3">
        <div>
          <h2 className="text-sm font-bold text-zinc-900">5 เมนูขายดี</h2>
          <p className="text-xs text-zinc-400">{formatThaiMonthYear(selectedMonth)}</p>
        </div>
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
          Leaderboard
        </span>
      </div>

      {topMenus.length === 0 ? (
        <EmptyState message="ยังไม่มีรายการอาหารที่สั่งในเดือนนี้" />
      ) : (
        <ol className="flex flex-col gap-2.5">
          {topMenus.map((menu, index) => {
            const percent = (menu.quantity / maxQuantity) * 100;
            const rankBadge = `#${index + 1}`;
            const rankStyle =
              index === 0
                ? 'bg-amber-100 text-amber-800 border-amber-300 font-black'
                : index === 1
                ? 'bg-slate-200 text-slate-700 border-slate-300 font-bold'
                : index === 2
                ? 'bg-amber-50 text-amber-900 border-amber-200 font-bold'
                : 'bg-zinc-100 text-zinc-600 border-zinc-200 font-medium';

            return (
              <li
                key={menu.item_name}
                className="flex flex-col gap-1.5 rounded-lg border border-zinc-100 bg-zinc-50/50 p-2.5 transition-all hover:border-emerald-200 hover:bg-emerald-50/20"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`inline-flex h-5 w-7 items-center justify-center rounded-md border text-[11px] num shrink-0 ${rankStyle}`}
                    >
                      {rankBadge}
                    </span>
                    <span className="truncate text-xs font-semibold text-zinc-800">
                      {menu.item_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 text-xs">
                    <span className="num font-bold text-zinc-900">{menu.quantity}</span>
                    <span className="text-[11px] text-zinc-400">จาน</span>
                  </div>
                </div>

                <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="h-full rounded-full bg-emerald-600 transition-all duration-300"
                    style={{ width: `${percent}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span className="whitespace-nowrap">ยอดขายสุทธิ</span>
                  <span className="num font-semibold text-zinc-700 whitespace-nowrap">
                    {formatBaht(Number(menu.amount))}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-5 pt-4 border-t border-zinc-100">
        <Link
          href="/admin/orders"
          className="flex w-full h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-emerald-700"
        >
          <CheckIcon className="w-3.5 h-3.5" />
          <span>ไปที่กระดานออเดอร์</span>
        </Link>
      </div>
    </section>
  );
}
