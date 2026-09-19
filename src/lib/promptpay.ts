/**
 * สร้างข้อความ QR พร้อมเพย์ตามมาตรฐาน EMVCo (Thai QR Payment) ไม่แตะฐานข้อมูลและไม่เรียกเครือข่าย
 * แอปธนาคารทุกแอปในไทยสแกนข้อความนี้แล้วเติมเลขบัญชีปลายทางกับยอดเงินให้เอง
 *
 * โครงสร้างข้อความ (Tag-Length-Value):
 *   00 Payload Format = "01"
 *   01 Point of Initiation = "11" QR ใช้ซ้ำได้ (ไม่ระบุยอด) / "12" QR ใช้ครั้งเดียว (ระบุยอด)
 *   29 ข้อมูลพร้อมเพย์: 00 = AID ของพร้อมเพย์, 01 เบอร์มือถือ / 02 เลขบัตร-เลขผู้เสียภาษี / 03 e-Wallet
 *   58 ประเทศ = "TH", 53 สกุลเงิน = "764" (บาท), 54 ยอดเงิน (ถ้ามี)
 *   63 CRC16 ของข้อความทั้งหมดรวมหัว "6304"
 */

/** ประเภทบัญชีพร้อมเพย์ที่ระบบรองรับ */
export type PromptPayIdType = 'PHONE' | 'NATIONAL_ID' | 'EWALLET';

/** ผลการตรวจเลขพร้อมเพย์ */
export type PromptPayIdResult =
  | { ok: true; type: PromptPayIdType; value: string }
  | { ok: false; message: string };

/** Application ID ของพร้อมเพย์ฝั่งโอนเข้าบัญชี (Merchant Presented QR) */
const PROMPTPAY_AID = 'A000000677010111';

/** ยอดสูงสุดที่ใส่ใน QR ได้ ตรงกับความยาว 13 ตัวอักษรของ tag 54 */
const MAX_QR_AMOUNT = 9999999999.99;

/**
 * คำนวณ CRC-16/CCITT-FALSE (poly 0x1021, ค่าเริ่ม 0xFFFF) ตามที่ EMVCo กำหนด
 *
 * @param data - ข้อความทั้งหมดก่อนต่อ checksum รวมหัว "6304"
 * @returns เลขฐานสิบหกตัวใหญ่ 4 หลัก เช่น "29B1"
 */
export function crc16Ccitt(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * ประกอบข้อมูล 1 ช่องในรูป Tag + ความยาว 2 หลัก + ค่า
 *
 * @param tag - รหัสช่อง 2 หลัก
 * @param value - ค่าของช่อง
 * @returns ข้อความ TLV เช่น "5802TH"
 */
function tlv(tag: string, value: string): string {
  return `${tag}${String(value.length).padStart(2, '0')}${value}`;
}

/**
 * ตรวจและจัดรูปเลขพร้อมเพย์ที่ร้านกรอก ตัดขีดและช่องว่างออก แล้วแยกประเภทจากจำนวนหลัก
 *
 * @param raw - เลขที่กรอก เช่น "081-234-5678" หรือ "1-2345-67890-12-3"
 * @returns ประเภทและเลขที่เหลือแต่ตัวเลข หรือข้อความไทยบอกว่าผิดตรงไหน
 */
export function normalizePromptPayId(raw: string): PromptPayIdResult {
  const digits = (raw ?? '').replace(/[\s-]/g, '');
  if (!/^\d+$/.test(digits)) {
    return { ok: false, message: 'เลขพร้อมเพย์ต้องเป็นตัวเลขเท่านั้น (เว้นขีดหรือช่องว่างได้)' };
  }
  if (digits.length === 10 && digits.startsWith('0')) {
    return { ok: true, type: 'PHONE', value: digits };
  }
  if (digits.length === 13) return { ok: true, type: 'NATIONAL_ID', value: digits };
  if (digits.length === 15) return { ok: true, type: 'EWALLET', value: digits };
  return {
    ok: false,
    message:
      'เลขพร้อมเพย์ต้องเป็นเบอร์มือถือ 10 หลัก เลขบัตรประชาชนหรือเลขผู้เสียภาษี 13 หลัก หรือ e-Wallet 15 หลัก',
  };
}

/**
 * แปลงเลขพร้อมเพย์เป็นค่าในช่องย่อยของ tag 29
 * เบอร์มือถือต้องแปลงเป็นรูปแบบสากล 13 หลัก: ตัด 0 ตัวหน้าแล้วเติม "0066"
 *
 * @param id - เลขพร้อมเพย์ที่ผ่านการตรวจแล้ว
 * @returns ข้อความ TLV ของช่องบัญชีปลายทาง
 */
function accountField(id: { type: PromptPayIdType; value: string }): string {
  if (id.type === 'PHONE') return tlv('01', `0066${id.value.slice(1)}`);
  if (id.type === 'NATIONAL_ID') return tlv('02', id.value);
  return tlv('03', id.value);
}

/**
 * สร้างข้อความ QR พร้อมเพย์สำหรับโอนเข้าบัญชีร้าน
 *
 * @param promptPayId - เลขพร้อมเพย์ของร้าน (มือถือ / เลขบัตร / e-Wallet)
 * @param amount - ยอดเงินที่ต้องโอน หน่วยบาท ไม่ส่งหรือเป็น 0 คือ QR ที่ลูกค้ากรอกยอดเอง
 * @returns ข้อความที่นำไปสร้างภาพ QR ได้ทันที
 * @throws Error เมื่อเลขพร้อมเพย์ไม่ถูกรูปแบบ หรือยอดเงินติดลบหรือเกินที่ QR รองรับ
 */
export function buildPromptPayPayload(promptPayId: string, amount?: number): string {
  const id = normalizePromptPayId(promptPayId);
  if (!id.ok) throw new Error(id.message);
  if (amount !== undefined && (!Number.isFinite(amount) || amount < 0 || amount > MAX_QR_AMOUNT)) {
    throw new Error('ยอดเงินใน QR ต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป และไม่เกินที่ระบบรองรับ');
  }

  const hasAmount = amount !== undefined && amount > 0;
  const parts = [
    tlv('00', '01'),
    tlv('01', hasAmount ? '12' : '11'),
    tlv('29', tlv('00', PROMPTPAY_AID) + accountField(id)),
    tlv('58', 'TH'),
    tlv('53', '764'),
  ];
  if (hasAmount) parts.push(tlv('54', amount.toFixed(2)));

  const withoutCrc = `${parts.join('')}6304`;
  return `${withoutCrc}${crc16Ccitt(withoutCrc)}`;
}

/**
 * ปิดบังเลขพร้อมเพย์บางส่วนก่อนแสดงบนจอ เหลือให้ลูกค้าเห็นพอเทียบกับแอปธนาคาร
 *
 * @param promptPayId - เลขพร้อมเพย์เต็ม
 * @returns เช่น "081-xxx-5678" สำหรับเบอร์มือถือ หรือ "x-xxxx-xxxxx-12-3" สำหรับเลข 13 หลัก
 */
export function maskPromptPayId(promptPayId: string): string {
  const id = normalizePromptPayId(promptPayId);
  if (!id.ok) return promptPayId;
  const v = id.value;
  if (id.type === 'PHONE') return `${v.slice(0, 3)}-xxx-${v.slice(6)}`;
  if (id.type === 'NATIONAL_ID') return `x-xxxx-xxxxx-${v.slice(10, 12)}-${v.slice(12)}`;
  return `${'x'.repeat(11)}${v.slice(11)}`;
}
