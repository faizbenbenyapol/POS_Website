'use client';

import { useState } from 'react';
import Link from 'next/link';
import { EmptyState } from '@/components/DataState';
import { formatBaht } from '@/lib/format';
import type { GrossProfitSummary } from '@/lib/profit';
import { formatThaiMonthYear } from './types';

/** จำนวนเมนูที่แสดงในตารางก่อนกด "ดูทั้งหมด" */
const INITIAL_ROWS = 8;

type GrossProfitPanelProps = {
  summary: GrossProfitSummary;
  discountTotal: number;
  selectedMonth: string;
};

/**
 * กำไรขั้นต้นจากต้นทุนวัตถุดิบของเดือนที่เลือก (เห็นเฉพาะแอดมิน)
 *
 * ตัวเลขมาจากต้นทุนต่อจานที่แช่แข็งไว้ตอนลูกค้าสั่ง ของบิลที่ปิดแล้วและไม่ถูกคืนเงิน
 * บอกนิยามไว้บนการ์ดตรง ๆ ว่ายังไม่หักส่วนลดท้ายบิล และบอกสัดส่วนยอดขายที่รู้ต้นทุน
 * เพราะเมนูที่ยังไม่มีสูตรไม่ถูกนับในกำไร ถ้าไม่บอกเจ้าของร้านจะเข้าใจว่ากำไรครอบคลุมทั้งร้าน
 *
 * @param summary - สรุปกำไรขั้นต้นจาก summarizeGrossProfit
 * @param discountTotal - ส่วนลดท้ายบิลรวมของเดือนเดียวกัน
 * @param selectedMonth - เดือนที่เลือกในรูป YYYY-MM
 * @returns การ์ดสรุปกำไรพร้อมตารางรายเมนู
 */
export default function GrossProfitPanel({ summary, discountTotal, selectedMonth }: GrossProfitPanelProps) {
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? summary.menus : summary.menus.slice(0, INITIAL_ROWS);
  const lowCoverage = summary.coveragePct !== null && summary.coveragePct < 80;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-xs">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2 border-b border-zinc-100 pb-3">
        <div>
          <h2 className="text-sm font-bold text-zinc-900">กำไรขั้นต้นจากต้นทุนวัตถุดิบ</h2>
          <p className="text-xs text-zinc-400">
            {formatThaiMonthYear(selectedMonth)} · บิลที่ปิดแล้วและไม่ถูกคืนเงิน
          </p>
        </div>
        <Link href="/admin/menu" className="text-xs font-medium text-emerald-600 hover:text-emerald-700 hover:underline">
          แก้สูตรและต้นทุนที่หน้าเมนู &rarr;
        </Link>
      </div>

      {summary.menus.length === 0 ? (
        <EmptyState message="ยังไม่มีบิลที่ปิดในเดือนนี้ กำไรจะขึ้นเมื่อมีบิลปิดแล้ว" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="ยอดขายที่รู้ต้นทุน" value={`฿${formatBaht(summary.costedSales)}`} />
            <Stat label="ต้นทุนวัตถุดิบ" value={`฿${formatBaht(summary.totalCost)}`} />
            <Stat
              label="กำไรขั้นต้น"
              value={`฿${formatBaht(summary.grossProfit)}`}
              detail={summary.marginPct === null ? undefined : `${summary.marginPct}% ของยอดขายที่รู้ต้นทุน`}
              tone={summary.grossProfit < 0 ? 'bad' : 'good'}
            />
            <Stat
              label="ยอดขายที่คิดกำไรได้"
              value={summary.coveragePct === null ? '—' : `${summary.coveragePct}%`}
              detail={`จากยอดขายตามรายการ ฿${formatBaht(summary.totalSales)}`}
              tone={lowCoverage ? 'warn' : undefined}
            />
          </div>

          <p className="mt-3 text-xs text-zinc-500">
            คิดจากราคาต่อจานก่อนหักส่วนลดท้ายบิล
            {discountTotal > 0 && (
              <>
                {' '}
                (เดือนนี้ให้ส่วนลดท้ายบิลไป <strong className="text-zinc-700">฿{formatBaht(discountTotal)}</strong>{' '}
                กำไรจริงจะน้อยกว่านี้เท่ากับส่วนลด)
              </>
            )}
            {summary.uncostedMenuCount > 0 && (
              <>
                {' '}
                · มี <strong className="text-amber-700">{summary.uncostedMenuCount} เมนู</strong>{' '}
                ที่ขายได้แต่ยังไม่มีสูตร จึงยังไม่นับในกำไร
              </>
            )}
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500">
                  <th className="py-2 pr-3 font-semibold">เมนู</th>
                  <th className="py-2 pr-3 text-right font-semibold">จำนวน</th>
                  <th className="py-2 pr-3 text-right font-semibold">ยอดขาย</th>
                  <th className="py-2 pr-3 text-right font-semibold">ต้นทุน</th>
                  <th className="py-2 pr-3 text-right font-semibold">กำไร</th>
                  <th className="py-2 text-right font-semibold">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((menu) => (
                  <tr key={menu.itemName}>
                    <td className="py-2 pr-3 text-zinc-800">{menu.itemName}</td>
                    <td className="num py-2 pr-3 text-right text-zinc-600">{menu.quantity}</td>
                    <td className="num py-2 pr-3 text-right text-zinc-800">
                      {formatBaht(menu.sales)}
                      {/* เมนูที่เพิ่งใส่สูตร กำไรคิดจากเฉพาะจานที่ขายหลังมีสูตร บอกไว้ไม่ให้เทียบผิดฐาน */}
                      {menu.profit !== null && menu.costedSales < menu.sales && (
                        <span className="block text-[11px] font-normal text-zinc-500">
                          รู้ต้นทุน ฿{formatBaht(menu.costedSales)}
                        </span>
                      )}
                    </td>
                    {menu.profit === null ? (
                      <td colSpan={3} className="py-2 text-right text-xs text-amber-700">
                        ยังไม่มีสูตร
                      </td>
                    ) : (
                      <>
                        <td className="num py-2 pr-3 text-right text-zinc-600">{formatBaht(menu.cost ?? 0)}</td>
                        <td
                          className={`num py-2 pr-3 text-right font-semibold ${
                            menu.profit < 0 ? 'text-red-600' : 'text-emerald-700'
                          }`}
                        >
                          {formatBaht(menu.profit)}
                        </td>
                        <td className="num py-2 text-right text-zinc-600">{menu.marginPct ?? '—'}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {summary.menus.length > INITIAL_ROWS && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-3 min-h-[36px] text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
            >
              {showAll ? 'ย่อรายการ' : `ดูทั้งหมด ${summary.menus.length} เมนู`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

/**
 * ช่องตัวเลขสรุป 1 ช่อง
 *
 * @param label - ชื่อตัวเลข
 * @param value - ค่าที่แสดง
 * @param detail - คำอธิบายใต้ตัวเลข
 * @param tone - สีของตัวเลข good = กำไร bad = ขาดทุน warn = ต้องระวัง
 * @returns กล่องตัวเลขสรุป
 */
function Stat({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: 'good' | 'bad' | 'warn';
}) {
  const color =
    tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-700' : 'text-zinc-900';
  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50/60 p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`num mt-0.5 text-lg font-bold ${color}`}>{value}</p>
      {detail && <p className="mt-0.5 text-[11px] text-zinc-500">{detail}</p>}
    </div>
  );
}
