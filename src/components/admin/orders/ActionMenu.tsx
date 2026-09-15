'use client';

import { useEffect, useRef, useState } from 'react';
import { MoreIcon } from '@/components/Icons';

/**
 * เมนูคำสั่งรองแบบยุบเก็บ ใช้ซ่อนปุ่มที่ไม่ได้กดบ่อยออกจากหน้าจอหลัก
 * ปิดตัวเองเมื่อคลิกนอกพื้นที่หรือกด Escape เพื่อไม่ให้ค้างบังกระดานออเดอร์
 *
 * @param label - ข้อความกำกับปุ่มเปิดเมนู ถ้าไม่ส่งจะแสดงเฉพาะไอคอนจุดสามจุด
 * @param title - ข้อความ tooltip ของปุ่มเปิดเมนู
 * @param align - จัดกล่องเมนูชิดขอบซ้ายหรือขวาของปุ่ม ค่าเริ่มต้นคือชิดขวา
 * @param children - เนื้อหาในเมนู ปกติคือ ActionMenuItem หลายตัว
 * @returns ปุ่มเปิดเมนูพร้อมกล่องรายการคำสั่งที่ลอยอยู่ด้านล่าง
 */
export default function ActionMenu({
  label,
  title = 'คำสั่งเพิ่มเติม',
  align = 'right',
  children,
}: {
  label?: string;
  title?: string;
  align?: 'left' | 'right';
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    /**
     * ปิดเมนูเมื่อผู้ใช้คลิกนอกกรอบเมนู
     *
     * @param event - เหตุการณ์คลิกระดับ document
     */
    function handleClickOutside(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    /**
     * ปิดเมนูเมื่อผู้ใช้กดปุ่ม Escape
     *
     * @param event - เหตุการณ์กดแป้นพิมพ์ระดับ document
     */
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={title}
        className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border px-2.5 text-sm font-bold transition-colors cursor-pointer ${
          open
            ? 'border-zinc-400 bg-white text-zinc-900 shadow-xs'
            : 'border-rule bg-white text-slip-dim hover:bg-zinc-50 hover:text-slip'
        }`}
      >
        <MoreIcon className="w-4 h-4" />
        {label && <span>{label}</span>}
      </button>

      {open && (
        <div
          role="menu"
          onClick={() => setOpen(false)}
          className={`absolute z-30 mt-1 flex w-60 flex-col gap-0.5 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-lg ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * รายการคำสั่ง 1 บรรทัดในเมนูยุบเก็บ
 * โทน danger ใช้กับคำสั่งทำลายข้อมูลอย่างการยกเลิกออเดอร์ เพื่อให้แยกออกจากคำสั่งปกติชัดเจน
 *
 * @param icon - ไอคอนนำหน้าข้อความ
 * @param label - ข้อความคำสั่ง
 * @param hint - คำอธิบายบรรทัดรอง ไม่บังคับ
 * @param tone - โทนสี 'normal' สำหรับคำสั่งทั่วไป หรือ 'danger' สำหรับคำสั่งที่ย้อนกลับไม่ได้
 * @param disabled - ปิดการกดเมื่อคำสั่งใช้ไม่ได้ในสถานะปัจจุบัน
 * @param onClick - ฟังก์ชันที่เรียกเมื่อกดเลือกคำสั่ง
 * @returns ปุ่มคำสั่งเต็มความกว้างของกล่องเมนู
 */
export function ActionMenuItem({
  icon,
  label,
  hint,
  tone = 'normal',
  disabled = false,
  onClick,
}: {
  icon?: React.ReactNode;
  label: string;
  hint?: string;
  tone?: 'normal' | 'danger';
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
        tone === 'danger'
          ? 'text-red-700 hover:bg-red-50'
          : 'text-slip hover:bg-zinc-100'
      }`}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {hint && <span className="block text-xs font-normal text-slip-dim">{hint}</span>}
      </span>
    </button>
  );
}

/**
 * เส้นคั่นในเมนู ใช้แยกกลุ่มคำสั่งปกติออกจากคำสั่งอันตราย
 *
 * @returns เส้นแบ่งแนวนอนบาง ๆ
 */
export function ActionMenuDivider() {
  return <div className="my-1 border-t border-zinc-200" />;
}
