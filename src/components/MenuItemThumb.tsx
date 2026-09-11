'use client';

import { useState, useEffect } from 'react';

/**
 * รูปย่อของเมนู 1 รายการ ใช้ทั้งฝั่งลูกค้าและฝั่งแอดมิน
 * ถ้าไม่มี image_url หรือโหลดรูปไม่สำเร็จ (onError) จะโชว์กล่องสีพื้นพร้อมตัวอักษรแรกของชื่อเมนูแทน
 * เพื่อไม่ให้จอว่างเปล่าหรือขึ้นไอคอนรูปหักเวลาลิงก์รูปมีปัญหา
 *
 * @param name - ชื่อเมนู ใช้ทำ alt text และตัวอักษรสำรอง
 * @param imageUrl - ลิงก์รูปภาพ ถ้าไม่มีให้ส่ง null
 * @param size - ขนาดกล่องรูปเป็น class ของ Tailwind เช่น "h-16 w-16"
 * @param rounded - class มุมโค้งของกล่องรูป ปกติโค้งทุกมุม แต่ถ้าใช้เป็นภาพปกด้านบนของการ์ด
 *                  (การ์ดครอบด้วย overflow-hidden อยู่แล้ว) ให้ส่ง "rounded-none" แทน
 * @returns กล่องรูปสี่เหลี่ยมมุมโค้ง
 */
export default function MenuItemThumb({
  name,
  imageUrl,
  size = 'h-16 w-16',
  rounded = 'rounded-lg',
}: {
  name: string;
  imageUrl: string | null;
  size?: string;
  rounded?: string;
}) {
  const [hasError, setHasError] = useState(false);

  // รีเซ็ตสถานะเมื่อ URL มีการเปลี่ยนแปลง
  useEffect(() => {
    setHasError(false);
  }, [imageUrl]);

  if (imageUrl && !hasError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={name}
        onError={() => setHasError(true)}
        className={`${size} ${rounded} shrink-0 bg-char object-cover transition-opacity duration-200`}
        loading="lazy"
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`${size} ${rounded} flex shrink-0 items-center justify-center bg-emerald-50/80 text-lg font-bold text-emerald-700 border border-emerald-100 select-none`}
    >
      {name.trim().charAt(0) || '?'}
    </div>
  );
}
