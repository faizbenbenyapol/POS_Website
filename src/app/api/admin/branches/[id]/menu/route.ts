import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, apiError, authFailureResponse, ERROR_CODES, parseId } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { query, withTransaction } from '@/lib/db';
import { branchMenuOverrideSchema, firstErrorMessage } from '@/lib/validation';

type RouteContext = { params: Promise<{ id: string }> };

export type BranchMenuItemRow = RowDataPacket & {
  id: number;
  category_id: number;
  category_name: string;
  name: string;
  description: string | null;
  base_price: string;
  custom_price: string | null;
  effective_price: string;
  image_url: string | null;
  base_is_available: number;
  is_available: number;
  has_override: number;
  /** จำนวนคงเหลือของสาขา null คือไม่จำกัดจำนวน */
  stock_qty: number | null;
};

/**
 * ดึงรายการเมนูทั้งหมด พร้อมแสดงราคาเฉพาะสาขา สถานะของหมด และจำนวนคงเหลือของสาขา
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireStaff();
  if (!auth.ok) return authFailureResponse(auth.reason);

  const branchId = parseId((await context.params).id);
  if (!branchId) return apiError(ERROR_CODES.VALIDATION_ERROR, 'รหัสสาขาไม่ถูกต้อง');

  if (auth.user.branchId && auth.user.branchId !== branchId) {
    return apiError(ERROR_CODES.FORBIDDEN, 'ไม่มีสิทธิ์เข้าถึงข้อมูลสาขาอื่น', 403);
  }

  const rows = await query<BranchMenuItemRow>(
    `SELECT m.id, m.category_id, c.name AS category_name, m.name, m.description,
            m.price AS base_price,
            bma.custom_price,
            COALESCE(bma.custom_price, m.price) AS effective_price,
            m.image_url,
            m.is_available AS base_is_available,
            COALESCE(bma.is_available, m.is_available) AS is_available,
            IF(bma.id IS NOT NULL, 1, 0) AS has_override,
            bma.stock_qty
       FROM menu_items m
       JOIN categories c ON c.id = m.category_id
       LEFT JOIN branch_menu_availability bma
         ON bma.menu_item_id = m.id AND bma.branch_id = ?
      ORDER BY c.sort_order, m.name`,
    [branchId],
  );

  return apiOk(rows);
}

/** ข้อมูลการตั้งค่าเมนูเฉพาะสาขา 1 รายการ หลังผ่านการตรวจแล้ว */
type OverridePayload = {
  menuItemId: number;
  customPrice?: number | null;
  isAvailable: boolean;
  stockQty?: number | null;
};

/**
 * เขียนค่าตั้งเมนูเฉพาะสาขา 1 รายการ พร้อมบันทึกประวัติเมื่อจำนวนคงเหลือถูกเปลี่ยน
 *
 * stockQty ที่ไม่ได้ส่งมา (undefined) หมายถึงไม่แตะจำนวนคงเหลือเดิม
 * ส่ง null หมายถึงเลิกจำกัดจำนวน ส่วนตัวเลขคือตั้งจำนวนคงเหลือใหม่
 * เมื่อตั้งเป็น 0 ระบบจะปิดขายเมนูนั้นของสาขาให้อัตโนมัติ
 *
 * @param branchId - รหัสสาขาที่แก้ไข
 * @param payload - ค่าตั้งของเมนูรายการนั้น
 * @param userId - รหัสผู้ใช้ที่เป็นคนแก้ ใช้บันทึกในประวัติการตั้งสต๊อก
 * @returns ไม่คืนค่า มีผลข้างเคียงคือเขียน branch_menu_availability และ menu_stock_logs
 */
async function saveOverride(branchId: number, payload: OverridePayload, userId: number) {
  const { menuItemId, customPrice, isAvailable, stockQty } = payload;

  await withTransaction(async (conn) => {
    const [existingRows] = await conn.execute<
      (RowDataPacket & { stock_qty: number | null })[]
    >(
      `SELECT stock_qty FROM branch_menu_availability
        WHERE branch_id = ? AND menu_item_id = ? FOR UPDATE`,
      [branchId, menuItemId],
    );
    const stockBefore = existingRows[0]?.stock_qty ?? null;
    const stockTouched = stockQty !== undefined;
    const stockAfter = stockTouched ? stockQty : stockBefore;

    // ตั้งจำนวนคงเหลือเป็น 0 เท่ากับสั่งปิดขาย ไม่ต้องให้พนักงานไปกดปิดซ้ำอีกที
    const available = stockTouched && stockAfter === 0 ? 0 : isAvailable ? 1 : 0;

    await conn.execute(
      `INSERT INTO branch_menu_availability
         (branch_id, menu_item_id, custom_price, is_available, stock_qty)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         custom_price = VALUES(custom_price),
         is_available = VALUES(is_available),
         stock_qty    = VALUES(stock_qty)`,
      [
        branchId,
        menuItemId,
        customPrice !== undefined && customPrice !== null ? customPrice : null,
        available,
        stockAfter,
      ],
    );

    if (stockTouched && stockBefore !== stockAfter) {
      const isRestock =
        stockBefore !== null && stockAfter !== null && stockAfter > stockBefore;
      await conn.execute(
        `INSERT INTO menu_stock_logs
           (branch_id, menu_item_id, change_type, quantity, stock_before, stock_after, changed_by, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          branchId,
          menuItemId,
          isRestock ? 'RESTOCK' : 'SET',
          stockAfter === null ? 0 : Math.abs((stockAfter ?? 0) - (stockBefore ?? 0)),
          stockBefore,
          stockAfter,
          userId,
          stockAfter === null ? 'เลิกจำกัดจำนวนคงเหลือ' : null,
        ],
      );
    }
  });
}

/**
 * อัปเดตราคาเฉพาะสาขา สถานะเปิด/ปิดขาย และจำนวนคงเหลือเฉพาะสาขา
 *
 * @param request - คำขอที่มี body เป็น JSON ตาม branchMenuOverrideSchema
 *                  หรือ { items: [...] } สำหรับบันทึกทีเดียวหลายรายการ
 * @param context - พารามิเตอร์เส้นทางที่มี id ของสาขา
 * @returns ผลการบันทึก หรือ error พร้อมข้อความไทยบอกสาเหตุ
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireStaff('ADMIN');
  if (!auth.ok) return authFailureResponse(auth.reason);

  const branchId = parseId((await context.params).id);
  if (!branchId) return apiError(ERROR_CODES.VALIDATION_ERROR, 'รหัสสาขาไม่ถูกต้อง');

  if (auth.user.branchId && auth.user.branchId !== branchId) {
    return apiError(ERROR_CODES.FORBIDDEN, 'ไม่มีสิทธิ์แก้ไขเมนูของสาขาอื่น', 403);
  }

  const body = await request.json().catch(() => null);

  // รองรับการบันทึกแบบกลุ่ม (Batch Update)
  if (body && Array.isArray(body.items)) {
    let updatedCount = 0;
    for (const item of body.items) {
      const parsed = branchMenuOverrideSchema.safeParse(item);
      if (parsed.success) {
        await saveOverride(
          branchId,
          {
            menuItemId: parsed.data.menuItemId,
            customPrice: parsed.data.customPrice,
            isAvailable: parsed.data.isAvailable,
            // ส่งต่อเฉพาะตอนที่ผู้เรียกระบุ stockQty มาจริง ๆ
            ...(Object.prototype.hasOwnProperty.call(item, 'stockQty')
              ? { stockQty: parsed.data.stockQty ?? null }
              : {}),
          },
          auth.user.id,
        );
        updatedCount += 1;
      }
    }
    return apiOk({ branchId, updatedCount });
  }

  // รองรับการบันทึกทีละรายการ (Single Item)
  const parsed = branchMenuOverrideSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, firstErrorMessage(parsed.error));
  }

  const { menuItemId, customPrice, isAvailable, stockQty } = parsed.data;

  await saveOverride(
    branchId,
    {
      menuItemId,
      customPrice,
      isAvailable,
      ...(body && Object.prototype.hasOwnProperty.call(body, 'stockQty')
        ? { stockQty: stockQty ?? null }
        : {}),
    },
    auth.user.id,
  );

  return apiOk({ branchId, menuItemId, customPrice, isAvailable, stockQty });
}
