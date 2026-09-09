import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, apiError, authFailureResponse, ERROR_CODES } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { execute, query } from '@/lib/db';
import { categorySchema, firstErrorMessage } from '@/lib/validation';

/** แถวหมวดหมู่พร้อมจำนวนเมนูในหมวด ใช้บอกผู้ใช้ว่าลบจริงได้หรือต้องปิดใช้งานแทน */
export type CategoryRow = RowDataPacket & {
  id: number;
  name: string;
  sort_order: number;
  is_active: number;
  menu_item_count: number;
};

/**
 * อ่านหมวดหมู่ทั้งหมด เรียงตามลำดับที่ตั้งไว้ พร้อมนับจำนวนเมนูในแต่ละหมวด
 *
 * @returns รายการหมวดหมู่ทั้งหมด หรือ error เมื่อสิทธิ์ไม่ผ่าน
 */
export async function GET() {
  const auth = await requireStaff();
  if (!auth.ok) return authFailureResponse(auth.reason);

  const rows = await query<CategoryRow>(
    `SELECT c.id, c.name, c.sort_order, c.is_active,
            (SELECT COUNT(*) FROM menu_items m WHERE m.category_id = c.id) AS menu_item_count
       FROM categories c
      ORDER BY c.sort_order, c.id`,
  );
  return apiOk(rows);
}

/**
 * สร้างหมวดหมู่ใหม่ ใช้ได้เฉพาะแอดมินเพราะกระทบโครงเมนูทั้งร้าน
 *
 * @param request - คำขอที่มี body เป็น JSON ตาม categorySchema
 * @returns id ของหมวดหมู่ที่สร้าง หรือ error พร้อมข้อความไทย
 */
export async function POST(request: NextRequest) {
  const auth = await requireStaff('ADMIN');
  if (!auth.ok) return authFailureResponse(auth.reason);

  const parsed = categorySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, firstErrorMessage(parsed.error));
  }

  const { name, sortOrder, isActive } = parsed.data;
  const result = await execute(
    'INSERT INTO categories (name, sort_order, is_active) VALUES (?, ?, ?)',
    [name, sortOrder, isActive ? 1 : 0],
  );
  return apiOk({ id: result.insertId }, 201);
}
