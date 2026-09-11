'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { EmptyState } from '@/components/DataState';
import { apiFetch, jsonBody } from '@/lib/client';
import { formatBaht, formatBahtWithSign } from '@/lib/format';
import { readCart, writeCart, cartTotal, type CartItem } from '@/lib/cart';

/** รายการข้อความด่วนสำหรับระบุหมายเหตุอาหาร */
const PRESET_NOTES = [
  { label: 'เผ็ดน้อย', value: 'เผ็ดน้อย' },
  { label: 'เผ็ดมาก', value: 'เผ็ดมาก' },
  { label: 'ไม่ใส่ผัก', value: 'ไม่ใส่ผัก' },
  { label: 'เพิ่มไข่ดาว', value: 'เพิ่มไข่ดาว' },
  { label: 'พิเศษ', value: 'พิเศษ' },
  { label: 'ไม่หวาน', value: 'ไม่หวาน' },
];

/**
 * สลับ/เพิ่ม/ลดข้อความด่วนลงในหมายเหตุของรายการอาหาร
 *
 * @param currentNote - หมายเหตุปัจจุบัน
 * @param value - ข้อความด่วนที่จะสลับ
 * @returns หมายเหตุฉบับอัปเดต
 */
function togglePresetNote(currentNote: string, value: string): string {
  const parts = currentNote
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.includes(value)) {
    const filtered = parts.filter((p) => p !== value);
    return filtered.join(', ');
  } else {
    return [...parts, value].join(', ');
  }
}

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
   * @param index - ลำดับของรายการในตะกร้าที่จะปรับจำนวน
   * @param delta - จำนวนที่เปลี่ยน เช่น +1 หรือ -1
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือปรับตะกร้า
   */
  function changeQuantity(index: number, delta: number) {
    const next = items
      .map((item, idx) =>
        idx === index ? { ...item, quantity: item.quantity + delta } : item,
      )
      .filter((item) => item.quantity > 0);
    updateCart(next);
  }

  /**
   * บันทึกหมายเหตุของรายการหนึ่ง เช่น "ไม่ใส่ผัก" หรือ "เผ็ดน้อย"
   *
   * @param index - ลำดับของรายการในตะกร้าที่จะใส่หมายเหตุ
   * @param note - ข้อความหมายเหตุ
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือปรับตะกร้า
   */
  function changeNote(index: number, note: string) {
    updateCart(
      items.map((item, idx) => (idx === index ? { ...item, note } : item)),
    );
  }

  /**
   * ส่งตะกร้าไปสร้างออเดอร์จริง เมื่อสำเร็จจะล้างตะกร้าแล้วพาไปหน้าสถานะ
   * ล้างตะกร้าหลังสำเร็จเท่านั้น ถ้าพลาดต้องเหลือของไว้ให้ลูกค้ากดใหม่ได้
   *
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือสร้างออเดอร์และเปลี่ยนหน้า
   */
  async function handleSubmit() {
    if (items.length === 0 || submitting) return;
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
    return <div className="h-40 animate-pulse rounded-2xl bg-white" aria-label="กำลังเปิดตะกร้า" />;
  }

  if (items.length === 0) {
    return (
      <EmptyState
        message="ตะกร้ายังว่างอยู่ — กลับไปหน้าเมนูเพื่อเลือกอาหารที่อยากสั่ง"
        action={
          <Link
            href={`/t/${token}`}
            className="flex min-h-[46px] items-center rounded-xl bg-emerald-600 px-5 font-semibold text-white shadow-xs transition-colors hover:bg-emerald-700 cursor-pointer"
          >
            เลือกอาหาร
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-36">
      <h1 className="text-xl font-bold text-slip">ตะกร้าสั่งอาหารของโต๊ะนี้</h1>

      <ul className="flex flex-col gap-3">
        {items.map((item, index) => (
          <li key={`${item.menuItemId}-${index}`} className="lm-card p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 flex-1 font-bold text-sm text-slip">{item.name}</p>
              <p className="num shrink-0 font-bold text-emerald-700 text-sm">
                {formatBaht(item.price * item.quantity)}
              </p>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => changeQuantity(index, -1)}
                aria-label={`ลดจำนวน ${item.name}`}
                className="h-10 w-10 rounded-full border border-rule bg-char text-base font-bold text-slip hover:bg-rule"
              >
                −
              </button>
              <span className="num w-8 text-center font-bold text-slip">{item.quantity}</span>
              <button
                type="button"
                onClick={() => changeQuantity(index, 1)}
                aria-label={`เพิ่มจำนวน ${item.name}`}
                className="h-10 w-10 rounded-full border border-rule bg-char text-base font-bold text-slip hover:bg-rule"
              >
                +
              </button>
              <span className="num ml-auto text-xs font-medium text-slip-dim">
                {formatBaht(item.price)} / จาน
              </span>
            </div>

            <input
              value={item.note}
              onChange={(event) => changeNote(index, event.target.value)}
              placeholder="หมายเหตุ เช่น ไม่ใส่ผัก เผ็ดน้อย"
              aria-label={`หมายเหตุสำหรับ ${item.name}`}
              className="mt-3 min-h-[44px] w-full rounded-xl border border-rule bg-char px-3.5 text-xs text-slip placeholder:text-slip-dim focus:border-emerald-600 focus:outline-none transition-colors"
            />

            {/* แถบชิปข้อความด่วน */}
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {PRESET_NOTES.map((chip) => {
                const isSelected = item.note.includes(chip.value);
                return (
                  <button
                    key={chip.value}
                    type="button"
                    onClick={() => changeNote(index, togglePresetNote(item.note, chip.value))}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-100 border border-slate-200 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>

      {errorMessage && (
        <p role="alert" className="rounded-xl border-l-4 border-void bg-void/10 px-3 py-2 text-xs font-medium text-void">
          {errorMessage}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-16 z-20 px-4">
        <div className="mx-auto flex max-w-md flex-col gap-2.5 rounded-2xl bg-white border border-zinc-200 p-4 shadow-xl">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-bold text-slip-dim">ยอดเงินรวมสุทธิ</span>
            <span className="num text-xl font-black text-emerald-700">
              {formatBahtWithSign(cartTotal(items))}
            </span>
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="min-h-[50px] rounded-xl bg-emerald-600 px-4 font-bold text-sm text-white shadow-xs transition-colors hover:bg-emerald-700 disabled:opacity-80 cursor-pointer"
          >
            {submitting
              ? 'กำลังส่งไปที่ครัว…'
              : `ยืนยันสั่งอาหาร (${formatBahtWithSign(cartTotal(items))})`}
          </button>
        </div>
      </div>
    </div>
  );
}
