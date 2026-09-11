'use client';

import { useEffect, useRef } from 'react';
import { CloseIcon } from '@/components/Icons';

/**
 * Modal ประจำระบบ จัดการกึ่งกลางหน้าจอ 100% พร้อมขอบเขตความสูงและ Scroll ภายใน
 */
export default function Modal({
  title,
  open,
  onClose,
  children,
  maxWidth = 'max-w-lg',
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    }
    if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // ปิด modal เมื่อคลิกพื้นที่ว่างนอกกล่องเนื้อหา
  function handleBackdropClick(event: React.MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current) {
      onClose();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="fixed inset-0 z-50 m-0 h-screen w-screen max-h-none max-w-none bg-transparent p-4 sm:p-6 border-none backdrop:bg-black/50 backdrop:backdrop-blur-sm open:flex open:items-center open:justify-center outline-none overflow-hidden"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full ${maxWidth} mx-auto max-h-[min(90vh,calc(100dvh-2rem))] flex flex-col rounded-2xl border border-rule bg-white text-slip shadow-2xl overflow-hidden`}
      >
        <div className="shrink-0 flex items-center justify-between border-b border-rule px-5 py-4 bg-white">
          <h2 className="font-bold text-base text-slip leading-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slip-dim hover:bg-zinc-100 hover:text-slip transition-colors cursor-pointer"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 overscroll-contain">
          {children}
        </div>
      </div>
    </dialog>
  );
}
