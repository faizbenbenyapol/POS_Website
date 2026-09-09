'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { TableSkeleton, EmptyState, ErrorState } from '@/components/DataState';
import { apiFetch } from '@/lib/client';
import { formatBaht, formatBahtWithSign } from '@/lib/format';
import { readCart, writeCart, addToCart, cartTotal, type CartItem } from '@/lib/cart';

/** หมวดหมู่ที่ลูกค้าเห็นบนแถบเลื่อนแนวนอน */
type Category = { id: number; name: string };

/** เมนู 1 รายการที่ลูกค้าเลือกได้ */
type MenuItem = {
  id: number;
  category_id: number;
  name: string;
  description: string | null;
  price: string;
};

/**
 * หน้าเมนูของลูกค้า จุดเริ่มต้นหลังสแกน QR
 * เรียก /api/public/tables/[token] ก่อนเสมอ เพราะการเรียกนั้นคือสิ่งที่เปิดรอบการนั่งให้โต๊ะ
 *
 * @param params - พารามิเตอร์เส้นทางที่มี token ของโต๊ะ
 * @returns หน้าเมนูพร้อมแถบหมวดหมู่และแถบตะกร้าล่างจอ
 */
export default function CustomerMenuPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[] | null>(null);
  const [activeCategory, setActiveCategory] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [justAdded, setJustAdded] = useState(0);

  /**
   * เปิดรอบการนั่งของโต๊ะแล้วโหลดเมนูที่เปิดขายอยู่
   * ทำสองอย่างในฟังก์ชันเดียวเพราะหน้านี้ใช้งานไม่ได้ถ้าขาดอย่างใดอย่างหนึ่ง
   *
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือเปิด session และปรับ state ของเมนู
   */
  const load = useCallback(async () => {
    setItems(null);
    setLoadError('');
    const session = await apiFetch(`/api/public/tables/${token}`);
    if (!session.ok) {
      setLoadError(session.message);
      return;
    }
    const menu = await apiFetch<{ categories: Category[]; items: MenuItem[] }>('/api/public/menu');
    if (!menu.ok) {
      setLoadError(menu.message);
      return;
    }
    setCategories(menu.data.categories);
    setItems(menu.data.items);
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setCart(readCart(token));
  }, [token]);

  /**
   * เพิ่มเมนูลงตะกร้าแล้วบันทึกทันที เพื่อให้กดเปลี่ยนหน้าไปตะกร้าแล้วของยังอยู่ครบ
   * แสดงคำว่า "เพิ่มแล้ว" สั้น ๆ ที่ปุ่มเพื่อยืนยันว่าการกดมีผล
   *
   * @param item - เมนูที่ลูกค้ากดเพิ่ม
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือเขียนตะกร้าลง localStorage
   */
  function handleAdd(item: MenuItem) {
    const next = addToCart(cart, {
      menuItemId: item.id,
      name: item.name,
      price: Number(item.price),
    });
    setCart(next);
    writeCart(token, next);
    setJustAdded(item.id);
    window.setTimeout(() => setJustAdded(0), 1200);
  }

  const visibleItems =
    items?.filter((item) => activeCategory === 0 || item.category_id === activeCategory) ?? [];
  const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="flex flex-col gap-4">
      {loadError && <ErrorState message={loadError} onRetry={load} />}
      {!loadError && items === null && <TableSkeleton rows={6} />}

      {!loadError && items !== null && (
        <>
          <div className="-mx-4 overflow-x-auto px-4">
            <div className="flex gap-2">
              {[{ id: 0, name: 'ทั้งหมด' }, ...categories].map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setActiveCategory(category.id)}
                  aria-pressed={activeCategory === category.id}
                  className={`min-h-[44px] shrink-0 rounded-sm border px-4 whitespace-nowrap ${
                    activeCategory === category.id
                      ? 'border-slip bg-griddle text-slip'
                      : 'border-rule text-slip-dim'
                  }`}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>

          {visibleItems.length === 0 && (
            <EmptyState message="หมวดนี้ยังไม่มีอาหารที่เปิดขายตอนนี้ — ลองเลือกหมวดอื่น หรือสอบถามพนักงาน" />
          )}

          <ul className="flex flex-col">
            {visibleItems.map((item) => (
              <li
                key={item.id}
                className="flex items-start gap-3 border-b border-rule py-3 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-slip">{item.name}</p>
                  {item.description && (
                    <p className="text-sm text-slip-dim">{item.description}</p>
                  )}
                  <p className="num mt-1 text-slip">{formatBaht(item.price)} บาท</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleAdd(item)}
                  className="min-h-[44px] min-w-[5.5rem] shrink-0 rounded-sm border border-rule px-3 text-slip"
                >
                  {justAdded === item.id ? 'เพิ่มแล้ว' : 'เพิ่ม'}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {totalCount > 0 && (
        <div className="fixed inset-x-0 bottom-14 z-10 border-t border-rule bg-char px-4 py-3">
          <Link
            href={`/t/${token}/cart`}
            className="mx-auto flex min-h-[44px] max-w-md items-center justify-between rounded-sm bg-flame px-4 font-medium text-char"
          >
            <span>ดูตะกร้า {totalCount} รายการ</span>
            <span className="num">{formatBahtWithSign(cartTotal(cart))}</span>
          </Link>
        </div>
      )}
    </div>
  );
}
