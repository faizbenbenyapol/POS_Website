import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, apiError, authFailureResponse, ERROR_CODES } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { execute, query } from '@/lib/db';
import { menuItemSchema, firstErrorMessage } from '@/lib/validation';

/** แถวเมนูพร้อมชื่อหมวดและจำนวนครั้งที่เคยถูกสั่ง ใช้ตัดสินว่าลบจริงได้ไหม */
export type MenuItemRow = RowDataPacket & {
  id: number;
  category_id: number;
  category_name: string;
  name: string;
  description: string | null;
  price: string;
  image_url: string | null;
  is_available: number;
  order_count: number;
  /** ต้นทุนวัตถุดิบต่อจานจากสูตร null คือเมนูที่ยังไม่มีสูตร */
  unit_cost: string | null;
  /** จำนวนกลุ่มตัวเลือก (เผ็ดน้อย / พิเศษ / ท็อปปิ้ง) ของเมนู */
  option_group_count: number;
};

/**
 * อ่านรายการเมนู กรองตามหมวดหมู่และค้นหาจากชื่อได้
 * ใช้ LIKE กับพารามิเตอร์ที่ผูกผ่าน prepared statement ไม่ต่อสตริง SQL เอง
 *
 * @param request - คำขอที่อาจมี query string categoryId และ q
 * @returns รายการเมนูที่ตรงเงื่อนไข
 */
export async function GET(request: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return authFailureResponse(auth.reason);

  const params = request.nextUrl.searchParams;
  const categoryId = Number(params.get('categoryId') ?? 0);
  const keyword = (params.get('q') ?? '').trim();

  const rows = await query<MenuItemRow>(
    `SELECT m.id, m.category_id, c.name AS category_name, m.name, m.description,
            m.price, m.image_url, m.is_available,
            (SELECT COUNT(*) FROM order_items oi WHERE oi.menu_item_id = m.id) AS order_count,
            (SELECT ROUND(SUM(r.quantity * i.cost_per_unit), 2)
               FROM menu_recipes r JOIN ingredients i ON i.id = r.ingredient_id
              WHERE r.menu_item_id = m.id AND i.is_active = 1) AS unit_cost,
            (SELECT COUNT(*) FROM menu_option_groups g WHERE g.menu_item_id = m.id) AS option_group_count
       FROM menu_items m
       JOIN categories c ON c.id = m.category_id
      WHERE (? = 0 OR m.category_id = ?)
        AND (? = '' OR m.name LIKE CONCAT('%', ?, '%'))
      ORDER BY c.sort_order, m.name`,
    [categoryId, categoryId, keyword, keyword],
  );
  return apiOk(rows);
}

/**
 * เพิ่มเมนูใหม่ ใช้ได้เฉพาะแอดมินเพราะกระทบราคาที่ลูกค้าเห็น
 *
 * @param request - คำขอที่มี body เป็น JSON ตาม menuItemSchema
 * @returns id ของเมนูที่สร้าง หรือ error พร้อมข้อความไทย
 */
export async function POST(request: NextRequest) {
  const auth = await requireStaff('ADMIN');
  if (!auth.ok) return authFailureResponse(auth.reason);

  const parsed = menuItemSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, firstErrorMessage(parsed.error));
  }

  const { categoryId, name, description, price, imageUrl, isAvailable } = parsed.data;
  const category = await query<RowDataPacket & { id: number }>(
    'SELECT id FROM categories WHERE id = ? LIMIT 1',
    [categoryId],
  );
  if (category.length === 0) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, 'ไม่พบหมวดหมู่ที่เลือก กรุณาเลือกหมวดหมู่ใหม่');
  }

  const result = await execute(
    `INSERT INTO menu_items (category_id, name, description, price, image_url, is_available)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [categoryId, name, description || null, price, imageUrl || null, isAvailable ? 1 : 0],
  );
  return apiOk({ id: result.insertId }, 201);
}
