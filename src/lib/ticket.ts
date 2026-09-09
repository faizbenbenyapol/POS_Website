import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

/** คำนำหน้ารหัสเรื่องแจ้งปัญหา ตามรูปแบบ TK-YYMMDD-XXX ในหัวข้อ 12 */
const TICKET_CODE_PREFIX = 'TK';

/** ความยาวเลขลำดับของวันในรหัส ticket */
const TICKET_SEQUENCE_DIGITS = 3;

/**
 * สร้างรหัสเรื่องแจ้งปัญหารูปแบบ TK-YYMMDD-XXX โดย XXX คือลำดับของวันนั้น
 * นับลำดับภายใน transaction เดียวกับการบันทึก เพื่อไม่ให้สองคนที่กดพร้อมกันได้รหัสซ้ำ
 *
 * @param conn - connection ที่อยู่ใน transaction เดียวกับการสร้าง ticket
 * @returns รหัส ticket ที่ผู้แจ้งเก็บไว้อ้างอิงได้
 */
export async function generateTicketCode(conn: PoolConnection): Promise<string> {
  const [rows] = await conn.execute<(RowDataPacket & { seq: number })[]>(
    'SELECT COUNT(*) AS seq FROM tickets WHERE DATE(created_at) = CURDATE() FOR UPDATE',
  );
  const sequence = String((rows[0]?.seq ?? 0) + 1).padStart(TICKET_SEQUENCE_DIGITS, '0');
  const today = new Date();
  const datePart = [
    String(today.getFullYear()).slice(2),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('');
  return `${TICKET_CODE_PREFIX}-${datePart}-${sequence}`;
}

/** คำอธิบายสถานะ ticket เป็นภาษาไทย ใช้ร่วมกันทั้งฝั่งเซิร์ฟเวอร์และหน้าจอ */
export const TICKET_STATUS_LABELS: Record<string, string> = {
  OPEN: 'เปิดเรื่อง',
  IN_PROGRESS: 'กำลังดำเนินการ',
  RESOLVED: 'แก้ไขแล้ว',
  CLOSED: 'ปิดเรื่อง',
};

/** คำอธิบายความเร่งด่วนเป็นภาษาไทย */
export const TICKET_PRIORITY_LABELS: Record<string, string> = {
  LOW: 'ไม่เร่ง',
  NORMAL: 'ปกติ',
  URGENT: 'เร่งด่วน',
};

/** คำอธิบายหมวดปัญหาเป็นภาษาไทย */
export const TICKET_CATEGORY_LABELS: Record<string, string> = {
  ORDER: 'ออเดอร์ผิด/ไม่มา',
  FOOD: 'คุณภาพอาหาร',
  PAYMENT: 'การชำระเงิน',
  SYSTEM: 'ระบบ/แอปมีปัญหา',
  OTHER: 'เรื่องอื่น ๆ',
};
