import type { NextRequest } from 'next/server';
import type { PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { apiOk, apiError, serverError, ERROR_CODES } from '@/lib/api';
import { query, withTransaction } from '@/lib/db';
import { findTableSession, resolveTableSession, sessionErrorMessage } from '@/lib/session';
import { createOrderSchema, firstErrorMessage } from '@/lib/validation';
import { getBusinessDayRange } from '@/lib/format';
import { createRateLimiter } from '@/lib/rateLimit';

/** จำกัดการสั่งอาหาร 10 ครั้ง/นาที ต่อ token กันยิงซ้ำจากสคริปต์ */
const orderByToken = createRateLimiter('order-token', { maxRequests: 10, windowMs: 60000 });

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
 * แยกนับลำดับรายสาขาผ่าน (branch_id, business_date)
 *
 * @param conn - connection ที่อยู่ใน transaction เดียวกับการสร้างออเดอร์
 * @param branchId - รหัสสาขาของออเดอร์
 * @returns รหัสออเดอร์ยาว 12 ตัวอักษร
 */
async function generateOrderCode(conn: PoolConnection, branchId: number): Promise<string> {
  const todayRange = getBusinessDayRange();
  await conn.execute(
    `INSERT INTO order_counters (branch_id, business_date, last_seq)
     VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE last_seq = last_seq + 1`,
    [branchId, todayRange.businessDate],
  );
  const [rows] = await conn.execute<(RowDataPacket & { last_seq: number })[]>(
    'SELECT last_seq FROM order_counters WHERE branch_id = ? AND business_date = ?',
    [branchId, todayRange.businessDate],
  );
  const sequence = String(rows[0]?.last_seq ?? 1).padStart(ORDER_SEQUENCE_DIGITS, '0');
  const [y, m, d] = todayRange.businessDate.split('-');
  const datePart = `${y.slice(2)}${m}${d}`;
  return `${ORDER_CODE_PREFIX}${datePart}${sequence}`;
}

/**
 * ดึงชื่อและราคาปัจจุบันของเมนูที่ลูกค้าสั่ง เพื่อคัดลอกลง order_items
 * คำนวณราคาพิเศษเฉพาะสาขา (Custom Price) และตรวจสถานะเปิด/ปิดขายเฉพาะสาขา
 *
 * @param conn - connection ที่อยู่ใน transaction เดียวกับการสร้างออเดอร์
 * @param branchId - รหัสสาขา
 * @param items - รายการที่ลูกค้าสั่ง มีแค่ menuItemId, quantity, note
 * @returns รายการที่เติมชื่อและราคาแล้ว หรือ null เมื่อมีเมนูที่ถูกปิดขายไปแล้ว
 */
async function priceItems(
  conn: PoolConnection,
  branchId: number,
  items: { menuItemId: number; quantity: number; note?: string }[],
): Promise<PricedItem[] | null> {
  const ids = items.map((i) => i.menuItemId);
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await conn.execute<
    (RowDataPacket & { id: number; name: string; price: string; is_available: number })[]
  >(
    `SELECT m.id, m.name,
            COALESCE(bma.custom_price, m.price) AS price,
            CASE
              WHEN m.is_available = 0 THEN 0
              WHEN bma.is_available IS NOT NULL THEN bma.is_available
              ELSE m.is_available
            END AS is_available
       FROM menu_items m
       LEFT JOIN branch_menu_availability bma
         ON bma.menu_item_id = m.id AND bma.branch_id = ?
      WHERE m.id IN (${placeholders})`,
    [branchId, ...ids],
  );

  // สร้าง map เฉพาะเมนูที่เปิดขายอยู่
  const availableRows = rows.filter((r) => r.is_available === 1);
  const menuMap = new Map(availableRows.map((r) => [r.id, { name: r.name, price: Number(r.price) }]));

  // ตรวจว่ามีเมนูไหนไม่พบหรือปิดขายไปแล้ว
  if (menuMap.size !== new Set(ids).size) return null;

  return items.map((item) => {
    const menu = menuMap.get(item.menuItemId)!;
    return {
      menuItemId: item.menuItemId,
      itemName: menu.name,
      unitPrice: menu.price,
      quantity: item.quantity,
      note: item.note?.trim() || null,
    };
  });
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

    // ตรวจ rate limit ก่อนเข้า transaction เพื่อลดภาระฐานข้อมูล
    const tokenCheck = orderByToken(parsed.data.token);
    if (!tokenCheck.allowed) {
      const waitSec = Math.ceil(tokenCheck.retryAfterMs / 1000);
      return apiError(
        ERROR_CODES.VALIDATION_ERROR,
        `สั่งอาหารถี่เกินไป กรุณารอ ${waitSec} วินาทีแล้วลองใหม่`,
        429,
      );
    }

    const session = await resolveTableSession(parsed.data.token);
    if (!session.ok) {
      const status = session.reason === 'TABLE_NOT_OPEN' ? 409 : 404;
      return apiError(ERROR_CODES.NOT_FOUND, sessionErrorMessage(session.reason), status);
    }

    const branchId = session.session.branchId;

    const created = await withTransaction(async (conn) => {
      const priced = await priceItems(conn, branchId, parsed.data.items);
      if (!priced) return null;

      const total = priced.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      const orderCode = await generateOrderCode(conn, branchId);

      const [orderResult] = await conn.execute<ResultSetHeader>(
        'INSERT INTO orders (session_id, branch_id, order_code, status, total_amount) VALUES (?, ?, ?, ?, ?)',
        [session.session.sessionId, branchId, orderCode, 'PENDING', total],
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
