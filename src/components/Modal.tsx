'use client';

import { useEffect, useRef } from 'react';

/**
 * กล่อง modal สำหรับฟอร์มเพิ่ม/แก้ไขข้อมูลในหน้าหลังบ้าน
 * ใช้ <dialog> ของเบราว์เซอร์เพราะได้ focus trap และปุ่ม Esc มาให้ฟรี
 * ไม่ต้องเขียนดักคีย์บอร์ดเอง และ screen reader อ่านได้ถูกต้อง
 *
 * @param title - หัวข้อบนสุดของกล่อง บอกว่ากำลังทำอะไรอยู่
 * @param open - เปิดหรือปิดกล่อง
 * @param onClose - ฟังก์ชันที่ถูกเรียกเมื่อผู้ใช้กดปิดหรือกด Esc
 * @param children - เนื้อหาในกล่อง ปกติคือฟอร์ม
 * @returns กล่อง modal ที่ครอบเนื้อหา
 */
export default function Modal({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-rule bg-griddle p-0 text-slip shadow-xl backdrop:bg-black/50"
    >
      <div className="flex items-center justify-between border-b border-rule px-4 py-3">
        <h2 className="font-semibold text-slip">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิดหน้าต่าง"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-slip-dim hover:bg-char hover:text-slip"
        >
          ✕
        </button>
      </div>
      <div className="px-4 py-4">{children}</div>
    </dialog>
  );
}
