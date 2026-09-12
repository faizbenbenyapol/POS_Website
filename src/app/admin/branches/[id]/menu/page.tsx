'use client';

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import type { BranchMenuItemRow } from '@/app/api/admin/branches/[id]/menu/route';
import type { Branch } from '@/lib/branch';
import { SearchIcon, FoodMenuIcon, CheckIcon } from '@/components/Icons';
import { useToast } from '@/components/Toast';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default function BranchMenuPage({ params }: PageProps) {
  const { id } = use(params);
  const branchId = Number(id);
  const { success: showSuccessToast, error: showErrorToast } = useToast();

  const [branch, setBranch] = useState<Branch | null>(null);
  const [items, setItems] = useState<BranchMenuItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState<number | 'ALL'>('ALL');
  const [savingId, setSavingId] = useState<number | null>(null);

  // Local edit states
  const [customPrices, setCustomPrices] = useState<Record<number, string>>({});
  const [availabilities, setAvailabilities] = useState<Record<number, boolean>>({});

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [bRes, mRes] = await Promise.all([
        fetch(`/api/admin/branches/${branchId}`),
        fetch(`/api/admin/branches/${branchId}/menu`),
      ]);
      const [bJson, mJson] = await Promise.all([bRes.json(), mRes.json()]);

      if (bJson.ok) setBranch(bJson.data);
      if (mJson.ok && Array.isArray(mJson.data)) {
        setItems(mJson.data);
        const prices: Record<number, string> = {};
        const avails: Record<number, boolean> = {};
        for (const item of mJson.data) {
          prices[item.id] = item.custom_price !== null ? String(item.custom_price) : '';
          avails[item.id] = item.is_available === 1;
        }
        setCustomPrices(prices);
        setAvailabilities(avails);
      }
    } catch {
      showErrorToast('ไม่สามารถโหลดข้อมูลเมนูของสาขาได้');
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleSaveItem(menuItemId: number) {
    setSavingId(menuItemId);
    const rawPrice = customPrices[menuItemId]?.trim();
    const customPrice = rawPrice ? Number(rawPrice) : null;
    const isAvailable = availabilities[menuItemId] ?? true;

    try {
      const res = await fetch(`/api/admin/branches/${branchId}/menu`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menuItemId, customPrice, isAvailable }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        showErrorToast(json.message || 'บันทึกไม่สำเร็จ');
        return;
      }
      showSuccessToast('บันทึกการตั้งค่าเมนูสำเร็จ');
    } catch {
      showErrorToast('เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setSavingId(null);
    }
  }

  const categories = Array.from(
    new Map(items.map((i) => [i.category_id, i.category_name])).entries(),
  );

  const filteredItems = items.filter((i) => {
    const matchCat = activeCat === 'ALL' || i.category_id === activeCat;
    const matchSearch =
      !search ||
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      (i.description && i.description.toLowerCase().includes(search.toLowerCase()));
    return matchCat && matchSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
            <Link href="/admin/branches" className="hover:text-zinc-800 transition">
              ← กลับหน้ารายการสาขา
            </Link>
          </div>
          <h1 className="text-xl font-bold text-slip flex items-center gap-2">
            <FoodMenuIcon className="w-5 h-5 text-emerald-600" />
            <span>
              ราคาและสต็อกเฉพาะสาขา: {branch ? `${branch.name} (${branch.code})` : `สาขา #${branchId}`}
            </span>
          </h1>
          <p className="text-xs text-slip-dim mt-0.5">
            ปรับราคาพิเศษเฉพาะสาขา (หากเว้นว่างจะใช้ราคาหลัก) และเปิด/ปิดของหมดเฉพาะสาขานี้
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white p-3 rounded-xl border border-rule shadow-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveCat('ALL')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
              activeCat === 'ALL'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/80'
            }`}
          >
            ทุกหมวดหมู่ ({items.length})
          </button>
          {categories.map(([catId, catName]) => (
            <button
              key={catId}
              type="button"
              onClick={() => setActiveCat(catId)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                activeCat === catId
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/80'
              }`}
            >
              {catName}
            </button>
          ))}
        </div>

        <div className="relative min-w-[220px]">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาเมนูอาหาร..."
            className="w-full rounded-lg border border-rule bg-zinc-50 pl-9 pr-3 py-1.5 text-xs text-zinc-800 placeholder:text-zinc-400 focus:bg-white focus:border-emerald-600 focus:outline-none"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-rule bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-rule bg-zinc-50/75 text-zinc-500 font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">เมนูอาหาร</th>
                <th className="px-4 py-3 text-center">หมวดหมู่</th>
                <th className="px-4 py-3 text-center">ราคาหลัก (Master)</th>
                <th className="px-4 py-3 text-center">ราคาเฉพาะสาขานี้ (บาท)</th>
                <th className="px-4 py-3 text-center">สถานะของในสาขา</th>
                <th className="px-4 py-3 text-right">บันทึก</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                    กำลังโหลดรายการเมนู...
                  </td>
                </tr>
              )}
              {!loading && filteredItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                    ไม่พบรายการอาหารที่ตรงกับเงื่อนไข
                  </td>
                </tr>
              )}
              {!loading &&
                filteredItems.map((item) => {
                  const hasCustom = customPrices[item.id]?.trim() !== '';
                  const isAvail = availabilities[item.id] ?? true;
                  const isSaving = savingId === item.id;

                  return (
                    <tr key={item.id} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-zinc-900">{item.name}</div>
                        {item.description && (
                          <div className="text-[11px] text-zinc-500 truncate max-w-xs">
                            {item.description}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="rounded bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                          {item.category_name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-zinc-500">
                        {Number(item.base_price).toLocaleString()} ฿
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <input
                            type="number"
                            value={customPrices[item.id] ?? ''}
                            onChange={(e) =>
                              setCustomPrices((prev) => ({ ...prev, [item.id]: e.target.value }))
                            }
                            placeholder={Number(item.base_price).toLocaleString()}
                            min={0}
                            className="w-24 rounded-md border border-rule bg-zinc-50 px-2 py-1 text-center font-mono text-xs text-zinc-800 focus:bg-white focus:border-emerald-600 focus:outline-none"
                          />
                          {hasCustom && (
                            <button
                              type="button"
                              onClick={() =>
                                setCustomPrices((prev) => ({ ...prev, [item.id]: '' }))
                              }
                              title="ล้างราคาพิเศษเพื่อกลับไปใช้ราคาหลัก"
                              className="text-[11px] text-zinc-400 hover:text-red-600 transition cursor-pointer"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            setAvailabilities((prev) => ({ ...prev, [item.id]: !isAvail }))
                          }
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
                            isAvail
                              ? 'bg-green-50 text-green-700 hover:bg-green-100'
                              : 'bg-red-50 text-red-700 hover:bg-red-100'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              isAvail ? 'bg-green-600' : 'bg-red-600'
                            }`}
                          />
                          <span>{isAvail ? 'เปิดขายปกติ' : 'ของหมดในสาขา'}</span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleSaveItem(item.id)}
                          disabled={isSaving}
                          className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50 transition cursor-pointer"
                        >
                          <CheckIcon className="w-3.5 h-3.5" />
                          <span>{isSaving ? '...' : 'บันทึก'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
