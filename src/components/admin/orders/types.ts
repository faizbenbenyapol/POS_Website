import type { SoundTone } from './orderSound';

/** ออเดอร์ 1 ใบบนกระดาน */
export type BoardOrder = {
  id: number;
  branch_id?: number | null;
  branch_name?: string | null;
  branch_address?: string | null;
  branch_phone?: string | null;
  order_code: string;
  order_type?: string | null;
  status: string;
  total_amount: string;
  created_at: string;
  session_id: number;
  session_status: string;
  /** เวลาที่บิลของรอบการนั่งถูกคืนเงิน null คือยังไม่ถูกคืน */
  session_refunded_at?: string | null;
  table_no: string;
};

/** รายการอาหารของออเดอร์บนกระดาน */
export type BoardItem = {
  id: number;
  order_id: number;
  item_name: string;
  unit_price: string;
  quantity: number;
  note: string | null;
  /** ตัวเลือกที่ลูกค้าเลือก เช่น "เผ็ดน้อย, ไข่ดาวเพิ่ม (+10)" null เมื่อไม่ได้เลือก */
  options_text?: string | null;
  status: string;
  category_name?: string | null;
};

/** ข้อมูลสรุปเมนูอาหารค้างปรุงสำหรับห้องครัว */
export type PrepItem = {
  /** คีย์ไม่ซ้ำของการ์ด (ชื่อเมนู + ตัวเลือก) */
  key: string;
  name: string;
  /** ตัวเลือกที่ลูกค้าเลือก เมนูเดียวกันแต่ตัวเลือกต่างกันแยกการ์ด */
  options: string | null;
  quantity: number;
  tables: string[];
  isBar: boolean;
};

/** สถานีที่ใช้คัดแยกงานระหว่างครัวอาหารกับบาร์เครื่องดื่ม */
export type StationFilter = 'ALL' | 'KITCHEN' | 'BAR';

/** มุมมองกระดาน: รายการเรียงต่อกัน หรือคอลัมน์แบบ KDS */
export type BoardViewMode = 'LIST' | 'KDS';

/** ค่าการตั้งค่าเสียงแจ้งเตือนที่หน้ากระดานส่งต่อให้แผงตั้งค่า */
export type SoundSettings = {
  enabled: boolean;
  tone: SoundTone;
  volume: number;
};

/** คำอธิบายสถานะภาษาไทย มีข้อความกำกับเสมอ ไม่สื่อความหมายด้วยสีอย่างเดียว */
export const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'รอครัวรับ', className: 'bg-char text-slip-dim' },
  PREPARING: { label: 'กำลังทำ', className: 'bg-waiting/10 text-waiting' },
  SERVED: { label: 'เสิร์ฟแล้ว', className: 'bg-served/10 text-served' },
  CANCELLED: { label: 'ยกเลิกแล้ว', className: 'bg-void/10 text-void' },
};

/** ตัวเลือกกรองสถานะบนหัวกระดาน */
export const STATUS_FILTERS = [
  { value: '', label: 'ทุกสถานะ' },
  { value: 'PENDING', label: 'รอครัวรับ' },
  { value: 'PREPARING', label: 'กำลังทำ' },
  { value: 'SERVED', label: 'เสิร์ฟแล้ว' },
  { value: 'CANCELLED', label: 'ยกเลิกแล้ว' },
];

/** วิธีชำระเงินที่ร้านรับ ตรงกับ ENUM ในตาราง payments */
export const PAYMENT_METHODS = [
  { value: 'CASH', label: 'เงินสด' },
  { value: 'TRANSFER', label: 'โอนเงิน' },
  { value: 'CARD', label: 'บัตรเครดิต/เดบิต' },
];
