'use client';

import { useCallback, useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import { apiFetch } from '@/lib/client';
import { downloadCsvFile } from '@/lib/exportCsv';
import { formatBaht, formatThaiTime, formatThaiDateTime } from '@/lib/format';
import { DownloadIcon, RefreshIcon } from '@/components/Icons';
import type { CancellationLogRow } from '@/app/api/admin/cancellations/route';

type CancellationAuditModalProps = {
  open: boolean;
  onClose: () => void;
};

/** ตัวเลือกเหตุผลการยกเลิกมาตรฐาน */
const COMMON_REASONS = [
  'ลูกค้าเปลี่ยนใจ',
  'คีย์ผิด/คีย์ซ้ำ',
  'อาหารหมด/ยกเลิกจากครัว',
  'ลูกค้ารอนาน',
  'ลูกค้าขอยกเลิกทั้งบิล',
];

/**
 * Modal แสดงประวัติการยกเลิกอาหารและบิล (Cancellation Audit Report)
 * ให้เจ้าของร้านตรวจสอบการตัดเงินย้อนหลัง พร้อมระบบกรองวันที่/เหตุผล และส่งออก CSV
 */
export default function CancellationAuditModal({
  open,
  onClose,
}: CancellationAuditModalProps) {
  const [logs, setLogs] = useState<CancellationLogRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterReason, setFilterReason] = useState('');

  const fetchLogs = useCallback(async (date: string, reason: string) => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (reason) params.set('reason', reason);

    const queryStr = params.toString() ? `?${params.toString()}` : '';
    const res = await apiFetch<CancellationLogRow[]>(`/api/admin/cancellations${queryStr}`);
    if (res.ok) {
      setLogs(res.data);
    } else {
      setError(res.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchLogs(filterDate, filterReason);
  }, [open, filterDate, filterReason, fetchLogs]);

  if (!open) return null;

  const totalVoided =
    logs?.reduce((sum, log) => sum + Number(log.amount || 0), 0) ?? 0;

  /** ส่งออกข้อมูลประวัติการยกเลิกเป็นไฟล์ CSV */
  function handleExportCsv() {
    if (!logs || logs.length === 0) return;
    const filename = `cancellation-audit-${filterDate || 'all'}.csv`;
    const headers = [
      'รหัสบันทึก',
      'เวลาทำรายการ',
      'สาขา',
      'โต๊ะ',
      'ประเภท',
      'รายการ / รหัสออเดอร์',
      'จำนวน',
      'ยอดเงินที่ตัดออก (บาท)',
      'เหตุผล',
      'ผู้ทำรายการ',
    ];

    const rows = logs.map((log) => [
      log.id,
      formatThaiDateTime(log.created_at),
      log.branch_name || '-',
      log.table_no,
      log.entity_type,
      log.entity_type === 'ORDER' ? `ยกเลิกทั้งบิล (${log.order_code || '-'})` : (log.item_name || '-'),
      log.quantity || 1,
      Number(log.amount || 0),
      log.reason,
      log.cancelled_by_name,
    ]);

    downloadCsvFile(filename, headers, rows);
  }

  function handleSetToday() {
    const now = new Date();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    setFilterDate(`${now.getFullYear()}-${m}-${d}`);
  }

  return (
    <Modal
      title="บันทึกประวัติการยกเลิก (Cancellation Audit Log)"
      open={open}
      onClose={onClose}
      maxWidth="max-w-3xl"
    >
      <div className="flex flex-col gap-4">
        {/* แถบตัวกรองวันที่และเหตุผล */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-zinc-50 border border-rule p-2.5 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-slip-dim font-medium">วันที่:</span>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="rounded-lg border border-rule bg-white px-2 py-1 text-xs text-slip focus:border-zinc-400 focus:outline-none"
            />
            {filterDate ? (
              <button
                type="button"
                onClick={() => setFilterDate('')}
                className="rounded-md px-1.5 py-1 text-[11px] text-slip-dim hover:text-slip cursor-pointer"
              >
                ล้าง
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSetToday}
                className="rounded-md bg-zinc-200 px-2 py-1 text-[11px] font-medium text-slip hover:bg-zinc-300 cursor-pointer"
              >
                วันนี้
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 ml-auto sm:ml-2">
            <span className="text-slip-dim font-medium">เหตุผล:</span>
            <select
              value={filterReason}
              onChange={(e) => setFilterReason(e.target.value)}
              className="rounded-lg border border-rule bg-white px-2 py-1 text-xs text-slip focus:border-zinc-400 focus:outline-none"
            >
              <option value="">ทุกเหตุผล</option>
              {COMMON_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            <button
              type="button"
              onClick={() => fetchLogs(filterDate, filterReason)}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded-lg border border-rule bg-white px-2.5 py-1 text-xs font-medium text-slip hover:bg-zinc-100 disabled:opacity-50 cursor-pointer"
              title="รีเฟรช"
            >
              <RefreshIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>รีเฟรช</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!logs || logs.length === 0}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 cursor-pointer"
            >
              <DownloadIcon className="w-3.5 h-3.5" />
              <span>ส่งออก CSV</span>
            </button>
          </div>
        </div>

        {/* สรุปยอดรวมที่ถูกตัดออก */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-zinc-50 border border-rule p-3.5 text-xs">
          <div>
            <span className="text-slip-dim">จำนวนรายการที่ยกเลิก:</span>{' '}
            <span className="font-bold text-slip num">
              {logs ? logs.length : 0} รายการ
            </span>
          </div>
          <div>
            <span className="text-slip-dim">มูลค่ารวมที่ถูกตัดออกจากบิล:</span>{' '}
            <span className="font-bold text-red-600 num text-sm">
              ฿{formatBaht(totalVoided)}
            </span>
          </div>
        </div>

        {loading && (
          <div className="py-8 text-center text-xs text-slip-dim">
            กำลังโหลดข้อมูลบันทึกประวัติ…
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && logs && logs.length === 0 && (
          <div className="py-8 text-center text-xs text-slip-dim">
            ไม่พบประวัติการยกเลิกรายการอาหารตามเงื่อนไขที่เลือก
          </div>
        )}

        {!loading && !error && logs && logs.length > 0 && (
          <div className="overflow-x-auto max-h-[50vh] rounded-xl border border-rule">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-zinc-100/90 backdrop-blur-xs text-slip-dim font-bold border-b border-rule">
                <tr>
                  <th className="px-3 py-2.5">เวลา / โต๊ะ</th>
                  <th className="px-3 py-2.5">รายการ</th>
                  <th className="px-3 py-2.5 text-right">ยอดเงิน</th>
                  <th className="px-3 py-2.5">เหตุผล</th>
                  <th className="px-3 py-2.5">ผู้ทำรายการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-zinc-50/70">
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slip">
                          โต๊ะ {log.table_no}
                        </span>
                        {log.branch_name && (
                          <span className="rounded-md bg-zinc-100 border border-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700">
                            {log.branch_name}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slip-dim num">
                        {formatThaiTime(log.created_at)}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-medium text-slip">
                        {log.entity_type === 'ORDER'
                          ? `ยกเลิกทั้งบิล (${log.order_code || 'Order'})`
                          : `${log.item_name} (×${log.quantity})`}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-red-600 num whitespace-nowrap">
                      -฿{formatBaht(Number(log.amount))}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                        {log.reason}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slip whitespace-nowrap font-medium">
                      {log.cancelled_by_name}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end border-t border-rule pt-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] rounded-xl bg-char px-5 text-xs font-bold text-slip hover:bg-rule cursor-pointer"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </Modal>
  );
}

