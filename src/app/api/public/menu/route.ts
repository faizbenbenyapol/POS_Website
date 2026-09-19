import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, serverError } from '@/lib/api';
import { query } from '@/lib/db';
import { findTableSession } from '@/lib/session';
import { loadOptionGroups } from '@/lib/menuOptionsStore';

type CategoryRow = RowDataPacket & { id: number; name: string };
type MenuRow = RowDataPacket & {
  id: number;
  category_id: number;
  name: string;
  description: string | null;
  price: string;
  image_url: string | null;
  /** จำนวนคงเหลือของสาขา null คือไม่จำกัดจำนวน */
  stock_qty: number | null;
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
                m.image_url,
                bma.stock_qty
           FROM menu_items m
           JOIN categories c ON c.id = m.category_id
           LEFT JOIN branch_menu_availability bma
             ON bma.menu_item_id = m.id AND bma.branch_id = ?
          WHERE c.is_active = 1
            AND m.is_available = 1
            AND COALESCE(bma.is_available, 1) = 1
            AND (bma.stock_qty IS NULL OR bma.stock_qty > 0)
          ORDER BY c.sort_order, m.name`,
        [branchId],
      );
    } else {
      // เมนูมาตรฐานของ Master Catalog
      itemsPromise = query<MenuRow>(
        `SELECT m.id, m.category_id, m.name, m.description, m.price, m.image_url,
                NULL AS stock_qty
           FROM menu_items m
           JOIN categories c ON c.id = m.category_id
          WHERE m.is_available = 1 AND c.is_active = 1
          ORDER BY c.sort_order, m.name`,
      );
    }

    const [categories, items] = await Promise.all([categoriesPromise, itemsPromise]);

    // แนบกลุ่มตัวเลือก (เผ็ดน้อย / พิเศษ / ท็อปปิ้ง) ที่เปิดใช้อยู่ให้แต่ละเมนู
    const optionGroups = await loadOptionGroups(
      items.map((item) => item.id),
      true,
    );
    const itemsWithOptions = items.map((item) => ({
      ...item,
      option_groups: (optionGroups.get(item.id) ?? []).map((group) => ({
        id: group.id,
        name: group.name,
        minSelect: group.minSelect,
        maxSelect: group.maxSelect,
        options: group.options.map((o) => ({ id: o.id, name: o.name, priceDelta: o.priceDelta })),
      })),
    }));

    return apiOk({ categories, items: itemsWithOptions });
  } catch (err) {
    return serverError(err, 'GET /api/public/menu');
  }
}
