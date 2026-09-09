'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { EmptyState } from '@/components/DataState';
import { apiFetch, jsonBody } from '@/lib/client';
import { formatBaht, formatBahtWithSign } from '@/lib/format';
import { readCart, writeCart, cartTotal, type CartItem } from '@/lib/cart';

/**
 * หน้าตะกร้าของลูกค้า แก้จำนวน ใส่หมายเหตุรายรายการ แล้วกดยืนยันสั่ง
 * ยอดรวมตรึงไว้ล่างจอเพื่อให้เห็นตลอดขณะเลื่อนดูรายการ
 *
 * @param params - พารามิเตอร์เส้นทางที่มี token ของโต๊ะ
 * @returns หน้าตะกร้าพร้อมปุ่มยืนยันสั่ง
 */
export default function CartPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setItems(readCart(token));
    setReady(true);
  }, [token]);

  /**
   * ปรับตะกร้าแล้วบันทึกลง localStorage ทันที
   * รวมสองขั้นไว้ที่เดียวเพื่อไม่ให้ลืมบันทึกจนตะกร้าหายตอนเปลี่ยนหน้า
   *
   * @param next - ตะกร้าชุดใหม่
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือเขียนตะกร้าลง localStorage
   */
  function updateCart(next: CartItem[]) {
    setItems(next);
    writeCart(token, next);
  }

  /**
   * เปลี่ยนจำนวนของรายการหนึ่ง ถ้าลดจนเหลือ 0 ให้เอาออกจากตะกร้าไปเลย
   *
   * @param menuItemId - รหัสเมนูที่จะปรับจำนวน
   * @param delta - จำนวนที่เปลี่ยน เช่น +1 หรือ -1
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือปรับตะกร้า
   */
  function changeQuantity(menuItemId: number, delta: number) {
    const next = items
      .map((item) =>
        item.menuItemId === menuItemId
          ? { ...item, quantity: item.quantity + delta }
          : item,
      )
      .filter((item) => item.quantity > 0);
    updateCart(next);
  }

  /**
   * บันทึกหมายเหตุของรายการหนึ่ง เช่น "ไม่ใส่ผัก" หรือ "เผ็ดน้อย"
   *
   * @param menuItemId - รหัสเมนูที่จะใส่หมายเหตุ
   * @param note - ข้อความหมายเหตุ
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือปรับตะกร้า
   */
  function changeNote(menuItemId: number, note: string) {
    updateCart(
      items.map((item) => (item.menuItemId === menuItemId ? { ...item, note } : item)),
    );
  }

  /**
   * ส่งตะกร้าไปสร้างออเดอร์จริง เมื่อสำเร็จจะล้างตะกร้าแล้วพาไปหน้าสถานะ
   * ล้างตะกร้าหลังสำเร็จเท่านั้น ถ้าพลาดต้องเหลือของไว้ให้ลูกค้ากดใหม่ได้
   *
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือสร้างออเดอร์และเปลี่ยนหน้า
   */
  async function handleSubmit() {
    setSubmitting(true);
    setErrorMessage('');
    const result = await apiFetch<{ orderCode: string }>('/api/public/orders', {
      method: 'POST',
      body: jsonBody({
        token,
        items: items.map((item) => ({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          note: item.note,
        })),
      }),
    });
    setSubmitting(false);

    if (!result.ok) {
      setErrorMessage(result.message);
      return;
    }
    updateCart([]);
    router.push(`/t/${token}/status`);
  }

  if (!ready) {
    return <div className="h-40 animate-pulse rounded-sm bg-griddle" aria-label="กำลังเปิดตะกร้า" />;
  }

  if (items.length === 0) {
    return (
      <EmptyState
        message="ตะกร้ายังว่างอยู่ — กลับไปหน้าเมนูเพื่อเลือกอาหารที่อยากสั่ง"
        action={
          <Link
            href={`/t/${token}`}
            className="flex min-h-[44px] items-center rounded-sm bg-flame px-4 font-medium text-char"
          >
            เลือกอาหาร
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-32">
      <h1 className="text-xl font-semibold text-slip">ตะกร้าของโต๊ะนี้</h1>

      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={item.menuItemId} className="border-b border-rule py-3 last:border-b-0">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 flex-1 text-slip">{item.name}</p>
              <p className="num shrink-0 text-slip">{formatBaht(item.price * item.quantity)}</p>
            </div>

            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => changeQuantity(item.menuItemId, -1)}
                aria-label={`ลดจำนวน ${item.name}`}
                className="h-11 w-11 rounded-sm border border-rule text-slip"
              >
                −
              </button>
              <span className="num w-8 text-center text-slip">{item.quantity}</span>
              <button
                type="button"
                onClick={() => changeQuantity(item.menuItemId, 1)}
                aria-label={`เพิ่มจำนวน ${item.name}`}
                className="h-11 w-11 rounded-sm border border-rule text-slip"
              >
                +
              </button>
              <span className="num ml-auto text-sm text-slip-dim">
                {formatBaht(item.price)} / จาน
              </span>
            </div>

            <input
              value={item.note}
              onChange={(event) => changeNote(item.menuItemId, event.target.value)}
              placeholder="หมายเหตุ เช่น ไม่ใส่ผัก เผ็ดน้อย"
              aria-label={`หมายเหตุสำหรับ ${item.name}`}
              className="mt-2 min-h-[44px] w-full rounded-sm border border-rule bg-griddle px-3 text-slip placeholder:text-slip-dim"
            />
          </li>
        ))}
      </ul>

      {errorMessage && (
        <p role="alert" className="border-l-2 border-void bg-griddle px-3 py-2 text-slip">
          {errorMessage}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-14 z-10 border-t border-rule bg-char px-4 py-3">
        <div className="mx-auto flex max-w-md flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-slip-dim">ยอดรวม</span>
            <span className="num text-lg text-slip">{formatBahtWithSign(cartTotal(items))}</span>
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="min-h-[52px] rounded-sm bg-flame px-4 font-medium text-char disabled:opacity-60"
          >
            {submitting
              ? 'กำลังส่งไปที่ครัว…'
              : `ยืนยันสั่ง (${formatBahtWithSign(cartTotal(items))})`}
          </button>
        </div>
      </div>
    </div>
  );
}
