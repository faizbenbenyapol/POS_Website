import type { RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '@/lib/db';
import { restoreIngredients } from '@/lib/ingredients';

/**
 * จำนวนคงเหลือที่ถือว่า "ใกล้หมด" ต่ำกว่าหรือเท่ากับค่านี้จะถูกเตือนที่หน้าสต๊อกและแดชบอร์ด
 * ตั้งไว้ที่ 5 จาน เพราะเป็นระดับที่ครัวยังมีเวลาเตรียมของเพิ่มก่อนขายหมดจริง
 */
export const LOW_STOCK_THRESHOLD = 5;

/** รายการอาหารเท่าที่การคืนสต๊อกต้องใช้ */
export type StockRestoreItem = {
  menuItemId: number;
  quantity: number;
  /** แถว order_items ที่ถูกยกเลิก ใช้คืนวัตถุดิบเท่าที่เคยตัดไปจริงกับรายการนี้ */
  orderItemId?: number;
};

/**
 * คืนจำนวนคงเหลือให้เมนูที่ถูกยกเลิก และเปิดขายกลับให้เมนูที่ระบบปิดไปตอนของหมด
 *
 * ตอนลูกค้าสั่ง ระบบตัดสต๊อกทันทีและปิดขายอัตโนมัติเมื่อเหลือศูนย์ (ดู POST /api/public/orders)
 * ถ้ายกเลิกรายการแล้วไม่คืนของกลับ เมนูนั้นจะกลายเป็น "ของหมด" ทั้งที่วัตถุดิบยังอยู่ครบ
 *
 * เปิดขายกลับเฉพาะเมนูที่ก่อนคืนของเหลือศูนย์เท่านั้น เพื่อไม่ให้ไปปลุกเมนูที่พนักงาน
 * ตั้งใจกดปิดขายเองทั้งที่ของยังเหลือ เมนูที่ stock_qty เป็น NULL คือไม่จำกัดจำนวน จึงข้ามไป
 *
 * ทำงานใน transaction ของตัวเองพร้อมล็อกแถวด้วย FOR UPDATE ให้เหมือนตอนตัดสต๊อก
 * กันกรณีคืนของพร้อมกับที่โต๊ะอื่นกำลังสั่งจานเดียวกันแล้วยอดคงเหลือเพี้ยน
 *
 * @param branchId - รหัสสาขาที่ยกเลิกรายการ สต๊อกเป็นของรายสาขาไม่ใช่ของแบรนด์
 * @param items - รายการอาหารที่ถูกยกเลิก พร้อมจำนวนที่ต้องคืน
 * @param orderId - รหัสใบสั่งที่ยกเลิก ใช้อ้างอิงในประวัติการคืนสต๊อก
 * @param userId - รหัสผู้ใช้ที่กดยกเลิก ใช้ตรวจย้อนหลังว่าใครทำให้ของกลับเข้าคลัง
 * @param note - หมายเหตุประกอบ เช่น เหตุผลการยกเลิก ส่ง null เมื่อไม่มี
 * คืนวัตถุดิบ (migration 012) ใน transaction เดียวกัน สำหรับรายการที่ส่ง orderItemId มา
 *
 * @returns ไม่คืนค่า มีผลข้างเคียงคือเขียน branch_menu_availability, menu_stock_logs
 *          และคืนยอดใน branch_ingredient_stock พร้อมประวัติใน ingredient_stock_logs
 */
export async function restoreStock(
  branchId: number,
  items: StockRestoreItem[],
  orderId: number,
  userId: number,
  note?: string | null,
): Promise<void> {
  if (items.length === 0) return;

  await withTransaction(async (conn) => {
    await restoreIngredients(
      conn,
      items.flatMap((item) => (item.orderItemId ? [item.orderItemId] : [])),
      userId,
      note ?? null,
    );

    for (const item of items) {
      if (item.quantity <= 0) continue;

      const [rows] = await conn.execute<
        (RowDataPacket & { id: number; stock_qty: number | null })[]
      >(
        `SELECT id, stock_qty FROM branch_menu_availability
          WHERE branch_id = ? AND menu_item_id = ? FOR UPDATE`,
        [branchId, item.menuItemId],
      );
      const stockRow = rows[0];
      // ไม่มีแถวตั้งค่าของสาขา หรือไม่ได้จำกัดจำนวน = ไม่ต้องคืนอะไรกลับ
      if (!stockRow || stockRow.stock_qty === null) continue;

      const before = Number(stockRow.stock_qty);
      const after = before + item.quantity;

      await conn.execute(
        `UPDATE branch_menu_availability
            SET stock_qty = ?, is_available = IF(? <= 0, 1, is_available)
          WHERE id = ?`,
        [after, before, stockRow.id],
      );
      await conn.execute(
        `INSERT INTO menu_stock_logs
           (branch_id, menu_item_id, change_type, quantity, stock_before, stock_after, order_id, changed_by, note)
         VALUES (?, ?, 'RESTORE', ?, ?, ?, ?, ?, ?)`,
        [
          branchId,
          item.menuItemId,
          item.quantity,
          before,
          after,
          orderId,
          userId,
          note ?? null,
        ],
      );
    }
  });
}
