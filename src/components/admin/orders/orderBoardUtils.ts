import { isBarItem } from '@/components/ReceiptPrintModal';
import type { BoardItem, BoardOrder, PrepItem, StationFilter } from './types';

/**
 * แปลงวันนี้เป็นข้อความ YYYY-MM-DD สำหรับตัวกรองวันที่
 *
 * @returns ข้อความวันที่รูปแบบที่ input type="date" รับได้
 */
export function todayInputValue(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * คำนวณระยะเวลารอของออเดอร์ พร้อมกำหนดระดับความเร่งด่วนสำหรับห้องครัว
 *
 * @param createdAt - วันเวลาที่สั่งอาหาร
 * @returns ข้อมูลจำนวนนาที ข้อความกำกับ และคลาสสีของป้ายเตือน
 */
export function getOrderAge(createdAt: string): {
  minutes: number;
  label: string;
  badgeClass: string;
  isUrgent: boolean;
} {
  const created = new Date(createdAt).getTime();
  const diffMs = Math.max(0, Date.now() - created);
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) {
    return {
      minutes,
      label: 'เพิ่งสั่ง',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      isUrgent: false,
    };
  }
  if (minutes < 10) {
    return {
      minutes,
      label: `รอ ${minutes} นาที`,
      badgeClass: 'bg-zinc-100 text-zinc-700 border-zinc-200',
      isUrgent: false,
    };
  }
  if (minutes < 20) {
    return {
      minutes,
      label: `รอนาน ${minutes} น.`,
      badgeClass: 'bg-amber-100 text-amber-900 border-amber-300 font-bold',
      isUrgent: true,
    };
  }
  return {
    minutes,
    label: `เร่งด่วน! ${minutes} น.`,
    badgeClass: 'bg-red-100 text-red-900 border-red-400 font-black animate-pulse',
    isUrgent: true,
  };
}

/**
 * รวมรายการอาหารที่ยังค้างปรุง (PENDING และ PREPARING) จากทุกใบสั่ง
 * รองรับการกรองตามสถานี (ครัวอาหาร หรือ บาร์น้ำ)
 *
 * @param orders - รายการออเดอร์ทั้งหมดบนกระดาน
 * @param items - รายการอาหารทั้งหมดบนกระดาน
 * @param stationFilter - ตัวกรองสถานี ('ALL' | 'KITCHEN' | 'BAR')
 * @returns รายการเมนูค้างปรุง เรียงจากจำนวนจานมากไปหาน้อย
 */
export function computeKitchenPrepSummary(
  orders: BoardOrder[] | null,
  items: BoardItem[],
  stationFilter: StationFilter = 'ALL',
): PrepItem[] {
  if (!orders || orders.length === 0 || items.length === 0) return [];

  const activeOrderMap = new Map<number, BoardOrder>();
  for (const o of orders) {
    if (o.status === 'PENDING' || o.status === 'PREPARING') {
      activeOrderMap.set(o.id, o);
    }
  }

  const prepMap = new Map<
    string,
    { name: string; options: string | null; quantity: number; tables: Set<string>; isBar: boolean }
  >();

  for (const item of items) {
    const parentOrder = activeOrderMap.get(item.order_id);
    if (!parentOrder) continue;
    if (item.status === 'PENDING' || item.status === 'PREPARING') {
      const isBar = isBarItem({
        itemName: item.item_name,
        quantity: item.quantity,
        categoryName: item.category_name,
      });

      if (stationFilter === 'KITCHEN' && isBar) continue;
      if (stationFilter === 'BAR' && !isBar) continue;

      // แยกตามตัวเลือกด้วย กะเพราเผ็ดน้อยกับเผ็ดมากเป็นคนละจานสำหรับคนทำ
      const prepKey = item.options_text ? `${item.item_name} (${item.options_text})` : item.item_name;
      const existing = prepMap.get(prepKey) || {
        name: item.item_name,
        options: item.options_text ?? null,
        quantity: 0,
        tables: new Set<string>(),
        isBar,
      };
      existing.quantity += item.quantity;
      existing.tables.add(parentOrder.table_no);
      prepMap.set(prepKey, existing);
    }
  }

  return Array.from(prepMap.entries())
    .map(([key, data]) => ({
      key,
      name: data.name,
      options: data.options,
      quantity: data.quantity,
      tables: Array.from(data.tables).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      ),
      isBar: data.isBar,
    }))
    .sort((a, b) => b.quantity - a.quantity);
}
