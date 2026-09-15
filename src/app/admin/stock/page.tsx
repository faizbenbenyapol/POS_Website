'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '@/components/Modal';
import { TableSkeleton, EmptyState, ErrorState, Notice } from '@/components/DataState';
import { NumberField, FormActions } from '@/components/Field';
import { apiFetch, jsonBody } from '@/lib/client';
import { BoxIcon, SearchIcon } from '@/components/Icons';

/** เมนู 1 รายการพร้อมจำนวนคงเหลือ ตามที่ GET /api/admin/stock คืนมา */
type StockItem = {
  menu_item_id: number;
  name: string;
  category_name: string;
  stock_qty: number | null;
  is_available: number;
  base_is_available: number;
};

/** ข้อมูลทั้งชุดของหน้าสต๊อก */
type StockResponse = {
  branchId: number;
  branchName: string;
  lowStockThreshold: number;
  items: StockItem[];
};

/** ตัวกรองมุมมองของหน้าสต๊อก */
type StockFilter = 'ALL' | 'LOW' | 'OUT' | 'UNLIMITED';

/** ตัวเลือกการกรอง พร้อมคำอธิบายภาษาไทยที่พนักงานอ่านแล้วเข้าใจทันที */
const FILTERS: { value: StockFilter; label: string }[] = [
  { value: 'ALL', label: 'ทั้งหมด' },
  { value: 'LOW', label: 'ใกล้หมด' },
  { value: 'OUT', label: 'หมดแล้ว' },
  { value: 'UNLIMITED', label: 'ไม่จำกัดจำนวน' },
];

/** งานที่กำลังทำกับเมนูที่เลือกอยู่ใน modal */
type StockAction = { item: StockItem; mode: 'SET' | 'ADD' };

/**
 * หน้าจัดการจำนวนคงเหลือของเมนูรายสาขา สำหรับพนักงานหน้าร้านและครัว
 *
 * ระบบตัดสต๊อกอัตโนมัติทุกครั้งที่ลูกค้าสั่ง และปิดขายให้เองเมื่อเหลือศูนย์
 * หน้านี้คือที่ที่ครัวมาบอกระบบว่า "วันนี้ทำได้กี่จาน" และ "เติมของเข้ามาอีกเท่าไร"
 * โดยเรียงเมนูที่เหลือน้อยที่สุดไว้บนสุดให้เห็นของที่กำลังจะหมดก่อนเสมอ
 *
 * @returns หน้าจอตารางจำนวนคงเหลือพร้อมปุ่มเติมของและตั้งจำนวน
 */
export default function StockPage() {
  const [data, setData] = useState<StockResponse | null>(null);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string }>({
    tone: 'success',
    message: '',
  });
  const [filter, setFilter] = useState<StockFilter>('ALL');
  const [search, setSearch] = useState('');
  const [action, setAction] = useState<StockAction | null>(null);
  const [quantity, setQuantity] = useState('0');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  /**
   * โหลดจำนวนคงเหลือของทุกเมนูในสาขาที่กำลังดูอยู่
   *
   * @param showSkeleton - true ให้ล้างข้อมูลเดิมแล้วโชว์โครงร่างระหว่างโหลด
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือปรับ state ของรายการและข้อความผิดพลาด
   */
  const load = useCallback(async (showSkeleton: boolean) => {
    if (showSkeleton) {
      setData(null);
      setLoadError('');
    }
    const result = await apiFetch<StockResponse>('/api/admin/stock');
    if (result.ok) {
      setData(result.data);
      setLoadError('');
    } else {
      setLoadError(result.message);
    }
  }, []);

  useEffect(() => {
    load(true);
  }, [load]);

  const threshold = data?.lowStockThreshold ?? 0;

  /** จำนวนเมนูที่หมดแล้วและที่ใกล้หมด ใช้โชว์เป็นสรุปบนหัวหน้าจอ */
  const summary = useMemo(() => {
    const items = data?.items ?? [];
    const tracked = items.filter((i) => i.stock_qty !== null);
    return {
      trackedCount: tracked.length,
      outCount: tracked.filter((i) => (i.stock_qty ?? 0) <= 0).length,
      lowCount: tracked.filter((i) => (i.stock_qty ?? 0) > 0 && (i.stock_qty ?? 0) <= threshold)
        .length,
    };
  }, [data, threshold]);

  /** รายการที่ผ่านตัวกรองและคำค้นหาแล้ว */
  const visibleItems = useMemo(() => {
    const items = data?.items ?? [];
    const keyword = search.trim().toLowerCase();
    return items.filter((item) => {
      if (keyword && !item.name.toLowerCase().includes(keyword)) return false;
      const qty = item.stock_qty;
      if (filter === 'UNLIMITED') return qty === null;
      if (filter === 'OUT') return qty !== null && qty <= 0;
      if (filter === 'LOW') return qty !== null && qty > 0 && qty <= threshold;
      return true;
    });
  }, [data, filter, search, threshold]);

  /**
   * เปิด modal กรอกจำนวน โดยตั้งค่าเริ่มต้นให้ตรงกับงานที่กำลังจะทำ
   *
   * @param item - เมนูที่เลือก
   * @param mode - SET คือตั้งจำนวนคงเหลือใหม่ ADD คือเติมของเพิ่มจากที่มีอยู่
   * @returns ไม่คืนค่า มีผลข้างเคียงคือเปิด modal และตั้งค่าในฟอร์ม
   */
  function openAction(item: StockItem, mode: 'SET' | 'ADD') {
    setAction({ item, mode });
    setQuantity(mode === 'SET' ? String(item.stock_qty ?? 0) : '1');
    setFormError('');
  }

  /**
   * ส่งคำสั่งแก้จำนวนคงเหลือไปที่เซิร์ฟเวอร์ แล้วโหลดตารางใหม่ทั้งชุด
   *
   * @param menuItemId - รหัสเมนูที่จะแก้
   * @param mode - วิธีแก้: ตั้งจำนวนใหม่ เติมของ หรือเลิกจำกัดจำนวน
   * @param qty - จำนวนที่ตั้งหรือเติม ไม่ต้องส่งเมื่อเลิกจำกัดจำนวน
   * @returns true เมื่อบันทึกสำเร็จ ใช้ตัดสินว่าจะปิด modal หรือคาไว้ให้แก้ต่อ
   */
  async function submitStock(
    menuItemId: number,
    mode: 'SET' | 'ADD' | 'UNLIMITED',
    qty?: number,
  ): Promise<boolean> {
    setSaving(true);
    const result = await apiFetch<{ stockAfter: number | null }>('/api/admin/stock', {
      method: 'PATCH',
      body: jsonBody({ menuItemId, mode, quantity: qty }),
    });
    setSaving(false);

    if (!result.ok) {
      setFormError(result.message);
      setNotice({ tone: 'error', message: result.message });
      return false;
    }

    const after = result.data.stockAfter;
    setNotice({
      tone: 'success',
      message:
        after === null
          ? 'เลิกจำกัดจำนวนของเมนูนี้แล้ว ลูกค้าสั่งได้ไม่จำกัดจำนวน'
          : after <= 0
            ? 'บันทึกแล้ว ของหมด ระบบปิดขายเมนูนี้ให้อัตโนมัติ'
            : `บันทึกแล้ว เมนูนี้เหลือ ${after} ที่`,
    });
    await load(false);
    return true;
  }

  /**
   * บันทึกจำนวนจากฟอร์มใน modal
   *
   * @param event - เหตุการณ์ submit ของฟอร์ม
   * @returns ไม่คืนค่า มีผลข้างเคียงคือบันทึกจำนวนและปิด modal เมื่อสำเร็จ
   */
  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!action) return;

    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 0) {
      setFormError('จำนวนต้องเป็นจำนวนเต็มและไม่ติดลบ');
      return;
    }
    if (action.mode === 'ADD' && qty <= 0) {
      setFormError('จำนวนที่เติมต้องมากกว่า 0');
      return;
    }

    const done = await submitStock(action.item.menu_item_id, action.mode, qty);
    if (done) setAction(null);
  }

  if (loadError) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold text-zinc-900">สต๊อกเมนู</h1>
        <ErrorState message={loadError} onRetry={() => load(true)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BoxIcon className="w-4 h-4 text-emerald-600" />
            <h1 className="text-lg font-semibold text-zinc-900">สต๊อกเมนู</h1>
            {data?.branchName && (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                {data.branchName}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-zinc-400">
            ระบบตัดจำนวนให้เองทุกครั้งที่ลูกค้าสั่ง และปิดขายอัตโนมัติเมื่อเหลือศูนย์
          </p>
        </div>
      </div>

      {notice.message && (
        <Notice
          tone={notice.tone}
          message={notice.message}
          onDismiss={() => setNotice({ tone: 'success', message: '' })}
        />
      )}

      {/* สรุปสิ่งที่ต้องรีบจัดการก่อน: ของหมดและของใกล้หมด */}
      {data && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-xs font-semibold text-red-700">หมดแล้ว (ปิดขายอยู่)</p>
            <p className="num mt-0.5 text-xl font-bold text-red-700">{summary.outCount} เมนู</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-800">
              ใกล้หมด (เหลือ {threshold} ที่หรือน้อยกว่า)
            </p>
            <p className="num mt-0.5 text-xl font-bold text-amber-800">{summary.lowCount} เมนู</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-3">
            <p className="text-xs font-semibold text-zinc-600">เมนูที่นับจำนวนอยู่</p>
            <p className="num mt-0.5 text-xl font-bold text-zinc-700">
              {summary.trackedCount} เมนู
            </p>
          </div>
        </div>
      )}

      {/* ตัวกรองและช่องค้นหา */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              className={`min-h-[36px] rounded-xl border px-3 text-xs font-semibold transition-colors cursor-pointer ${
                filter === option.value
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  : 'border-rule bg-white text-slip-dim hover:bg-zinc-50'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="relative ml-auto w-full sm:w-64">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 w-3.5 h-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ค้นหาชื่อเมนู"
            className="min-h-[36px] w-full rounded-xl border border-rule bg-white pl-9 pr-3 text-xs text-slip placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none"
          />
        </div>
      </div>

      {!data ? (
        <TableSkeleton rows={8} />
      ) : visibleItems.length === 0 ? (
        <EmptyState
          message={
            search.trim() || filter !== 'ALL'
              ? 'ไม่มีเมนูที่ตรงกับตัวกรองนี้ ลองเปลี่ยนตัวกรองหรือล้างคำค้นหา'
              : 'ยังไม่มีเมนูในระบบ กรุณาเพิ่มเมนูที่หน้าเมนูอาหารก่อน'
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-rule bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-rule bg-char text-left text-xs text-slip-dim">
                <th className="px-3 py-2.5 font-semibold">เมนู</th>
                <th className="px-3 py-2.5 font-semibold">หมวดหมู่</th>
                <th className="px-3 py-2.5 font-semibold text-right">คงเหลือ</th>
                <th className="px-3 py-2.5 font-semibold">สถานะขาย</th>
                <th className="px-3 py-2.5 font-semibold text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule/60">
              {visibleItems.map((item) => {
                const qty = item.stock_qty;
                const isOut = qty !== null && qty <= 0;
                const isLow = qty !== null && qty > 0 && qty <= threshold;

                return (
                  <tr key={item.menu_item_id} className={isOut ? 'bg-red-50/40' : isLow ? 'bg-amber-50/40' : ''}>
                    <td className="px-3 py-2.5 font-semibold text-slip">{item.name}</td>
                    <td className="px-3 py-2.5 text-xs text-slip-dim">{item.category_name}</td>
                    <td className="px-3 py-2.5 text-right">
                      {qty === null ? (
                        <span className="text-xs text-slip-dim">ไม่จำกัด</span>
                      ) : (
                        <span
                          className={`num font-bold ${
                            isOut ? 'text-red-700' : isLow ? 'text-amber-700' : 'text-slip'
                          }`}
                        >
                          {qty}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          item.is_available === 1
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-zinc-100 text-zinc-600'
                        }`}
                      >
                        {item.is_available === 1 ? 'เปิดขาย' : 'ปิดขาย'}
                      </span>
                      {item.base_is_available === 0 && (
                        <span className="ml-1.5 text-xs text-slip-dim">(ปิดจากเมนูกลาง)</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {qty !== null && (
                          <button
                            type="button"
                            onClick={() => openAction(item, 'ADD')}
                            className="min-h-[34px] rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition-colors cursor-pointer"
                          >
                            เติมของ
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openAction(item, 'SET')}
                          className="min-h-[34px] rounded-lg border border-rule bg-white px-2.5 text-xs font-bold text-slip hover:bg-zinc-50 transition-colors cursor-pointer"
                        >
                          ตั้งจำนวน
                        </button>
                        {qty !== null && (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => submitStock(item.menu_item_id, 'UNLIMITED')}
                            className="min-h-[34px] rounded-lg border border-rule bg-white px-2.5 text-xs font-semibold text-slip-dim hover:bg-zinc-50 transition-colors cursor-pointer disabled:opacity-40"
                          >
                            เลิกจำกัด
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ฟอร์มกรอกจำนวน ใช้ร่วมกันทั้งการตั้งจำนวนใหม่และการเติมของ */}
      {action && (
        <Modal
          title={
            action.mode === 'ADD'
              ? `เติมของ: ${action.item.name}`
              : `ตั้งจำนวนคงเหลือ: ${action.item.name}`
          }
          open={Boolean(action)}
          onClose={() => setAction(null)}
          maxWidth="max-w-sm"
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <p className="rounded-xl bg-char px-3 py-2 text-xs text-slip-dim">
              {action.item.stock_qty === null
                ? 'ตอนนี้เมนูนี้ยังไม่จำกัดจำนวน ตั้งจำนวนแล้วระบบจะเริ่มตัดสต๊อกทุกครั้งที่ลูกค้าสั่ง'
                : `ตอนนี้เหลือ ${action.item.stock_qty} ที่ · ตั้งเป็น 0 เท่ากับสั่งปิดขายเมนูนี้`}
            </p>

            <NumberField
              id="stock-quantity"
              label={action.mode === 'ADD' ? 'จำนวนที่เติมเพิ่ม (ที่)' : 'จำนวนคงเหลือใหม่ (ที่)'}
              value={quantity}
              onChange={setQuantity}
              min={action.mode === 'ADD' ? 1 : 0}
            />

            <FormActions
              error={formError}
              saving={saving}
              onCancel={() => setAction(null)}
              submitLabel={action.mode === 'ADD' ? 'เติมของ' : 'บันทึกจำนวน'}
            />
          </form>
        </Modal>
      )}
    </div>
  );
}
