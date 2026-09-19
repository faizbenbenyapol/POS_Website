import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { ingredientUsage, roundQty } from '@/lib/recipe';

/** วัตถุดิบ 1 บรรทัดในสูตรของเมนู พร้อมต้นทุนต่อหน่วยปัจจุบัน */
export type RecipeLine = {
  ingredientId: number;
  quantity: number;
  costPerUnit: number;
};

/** รายการอาหารที่เพิ่งบันทึก เท่าที่การตัดวัตถุดิบต้องใช้ */
export type DeductionItem = {
  orderItemId: number;
  menuItemId: number;
  quantity: number;
};

/**
 * อ่านสูตรของหลายเมนูในคำสั่งเดียว ข้ามวัตถุดิบที่ถูกปิดใช้งานแล้ว
 *
 * @param conn - connection ใน transaction ของการสั่งอาหาร
 * @param menuItemIds - id ของเมนูที่ลูกค้าสั่ง
 * @returns Map จาก menu_item_id ไปยังบรรทัดสูตร เมนูที่ไม่มีสูตรจะไม่มีคีย์
 */
export async function loadRecipes(
  conn: PoolConnection,
  menuItemIds: number[],
): Promise<Map<number, RecipeLine[]>> {
  const result = new Map<number, RecipeLine[]>();
  const ids = [...new Set(menuItemIds)];
  if (ids.length === 0) return result;

  const [rows] = await conn.execute<
    (RowDataPacket & {
      menu_item_id: number;
      ingredient_id: number;
      quantity: string;
      cost_per_unit: string;
    })[]
  >(
    `SELECT r.menu_item_id, r.ingredient_id, r.quantity, i.cost_per_unit
       FROM menu_recipes r
       JOIN ingredients i ON i.id = r.ingredient_id
      WHERE r.menu_item_id IN (${ids.map(() => '?').join(',')}) AND i.is_active = 1`,
    ids,
  );
  for (const row of rows) {
    const list = result.get(row.menu_item_id) ?? [];
    list.push({
      ingredientId: row.ingredient_id,
      quantity: Number(row.quantity),
      costPerUnit: Number(row.cost_per_unit),
    });
    result.set(row.menu_item_id, list);
  }
  return result;
}

/**
 * ตัดวัตถุดิบของสาขาตามสูตรของเมนูที่เพิ่งสั่ง และบันทึกประวัติแยกรายการอาหาร
 *
 * ตัดเฉพาะวัตถุดิบที่สาขานั้นนับอยู่ (มีแถวใน branch_ingredient_stock) สาขาที่ยังไม่นับจะไม่ถูกแตะ
 * ยอมให้ติดลบได้โดยไม่ปฏิเสธออเดอร์ เพราะยอดวัตถุดิบในครัวคลาดเคลื่อนเสมอ
 * ยอดติดลบจึงเป็นสัญญาณให้ไปนับของจริงแล้วปรับยอด (ดูเหตุผลใน migration 012)
 *
 * ล็อกแถวเรียงตาม ingredient_id ก่อนตัดทุกครั้ง กันสองโต๊ะที่สั่งพร้อมกัน deadlock กันเอง
 *
 * @param conn - connection ใน transaction เดียวกับการสร้างออเดอร์
 * @param branchId - สาขาที่สั่ง
 * @param items - รายการอาหารที่เพิ่งบันทึก พร้อม id ของแถว order_items
 * @param recipes - สูตรของเมนูที่อ่านไว้แล้วจาก loadRecipes
 * @param orderId - ออเดอร์ที่ทำให้วัตถุดิบลดลง ใช้อ้างอิงในประวัติ
 * @returns ไม่คืนค่า มีผลข้างเคียงคือแก้ branch_ingredient_stock และเขียน ingredient_stock_logs
 */
export async function deductIngredients(
  conn: PoolConnection,
  branchId: number,
  items: DeductionItem[],
  recipes: Map<number, RecipeLine[]>,
  orderId: number,
): Promise<void> {
  const perItem = items
    .map((item) => ({
      orderItemId: item.orderItemId,
      usage: ingredientUsage(recipes.get(item.menuItemId) ?? [], item.quantity),
    }))
    .filter((entry) => entry.usage.length > 0);
  if (perItem.length === 0) return;

  const ingredientIds = [...new Set(perItem.flatMap((e) => e.usage.map((u) => u.ingredientId)))].sort(
    (a, b) => a - b,
  );
  const [stockRows] = await conn.execute<
    (RowDataPacket & { ingredient_id: number; quantity: string })[]
  >(
    `SELECT ingredient_id, quantity FROM branch_ingredient_stock
      WHERE branch_id = ? AND ingredient_id IN (${ingredientIds.map(() => '?').join(',')})
      ORDER BY ingredient_id
      FOR UPDATE`,
    [branchId, ...ingredientIds],
  );
  const onHand = new Map(stockRows.map((r) => [r.ingredient_id, Number(r.quantity)]));
  if (onHand.size === 0) return;

  for (const entry of perItem) {
    for (const use of entry.usage) {
      const before = onHand.get(use.ingredientId);
      // สาขานี้ไม่ได้นับวัตถุดิบตัวนี้ ข้ามไปโดยไม่สร้างยอดติดลบขึ้นมาเอง
      if (before === undefined) continue;
      const after = roundQty(before - use.quantity);
      onHand.set(use.ingredientId, after);
      await conn.execute(
        'UPDATE branch_ingredient_stock SET quantity = ? WHERE branch_id = ? AND ingredient_id = ?',
        [after, branchId, use.ingredientId],
      );
      await conn.execute(
        `INSERT INTO ingredient_stock_logs
           (branch_id, ingredient_id, change_type, quantity, qty_before, qty_after, order_id, order_item_id)
         VALUES (?, ?, 'DEDUCT', ?, ?, ?, ?, ?)`,
        [branchId, use.ingredientId, use.quantity, before, after, orderId, entry.orderItemId],
      );
    }
  }
}

/**
 * คืนวัตถุดิบของรายการอาหารที่ถูกยกเลิก โดยคืนเท่ากับที่เคยตัดไปจริงตามประวัติ
 *
 * อ่านยอดจาก ingredient_stock_logs ไม่ใช่จากสูตรปัจจุบัน เพราะสูตรอาจถูกแก้หลังลูกค้าสั่ง
 * และหักยอดที่เคยคืนไปแล้วออก การกดยกเลิกซ้ำจึงไม่คืนของเกินที่ตัดไป
 *
 * @param conn - connection ใน transaction ของการคืนสต๊อก
 * @param orderItemIds - แถว order_items ที่ถูกยกเลิก
 * @param userId - ผู้ที่กดยกเลิก
 * @param note - หมายเหตุ เช่น เหตุผลการยกเลิก
 * @returns ไม่คืนค่า มีผลข้างเคียงคือแก้ branch_ingredient_stock และเขียน ingredient_stock_logs
 */
export async function restoreIngredients(
  conn: PoolConnection,
  orderItemIds: number[],
  userId: number,
  note: string | null,
): Promise<void> {
  const ids = [...new Set(orderItemIds)];
  if (ids.length === 0) return;

  const [pending] = await conn.execute<
    (RowDataPacket & {
      branch_id: number;
      ingredient_id: number;
      order_id: number | null;
      order_item_id: number;
      outstanding: string;
    })[]
  >(
    `SELECT branch_id, ingredient_id, MAX(order_id) AS order_id, order_item_id,
            SUM(CASE change_type WHEN 'DEDUCT' THEN quantity WHEN 'RESTORE' THEN -quantity ELSE 0 END) AS outstanding
       FROM ingredient_stock_logs
      WHERE order_item_id IN (${ids.map(() => '?').join(',')})
      GROUP BY branch_id, ingredient_id, order_item_id
      HAVING outstanding > 0
      ORDER BY ingredient_id`,
    ids,
  );

  for (const row of pending) {
    const [stock] = await conn.execute<(RowDataPacket & { quantity: string })[]>(
      `SELECT quantity FROM branch_ingredient_stock
        WHERE branch_id = ? AND ingredient_id = ? FOR UPDATE`,
      [row.branch_id, row.ingredient_id],
    );
    // สาขาเลิกนับวัตถุดิบตัวนี้ไปแล้ว ไม่ต้องคืน
    if (!stock[0]) continue;
    const before = Number(stock[0].quantity);
    const amount = roundQty(Number(row.outstanding));
    const after = roundQty(before + amount);
    await conn.execute(
      'UPDATE branch_ingredient_stock SET quantity = ? WHERE branch_id = ? AND ingredient_id = ?',
      [after, row.branch_id, row.ingredient_id],
    );
    await conn.execute(
      `INSERT INTO ingredient_stock_logs
         (branch_id, ingredient_id, change_type, quantity, qty_before, qty_after, order_id, order_item_id, changed_by, note)
       VALUES (?, ?, 'RESTORE', ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.branch_id,
        row.ingredient_id,
        amount,
        before,
        after,
        row.order_id,
        row.order_item_id,
        userId,
        note,
      ],
    );
  }
}
