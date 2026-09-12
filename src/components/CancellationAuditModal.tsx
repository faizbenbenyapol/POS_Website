'use client';

import { useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import { apiFetch } from '@/lib/client';
import { formatBaht, formatThaiTime } from '@/lib/format';
import type { CancellationLogRow } from '@/app/api/admin/cancellations/route';

type CancellationAuditModalProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * Modal แสดงประวัติการยกเลิกอาหารและบิล (Cancellation Audit Report)
 * ให้เจ้าของร้านตรวจสอบการตัดเงินย้อนหลัง พร้อมสรุปยอดเงินที่ถูกยกเลิก
 */
export default function CancellationAuditModal({
  open,
  onClose,
}: CancellationAuditModalProps) {
  const [logs, setLogs] = useState<CancellationLogRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError('');
    apiFetch<CancellationLogRow[]>('/api/admin/cancellations')
      .then((res) => {
        if (res.ok) setLogs(res.data);
        else setError(res.message);
      })
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const totalVoided =
    logs?.reduce((sum, log) => sum + Number(log.amount || 0), 0) ?? 0;

  return (
    <Modal
      title="บันทึกประวัติการยกเลิก (Cancellation Audit Log)"
      open={open}
      onClose={onClose}
      maxWidth="max-w-2xl"
    >
      <div className="flex flex-col gap-4">
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
            ยังไม่มีประวัติการยกเลิกรายการอาหารในระบบ
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
