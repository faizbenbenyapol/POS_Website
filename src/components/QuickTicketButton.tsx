'use client';

import { useState } from 'react';
import { apiFetch, jsonBody } from '@/lib/client';

/** เวลาที่ต้องรอก่อนกดซ้ำได้อีกครั้ง กันลูกค้ากดรัวจนพนักงานเห็นเรื่องซ้ำเต็มบอร์ด */
const COOLDOWN_MS = 60000;

/**
 * ปุ่มแจ้งพนักงานแบบกดครั้งเดียว ไม่ต้องพิมพ์อะไรเพิ่ม
 * ใช้ /api/public/tickets ตัวเดิมกับหน้าแจ้งปัญหา เพื่อให้เรื่องไปโผล่ที่บอร์ด ticket
 * ของพนักงานที่เดียวกัน ไม่ต้องสร้างระบบแยกใหม่
 *
 * @param token - qr_token ของโต๊ะ
 * @param category - หมวดปัญหาตาม ENUM ของตาราง tickets
 * @param subject - หัวข้อคงที่ของปุ่มนี้ เช่น "เรียกพนักงาน"
 * @param detail - รายละเอียดคงที่ที่ส่งไปพร้อมหัวข้อ
 * @param idleLabel - ข้อความบนปุ่มตอนยังไม่ได้กด
 * @param sentLabel - ข้อความบนปุ่มหลังกดสำเร็จ จนกว่าจะครบเวลารอ
 * @param className - คลาสของปุ่ม กำหนดจากหน้าที่เรียกใช้เพื่อให้เข้ากับบริบทนั้น
 * @returns ปุ่มพร้อมสถานะกำลังส่ง/ส่งแล้ว/ผิดพลาด
 */
export default function QuickTicketButton({
  token,
  category,
  subject,
  detail,
  idleLabel,
  sentLabel,
  className,
}: {
  token: string;
  category: 'ORDER' | 'FOOD' | 'PAYMENT' | 'SYSTEM' | 'OTHER';
  subject: string;
  detail: string;
  idleLabel: React.ReactNode;
  sentLabel: React.ReactNode;
  className: string;
}) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  /**
   * ส่งคำขอแจ้งพนักงานทันทีที่กด แล้วล็อกปุ่มไว้ตามเวลาคูลดาวน์
   *
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือสร้าง ticket และปรับสถานะปุ่ม
   */
  async function handleClick() {
    setStatus('sending');
    setErrorMessage('');
    const result = await apiFetch<{ ticketCode: string }>('/api/public/tickets', {
      method: 'POST',
      body: jsonBody({ token, category, subject, detail }),
    });
    if (!result.ok) {
      setStatus('error');
      setErrorMessage(result.message);
      return;
    }
    setStatus('sent');
    window.setTimeout(() => setStatus('idle'), COOLDOWN_MS);
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={status === 'sending' || status === 'sent'}
        className={className}
      >
        {status === 'sending' ? 'กำลังแจ้ง…' : status === 'sent' ? sentLabel : idleLabel}
      </button>
      {status === 'error' && <p className="text-sm text-void">{errorMessage}</p>}
    </div>
  );
}
