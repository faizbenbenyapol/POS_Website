'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { TableSkeleton, EmptyState, ErrorState } from '@/components/DataState';
import MenuItemThumb from '@/components/MenuItemThumb';
import {
  SearchIcon,
  PlusIcon,
  MinusIcon,
  CheckIcon,
  CartIcon,
  CloseIcon,
  UtensilsIcon,
} from '@/components/Icons';
import { apiFetch } from '@/lib/client';
import { formatBaht, formatBahtWithSign } from '@/lib/format';
import {
  readCart,
  writeCart,
  addToCart,
  addCustomizedToCart,
  cartTotal,
  type CartItem,
} from '@/lib/cart';

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
  /** จำนวนคงเหลือของสาขา null คือขายได้ไม่จำกัด */
  stock_qty: number | null;
};

/** จำนวนคงเหลือที่ถือว่าใกล้หมด ต่ำกว่านี้จะขึ้นป้ายเตือนลูกค้าให้รีบสั่ง */
const LOW_STOCK_THRESHOLD = 5;

/** ตัวเลือกด่วนสำหรับใส่หมายเหตุพิเศษถึงทางร้าน สไตล์ LINE MAN */
const QUICK_NOTES = ['ไม่ใส่ผัก', 'เผ็ดน้อย', 'ขอเผ็ดๆ', 'ไม่หวาน', 'แยกน้ำ', 'ขอช้อนส้อม'];

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
  const [searchQuery, setSearchQuery] = useState('');

  // State สำหรับ LINE MAN Pop-up รายละเอียดอาหาร
  const [selectedItemForDetail, setSelectedItemForDetail] = useState<MenuItem | null>(null);
  const [detailQuantity, setDetailQuantity] = useState(1);
  const [detailNote, setDetailNote] = useState('');

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
      apiFetch<{ categories: Category[]; items: MenuItem[] }>(
        `/api/public/menu?token=${encodeURIComponent(token)}`,
      ),
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
   * เปิด Pop-up แสดงรายละเอียดอาหาร พร้อมให้เลือกจำนวนและระบุข้อความพิเศษ สไตล์ LINE MAN
   *
   * @param item - เมนูอาหารที่ลูกค้าคลิก
   */
  function openDetail(item: MenuItem) {
    setSelectedItemForDetail(item);
    setDetailQuantity(1);
    setDetailNote('');
  }

  /**
   * เพิ่มเมนูที่ปรับแต่งแล้ว (จำนวน + หมายเหตุ) ลงตะกร้า
   *
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือบันทึกตะกร้าลง localStorage และปิด Pop-up
   */
  function handleAddCustomized() {
    if (!selectedItemForDetail) return;
    const next = addCustomizedToCart(cart, {
      menuItemId: selectedItemForDetail.id,
      name: selectedItemForDetail.name,
      price: Number(selectedItemForDetail.price),
      quantity: detailQuantity,
      note: detailNote,
    });
    setCart(next);
    writeCart(token, next);
    const itemId = selectedItemForDetail.id;
    setSelectedItemForDetail(null);
    setJustAdded(itemId);
    window.setTimeout(() => setJustAdded(0), 1200);
  }

  /**
   * สลับการเพิ่ม/ลบแท็กด่วนลงในกล่องข้อความหมายเหตุ
   *
   * @param tag - ข้อความแท็กด่วน เช่น "ไม่ใส่ผัก"
   */
  function toggleQuickNote(tag: string) {
    setDetailNote((prev) => {
      const current = prev.trim();
      if (!current) return tag;
      const parts = current.split(/[,，、 ]+/).filter(Boolean);
      if (parts.includes(tag)) {
        return parts.filter((p) => p !== tag).join(', ');
      }
      return `${current}, ${tag}`;
    });
  }

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
          {/* ช่องค้นหาเมนูอาหาร (เลื่อนตามหน้าจอปกติ) */}
          <div className="relative mb-2 mt-1">
            <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slip-dim pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาเมนูอาหาร..."
              className="min-h-[42px] w-full rounded-full border border-rule bg-white pl-10 pr-10 text-sm text-slip placeholder:text-slip-dim focus:border-emerald-600 focus:outline-none shadow-xs"
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

          {/* แถบหมวดหมู่เลื่อนแนวนอน — sticky ติดใต้ Header (52px) ตลอดเวลาที่เลื่อนดูเมนู */}
          <div className="sticky top-[52px] z-20 -mx-4 bg-char px-4 py-2 border-b border-rule/70 shadow-xs">
            <div className="-mx-4 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex gap-2">
                {[{ id: 0, name: 'ทั้งหมด' }, ...categories].map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setActiveCategory(category.id)}
                    aria-pressed={activeCategory === category.id}
                    className={`min-h-[36px] shrink-0 rounded-full px-4 font-semibold text-xs whitespace-nowrap transition-colors cursor-pointer ${
                      activeCategory === category.id
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
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

          {/* รายการเมนูอาหาร — คลิกที่การ์ดเพื่อเปิดดูรายละเอียดอาหารแบบ LINE MAN */}
          <ul className="flex flex-col gap-3 pt-3">
            {visibleItems.map((item) => (
              <li
                key={item.id}
                onClick={() => openDetail(item)}
                className="lm-card flex items-center gap-3.5 p-3.5 transition-all hover:border-slate-300 cursor-pointer active:bg-zinc-50/80 group"
              >
                <MenuItemThumb name={item.name} imageUrl={item.image_url} />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm text-slip group-hover:text-emerald-700 transition-colors">
                    {item.name}
                  </p>
                  {item.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-slip-dim">{item.description}</p>
                  )}
                  <div className="mt-1 flex items-center gap-2">
                    <p className="num font-bold text-emerald-700 text-sm">
                      {formatBaht(item.price)} <span className="text-xs font-normal text-slip-dim">บาท</span>
                    </p>
                    {/* เตือนเมื่อของใกล้หมด ลูกค้าจะได้ไม่สั่งเกินจำนวนที่ครัวทำได้ */}
                    {item.stock_qty !== null && item.stock_qty <= LOW_STOCK_THRESHOLD && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                        เหลือ {item.stock_qty} ที่
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openDetail(item);
                  }}
                  className={`min-h-[38px] min-w-[5.2rem] shrink-0 rounded-full px-3 text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1 cursor-pointer ${
                    justAdded === item.id
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'bg-emerald-600 text-white shadow-xs hover:bg-emerald-700'
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
        <div className="fixed inset-x-0 bottom-18 z-20 px-4">
          <Link
            href={`/t/${token}/cart`}
            className="mx-auto flex min-h-[52px] max-w-md items-center justify-between rounded-2xl bg-slate-900 px-5 font-bold text-white shadow-xl border border-slate-800 transition-transform active:scale-98"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                {totalCount}
              </span>
              <span className="text-sm">ดูตะกร้าสั่งอาหาร</span>
            </div>
            <span className="num text-base font-bold text-emerald-400">{formatBahtWithSign(cartTotal(cart))}</span>
          </Link>
        </div>

      {/* LINE MAN Style Food Detail Modal / Bottom Sheet */}
      {selectedItemForDetail && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setSelectedItemForDetail(null)}
            aria-hidden="true"
          />

          {/* Modal Panel */}
          <div className="relative z-10 w-full max-w-md max-h-[90vh] flex flex-col bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200">
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setSelectedItemForDetail(null)}
              className="absolute right-3.5 top-3.5 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-xs hover:bg-black/60 transition-all active:scale-95 shadow-sm"
              aria-label="ปิด"
            >
              <CloseIcon className="w-4 h-4" />
            </button>

            {/* Food Image */}
            <div className="relative w-full h-52 sm:h-60 bg-zinc-100 shrink-0 overflow-hidden">
              {selectedItemForDetail.image_url ? (
                <img
                  src={selectedItemForDetail.image_url}
                  alt={selectedItemForDetail.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400 bg-gradient-to-br from-zinc-100 to-zinc-200">
                  <UtensilsIcon className="w-12 h-12 mb-1 opacity-40" />
                  <span className="text-xs">ไม่มีรูปภาพอาหาร</span>
                </div>
              )}
            </div>

            {/* Scrollable Details */}
            <div className="overflow-y-auto p-4 sm:p-5 flex-1 space-y-4">
              {/* Dish Name & Price */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-black text-slip leading-snug">
                    {selectedItemForDetail.name}
                  </h3>
                  {selectedItemForDetail.description && (
                    <p className="mt-1 text-xs text-slip-dim leading-relaxed">
                      {selectedItemForDetail.description}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <span className="num text-lg font-black text-emerald-700">
                    ฿{formatBaht(selectedItemForDetail.price)}
                  </span>
                </div>
              </div>

              <div className="border-t border-rule" />

              {/* Notes / Special Instructions */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slip">รายละเอียดเพิ่มเติมถึงร้านค้า</span>
                  <span className="text-[11px] text-slip-dim">ไม่บังคับ</span>
                </div>

                {/* Quick Note Chips */}
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_NOTES.map((qNote) => {
                    const isSelected = detailNote.includes(qNote);
                    return (
                      <button
                        key={qNote}
                        type="button"
                        onClick={() => toggleQuickNote(qNote)}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 font-semibold shadow-xs'
                            : 'bg-slate-100 text-slate-600 border border-transparent hover:border-slate-300'
                        }`}
                      >
                        {isSelected ? qNote : `+ ${qNote}`}
                      </button>
                    );
                  })}
                </div>

                {/* Note Textarea */}
                <textarea
                  value={detailNote}
                  onChange={(e) => setDetailNote(e.target.value)}
                  placeholder="ระบุข้อความ เช่น เผ็ดน้อย, ไม่ใส่ผักชี, ขอช้อนส้อม..."
                  maxLength={150}
                  rows={2}
                  className="w-full rounded-xl border border-rule bg-zinc-50/50 p-3 text-xs text-slip placeholder:text-zinc-400 focus:bg-white focus:border-emerald-600 focus:outline-none resize-none transition-colors"
                />
                <p className="text-right text-[10px] text-slip-dim">
                  {detailNote.length}/150 ตัวอักษร
                </p>
              </div>
            </div>

            {/* Bottom Action Bar */}
            <div className="sticky bottom-0 border-t border-rule bg-white p-3.5 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
              <div className="flex items-center gap-3">
                {/* Stepper */}
                <div className="flex items-center gap-2 rounded-full border border-rule bg-zinc-50 p-1">
                  <button
                    type="button"
                    disabled={detailQuantity <= 1}
                    onClick={() => setDetailQuantity((q) => Math.max(1, q - 1))}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slip shadow-xs hover:bg-zinc-100 disabled:opacity-40 disabled:hover:bg-white active:scale-95 transition-all"
                    aria-label="ลดจำนวน"
                  >
                    <MinusIcon className="w-3.5 h-3.5" />
                  </button>
                  <span className="num min-w-[20px] text-center text-sm font-black text-slip">
                    {detailQuantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDetailQuantity((q) => q + 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xs hover:bg-emerald-700 active:scale-95 transition-all cursor-pointer"
                    aria-label="เพิ่มจำนวน"
                  >
                    <PlusIcon className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Add to Cart Button */}
                <button
                  type="button"
                  onClick={handleAddCustomized}
                  className="flex min-h-[46px] flex-1 items-center justify-between rounded-full bg-emerald-600 px-5 font-bold text-white shadow-xs hover:bg-emerald-700 active:scale-98 transition-all cursor-pointer"
                >
                  <span className="text-sm">ใส่ตะกร้า</span>
                  <span className="num text-sm font-black">
                    ฿{formatBaht(Number(selectedItemForDetail.price) * detailQuantity)}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
