import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, serverError } from '@/lib/api';
import { query } from '@/lib/db';
import { findTableSession } from '@/lib/session';

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
 * คืนหมวดหมู่และเมนูที่เปิดขายอยู่
 * หากส่ง token ของโต๊ะมา จะคำนวณราคาพิเศษและสถานะเปิด/ปิดเฉพาะสาขาของโต๊ะนั้น
 *
 * @param request - คำขอที่อาจมี query parameter token
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')?.trim();
    let branchId: number | null = null;

    if (token) {
      const sessionResult = await findTableSession(token);
      if (sessionResult.ok) {
        branchId = sessionResult.branchId;
      }
    }

    const categoriesPromise = query<CategoryRow>(
      'SELECT id, name FROM categories WHERE is_active = 1 ORDER BY sort_order, id',
    );

    let itemsPromise;
    if (branchId) {
      // เมนูที่คำนวณราคาพิเศษและสถานะของสาขานั้น
      itemsPromise = query<MenuRow>(
        `SELECT m.id, m.category_id, m.name, m.description,
                COALESCE(bma.custom_price, m.price) AS price,
                m.image_url
           FROM menu_items m
           JOIN categories c ON c.id = m.category_id
           LEFT JOIN branch_menu_availability bma
             ON bma.menu_item_id = m.id AND bma.branch_id = ?
          WHERE c.is_active = 1
            AND (
              (bma.is_available IS NULL AND m.is_available = 1)
              OR (bma.is_available = 1)
            )
          ORDER BY c.sort_order, m.name`,
        [branchId],
      );
    } else {
      // เมนูมาตรฐานของ Master Catalog
      itemsPromise = query<MenuRow>(
        `SELECT m.id, m.category_id, m.name, m.description, m.price, m.image_url
           FROM menu_items m
           JOIN categories c ON c.id = m.category_id
          WHERE m.is_available = 1 AND c.is_active = 1
          ORDER BY c.sort_order, m.name`,
      );
    }

    const [categories, items] = await Promise.all([categoriesPromise, itemsPromise]);
    return apiOk({ categories, items });
  } catch (err) {
    return serverError(err, 'GET /api/public/menu');
  }
}
