'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Modal from '@/components/Modal';
import { TableSkeleton, ErrorState } from '@/components/DataState';
import { CloseIcon, PlusIcon } from '@/components/Icons';
import { apiFetch, jsonBody } from '@/lib/client';
import { formatBaht } from '@/lib/format';
import { grossMargin, recipeUnitCost } from '@/lib/recipe';

/** วัตถุดิบในรายชื่อ ตามที่ GET /api/admin/ingredients คืนมา (เท่าที่หน้านี้ใช้) */
type IngredientOption = { id: number; name: string; unit: string; costPerUnit: number; isActive: boolean };

/** สูตรของเมนูตามที่ GET /api/admin/menu-items/[id]/recipe คืนมา */
type RecipeResponse = {
  price: number;
  lines: { ingredientId: number; quantity: number }[];
};

/** บรรทัดสูตร 1 บรรทัดในฟอร์ม เก็บปริมาณเป็นข้อความเพื่อให้พิมพ์ทศนิยมได้ลื่น */
type DraftLine = { key: number; ingredientId: string; quantity: string };

/**
 * หน้าต่างแก้สูตรของเมนู: หนึ่งจานใช้วัตถุดิบอะไรกี่หน่วย พร้อมคิดต้นทุนและกำไรขั้นต้นสด ๆ
 * สูตรนี้ใช้ตัดวัตถุดิบของสาขาทุกครั้งที่ลูกค้าสั่ง และแช่แข็งต้นทุนต่อจานไว้กับรายการอาหาร
 *
 * @param menuItem - เมนูที่กำลังแก้ null คือปิดหน้าต่าง
 * @param onClose - ปิดหน้าต่างโดยไม่บันทึก
 * @param onSaved - เรียกหลังบันทึกสำเร็จ
 * @returns หน้าต่างแก้สูตรและต้นทุน
 */
export default function RecipeEditor({
  menuItem,
  onClose,
  onSaved,
}: {
  menuItem: { id: number; name: string } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [ingredients, setIngredients] = useState<IngredientOption[] | null>(null);
  const [price, setPrice] = useState(0);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const menuItemId = menuItem?.id ?? null;

  useEffect(() => {
    if (menuItemId === null) return;
    let cancelled = false;
    setIngredients(null);
    setLoadError('');
    setSaveError('');
    Promise.all([
      apiFetch<RecipeResponse>(`/api/admin/menu-items/${menuItemId}/recipe`),
      apiFetch<{ items: IngredientOption[] }>('/api/admin/ingredients'),
    ]).then(([recipeRes, ingredientRes]) => {
      if (cancelled) return;
      if (!recipeRes.ok) return setLoadError(recipeRes.message);
      if (!ingredientRes.ok) return setLoadError(ingredientRes.message);
      setPrice(recipeRes.data.price);
      setLines(
        recipeRes.data.lines.map((l, i) => ({
          key: i,
          ingredientId: String(l.ingredientId),
          quantity: String(l.quantity),
        })),
      );
      setIngredients(ingredientRes.data.items);
    });
    return () => {
      cancelled = true;
    };
  }, [menuItemId]);

  const byId = new Map((ingredients ?? []).map((i) => [String(i.id), i]));
  const costLines = lines
    .map((l) => ({ line: l, ingredient: byId.get(l.ingredientId) }))
    .filter((x) => x.ingredient && x.ingredient.isActive)
    .map((x) => ({ quantity: Number(x.line.quantity) || 0, costPerUnit: x.ingredient!.costPerUnit }));
  const unitCost = recipeUnitCost(costLines);
  const margin = unitCost === null ? null : grossMargin(price, unitCost);

  /**
   * แก้บรรทัดสูตรหนึ่งบรรทัด
   *
   * @param key - คีย์ของบรรทัด
   * @param patch - ฟิลด์ที่ต้องการเปลี่ยน
   */
  function updateLine(key: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  /**
   * บันทึกสูตรทั้งชุด บรรทัดที่ยังไม่ได้เลือกวัตถุดิบจะถูกข้าม
   *
   * @param event - เหตุการณ์ submit ของฟอร์ม
   */
  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (menuItemId === null) return;
    setSaving(true);
    setSaveError('');
    const res = await apiFetch(`/api/admin/menu-items/${menuItemId}/recipe`, {
      method: 'PUT',
      body: jsonBody({
        lines: lines
          .filter((l) => l.ingredientId !== '')
          .map((l) => ({ ingredientId: Number(l.ingredientId), quantity: Number(l.quantity) || 0 })),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setSaveError(res.message);
      return;
    }
    onSaved();
  }

  const inputClass =
    'min-h-[40px] rounded-lg border border-rule bg-white px-2.5 text-sm text-slip focus:border-emerald-600 focus:outline-none';
  const activeIngredients = (ingredients ?? []).filter((i) => i.isActive);

  return (
    <Modal
      title={menuItem ? `สูตรและต้นทุน: ${menuItem.name}` : 'สูตรและต้นทุน'}
      open={menuItem !== null}
      onClose={onClose}
      maxWidth="max-w-2xl"
    >
      {loadError && <ErrorState message={loadError} onRetry={onClose} />}
      {!loadError && ingredients === null && <TableSkeleton rows={3} />}
      {!loadError && ingredients !== null && (
        <form onSubmit={handleSave} className="flex flex-col gap-4" noValidate>
          <p className="text-sm text-slip-dim">
            ใส่ปริมาณวัตถุดิบที่ใช้ต่อ 1 จาน ระบบจะคิดต้นทุนต่อจานและตัดวัตถุดิบของสาขาให้เองทุกครั้งที่ลูกค้าสั่ง
          </p>

          {activeIngredients.length === 0 ? (
            <p className="rounded-lg border border-dashed border-rule px-3 py-4 text-center text-sm text-slip-dim">
              ยังไม่มีวัตถุดิบในระบบ —{' '}
              <Link href="/admin/ingredients" className="font-bold text-emerald-700 underline underline-offset-4">
                ไปเพิ่มวัตถุดิบก่อน
              </Link>
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {lines.length === 0 && (
                <p className="text-sm text-slip-dim">เมนูนี้ยังไม่มีสูตร จึงยังไม่รู้ต้นทุนและไม่ตัดวัตถุดิบ</p>
              )}
              {lines.map((line) => {
                const ingredient = byId.get(line.ingredientId);
                const lineCost = ingredient ? (Number(line.quantity) || 0) * ingredient.costPerUnit : 0;
                return (
                  <div key={line.key} className="flex flex-wrap items-center gap-2">
                    <select
                      value={line.ingredientId}
                      onChange={(e) => updateLine(line.key, { ingredientId: e.target.value })}
                      aria-label="วัตถุดิบ"
                      className={`min-w-[10rem] flex-1 cursor-pointer ${inputClass}`}
                    >
                      <option value="">เลือกวัตถุดิบ…</option>
                      {(ingredients ?? [])
                        .filter(
                          (i) =>
                            (i.isActive || String(i.id) === line.ingredientId) &&
                            (String(i.id) === line.ingredientId ||
                              !lines.some((l) => l.ingredientId === String(i.id))),
                        )
                        .map((i) => (
                          <option key={i.id} value={String(i.id)}>
                            {i.name}
                            {i.isActive ? '' : ' (ปิดใช้แล้ว)'}
                          </option>
                        ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={line.quantity}
                      onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                      aria-label={`ปริมาณ${ingredient ? ` ${ingredient.name}` : ''} ต่อจาน`}
                      className={`num w-24 text-right ${inputClass}`}
                    />
                    <span className="w-14 text-xs text-slip-dim">{ingredient?.unit ?? ''}</span>
                    <span className="num w-20 text-right text-sm font-semibold text-slip">
                      ฿{formatBaht(lineCost)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                      aria-label="ลบบรรทัดนี้"
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-rule bg-white text-slip-dim hover:text-red-600 cursor-pointer"
                    >
                      <CloseIcon className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() =>
                  setLines((prev) => [
                    ...prev,
                    { key: Math.max(-1, ...prev.map((l) => l.key)) + 1, ingredientId: '', quantity: '' },
                  ])
                }
                className="flex min-h-[38px] items-center gap-1.5 self-start rounded-lg px-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 cursor-pointer"
              >
                <PlusIcon className="w-4 h-4" />
                เพิ่มวัตถุดิบ
              </button>
            </div>
          )}

          {/* สรุปต้นทุนเทียบราคาขายกลาง (ราคาพิเศษรายสาขาอาจทำให้กำไรจริงต่างจากนี้) */}
          <div className="grid grid-cols-3 gap-2 rounded-xl border border-rule bg-char/50 p-3 text-center">
            <div>
              <p className="text-xs text-slip-dim">ราคาขาย</p>
              <p className="num text-base font-bold text-slip">฿{formatBaht(price)}</p>
            </div>
            <div>
              <p className="text-xs text-slip-dim">ต้นทุนวัตถุดิบ</p>
              <p className="num text-base font-bold text-slip">
                {unitCost === null ? '—' : `฿${formatBaht(unitCost)}`}
              </p>
            </div>
            <div>
              <p className="text-xs text-slip-dim">กำไรขั้นต้น</p>
              <p
                className={`num text-base font-bold ${
                  margin && margin.profit < 0 ? 'text-red-600' : 'text-emerald-700'
                }`}
              >
                {margin === null
                  ? '—'
                  : `฿${formatBaht(margin.profit)}${margin.marginPct === null ? '' : ` (${margin.marginPct}%)`}`}
              </p>
            </div>
          </div>

          {saveError && (
            <p role="alert" className="rounded-lg border-l-4 border-void bg-char px-3 py-2 text-sm text-slip">
              {saveError}
            </p>
          )}
          <div className="flex justify-end gap-2.5 border-t border-rule pt-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] rounded-xl border border-rule bg-white px-4 text-xs font-semibold text-slip-dim hover:bg-slate-50 cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[42px] rounded-xl bg-emerald-600 px-5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
            >
              {saving ? 'กำลังบันทึก…' : 'บันทึกสูตร'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
