'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/client';
import { formatBaht, formatThaiTime } from '@/lib/format';
import { TableSkeleton, EmptyState, ErrorState } from '@/components/DataState';
import { SelectField } from '@/components/Field';
import { RefreshIcon, ClockIcon } from '@/components/Icons';
import type { ActivityLog } from '@/app/api/admin/activity-logs/route';

/** ตัวกรองประเภทกิจกรรม ค่าว่างคือดูทั้งหมด */
const KIND_FILTERS = [
  { value: '', label: 'ทุกกิจกรรม' },
  { value: 'ORDER_STATUS', label: 'การจัดการออเดอร์' },
  { value: 'CHECKOUT', label: 'การปิดบิลรับเงิน' },
];

/** คำอธิบายภาษาไทยของสถานะออเดอร์ ใช้ประกอบประโยคว่าใครทำอะไร */
const STATUS_TEXT: Record<string, string> = {
  PENDING: 'รอครัวรับ',
  PREPARING: 'กำลังทำ',
  SERVED: 'เสิร์ฟครบแล้ว',
  CANCELLED: 'ยกเลิก',
};

/** ชื่อวิธีชำระเงินภาษาไทย ตรงกับ ENUM ในตาราง payments */
const METHOD_TEXT: Record<string, string> = {
  CASH: 'เงินสด',
  TRANSFER: 'โอนเงิน',
  CARD: 'บัตร',
};

/**
 * คืนค่าสตริงวันที่ของวันนี้ในรูปแบบ YYYY-MM-DD สำหรับใส่ใน input type="date"
 *
 * @returns วันที่วันนี้ เช่น 2026-09-14
 */
function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * แปลงกิจกรรม 1 รายการเป็นประโยคไทยว่าใครทำอะไรกับอะไร
 *
 * @param log - กิจกรรมที่ได้จาก API
 * @returns ข้อความอธิบายการกระทำ เช่น "รับออเดอร์เข้าครัว"
 */
function describeAction(log: ActivityLog): string {
  if (log.kind === 'CHECKOUT') {
    return `ปิดบิลรับเงิน (${METHOD_TEXT[log.method ?? ''] ?? log.method ?? '-'})`;
  }
  if (log.toStatus === 'PREPARING') return 'รับออเดอร์เข้าครัว';
  if (log.toStatus === 'SERVED') return 'กดเสิร์ฟครบแล้ว';
  if (log.toStatus === 'CANCELLED') return 'ยกเลิกออเดอร์ทั้งใบ';
  return `เปลี่ยนสถานะเป็น ${STATUS_TEXT[log.toStatus ?? ''] ?? log.toStatus ?? '-'}`;
}

/**
 * สีของชิปกิจกรรม แยกการปิดบิล (เกี่ยวกับเงิน) ออกจากงานครัวด้วยสายตา
 *
 * @param log - กิจกรรมที่ได้จาก API
 * @returns คลาส Tailwind ของชิป
 */
function actionChipClass(log: ActivityLog): string {
  if (log.kind === 'CHECKOUT') return 'bg-emerald-50 text-emerald-700';
  if (log.toStatus === 'CANCELLED') return 'bg-void/10 text-void';
  if (log.toStatus === 'SERVED') return 'bg-served/10 text-served';
  return 'bg-waiting/10 text-waiting';
}

/**
 * หน้าบันทึกการทำงานของพนักงาน สำหรับเจ้าของร้านตรวจย้อนหลังว่า
 * ใครรับออเดอร์ ใครกดเสิร์ฟ ใครยกเลิก และใครเป็นคนปิดบิลรับเงิน
 *
 * @returns หน้าจอไทม์ไลน์กิจกรรมพร้อมตัวกรองวันที่และประเภท
 */
export default function ActivityLogsPage() {
  const [logs, setLogs] = useState<ActivityLog[] | null>(null);
  const [selectedDate, setSelectedDate] = useState(getTodayDateString());
  const [kind, setKind] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  /**
   * ดึงบันทึกการทำงานตามวันที่และประเภทที่เลือก
   *
   * @param date - วันทำการที่ต้องการดู รูปแบบ YYYY-MM-DD
   * @param kindFilter - ประเภทกิจกรรม ค่าว่างคือทั้งหมด
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือปรับ state ของหน้า
   */
  const load = useCallback(async (date: string, kindFilter: string) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (kindFilter) params.set('kind', kindFilter);
    const res = await apiFetch<ActivityLog[]>(`/api/admin/activity-logs?${params.toString()}`);
    if (res.ok) {
      setLogs(res.data);
      setLoadError('');
    } else {
      setLoadError(res.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load(selectedDate, kind);
  }, [load, selectedDate, kind]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slip">บันทึกการทำงาน</h1>
          <p className="text-xs text-slip-dim">
            ตรวจย้อนหลังว่าใครรับออเดอร์ ใครกดเสิร์ฟ และใครเป็นคนปิดบิลรับเงิน
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="log-date" className="text-xs font-semibold text-slate-600">
              วันทำการ
            </label>
            <input
              id="log-date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <SelectField
            id="log-kind"
            label="ประเภทกิจกรรม"
            value={kind}
            onChange={setKind}
            options={KIND_FILTERS}
          />

          <button
            type="button"
            onClick={() => load(selectedDate, kind)}
            disabled={loading}
            className="flex min-h-[42px] items-center gap-1.5 rounded-xl border border-rule bg-white px-3.5 text-xs font-bold text-slip transition-colors hover:bg-zinc-50 disabled:opacity-50 cursor-pointer shadow-2xs"
          >
            <RefreshIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>รีเฟรช</span>
          </button>
        </div>
      </div>

      {loadError && <ErrorState message={loadError} onRetry={() => load(selectedDate, kind)} />}

      {!loadError && loading && <TableSkeleton />}

      {!loadError && !loading && logs !== null && logs.length === 0 && (
        <EmptyState message="วันทำการนี้ยังไม่มีบันทึกการทำงาน ลองเปลี่ยนวันที่หรือประเภทกิจกรรม" />
      )}

      {!loadError && !loading && logs !== null && logs.length > 0 && (
        <div className="lm-card overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs">
            <thead>
              <tr className="border-b border-rule bg-char text-left text-slip-dim">
                <th className="px-3.5 py-2.5 font-bold">เวลา</th>
                <th className="px-3.5 py-2.5 font-bold">ผู้ทำรายการ</th>
                <th className="px-3.5 py-2.5 font-bold">การกระทำ</th>
                <th className="px-3.5 py-2.5 font-bold">โต๊ะ / ออเดอร์</th>
                <th className="px-3.5 py-2.5 font-bold text-right">จำนวนเงิน</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-rule/60 last:border-0">
                  <td className="num whitespace-nowrap px-3.5 py-2.5 text-slip-dim">
                    <span className="flex items-center gap-1.5">
                      <ClockIcon className="w-3.5 h-3.5 shrink-0" />
                      {formatThaiTime(log.createdAt)}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5 font-bold text-slip">
                    {log.actorName}
                    {log.branchName && (
                      <span className="ml-1.5 rounded bg-zinc-100 px-1 py-0.5 text-[9px] font-semibold text-zinc-600">
                        {log.branchName}
                      </span>
                    )}
                  </td>
                  <td className="px-3.5 py-2.5">
                    <span className={`rounded-full px-2.5 py-0.5 font-bold ${actionChipClass(log)}`}>
                      {describeAction(log)}
                    </span>
                  </td>
                  <td className="num px-3.5 py-2.5 text-slip-dim">
                    {log.tableNo ? `โต๊ะ ${log.tableNo}` : '-'}
                    {log.orderCode && ` · ${log.orderCode}`}
                  </td>
                  <td className="num px-3.5 py-2.5 text-right font-bold text-slip">
                    {log.amount === null ? '-' : `฿${formatBaht(log.amount)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
