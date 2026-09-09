/** ตัวคั่นและรูปแบบตัวเลขเงินบาท ประกาศไว้ที่เดียวเพื่อให้ทุกหน้าจอแสดงเหมือนกัน */
const BAHT_FORMATTER = new Intl.NumberFormat('th-TH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** โซนเวลาที่ใช้ทั้งระบบ — ร้านอยู่ไทย จึงตรึงไว้ไม่ให้เพี้ยนตามเครื่องผู้ใช้ */
const TIME_ZONE = 'Asia/Bangkok';

/**
 * แปลงจำนวนเงินเป็นข้อความทศนิยม 2 ตำแหน่งเสมอ เพื่อให้คอลัมน์เงินชิดขวาแล้วจุดตรงกัน
 * รับได้ทั้ง number และ string เพราะ mysql2 คืนค่า DECIMAL มาเป็น string
 *
 * @param amount - จำนวนเงิน เช่น 65 หรือ "65.00"
 * @returns ข้อความเช่น "1,250.00" (ไม่มีสัญลักษณ์ ฿ ให้ผู้เรียกเติมเอง)
 */
export function formatBaht(amount: number | string): string {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(value)) return '0.00';
  return BAHT_FORMATTER.format(value);
}

/**
 * แปลงจำนวนเงินเป็นข้อความพร้อมสัญลักษณ์บาทนำหน้า ใช้กับปุ่มและยอดรวม
 *
 * @param amount - จำนวนเงิน
 * @returns ข้อความเช่น "฿1,250.00"
 */
export function formatBahtWithSign(amount: number | string): string {
  return `฿${formatBaht(amount)}`;
}

/**
 * แปลงวันเวลาเป็นรูปแบบ "9 ก.ย. 2569 14:32" สำหรับแสดงบนหน้าจอไทย
 *
 * @param value - Date หรือข้อความวันเวลาจากฐานข้อมูล
 * @returns ข้อความวันเวลาไทย หรือ "-" เมื่อค่าไม่ถูกต้อง
 */
export function formatThaiDateTime(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: TIME_ZONE,
  }).format(date);
}

/**
 * แปลงวันเวลาเป็นเวลาอย่างเดียว "14:32" ใช้บนกระดานออเดอร์ที่ต้องอ่านเร็ว
 *
 * @param value - Date หรือข้อความวันเวลาจากฐานข้อมูล
 * @returns ข้อความเวลา หรือ "-" เมื่อค่าไม่ถูกต้อง
 */
export function formatThaiTime(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('th-TH', {
    timeStyle: 'short',
    timeZone: TIME_ZONE,
  }).format(date);
}

/**
 * แปลงวันที่เป็น "9 ก.ย. 2569" ใช้กับวันปล่อยเวอร์ชันและหัวตารางรายวัน
 *
 * @param value - Date หรือข้อความวันที่จากฐานข้อมูล
 * @returns ข้อความวันที่ไทย หรือ "-" เมื่อค่าไม่ถูกต้อง
 */
export function formatThaiDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeZone: TIME_ZONE,
  }).format(date);
}
