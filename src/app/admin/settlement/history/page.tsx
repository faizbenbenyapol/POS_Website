'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/client';
import { downloadCsvFile } from '@/lib/exportCsv';
import { formatBaht, formatThaiDate, formatThaiDateTime } from '@/lib/format';
import { TableSkeleton, ErrorState, EmptyState } from '@/components/DataState';
import {
  CalendarIcon,
  RefreshIcon,
  DownloadIcon,
  BuildingIcon,
  LockIcon,
  MoneyIcon,
  TrophyIcon,
  ChartIcon,
} from '@/components/Icons';
import type { SettlementHistoryResponse } from '@/app/api/admin/settlements/route';

/**
 * คืนค่าสตริงวันที่ของวันนี้ในรูปแบบ YYYY-MM-DD สำหรับตั้งค่าเริ่มต้นของช่องเลือกวันที่
 *
 * @returns ข้อความวันที่รูปแบบ YYYY-MM-DD
 */
function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * เลื่อนวันที่ถอยหลังตามจำนวนวันที่กำหนด ใช้กับปุ่มช่วงเวลาสำเร็จรูป
 *
 * @param dateStr - วันที่ตั้งต้นรูปแบบ YYYY-MM-DD
 * @param days - จำนวนวันที่ต้องการถอยหลัง
 * @returns วันที่ใหม่รูปแบบ YYYY-MM-DD
 */
function shiftDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - days);
  const ny = date.getFullYear();
  const nm = String(date.getMonth() + 1).padStart(2, '0');
  const nd = String(date.getDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

/**
 * แปลงผลต่างเงินสดเป็นข้อความไทยบอกว่าเงินตรง ขาด หรือเกินอยู่เท่าไร
 *
 * @param difference - ผลต่างหน่วยบาท (เงินสดที่นับได้จริง ลบด้วยเงินสดตามระบบ)
 * @returns ข้อความสรุปผลต่างพร้อมจำนวนเงิน
 */
function describeCashDifference(difference: number): string {
  if (difference === 0) return 'ตรงพอดี';
  if (difference > 0) return `เกิน ฿${formatBaht(difference)}`;
  return `ขาด ฿${formatBaht(Math.abs(difference))}`;
}

/**
 * หน้าจอประวัติการปิดยอดประจำวัน (Z-Report History)
 * อ่านจากใบปิดยอดที่แช่แข็งไว้แล้ว จึงเป็นตัวเลขชุดเดียวกับที่พนักงานเซ็นส่งมอบกะในแต่ละวัน
 */
export default function SettlementHistoryPage() {
  const [dateTo, setDateTo] = useState<string>(getTodayDateString());
  const [dateFrom, setDateFrom] = useState<string>(shiftDateString(getTodayDateString(), 30));
  const [data, setData] = useState<SettlementHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  /**
   * โหลดประวัติใบปิดยอดตามช่วงวันที่ที่เลือก
   *
   * @param from - วันเริ่มต้นรูปแบบ YYYY-MM-DD
   * @param to - วันสิ้นสุดรูปแบบ YYYY-MM-DD
   * @param showSkeleton - true เมื่อต้องการแสดงโครงร่างระหว่างโหลดครั้งแรก
   */
  const fetchHistory = useCallback(
    async (from: string, to: string, showSkeleton = true) => {
      if (showSkeleton) {
        setLoading(true);
        setLoadError('');
      }
      setIsRefreshing(true);
      const url = `/api/admin/settlements?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
      const res = await apiFetch<SettlementHistoryResponse>(url);
      setLoading(false);
      setIsRefreshing(false);
      if (res.ok) {
        setData(res.data);
        setLoadError('');
      } else {
        setLoadError(res.message);
      }
    },
    [],
  );

  useEffect(() => {
    fetchHistory(dateFrom, dateTo, true);
  }, [dateFrom, dateTo, fetchHistory]);

  /**
   * ตั้งช่วงวันที่ย้อนหลังตามจำนวนวันที่กดเลือก โดยยึดวันนี้เป็นวันสิ้นสุดเสมอ
   *
   * @param days - จำนวนวันย้อนหลังที่ต้องการดู
   */
  function applyQuickRange(days: number) {
    const today = getTodayDateString();
    setDateTo(today);
    setDateFrom(shiftDateString(today, days));
  }

  /** ส่งออกประวัติการปิดยอดทั้งช่วงเป็นไฟล์ CSV สำหรับส่งบัญชี */
  function handleExportCsv() {
    if (!data) return;
    const filename = `settlement-history-${data.branchCode}-${data.from}-ถึง-${data.to}.csv`;

    const headers = [
      'วันทำการ',
      'เลขที่ใบปิดยอด',
      'สาขา',
      'ยอดขายสุทธิ',
      'จำนวนบิล',
      'เงินสด',
      'เงินโอน',
      'บัตร',
      'รายการยกเลิก',
      'มูลค่าที่ตัดออก',
      'เงินสดนับได้จริง',
      'ผลต่างเงินสด',
      'ผู้ปิดยอด',
      'เวลาที่ปิดยอด',
      'หมายเหตุ',
    ];

    const rows: (string | number)[][] = data.rows.map((row) => [
      row.businessDate,
      `Z-${row.zNumber}`,
      row.branchName,
      row.totalRevenue,
      row.totalBills,
      row.cashTotal,
      row.transferTotal,
      row.cardTotal,
      row.voidCount,
      row.voidAmount,
      row.countedCash ?? '',
      row.cashDifference ?? '',
      row.closedByName,
      formatThaiDateTime(row.closedAt),
      row.note || '',
    ]);

    rows.push([
      'รวมทั้งช่วง',
      `${data.summary.settlementCount} ใบ`,
      '',
      data.summary.totalRevenue,
      data.summary.totalBills,
      data.summary.cashTotal,
      data.summary.transferTotal,
      data.summary.cardTotal,
      data.summary.voidCount,
      data.summary.voidAmount,
      '',
      data.summary.cashDifferenceTotal,
      '',
      '',
      '',
    ]);

    downloadCsvFile(filename, headers, rows);
  }

  return (
    <div className="flex flex-col gap-5 pb-12">
      {/* Top Header & Range Selector */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-rule bg-white p-5 shadow-xs">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-slip border border-zinc-200">
              <ChartIcon className="w-3.5 h-3.5" />
              <span>ประวัติการปิดยอด (Z-Report History)</span>
            </span>
            {data?.branchName && (
              <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700">
                <BuildingIcon className="w-3 h-3 text-zinc-500" />
                {data.branchName}
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold text-slip">ใบปิดยอดย้อนหลังและยอดรวมตามช่วงเวลา</h1>
          <p className="mt-0.5 text-xs text-slip-dim">
            ตัวเลขทั้งหมดมาจากใบปิดยอดที่บันทึกถาวรแล้ว ไม่ถูกคำนวณใหม่ จึงตรงกับสลิปที่เซ็นส่งกะทุกใบ
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-rule bg-zinc-50 p-1 text-xs font-medium text-slip">
            <button
              type="button"
              onClick={() => applyQuickRange(7)}
              className="rounded-lg px-2.5 py-1 text-slip-dim transition-colors hover:text-slip cursor-pointer"
            >
              7 วัน
            </button>
            <button
              type="button"
              onClick={() => applyQuickRange(30)}
              className="rounded-lg px-2.5 py-1 text-slip-dim transition-colors hover:text-slip cursor-pointer"
            >
              30 วัน
            </button>
            <button
              type="button"
              onClick={() => applyQuickRange(90)}
              className="rounded-lg px-2.5 py-1 text-slip-dim transition-colors hover:text-slip cursor-pointer"
            >
              90 วัน
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label="วันเริ่มต้น"
              className="rounded-xl border border-rule bg-white px-3 py-1.5 text-xs font-medium text-slip focus:border-zinc-400 focus:outline-none"
            />
            <span className="text-xs text-slip-dim">ถึง</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label="วันสิ้นสุด"
              className="rounded-xl border border-rule bg-white px-3 py-1.5 text-xs font-medium text-slip focus:border-zinc-400 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => fetchHistory(dateFrom, dateTo, false)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1 rounded-xl border border-rule bg-white px-3 py-1.5 text-xs font-medium text-slip hover:bg-zinc-50 disabled:opacity-50 cursor-pointer"
            title="รีเฟรชข้อมูล"
          >
            <RefreshIcon className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden md:inline">รีเฟรช</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!data || loading || data.rows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
          >
            <DownloadIcon className="w-4 h-4" />
            <span>ส่งออก CSV</span>
          </button>

          <Link
            href="/admin/settlement"
            className="inline-flex items-center gap-1.5 rounded-xl border border-rule bg-white px-3.5 py-1.5 text-xs font-bold text-slip hover:bg-zinc-50"
          >
            <CalendarIcon className="w-4 h-4" />
            <span>ปิดยอดวันนี้</span>
          </Link>
        </div>
      </div>

      {loadError && (
        <ErrorState message={loadError} onRetry={() => fetchHistory(dateFrom, dateTo, true)} />
      )}

      {loading && !data && <TableSkeleton />}

      {data && !loadError && (
        <>
          {/* Range Summary Metrics */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-rule bg-white p-4 shadow-xs">
              <span className="text-xs font-semibold text-slip-dim">ยอดขายรวมทั้งช่วง</span>
              <p className="num mt-1 text-2xl font-black text-emerald-700">
                ฿{formatBaht(data.summary.totalRevenue)}
              </p>
              <p className="mt-1 text-[11px] text-slip-dim">
                จาก {data.summary.settlementCount} วันทำการที่ปิดยอดแล้ว ({data.summary.totalBills}{' '}
                บิล)
              </p>
            </div>

            <div className="rounded-2xl border border-rule bg-white p-4 shadow-xs">
              <span className="text-xs font-semibold text-slip-dim">ยอดขายเฉลี่ยต่อวัน</span>
              <p className="num mt-1 text-2xl font-black text-slip">
                ฿{formatBaht(data.summary.avgRevenuePerDay)}
              </p>
              <p className="mt-1 text-[11px] text-slip-dim">
                เฉลี่ยจากวันที่ปิดยอดแล้วเท่านั้น
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-900">ผลต่างเงินสดสะสม</span>
                <MoneyIcon className="w-4 h-4 text-emerald-700" />
              </div>
              <p className="num mt-1 text-2xl font-black text-emerald-900">
                {data.summary.daysWithCashCount === 0
                  ? '-'
                  : describeCashDifference(data.summary.cashDifferenceTotal)}
              </p>
              <p className="mt-1 text-[11px] text-emerald-700 font-medium">
                นับเงินไว้ {data.summary.daysWithCashCount} วันจาก {data.summary.settlementCount} วัน
              </p>
            </div>

            <div className="rounded-2xl border border-rule bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slip-dim">วันที่ขายดีที่สุด</span>
                <TrophyIcon className="w-4 h-4 text-amber-600" />
              </div>
              <p className="num mt-1 text-2xl font-black text-slip">
                {data.summary.bestDay ? `฿${formatBaht(data.summary.bestDay.totalRevenue)}` : '-'}
              </p>
              <p className="mt-1 text-[11px] text-slip-dim">
                {data.summary.bestDay ? formatThaiDate(data.summary.bestDay.businessDate) : 'ยังไม่มีข้อมูล'}
              </p>
            </div>
          </div>

          {/* Range Ribbon */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-zinc-100 px-4 py-2.5 text-xs text-slip-dim border border-zinc-200">
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-zinc-500" />
              <span>
                ช่วงที่ดู: <strong className="text-slip">{formatThaiDate(data.from)}</strong> ถึง{' '}
                <strong className="text-slip">{formatThaiDate(data.to)}</strong>
              </span>
            </div>
            <div>
              พบใบปิดยอด <strong className="text-slip">{data.summary.settlementCount}</strong> ใบ
            </div>
          </div>

          {/* Settlement Table */}
          {data.rows.length === 0 ? (
            <EmptyState
              message="ยังไม่มีใบปิดยอดในช่วงวันที่เลือก ลองขยายช่วงวันที่ หรือไปปิดยอดของวันทำการปัจจุบันก่อน"
              action={
                <Link
                  href="/admin/settlement"
                  className="rounded-xl bg-zinc-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-zinc-800"
                >
                  ไปหน้าปิดยอดประจำวัน
                </Link>
              }
            />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-rule bg-white shadow-xs">
              <table className="w-full min-w-[900px] text-xs">
                <thead className="bg-zinc-50 text-slip-dim">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">วันทำการ</th>
                    <th className="px-4 py-3 text-left font-semibold">ใบที่</th>
                    <th className="px-4 py-3 text-right font-semibold">ยอดขายสุทธิ</th>
                    <th className="px-4 py-3 text-right font-semibold">บิล</th>
                    <th className="px-4 py-3 text-right font-semibold">เงินสด</th>
                    <th className="px-4 py-3 text-right font-semibold">โอน</th>
                    <th className="px-4 py-3 text-right font-semibold">บัตร</th>
                    <th className="px-4 py-3 text-right font-semibold">ผลต่างเงินสด</th>
                    <th className="px-4 py-3 text-left font-semibold">ผู้ปิดยอด</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {data.rows.map((row) => (
                    <tr key={row.id} className="hover:bg-zinc-50/60">
                      <td className="px-4 py-3">
                        <span className="font-semibold text-slip">
                          {formatThaiDate(row.businessDate)}
                        </span>
                        {row.note && (
                          <p className="mt-0.5 text-[11px] text-slip-dim">หมายเหตุ: {row.note}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-bold text-slip">
                          <LockIcon className="w-3 h-3" />Z-{row.zNumber}
                        </span>
                      </td>
                      <td className="num px-4 py-3 text-right font-black text-emerald-700">
                        ฿{formatBaht(row.totalRevenue)}
                      </td>
                      <td className="num px-4 py-3 text-right text-slip">{row.totalBills}</td>
                      <td className="num px-4 py-3 text-right text-slip">
                        ฿{formatBaht(row.cashTotal)}
                      </td>
                      <td className="num px-4 py-3 text-right text-slip">
                        ฿{formatBaht(row.transferTotal)}
                      </td>
                      <td className="num px-4 py-3 text-right text-slip">
                        ฿{formatBaht(row.cardTotal)}
                      </td>
                      <td className="num px-4 py-3 text-right font-bold">
                        {row.cashDifference === null ? (
                          <span className="text-slip-dim">ไม่ได้นับ</span>
                        ) : (
                          <span
                            className={
                              row.cashDifference === 0 ? 'text-emerald-700' : 'text-red-700'
                            }
                          >
                            {describeCashDifference(row.cashDifference)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-slip">{row.closedByName}</span>
                        <p className="mt-0.5 text-[11px] text-slip-dim">
                          {formatThaiDateTime(row.closedAt)}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-zinc-50 font-bold text-slip">
                  <tr>
                    <td className="px-4 py-3" colSpan={2}>
                      รวมทั้งช่วง ({data.summary.settlementCount} ใบ)
                    </td>
                    <td className="num px-4 py-3 text-right text-emerald-800">
                      ฿{formatBaht(data.summary.totalRevenue)}
                    </td>
                    <td className="num px-4 py-3 text-right">{data.summary.totalBills}</td>
                    <td className="num px-4 py-3 text-right">
                      ฿{formatBaht(data.summary.cashTotal)}
                    </td>
                    <td className="num px-4 py-3 text-right">
                      ฿{formatBaht(data.summary.transferTotal)}
                    </td>
                    <td className="num px-4 py-3 text-right">
                      ฿{formatBaht(data.summary.cardTotal)}
                    </td>
                    <td className="num px-4 py-3 text-right">
                      {data.summary.daysWithCashCount === 0
                        ? '-'
                        : describeCashDifference(data.summary.cashDifferenceTotal)}
                    </td>
                    <td className="px-4 py-3" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
