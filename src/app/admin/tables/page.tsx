import TableManager from './TableManager';

/**
 * หน้าจัดการโต๊ะ ทำหน้าที่อ่าน APP_BASE_URL จากฝั่งเซิร์ฟเวอร์แล้วส่งต่อให้ตัวจัดการ
 * ต้องอ่านที่นี่เพราะ QR ต้องชี้ไปที่ที่อยู่จริงของร้าน ไม่ใช่ localhost ของเครื่องแอดมิน
 * ไม่อย่างนั้นมือถือลูกค้าสแกนแล้วจะเปิดไม่ได้
 *
 * @returns หน้าจัดการโต๊ะพร้อม QR
 */
export default function TablesPage() {
  const baseUrl = process.env.APP_BASE_URL ?? '';
  return <TableManager baseUrl={baseUrl} />;
}
