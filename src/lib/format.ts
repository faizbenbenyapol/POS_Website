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

/**
 * ดึงชั่วโมงตัดรอบวันทำการของร้านอาหาร (ค่าเริ่มต้น 04:00 น. สามารถตั้งค่าผ่าน env BUSINESS_DAY_CUTOFF_HOUR)
 */
export function getBusinessCutoffHour(): number {
  const val = Number(process.env.BUSINESS_DAY_CUTOFF_HOUR);
  return Number.isInteger(val) && val >= 0 && val < 24 ? val : 4;
}

export const BUSINESS_DAY_CUTOFF_HOUR = 4;

/**
 * ดึงวันและเวลาปัจจุบันตามโซนเวลาประเทศไทย (Asia/Bangkok)
 */
export function getBangkokNow(): Date {
  const now = new Date();
  return new Date(now.toLocaleString('en-US', { timeZone: TIME_ZONE }));
}

/**
 * คำนวณช่วงวันทำการ (Business Day) ของร้านอาหาร
 * โดย 1 วันทำการเริ่มตั้งแต่ cutoffHour:00:00 ถึง cutoffHour:00:00 ของวันปฏิทินถัดไป
 *
 * @param refDate - วันเวลาที่ต้องการอ้างอิง (Date หรือข้อความ 'YYYY-MM-DD')
 * @returns { businessDate, start, end, startSql, endSql }
 */
export function businessDayRange(refDate?: Date | string): {
  businessDate: string;
  start: string;
  end: string;
  startSql: string;
  endSql: string;
} {
  const cutoffHour = getBusinessCutoffHour();
  const hourStr = String(cutoffHour).padStart(2, '0');

  let date: Date;
  if (typeof refDate === 'string') {
    const [y, m, d] = refDate.split('-').map(Number);
    const startSql = `${refDate} ${hourStr}:00:00`;
    const nextDate = new Date(y, m - 1, d);
    nextDate.setDate(nextDate.getDate() + 1);
    const ny = nextDate.getFullYear();
    const nm = String(nextDate.getMonth() + 1).padStart(2, '0');
    const nd = String(nextDate.getDate()).padStart(2, '0');
    const endSql = `${ny}-${nm}-${nd} ${hourStr}:00:00`;
    return { businessDate: refDate, start: startSql, end: endSql, startSql, endSql };
  } else if (refDate instanceof Date) {
    date = new Date(refDate.toLocaleString('en-US', { timeZone: TIME_ZONE }));
  } else {
    date = getBangkokNow();
  }

  // หากเวลายังไม่ถึงชั่วโมงตัดรอบ ให้นับอยู่ในวันทำการของเมื่อวาน
  if (date.getHours() < cutoffHour) {
    date.setDate(date.getDate() - 1);
  }

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const businessDate = `${y}-${m}-${d}`;

  const startSql = `${businessDate} ${hourStr}:00:00`;

  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + 1);
  const ny = nextDate.getFullYear();
  const nm = String(nextDate.getMonth() + 1).padStart(2, '0');
  const nd = String(nextDate.getDate()).padStart(2, '0');
  const endSql = `${ny}-${nm}-${nd} ${hourStr}:00:00`;

  return { businessDate, start: startSql, end: endSql, startSql, endSql };
}

/**
 * Alias ฟังก์ชัน getBusinessDayRange สำหรับความเข้ากันได้
 */
export const getBusinessDayRange = businessDayRange;

/**
 * คำนวณช่วงวันทำการของวันก่อนหน้า (เมื่อวาน)
 */
export function getYesterdayBusinessDayRange(refDate?: Date): {
  businessDate: string;
  start: string;
  end: string;
  startSql: string;
  endSql: string;
} {
  const current = businessDayRange(refDate);
  const [y, m, d] = current.businessDate.split('-').map(Number);
  const prevDate = new Date(y, m - 1, d);
  prevDate.setDate(prevDate.getDate() - 1);
  return businessDayRange(new Date(prevDate.getFullYear(), prevDate.getMonth(), prevDate.getDate(), 12, 0, 0));
}

/**
 * คำนวณช่วงวันทำการจากข้อความวันที่ 'YYYY-MM-DD'
 */
export function getBusinessDayRangeFromDateString(dateStr: string): {
  businessDate: string;
  start: string;
  end: string;
  startSql: string;
  endSql: string;
} {
  return businessDayRange(dateStr);
}

