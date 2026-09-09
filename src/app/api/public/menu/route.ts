import type { RowDataPacket } from 'mysql2/promise';
import { apiOk } from '@/lib/api';
import { query } from '@/lib/db';

/** หมวดหมู่ที่เปิดใช้งาน สำหรับทำแถบหมวดหมู่บนหน้าลูกค้า */
type CategoryRow = RowDataPacket & { id: number; name: string };

/** เมนูที่เปิดขายอยู่ พร้อมบอกว่าอยู่หมวดไหน */
type MenuRow = RowDataPacket & {
  id: number;
  category_id: number;
  name: string;
  description: string | null;
  price: string;
  image_url: string | null;
};

/**
 * คืนหมวดหมู่และเมนูที่เปิดขายอยู่ สำหรับหน้าเมนูฝั่งลูกค้า
 * ไม่ต้องล็อกอินเพราะเป็นข้อมูลสาธารณะ (เมนูหน้าร้าน) และไม่มีข้อมูลของโต๊ะใดปนอยู่
 *
 * @returns { categories, items } ที่เรียงตามลำดับหมวดและชื่อเมนู
 */
export async function GET() {
  const categories = await query<CategoryRow>(
    'SELECT id, name FROM categories WHERE is_active = 1 ORDER BY sort_order, id',
  );
  const items = await query<MenuRow>(
    `SELECT m.id, m.category_id, m.name, m.description, m.price, m.image_url
       FROM menu_items m
       JOIN categories c ON c.id = m.category_id
      WHERE m.is_available = 1 AND c.is_active = 1
      ORDER BY c.sort_order, m.name`,
  );
  return apiOk({ categories, items });
}
