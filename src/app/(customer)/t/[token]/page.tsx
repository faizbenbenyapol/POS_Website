'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { TableSkeleton, EmptyState, ErrorState } from '@/components/DataState';
import MenuItemThumb from '@/components/MenuItemThumb';
import { SearchIcon, PlusIcon, CheckIcon, CartIcon, CloseIcon } from '@/components/Icons';
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
  image_url: string | null;
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
    const [sessionRes, menuRes] = await Promise.all([
      apiFetch(`/api/public/tables/${token}`),
      apiFetch<{ categories: Category[]; items: MenuItem[] }>('/api/public/menu'),
    ]);

    if (!sessionRes.ok) {
      setLoadError(sessionRes.message);
      return;
    }
    if (!menuRes.ok) {
      setLoadError(menuRes.message);
      return;
    }

    setCategories(menuRes.data.categories);
    setItems(menuRes.data.items);
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

  const [searchQuery, setSearchQuery] = useState('');

  const visibleItems =
    items?.filter((item) => {
      const matchCat = activeCategory === 0 || item.category_id === activeCategory;
      const matchSearch =
        !searchQuery ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchCat && matchSearch;
    }) ?? [];
  const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="flex flex-col gap-0 pb-24">
      {loadError && <ErrorState message={loadError} onRetry={load} />}
      {!loadError && items === null && <TableSkeleton rows={6} />}

      {!loadError && items !== null && (
        <>
          {/* แถบค้นหา + แถบหมวดหมู่ — sticky ติดหัวหน้าจอตลอด */}
          <div className="sticky top-0 z-10 -mx-4 bg-char px-4 pb-2 pt-3 shadow-sm">
            {/* ช่องค้นหาเมนูอาหาร */}
            <div className="relative mb-2.5">
              <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slip-dim pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหาเมนูอาหารอร่อย..."
                className="min-h-[42px] w-full rounded-full border border-rule bg-white pl-10 pr-10 text-sm text-slip placeholder:text-slip-dim focus:border-[#06C755] focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-xs text-slip-dim hover:bg-rule"
                >
                  <CloseIcon className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* แถบหมวดหมู่เลื่อนแนวนอน */}
            <div className="-mx-4 overflow-x-auto px-4 pb-1">
              <div className="flex gap-2">
                {[{ id: 0, name: 'ทั้งหมด' }, ...categories].map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setActiveCategory(category.id)}
                    aria-pressed={activeCategory === category.id}
                    className={`min-h-[36px] shrink-0 rounded-full px-4 font-bold text-xs whitespace-nowrap transition-all ${
                      activeCategory === category.id
                        ? 'bg-[#06C755] text-white shadow-md shadow-[#06C755]/20'
                        : 'bg-white text-slip-dim border border-rule hover:border-[#06C755]/50'
                    }`}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {visibleItems.length === 0 && (
            <div className="pt-4">
              <EmptyState message="ไม่พบเมนูอาหารที่ตรงตามเงื่อนไข — ลองค้นหาด้วยคำอื่น หรือเลือกหมวดใหม่อีกครั้ง" />
            </div>
          )}

          {/* รายการเมนูอาหาร */}
          <ul className="flex flex-col gap-3 pt-3">
            {visibleItems.map((item) => (
              <li
                key={item.id}
                className="lm-card flex items-center gap-3.5 p-3.5 transition-all hover:border-[#06C755]/40"
              >
                <MenuItemThumb name={item.name} imageUrl={item.image_url} />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm text-slip">{item.name}</p>
                  {item.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-slip-dim">{item.description}</p>
                  )}
                  <p className="num mt-1 font-bold text-[#06C755] text-sm">
                    {formatBaht(item.price)} <span className="text-xs font-normal text-slip-dim">บาท</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleAdd(item)}
                  className={`min-h-[40px] min-w-[5.5rem] shrink-0 rounded-full px-3 text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1 ${
                    justAdded === item.id
                      ? 'bg-[#10B981] text-white shadow-sm'
                      : 'bg-[#06C755] text-white shadow-sm shadow-[#06C755]/20 hover:bg-[#00A040]'
                  }`}
                >
                  {justAdded === item.id ? (
                    <>
                      <CheckIcon className="w-4 h-4" />
                      <span>เพิ่มแล้ว</span>
                    </>
                  ) : (
                    <>
                      <PlusIcon className="w-4 h-4" />
                      <span>เพิ่ม</span>
                    </>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* แถบตะกร้าสินค้าลอยล่างจอ */}
      {totalCount > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-20 px-4">
          <Link
            href={`/t/${token}/cart`}
            className="mx-auto flex min-h-[52px] max-w-md items-center justify-between rounded-full lm-header-gradient px-5 font-bold text-white shadow-xl shadow-[#06C755]/30 transition-transform active:scale-95"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-black text-[#00A040]">
                {totalCount}
              </span>
              <span>ดูตะกร้าสั่งอาหาร</span>
            </div>
            <span className="num text-base">{formatBahtWithSign(cartTotal(cart))}</span>
          </Link>
        </div>
      )}
    </div>
  );
}

