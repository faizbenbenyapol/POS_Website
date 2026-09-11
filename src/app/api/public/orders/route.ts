import type { NextRequest } from 'next/server';
import type { PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { apiOk, apiError, serverError, ERROR_CODES } from '@/lib/api';
import { query, withTransaction } from '@/lib/db';
import { findTableSession, resolveTableSession, sessionErrorMessage } from '@/lib/session';
import { createOrderSchema, firstErrorMessage } from '@/lib/validation';
import { getBusinessDayRange } from '@/lib/format';

/** คำนำหน้ารหัสออเดอร์ รวมกับวันที่และลำดับแล้วยาว 12 ตัวพอดีตามคอลัมน์ order_code */
const ORDER_CODE_PREFIX = 'OD';

/** ความยาวเลขลำดับต่อวันในรหัสออเดอร์ */
const ORDER_SEQUENCE_DIGITS = 4;

/** รายการที่ลูกค้าสั่ง หลังจากดึงชื่อและราคาจริงจากฐานข้อมูลแล้ว */
type PricedItem = {
  menuItemId: number;
  itemName: string;
  unitPrice: number;
  quantity: number;
  note: string | null;
};

/** ออเดอร์ 1 ใบพร้อมยอดรวม สำหรับหน้าสถานะฝั่งลูกค้า */
type OrderRow = RowDataPacket & {
  id: number;
  order_code: string;
  status: string;
  total_amount: string;
  created_at: string;
};

/** รายการอาหารในออเดอร์ สำหรับหน้าสถานะฝั่งลูกค้า */
type OrderItemRow = RowDataPacket & {
  id: number;
  order_id: number;
  item_name: string;
  unit_price: string;
  quantity: number;
  note: string | null;
  status: string;
};

/**
 * สร้างรหัสออเดอร์รูปแบบ OD + YYMMDD + ลำดับ 4 หลักของวันนั้น เช่น OD2609090007
 * ใช้ INSERT ... ON DUPLICATE KEY UPDATE เพื่อเพิ่มลำดับแบบ atomic
 * ไม่ต้องล็อกแถวอื่น จึงไม่กัน concurrency เท่ากับ COUNT(*) FOR UPDATE
 *
 * @param conn - connection ที่อยู่ใน transaction เดียวกับการสร้างออเดอร์
 * @returns รหัสออเดอร์ยาว 12 ตัวอักษร
 */
async function generateOrderCode(conn: PoolConnection): Promise<string> {
  const todayRange = getBusinessDayRange();
  await conn.execute(
    `INSERT INTO order_counters (business_date, last_seq)
     VALUES (?, 1)
     ON DUPLICATE KEY UPDATE last_seq = last_seq + 1`,
    [todayRange.businessDate],
  );
  const [rows] = await conn.execute<(RowDataPacket & { last_seq: number })[]>(
    'SELECT last_seq FROM order_counters WHERE business_date = ?',
    [todayRange.businessDate],
  );
  const sequence = String(rows[0]?.last_seq ?? 1).padStart(ORDER_SEQUENCE_DIGITS, '0');
  const [y, m, d] = todayRange.businessDate.split('-');
  const datePart = `${y.slice(2)}${m}${d}`;
  return `${ORDER_CODE_PREFIX}${datePart}${sequence}`;
}

/**
 * ดึงชื่อและราคาปัจจุบันของเมนูที่ลูกค้าสั่ง เพื่อคัดลอกลง order_items
 * ต้องทำที่ฝั่งเซิร์ฟเวอร์เสมอ ห้ามเชื่อราคาที่ส่งมาจากเบราว์เซอร์ เพราะแก้ได้
 *
 * @param conn - connection ที่อยู่ใน transaction เดียวกับการสร้างออเดอร์
 * @param items - รายการที่ลูกค้าสั่ง มีแค่ menuItemId, quantity, note
 * @returns รายการที่เติมชื่อและราคาแล้ว หรือ null เมื่อมีเมนูที่ถูกปิดขายไปแล้ว
 */
async function priceItems(
  conn: PoolConnection,
  items: { menuItemId: number; quantity: number; note?: string }[],
): Promise<PricedItem[] | null> {
  const priced: PricedItem[] = [];
  for (const item of items) {
    const [rows] = await conn.execute<(RowDataPacket & { name: string; price: string })[]>(
      'SELECT name, price FROM menu_items WHERE id = ? AND is_available = 1 LIMIT 1',
      [item.menuItemId],
    );
    const menu = rows[0];
    if (!menu) return null;
    priced.push({
      menuItemId: item.menuItemId,
      itemName: menu.name,
      unitPrice: Number(menu.price),
      quantity: item.quantity,
      note: item.note?.trim() || null,
    });
  }
  return priced;
}

/**
 * สร้างออเดอร์ใหม่จากตะกร้าของลูกค้า และคัดลอกราคา ณ ปัจจุบันลง order_items
 * เพื่อไม่ให้บิลเปลี่ยนตามราคาที่แอดมินแก้ภายหลัง
 *
 * ทั้งหมดอยู่ใน transaction เดียว ถ้าเขียนรายการอาหารไม่สำเร็จ ออเดอร์หัวบิลต้องไม่ค้างอยู่
 *
 * @param request - คำขอที่มี body เป็น JSON { token, items }
 * @returns รหัสออเดอร์และยอดรวม หรือ error พร้อมข้อความไทยบอกวิธีแก้
 */
export async function POST(request: NextRequest) {
  try {
    const parsed = createOrderSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return apiError(ERROR_CODES.VALIDATION_ERROR, firstErrorMessage(parsed.error));
    }

    const session = await resolveTableSession(parsed.data.token);
    if (!session.ok) {
      const status = session.reason === 'TABLE_NOT_OPEN' ? 409 : 404;
      return apiError(ERROR_CODES.NOT_FOUND, sessionErrorMessage(session.reason), status);
    }

    const created = await withTransaction(async (conn) => {
      const priced = await priceItems(conn, parsed.data.items);
      if (!priced) return null;

      const total = priced.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      const orderCode = await generateOrderCode(conn);

      const [orderResult] = await conn.execute<ResultSetHeader>(
        'INSERT INTO orders (session_id, order_code, status, total_amount) VALUES (?, ?, ?, ?)',
        [session.session.sessionId, orderCode, 'PENDING', total],
      );

      for (const item of priced) {
        await conn.execute(
          `INSERT INTO order_items (order_id, menu_item_id, item_name, unit_price, quantity, note, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            orderResult.insertId,
            item.menuItemId,
            item.itemName,
            item.unitPrice,
            item.quantity,
            item.note,
            'PENDING',
          ],
        );
      }
      return { orderId: orderResult.insertId, orderCode, total };
    });

    if (!created) {
      return apiError(
        ERROR_CODES.VALIDATION_ERROR,
        'มีเมนูในตะกร้าที่เพิ่งถูกปิดขาย กรุณากลับไปหน้าเมนูแล้วเลือกรายการใหม่',
        409,
      );
    }
    return apiOk(created, 201);
  } catch (err) {
    return serverError(err, 'POST /api/public/orders');
  }
}

/**
 * คืนออเดอร์ทั้งหมดของรอบการนั่งปัจจุบัน พร้อมยอดสะสมของโต๊ะ
 * รายการที่ถูกยกเลิกจะไม่ถูกนับในยอดรวม ตามกฎในหัวข้อ 10
 *
 * ใช้ findTableSession แทน resolveTableSession เพื่อไม่ให้การกดดูสถานะเฉย ๆ
 * ไปเปิดรอบการนั่งใหม่ให้โต๊ะที่เพิ่งปิดบิลไป
 *
 * @param request - คำขอที่มี query string token
 * @returns ข้อมูลโต๊ะ รายการออเดอร์พร้อมรายการอาหาร และยอดรวม
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token') ?? '';
    const found = await findTableSession(token);
    if (!found.ok) {
      return apiError(ERROR_CODES.NOT_FOUND, sessionErrorMessage(found.reason), 404);
    }
    if (found.sessionId === null) {
      return apiOk({ tableNo: found.tableNo, orders: [], items: [], total: 0 });
    }

    const orders = await query<OrderRow>(
      `SELECT id, order_code, status, total_amount, created_at
         FROM orders WHERE session_id = ? ORDER BY id`,
      [found.sessionId],
    );
    const items = await query<OrderItemRow>(
      `SELECT oi.id, oi.order_id, oi.item_name, oi.unit_price, oi.quantity, oi.note, oi.status
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
        WHERE o.session_id = ?
        ORDER BY oi.id`,
      [found.sessionId],
    );

    const total = items
      .filter((item) => item.status !== 'CANCELLED')
      .reduce((sum, item) => sum + Number(item.unit_price) * item.quantity, 0);

    return apiOk({ tableNo: found.tableNo, orders, items, total });
  } catch (err) {
    return serverError(err, 'GET /api/public/orders');
  }
}
