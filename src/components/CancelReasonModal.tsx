'use client';

import { useState } from 'react';
import Modal from '@/components/Modal';

/** ตัวเลือกเหตุผลการยกเลิกมาตรฐานของร้านอาหาร */
const PRESET_REASONS = [
  'ลูกค้าเปลี่ยนใจ / ขอยกเลิก',
  'สั่งซ้ำ / คีย์รายการผิด',
  'ครัวของหมด / วัตถุดิบหมด',
  'คีย์ผิดโต๊ะ',
  'อาหารรอนานเกินไป',
  'อื่นๆ (ระบุเหตุผลเอง)',
];

type CancelReasonModalProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  amountText?: string;
  onConfirm: (reason: string) => void;
  onClose: () => void;
};

/**
 * Modal บังคับระบุเหตุผลในการกดยกเลิกรายการอาหารหรือยกเลิกบิล
 * เพื่อบันทึกลง Cancellation Audit Trail ป้องกันการทุจริตตัดเงินออกจากบิล
 */
export default function CancelReasonModal({
  open,
  title,
  subtitle,
  amountText,
  onConfirm,
  onClose,
}: CancelReasonModalProps) {
  const [selectedReason, setSelectedReason] = useState(PRESET_REASONS[0]);
  const [customReason, setCustomReason] = useState('');
  const [error, setError] = useState('');

  if (!open) return null;

  function handleConfirm() {
    const finalReason =
      selectedReason === 'อื่นๆ (ระบุเหตุผลเอง)'
        ? customReason.trim()
        : selectedReason;

    if (!finalReason) {
      setError('กรุณาระบุเหตุผลการยกเลิก');
      return;
    }

    onConfirm(finalReason);
  }

  return (
    <Modal title={title} open={open} onClose={onClose} maxWidth="max-w-md">
      <div className="flex flex-col gap-4">
        {subtitle && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
            <p className="font-bold">{subtitle}</p>
            {amountText && (
              <p className="mt-0.5 text-amber-800">
                ยอดเงินที่ถูกตัดออกจากบิล:{' '}
                <span className="font-bold text-red-600 num">{amountText}</span>
              </p>
            )}
            <p className="mt-1 text-[11px] text-amber-700">
              * การยกเลิกจะถูกบันทึกลง Audit Log พร้อมชื่อผู้ทำรายการและเวลา
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-slip">
            เลือกเหตุผลการยกเลิก:
          </label>
          <div className="flex flex-col gap-1.5">
            {PRESET_REASONS.map((reason) => (
              <label
                key={reason}
                className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-xs transition-colors cursor-pointer ${
                  selectedReason === reason
                    ? 'border-red-300 bg-red-50/60 font-bold text-red-900'
                    : 'border-rule bg-white text-slip hover:bg-zinc-50'
                }`}
              >
                <input
                  type="radio"
                  name="cancel-reason"
                  value={reason}
                  checked={selectedReason === reason}
                  onChange={() => {
                    setSelectedReason(reason);
                    setError('');
                  }}
                  className="h-4 w-4 text-red-600 focus:ring-red-500"
                />
                <span>{reason}</span>
              </label>
            ))}
          </div>
        </div>

        {selectedReason === 'อื่นๆ (ระบุเหตุผลเอง)' && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slip">ระบุรายละเอียดเพิ่มเติม:</label>
            <textarea
              value={customReason}
              onChange={(e) => {
                setCustomReason(e.target.value);
                setError('');
              }}
              placeholder="ระบุเหตุผลที่ต้องการยกเลิก..."
              rows={2}
              className="w-full rounded-xl border border-rule bg-char p-3 text-xs text-slip placeholder:text-zinc-400 focus:border-red-500 focus:bg-white focus:outline-none"
            />
          </div>
        )}

        {error && <p className="text-xs font-bold text-red-600">{error}</p>}

        <div className="flex items-center justify-end gap-2 border-t border-rule pt-4">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[42px] rounded-xl bg-char px-4 text-xs font-bold text-slip transition-colors hover:bg-rule cursor-pointer"
          >
            ย้อนกลับ
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="min-h-[42px] rounded-xl bg-red-600 px-5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-red-700 active:scale-98 cursor-pointer"
          >
            ยืนยันการยกเลิก
          </button>
        </div>
      </div>
    </Modal>
  );
}
