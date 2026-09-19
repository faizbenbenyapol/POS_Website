'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { formatBaht } from '@/lib/format';

/** พารามิเตอร์สำหรับคอมโพเนนต์ PromptPayQR */
type PromptPayQRProps = {
  /** ข้อความ QR ที่เซิร์ฟเวอร์สร้างไว้แล้ว (ดู src/lib/promptpay.ts) */
  payload: string;
  /** ยอดเงินที่ผูกอยู่ใน QR แสดงให้ลูกค้าเทียบก่อนกดโอน */
  amount: number;
  /** ชื่อบัญชีปลายทาง */
  accountName?: string | null;
  /** เลขพร้อมเพย์ที่ปิดบังบางส่วนแล้ว */
  maskedPromptPayId?: string | null;
};

/**
 * แสดงภาพ QR พร้อมเพย์จากข้อความที่เซิร์ฟเวอร์สร้างให้
 * ไม่สร้างข้อความ QR เองบนหน้าจอ เพื่อให้เลขบัญชีและยอดเงินมาจากฐานข้อมูลที่เดียว
 * และ QR ที่ลูกค้าสแกนตรงกับคำขอรับเงินที่ระบบบันทึกไว้เสมอ
 *
 * @param props - ข้อความ QR ยอดเงิน และข้อมูลบัญชีที่จะแสดง
 * @returns การ์ดแสดง QR พร้อมเพย์
 */
export default function PromptPayQR({
  payload,
  amount,
  accountName,
  maskedPromptPayId,
}: PromptPayQRProps) {
  const [qrSrc, setQrSrc] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setQrSrc('');
    setError('');
    QRCode.toDataURL(payload, { width: 256, margin: 1, color: { dark: '#000000', light: '#FFFFFF' } })
      .then((url) => {
        if (!cancelled) setQrSrc(url);
      })
      .catch(() => {
        if (!cancelled) setError('สร้างภาพ QR ไม่สำเร็จ กรุณากดสร้าง QR ใหม่');
      });
    return () => {
      cancelled = true;
    };
  }, [payload]);

  return (
    <div className="flex flex-col items-center rounded-xl border border-rule bg-char p-4 shadow-sm">
      <div className="flex w-full items-center justify-between border-b border-rule pb-2">
        <div className="flex items-center gap-2">
          <span className="rounded bg-[#003D6B] px-2 py-0.5 font-bold text-xs text-white">PromptPay</span>
          <span className="font-semibold text-xs text-slip">พร้อมเพย์</span>
        </div>
        <span className="num font-bold text-flame text-sm">฿{formatBaht(amount)}</span>
      </div>

      <div className="my-3 flex h-48 w-48 items-center justify-center rounded-lg border border-rule bg-white p-2">
        {error ? (
          <p className="text-center text-xs text-void">{error}</p>
        ) : qrSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrSrc} alt={`QR พร้อมเพย์ ยอด ${formatBaht(amount)} บาท`} className="h-full w-full object-contain" />
        ) : (
          <div className="h-full w-full animate-pulse rounded bg-char" />
        )}
      </div>

      <div className="w-full text-center text-xs">
        {accountName && <p className="font-medium text-slip">{accountName}</p>}
        {maskedPromptPayId && <p className="num text-slip-dim">พร้อมเพย์: {maskedPromptPayId}</p>}
        <p className="mt-1 text-[11px] text-slip-dim">สแกนด้วยแอปธนาคาร ยอดเงินจะขึ้นให้เอง</p>
      </div>
    </div>
  );
}
