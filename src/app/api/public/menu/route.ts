import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, apiError, serverError, ERROR_CODES } from '@/lib/api';
import { query } from '@/lib/db';

type CategoryRow = RowDataPacket & { id: number; name: string };
type MenuRow = RowDataPacket & {
  id: number;
  category_id: number;
  name: string;
  description: string | null;
  price: string;
  image_url: string | null;
};

/**
 * คืนหมวดหมู่และเมนูที่เปิดขายอยู่ โดยยิงคำสั่ง SQL ขนานกันพร้อมกัน
 */
export async function GET() {
  try {
    const [categories, items] = await Promise.all([
      query<CategoryRow>(
        'SELECT id, name FROM categories WHERE is_active = 1 ORDER BY sort_order, id',
      ),
      query<MenuRow>(
        `SELECT m.id, m.category_id, m.name, m.description, m.price, m.image_url
           FROM menu_items m
           JOIN categories c ON c.id = m.category_id
          WHERE m.is_available = 1 AND c.is_active = 1
          ORDER BY c.sort_order, m.name`,
      ),
    ]);
    return apiOk({ categories, items });
  } catch (err) {
    return serverError(err, 'GET /api/public/menu');
  }
}
