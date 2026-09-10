'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { formatBaht } from '@/lib/format';

/**
 * คำนวณ CRC16-CCITT (Checksum) ตามมาตรฐาน EMVCo / PromptPay
 *
 * @param data - ข้อมูลข้อความ payload ทั้งหมดก่อนต่อ checksum
 * @returns รหัส Hexadecimal 4 หลัก เช่น 'A1B2'
 */
function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    let x = ((crc >> 8) ^ data.charCodeAt(i)) & 0xff;
    x ^= x >> 4;
    crc = ((crc << 8) ^ (x << 12) ^ (x << 5) ^ x) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * สร้างข้อความ PromptPay EMVCo Payload สำหรับสร้าง QR Code
 *
 * @param mobile - หมายเลขโทรศัพท์พร้อมเพย์ เช่น '0812345678'
 * @param amount - ยอดเงินคงเหลือชำระ
 * @returns ข้อความ EMVCo Payload ที่สแกนด้วยแอปธนาคารไทยได้จริง
 */
function generatePromptPayPayload(mobile: string, amount: number): string {
  const cleanMobile = mobile.replace(/[^0-9]/g, '');
  const formattedMobile = '0066' + cleanMobile.replace(/^0/, '');
  const target = `0016A0000006770101110113${formattedMobile}`;
  const tag29 = `29${target.length.toString().padStart(2, '0')}${target}`;

  let payload = `000201010212${tag29}53037645802TH`;
  if (amount > 0) {
    const amountStr = amount.toFixed(2);
    payload += `54${amountStr.length.toString().padStart(2, '0')}${amountStr}`;
  }
  payload += '6304';
  payload += crc16(payload);
  return payload;
}

/** พารามิเตอร์สำหรับคอมโพเนนต์ PromptPayQR */
type PromptPayQRProps = {
  /** ยอดเงินรวมที่ต้องชำระ */
  amount: number;
  /** เบอร์พร้อมเพย์ของร้าน (เริ่มต้น '081-234-5678') */
  phoneNumber?: string;
  /** ชื่อบัญชีพร้อมเพย์ */
  accountName?: string;
};

/**
 * คอมโพเนนต์แสดงผล PromptPay QR Code จำลองสำหรับโอนเงินปิดบิล
 * สร้างภาพ QR Code ไดนามิกตามยอดเงินจริงด้วยมาตรฐาน EMVCo PromptPay
 *
 * @param props - พารามิเตอร์ของคอมโพเนนต์
 * @returns การ์ดแสดง PromptPay QR Code
 */
export default function PromptPayQR({
  amount,
  phoneNumber = '081-234-5678',
  accountName = 'ร้าน POS Restaurant',
}: PromptPayQRProps) {
  const [qrSrc, setQrSrc] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    async function generateQR() {
      try {
        const payload = generatePromptPayPayload(phoneNumber, amount);
        const url = await QRCode.toDataURL(payload, {
          width: 256,
          margin: 1,
          color: {
            dark: '#000000',
            light: '#FFFFFF',
          },
        });
        setQrSrc(url);
      } catch (err) {
        setError('ไม่สามารถสร้าง QR Code ได้');
      }
    }
    generateQR();
  }, [amount, phoneNumber]);

  return (
    <div className="flex flex-col items-center rounded-xl border border-rule bg-char p-4 shadow-sm">
      {/* แถบหัว PromptPay */}
      <div className="flex w-full items-center justify-between border-b border-rule pb-2">
        <div className="flex items-center gap-2">
          <span className="rounded bg-[#003D6B] px-2 py-0.5 font-bold text-xs text-white">
            PromptPay
          </span>
          <span className="font-semibold text-xs text-slip">พร้อมเพย์</span>
        </div>
        <span className="num font-bold text-flame text-sm">{formatBaht(amount)}</span>
      </div>

      {/* ภาพ QR Code */}
      <div className="my-3 flex h-48 w-48 items-center justify-center rounded-lg border border-rule bg-white p-2">
        {error ? (
          <p className="text-center text-xs text-void">{error}</p>
        ) : qrSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrSrc} alt="PromptPay QR Code" className="h-full w-full object-contain" />
        ) : (
          <div className="h-full w-full animate-pulse rounded bg-char" />
        )}
      </div>

      {/* รายละเอียดบัญชี */}
      <div className="w-full text-center text-xs">
        <p className="font-medium text-slip">{accountName}</p>
        <p className="num text-slip-dim">เบอร์พร้อมเพย์: {phoneNumber}</p>
        <p className="mt-1 text-[11px] text-slip-dim">
          สแกนด้วยแอปพลิเคชันธนาคารเพื่อโอนเงินตามยอด
        </p>
      </div>
    </div>
  );
}
