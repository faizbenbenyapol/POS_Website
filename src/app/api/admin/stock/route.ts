import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, apiError, serverError, authFailureResponse, ERROR_CODES } from '@/lib/api';
import { requireCapability } from '@/lib/auth';
import { query, withTransaction } from '@/lib/db';
import { getEffectiveBranchId, getBranchById } from '@/lib/branch';
import { LOW_STOCK_THRESHOLD } from '@/lib/stock';
import { stockUpdateSchema, firstErrorMessage } from '@/lib/validation';

/** จำนวนคงเหลือของเมนู 1 รายการในสาขาที่กำลังดูอยู่ */
export type StockItemRow = RowDataPacket & {
  menu_item_id: number;
  name: string;
  category_name: string;
  /** จำนวนคงเหลือ null คือไม่จำกัดจำนวน */
  stock_qty: number | null;
  is_available: number;
  base_is_available: number;
};

/**
 * คืนจำนวนคงเหลือของเมนูทุกรายการในสาขาที่กำลังดูอยู่
 *
 * เรียงเมนูที่จำกัดจำนวนขึ้นก่อนโดยไล่จากของที่เหลือน้อยที่สุด
 * เพราะสิ่งที่พนักงานเปิดหน้านี้มาดูคือ "อะไรกำลังจะหมด" ไม่ใช่รายชื่อเมนูทั้งร้าน
 *
 * ต้องระบุสาขาเสมอ เพราะของในครัวเป็นของแต่ละสาขา ไม่ใช่ของแบรนด์
 * HQ Admin ที่เลือกดู "ทุกสาขา" อยู่จึงต้องเลือกสาขาก่อน
 *
 * @param request - คำขอ อาจมี query parameter branchId สำหรับ HQ Admin
 * @returns รายการเมนูพร้อมจำนวนคงเหลือ และเกณฑ์ที่ถือว่าใกล้หมด
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireCapability('stock.menu');
    if (!auth.ok) return authFailureResponse(auth.reason);

    const branchId = await getEffectiveBranchId(request, auth.user);
    if (!branchId) {
      return apiError(
        ERROR_CODES.VALIDATION_ERROR,
        'จำนวนคงเหลือเป็นของแต่ละสาขา กรุณาเลือกสาขาที่ต้องการดูจากแถบเลือกสาขาก่อน',
        400,
      );
    }
    const branch = await getBranchById(branchId);

    const rows = await query<StockItemRow>(
      `SELECT m.id AS menu_item_id, m.name, c.name AS category_name,
              bma.stock_qty,
              COALESCE(bma.is_available, m.is_available) AS is_available,
              m.is_available AS base_is_available
         FROM menu_items m
         JOIN categories c ON c.id = m.category_id
         LEFT JOIN branch_menu_availability bma
           ON bma.menu_item_id = m.id AND bma.branch_id = ?
        ORDER BY (bma.stock_qty IS NULL), bma.stock_qty ASC, c.sort_order, m.name`,
      [branchId],
    );

    return apiOk({
      branchId,
      branchName: branch?.name ?? 'สาขาปัจจุบัน',
      lowStockThreshold: LOW_STOCK_THRESHOLD,
      items: rows,
    });
  } catch (err) {
    return serverError(err, 'GET /api/admin/stock');
  }
}

/**
 * แก้จำนวนคงเหลือของเมนู 1 รายการในสาขาที่กำลังดูอยู่ พร้อมบันทึกประวัติทุกครั้ง
 *
 * เปิดให้พนักงาน (STAFF) ทำได้ ไม่สงวนไว้เฉพาะ ADMIN เหมือนการแก้ราคา
 * เพราะคนที่รู้ว่าของเหลือเท่าไรคือคนที่ยืนอยู่ในครัว ไม่ใช่เจ้าของร้าน
 * และการแก้จำนวนคงเหลือไม่ได้แตะเงินในบิล จึงไม่ใช่ช่องทางทุจริตแบบเดียวกับส่วนลด
 *
 * ตั้งจำนวนเป็น 0 เท่ากับสั่งปิดขาย ส่วนการเติมของให้เมนูที่เหลือศูนย์จะเปิดขายกลับให้เอง
 * ไม่ต้องให้พนักงานไปกดเปิดซ้ำอีกที
 *
 * @param request - คำขอที่มี body เป็น JSON ตาม stockUpdateSchema
 * @returns จำนวนคงเหลือก่อนและหลังแก้ หรือ error พร้อมข้อความไทยบอกสาเหตุ
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireCapability('stock.menu');
    if (!auth.ok) return authFailureResponse(auth.reason);

    const branchId = await getEffectiveBranchId(request, auth.user);
    if (!branchId) {
      return apiError(
        ERROR_CODES.VALIDATION_ERROR,
        'จำนวนคงเหลือเป็นของแต่ละสาขา กรุณาเลือกสาขาที่ต้องการแก้ก่อน',
        400,
      );
    }

    const parsed = stockUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return apiError(ERROR_CODES.VALIDATION_ERROR, firstErrorMessage(parsed.error));
    }
    const { menuItemId, mode, quantity } = parsed.data;

    if (mode !== 'UNLIMITED' && quantity === undefined) {
      return apiError(ERROR_CODES.VALIDATION_ERROR, 'ต้องระบุจำนวนที่ต้องการตั้งหรือเติม');
    }
    if (mode === 'ADD' && (quantity ?? 0) <= 0) {
      return apiError(ERROR_CODES.VALIDATION_ERROR, 'จำนวนที่เติมต้องมากกว่า 0');
    }

    const result = await withTransaction<
      | { ok: true; stockBefore: number | null; stockAfter: number | null }
      | { ok: false; reason: 'MENU_NOT_FOUND' | 'ADD_ON_UNLIMITED' }
    >(async (conn) => {
      const [menus] = await conn.execute<(RowDataPacket & { id: number })[]>(
        'SELECT id FROM menu_items WHERE id = ?',
        [menuItemId],
      );
      if (!menus[0]) return { ok: false, reason: 'MENU_NOT_FOUND' };

      const [existing] = await conn.execute<
        (RowDataPacket & { id: number; stock_qty: number | null; is_available: number })[]
      >(
        `SELECT id, stock_qty, is_available FROM branch_menu_availability
          WHERE branch_id = ? AND menu_item_id = ? FOR UPDATE`,
        [branchId, menuItemId],
      );
      const current = existing[0];
      const stockBefore = current?.stock_qty ?? null;

      // เติมของให้เมนูที่ไม่ได้จำกัดจำนวนไม่มีความหมาย เพราะของมีไม่จำกัดอยู่แล้ว
      if (mode === 'ADD' && stockBefore === null) {
        return { ok: false, reason: 'ADD_ON_UNLIMITED' };
      }

      let stockAfter: number | null;
      if (mode === 'UNLIMITED') stockAfter = null;
      else if (mode === 'ADD') stockAfter = (stockBefore ?? 0) + (quantity ?? 0);
      else stockAfter = quantity ?? 0;

      // ของหมด = ปิดขายอัตโนมัติ ส่วนของที่เติมกลับเข้ามาจากศูนย์ = เปิดขายกลับให้เอง
      // กรณีอื่นคงสถานะเปิด/ปิดตามที่พนักงานตั้งไว้เดิม ไม่ไปปลุกเมนูที่ตั้งใจปิดขาย
      const availableBefore = current?.is_available ?? 1;
      let availableAfter = availableBefore;
      if (stockAfter !== null && stockAfter <= 0) availableAfter = 0;
      else if ((stockBefore ?? 0) <= 0 && (stockAfter === null || stockAfter > 0)) availableAfter = 1;

      await conn.execute(
        `INSERT INTO branch_menu_availability (branch_id, menu_item_id, is_available, stock_qty)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE is_available = VALUES(is_available), stock_qty = VALUES(stock_qty)`,
        [branchId, menuItemId, availableAfter, stockAfter],
      );

      if (stockBefore !== stockAfter) {
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
            stockAfter === null ? 0 : Math.abs(stockAfter - (stockBefore ?? 0)),
            stockBefore,
            stockAfter,
            auth.user.id,
            stockAfter === null ? 'เลิกจำกัดจำนวนคงเหลือ' : null,
          ],
        );
      }

      return { ok: true, stockBefore, stockAfter };
    });

    if (!result.ok) {
      if (result.reason === 'ADD_ON_UNLIMITED') {
        return apiError(
          ERROR_CODES.VALIDATION_ERROR,
          'เมนูนี้ยังไม่ได้จำกัดจำนวน จึงเติมของเพิ่มไม่ได้ ถ้าต้องการนับจำนวนให้กดตั้งจำนวนคงเหลือก่อน',
          409,
        );
      }
      return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบเมนูนี้ กรุณารีเฟรชหน้าจอใหม่', 404);
    }

    return apiOk({
      branchId,
      menuItemId,
      stockBefore: result.stockBefore,
      stockAfter: result.stockAfter,
    });
  } catch (err) {
    return serverError(err, 'PATCH /api/admin/stock');
  }
}
