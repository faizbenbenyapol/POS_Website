import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, apiError, authFailureResponse, ERROR_CODES, parseId } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { execute, query } from '@/lib/db';
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
};

/**
 * ดึงรายการเมนูทั้งหมด พร้อมแสดงราคาเฉพาะสาขาและสถานะของหมดเฉพาะสาขา
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
            IF(bma.id IS NOT NULL, 1, 0) AS has_override
       FROM menu_items m
       JOIN categories c ON c.id = m.category_id
       LEFT JOIN branch_menu_availability bma
         ON bma.menu_item_id = m.id AND bma.branch_id = ?
      ORDER BY c.sort_order, m.name`,
    [branchId],
  );

  return apiOk(rows);
}

/**
 * อัปเดตราคาเฉพาะสาขา หรือเปิด/ปิดขายของหมดเฉพาะสาขา
 *
 * @param request - คำขอที่มี body เป็น JSON ตาม branchMenuOverrideSchema
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireStaff('ADMIN');
  if (!auth.ok) return authFailureResponse(auth.reason);

  const branchId = parseId((await context.params).id);
  if (!branchId) return apiError(ERROR_CODES.VALIDATION_ERROR, 'รหัสสาขาไม่ถูกต้อง');

  if (auth.user.branchId && auth.user.branchId !== branchId) {
    return apiError(ERROR_CODES.FORBIDDEN, 'ไม่มีสิทธิ์แก้ไขเมนูของสาขาอื่น', 403);
  }

  const parsed = branchMenuOverrideSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, firstErrorMessage(parsed.error));
  }

  const { menuItemId, customPrice, isAvailable } = parsed.data;

  // หากไม่มี customPrice (เป็น null/undefined) และ isAvailable ตรงกับค่า default หรือต้องการ reset
  // เราใช้ INSERT ... ON DUPLICATE KEY UPDATE
  await execute(
    `INSERT INTO branch_menu_availability (branch_id, menu_item_id, custom_price, is_available)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       custom_price = VALUES(custom_price),
       is_available = VALUES(is_available)`,
    [
      branchId,
      menuItemId,
      customPrice !== undefined && customPrice !== null ? customPrice : null,
      isAvailable ? 1 : 0,
    ],
  );

  return apiOk({ branchId, menuItemId, customPrice, isAvailable });
}
