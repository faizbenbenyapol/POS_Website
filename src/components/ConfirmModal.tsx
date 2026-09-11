'use client';

import { useEffect, useRef } from 'react';
import { CloseIcon, AlertTriangleIcon, AlertCircleIcon, CheckCircleIcon } from '@/components/Icons';

type ConfirmTone = 'danger' | 'warning' | 'primary';

type ConfirmModalProps = {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: ConfirmTone;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

/**
 * Modal ยืนยันการทำรายการแบบ Commercial Minimal แทนที่ window.confirm
 * รับประกันการอยู่กึ่งกลางหน้าจอ 100% ไม่ชิดขอบ และไม่ใช้อีโมจิ
 */
export default function ConfirmModal({
  open,
  title,
  message,
  confirmText = 'ยืนยัน',
  cancelText = 'ยกเลิก',
  tone = 'danger',
  loading = false,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function handleBackdropClick(event: React.MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current && !loading) {
      onClose();
    }
  }

  const toneButtonClass =
    tone === 'danger'
      ? 'bg-red-600 hover:bg-red-700 text-white'
      : tone === 'warning'
      ? 'bg-amber-600 hover:bg-amber-700 text-white'
      : 'bg-emerald-600 hover:bg-emerald-700 text-white';

  const toneIcon =
    tone === 'danger' ? (
      <AlertCircleIcon className="h-5 w-5 shrink-0 text-red-600" />
    ) : tone === 'warning' ? (
      <AlertTriangleIcon className="h-5 w-5 shrink-0 text-amber-600" />
    ) : (
      <CheckCircleIcon className="h-5 w-5 shrink-0 text-emerald-600" />
    );

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      onCancel={(event) => {
        event.preventDefault();
        if (!loading) onClose();
      }}
      className="fixed inset-0 z-50 m-0 h-screen w-screen max-h-none max-w-none bg-transparent p-4 sm:p-6 border-none backdrop:bg-black/50 backdrop:backdrop-blur-sm open:flex open:items-center open:justify-center outline-none overflow-hidden"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md mx-auto max-h-[90vh] flex flex-col rounded-2xl border border-rule bg-white text-slip shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-center justify-between border-b border-rule px-5 py-4 bg-white">
          <div className="flex items-center gap-2.5">
            {toneIcon}
            <h2 className="font-bold text-base text-slip leading-tight">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="ปิดหน้าต่าง"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slip-dim hover:bg-zinc-100 hover:text-slip transition-colors disabled:opacity-50 cursor-pointer"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 flex-1 overflow-y-auto">
          <p className="text-sm text-slip-dim leading-relaxed whitespace-pre-line">{message}</p>
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-rule bg-slate-50 px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-xl border border-rule bg-white px-4 py-2.5 text-xs font-semibold text-slip-dim hover:bg-zinc-100 hover:text-slip transition-colors disabled:opacity-50 cursor-pointer"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`rounded-xl px-4 py-2.5 text-xs font-bold transition-colors disabled:opacity-60 cursor-pointer ${toneButtonClass}`}
          >
            {loading ? 'กำลังดำเนินการ...' : confirmText}
          </button>
        </div>
      </div>
    </dialog>
  );
}
