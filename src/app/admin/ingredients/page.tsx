'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '@/components/Modal';
import ConfirmModal from '@/components/ConfirmModal';
import { TableSkeleton, EmptyState, ErrorState, Notice } from '@/components/DataState';
import { TextField, NumberField, CheckboxField, FormActions } from '@/components/Field';
import BranchPickPrompt from '@/components/admin/BranchPickPrompt';
import { PlusIcon, SearchIcon } from '@/components/Icons';
import { apiFetch, jsonBody } from '@/lib/client';
import { formatBaht, formatThaiDateTime } from '@/lib/format';
import { COMMON_INGREDIENT_UNITS } from '@/lib/recipe';

/** วัตถุดิบ 1 รายการตามที่ GET /api/admin/ingredients คืนมา */
type Ingredient = {
  id: number;
  name: string;
  unit: string;
  costPerUnit: number;
  lowStockThreshold: number | null;
  isActive: boolean;
  /** ยอดคงเหลือของสาขาที่กำลังดู null คือสาขานี้ยังไม่นับวัตถุดิบตัวนี้ */
  quantity: number | null;
  isLow: boolean;
  recipeCount: number;
};

/** ข้อมูลทั้งชุดของหน้า */
type IngredientsResponse = { branchId: number | null; branchName: string | null; items: Ingredient[] };

/** ประวัติการเข้าออกของวัตถุดิบ 1 แถว */
type StockLog = {
  id: number;
  change_type: 'RECEIVE' | 'ADJUST' | 'WASTE' | 'DEDUCT' | 'RESTORE';
  quantity: string;
  qty_before: string;
  qty_after: string;
  unit_cost: string | null;
  note: string | null;
  created_at: string;
  changed_by_name: string | null;
  order_code: string | null;
};

/** ตัวกรองมุมมองของหน้า */
type Filter = 'ALL' | 'LOW' | 'UNTRACKED';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'ทั้งหมด' },
  { value: 'LOW', label: 'ใกล้หมด / ติดลบ' },
  { value: 'UNTRACKED', label: 'สาขานี้ยังไม่นับ' },
];

/** คำสั่งแก้ยอดวัตถุดิบของสาขา */
type StockMode = 'RECEIVE' | 'ADJUST' | 'WASTE';

const STOCK_MODE_LABELS: Record<StockMode, { title: string; field: string; submit: string }> = {
  RECEIVE: { title: 'รับของเข้า', field: 'จำนวนที่รับเข้า', submit: 'บันทึกรับของ' },
  ADJUST: { title: 'ปรับยอดตามที่นับได้', field: 'ยอดที่นับได้จริง', submit: 'บันทึกยอดใหม่' },
  WASTE: { title: 'ตัดของเสีย', field: 'จำนวนที่เสีย / ทิ้ง', submit: 'บันทึกของเสีย' },
};

/** ป้ายภาษาไทยของประเภทประวัติ */
const LOG_LABELS: Record<StockLog['change_type'], string> = {
  RECEIVE: 'รับเข้า',
  ADJUST: 'ปรับยอด',
  WASTE: 'ของเสีย',
  DEDUCT: 'ตัดตามออเดอร์',
  RESTORE: 'คืนจากการยกเลิก',
};

/** ค่าตั้งต้นของฟอร์มวัตถุดิบ */
const EMPTY_FORM = { name: '', unit: 'กรัม', costPerUnit: '', lowStockThreshold: '', isActive: true };

/**
 * แสดงปริมาณวัตถุดิบ ตัดศูนย์ท้ายทศนิยมทิ้ง (1.500 -> 1.5) และคั่นหลักพัน
 *
 * @param value - ปริมาณ
 * @returns ข้อความพร้อมแสดง
 */
function formatQty(value: number): string {
  return value.toLocaleString('th-TH', { maximumFractionDigits: 3 });
}

/**
 * หน้าจัดการวัตถุดิบและยอดคงเหลือรายสาขา
 *
 * แอดมินเพิ่มรายชื่อวัตถุดิบและต้นทุนต่อหน่วย (ใช้คิดต้นทุนต่อจานจากสูตรในหน้าเมนู)
 * ส่วนพนักงานในครัวรับของเข้า ปรับยอดตามที่นับได้ และตัดของเสียของสาขาตัวเอง
 * ระบบตัดวัตถุดิบตามสูตรทุกครั้งที่ลูกค้าสั่ง และคืนให้เมื่อยกเลิกรายการ
 *
 * @returns หน้าจอตารางวัตถุดิบพร้อมคำสั่งแก้ยอดและประวัติ
 */
export default function IngredientsPage() {
  const [data, setData] = useState<IngredientsResponse | null>(null);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string }>({
    tone: 'success',
    message: '',
  });
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Ingredient | null>(null);

  const [stockAction, setStockAction] = useState<{ item: Ingredient; mode: StockMode } | null>(null);
  const [stockQty, setStockQty] = useState('');
  const [stockCost, setStockCost] = useState('');
  const [stockNote, setStockNote] = useState('');

  const [historyFor, setHistoryFor] = useState<Ingredient | null>(null);
  const [history, setHistory] = useState<StockLog[] | null>(null);
  const [historyError, setHistoryError] = useState('');

  /**
   * โหลดรายชื่อวัตถุดิบพร้อมยอดของสาขาที่กำลังดู
   *
   * @returns ไม่คืนค่า มีผลข้างเคียงคือปรับ state ของตาราง
   */
  const load = useCallback(async () => {
    setLoadError('');
    const res = await apiFetch<IngredientsResponse>('/api/admin/ingredients');
    if (res.ok) setData(res.data);
    else setLoadError(res.message);
  }, []);

  useEffect(() => {
    load();
    apiFetch<{ role: string }>('/api/auth/me').then((res) => {
      if (res.ok) setIsAdmin(res.data.role === 'ADMIN');
    });
  }, [load]);

  const visible = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return (data?.items ?? []).filter((item) => {
      if (keyword && !item.name.toLowerCase().includes(keyword)) return false;
      if (filter === 'LOW') return item.isLow;
      if (filter === 'UNTRACKED') return item.quantity === null && item.isActive;
      return true;
    });
  }, [data, filter, search]);

  const lowCount = (data?.items ?? []).filter((i) => i.isActive && i.isLow).length;
  const trackedCount = (data?.items ?? []).filter((i) => i.isActive && i.quantity !== null).length;
  const hasBranch = data?.branchId !== null && data?.branchId !== undefined;

  /**
   * เปิดฟอร์มเพิ่มหรือแก้วัตถุดิบ
   *
   * @param item - วัตถุดิบที่จะแก้ ไม่ส่งคือเพิ่มใหม่
   */
  function openForm(item?: Ingredient) {
    setEditing(item ?? null);
    setForm(
      item
        ? {
            name: item.name,
            unit: item.unit,
            costPerUnit: String(item.costPerUnit),
            lowStockThreshold: item.lowStockThreshold === null ? '' : String(item.lowStockThreshold),
            isActive: item.isActive,
          }
        : EMPTY_FORM,
    );
    setFormError('');
    setFormOpen(true);
  }

  /**
   * บันทึกฟอร์มวัตถุดิบ
   *
   * @param event - เหตุการณ์ submit ของฟอร์ม
   */
  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    const payload = {
      name: form.name,
      unit: form.unit,
      costPerUnit: Number(form.costPerUnit || 0),
      lowStockThreshold: form.lowStockThreshold === '' ? null : Number(form.lowStockThreshold),
      isActive: form.isActive,
    };
    const res = editing
      ? await apiFetch(`/api/admin/ingredients/${editing.id}`, { method: 'PUT', body: jsonBody(payload) })
      : await apiFetch('/api/admin/ingredients', { method: 'POST', body: jsonBody(payload) });
    setSaving(false);
    if (!res.ok) {
      setFormError(res.message);
      return;
    }
    setFormOpen(false);
    setNotice({ tone: 'success', message: editing ? 'แก้ไขวัตถุดิบแล้ว' : 'เพิ่มวัตถุดิบแล้ว' });
    load();
  }

  /**
   * ลบวัตถุดิบหลังยืนยัน วัตถุดิบที่อยู่ในสูตรหรือมีประวัติจะถูกปิดใช้แทน
   */
  async function executeDelete() {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    const res = await apiFetch<{ message: string }>(`/api/admin/ingredients/${target.id}`, { method: 'DELETE' });
    setNotice(res.ok ? { tone: 'success', message: res.data.message } : { tone: 'error', message: res.message });
    if (res.ok) load();
  }

  /**
   * เปิดฟอร์มแก้ยอดวัตถุดิบของสาขา
   *
   * @param item - วัตถุดิบที่จะแก้ยอด
   * @param mode - รับเข้า / ปรับยอด / ของเสีย
   */
  function openStock(item: Ingredient, mode: StockMode) {
    setStockAction({ item, mode });
    setStockQty(mode === 'ADJUST' && item.quantity !== null ? String(item.quantity) : '');
    setStockCost('');
    setStockNote('');
    setFormError('');
  }

  /**
   * ส่งคำสั่งแก้ยอดวัตถุดิบ
   *
   * @param event - เหตุการณ์ submit ของฟอร์ม
   */
  async function submitStock(event: React.FormEvent) {
    event.preventDefault();
    if (!stockAction) return;
    setSaving(true);
    setFormError('');
    const res = await apiFetch<{ before: number; after: number }>(
      `/api/admin/ingredients/${stockAction.item.id}/stock`,
      {
        method: 'POST',
        body: jsonBody({
          mode: stockAction.mode,
          quantity: Number(stockQty || 0),
          unitCost: stockAction.mode === 'RECEIVE' && stockCost !== '' ? Number(stockCost) : null,
          note: stockNote,
        }),
      },
    );
    setSaving(false);
    if (!res.ok) {
      setFormError(res.message);
      return;
    }
    const { item } = stockAction;
    setStockAction(null);
    setNotice({
      tone: 'success',
      message: `${item.name}: ${formatQty(res.data.before)} → ${formatQty(res.data.after)} ${item.unit}`,
    });
    load();
  }

  /**
   * เปิดประวัติการเข้าออกของวัตถุดิบในสาขาที่กำลังดู
   *
   * @param item - วัตถุดิบที่ต้องการดูประวัติ
   */
  async function openHistory(item: Ingredient) {
    setHistoryFor(item);
    setHistory(null);
    setHistoryError('');
    const res = await apiFetch<StockLog[]>(`/api/admin/ingredients/${item.id}/stock`);
    if (res.ok) setHistory(res.data);
    else setHistoryError(res.message);
  }

  const smallBtn =
    'min-h-[34px] rounded-lg border px-2.5 text-xs font-bold transition-colors cursor-pointer disabled:opacity-40';

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-zinc-900">วัตถุดิบ</h1>
            {data?.branchName && (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                {data.branchName}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slip-dim">
            ระบบตัดวัตถุดิบตามสูตรทุกครั้งที่ลูกค้าสั่ง และคืนให้เมื่อยกเลิก ยอดติดลบแปลว่าควรไปนับของจริงแล้วปรับยอด
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => openForm()}
            className="flex min-h-[42px] items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 cursor-pointer"
          >
            <PlusIcon className="w-4 h-4" />
            เพิ่มวัตถุดิบ
          </button>
        )}
      </div>

      <Notice
        tone={notice.tone}
        message={notice.message}
        onDismiss={() => setNotice({ tone: 'success', message: '' })}
      />

      {data && !hasBranch && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm text-amber-900">
            ยอดคงเหลือเป็นของแต่ละสาขา ตอนนี้กำลังดูภาพรวมทุกสาขาจึงเห็นแค่รายชื่อและต้นทุน
          </p>
          <BranchPickPrompt label="เลือกสาขาเพื่อดูยอดและรับของเข้า" />
        </div>
      )}

      {data && hasBranch && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-800">ใกล้หมดหรือติดลบ</p>
            <p className="num mt-0.5 text-xl font-bold text-amber-800">{lowCount} รายการ</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-3">
            <p className="text-xs font-semibold text-zinc-600">วัตถุดิบที่สาขานี้นับอยู่</p>
            <p className="num mt-0.5 text-xl font-bold text-zinc-700">{trackedCount} รายการ</p>
          </div>
        </div>
      )}

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
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อวัตถุดิบ"
            aria-label="ค้นหาชื่อวัตถุดิบ"
            className="min-h-[36px] w-full rounded-xl border border-rule bg-white pl-9 pr-3 text-xs text-slip placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none"
          />
        </div>
      </div>

      {loadError && <ErrorState message={loadError} onRetry={load} />}
      {!loadError && !data && <TableSkeleton rows={6} />}
      {!loadError && data && visible.length === 0 && (
        <EmptyState
          message={
            data.items.length === 0
              ? 'ยังไม่มีวัตถุดิบในระบบ เพิ่มวัตถุดิบแล้วไปใส่สูตรที่หน้าเมนูอาหาร เพื่อให้รู้ต้นทุนต่อจาน'
              : 'ไม่มีวัตถุดิบที่ตรงกับตัวกรองนี้ ลองเปลี่ยนตัวกรองหรือล้างคำค้นหา'
          }
          action={
            isAdmin && data.items.length === 0 ? (
              <button
                type="button"
                onClick={() => openForm()}
                className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 cursor-pointer"
              >
                <PlusIcon className="w-4 h-4" />
                เพิ่มวัตถุดิบ
              </button>
            ) : undefined
          }
        />
      )}

      {!loadError && data && visible.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-rule bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-rule bg-char text-left text-xs text-slip-dim">
                <th className="px-3 py-2.5 font-semibold">วัตถุดิบ</th>
                <th className="px-3 py-2.5 font-semibold text-right">ต้นทุน / หน่วย</th>
                <th className="px-3 py-2.5 font-semibold text-right">คงเหลือ</th>
                <th className="px-3 py-2.5 font-semibold text-right">เตือนเมื่อเหลือ</th>
                <th className="px-3 py-2.5 font-semibold text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule/60">
              {visible.map((item) => {
                const negative = item.quantity !== null && item.quantity < 0;
                return (
                  <tr
                    key={item.id}
                    className={!item.isActive ? 'opacity-60' : item.isLow ? 'bg-amber-50/40' : ''}
                  >
                    <td className="px-3 py-2.5">
                      <p className="font-semibold text-slip">{item.name}</p>
                      <p className="text-xs text-slip-dim">
                        หน่วย: {item.unit} · อยู่ในสูตร {item.recipeCount} เมนู
                        {!item.isActive && ' · ปิดใช้งานแล้ว'}
                      </p>
                    </td>
                    <td className="num px-3 py-2.5 text-right text-slip">
                      ฿{item.costPerUnit.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {!hasBranch ? (
                        <span className="text-xs text-slip-dim">เลือกสาขาก่อน</span>
                      ) : item.quantity === null ? (
                        <span className="text-xs text-slip-dim">ยังไม่นับ</span>
                      ) : (
                        <span
                          className={`num font-bold ${
                            negative ? 'text-red-700' : item.isLow ? 'text-amber-700' : 'text-slip'
                          }`}
                        >
                          {formatQty(item.quantity)} {item.unit}
                        </span>
                      )}
                    </td>
                    <td className="num px-3 py-2.5 text-right text-xs text-slip-dim">
                      {item.lowStockThreshold === null ? '—' : `${formatQty(item.lowStockThreshold)} ${item.unit}`}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {hasBranch && item.isActive && (
                          <>
                            <button
                              type="button"
                              onClick={() => openStock(item, 'RECEIVE')}
                              className={`${smallBtn} border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100`}
                            >
                              รับเข้า
                            </button>
                            <button
                              type="button"
                              onClick={() => openStock(item, 'ADJUST')}
                              className={`${smallBtn} border-rule bg-white text-slip hover:bg-zinc-50`}
                            >
                              ปรับยอด
                            </button>
                            {item.quantity !== null && (
                              <button
                                type="button"
                                onClick={() => openStock(item, 'WASTE')}
                                className={`${smallBtn} border-rule bg-white text-slip hover:bg-zinc-50`}
                              >
                                ของเสีย
                              </button>
                            )}
                          </>
                        )}
                        {hasBranch && item.quantity !== null && (
                          <button
                            type="button"
                            onClick={() => openHistory(item)}
                            className={`${smallBtn} border-rule bg-white text-slip-dim hover:bg-zinc-50`}
                          >
                            ประวัติ
                          </button>
                        )}
                        {isAdmin && (
                          <>
                            <button
                              type="button"
                              onClick={() => openForm(item)}
                              className={`${smallBtn} border-rule bg-white text-slip hover:bg-zinc-50`}
                            >
                              แก้ไข
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleting(item)}
                              className={`${smallBtn} border-red-200 bg-red-50 text-red-600 hover:bg-red-100`}
                            >
                              ลบ
                            </button>
                          </>
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

      {/* ฟอร์มเพิ่ม/แก้วัตถุดิบ (แอดมินเท่านั้น) */}
      <Modal
        title={editing ? `แก้ไขวัตถุดิบ: ${editing.name}` : 'เพิ่มวัตถุดิบ'}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <TextField
            id="ingredient-name"
            label="ชื่อวัตถุดิบ"
            value={form.name}
            onChange={(value) => setForm({ ...form, name: value })}
            placeholder="เช่น หมูสับ"
          />
          <div className="flex flex-col gap-2">
            <label htmlFor="ingredient-unit" className="text-sm text-slip-dim">
              หน่วยนับ
            </label>
            <input
              id="ingredient-unit"
              list="ingredient-unit-options"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              maxLength={20}
              className="min-h-[44px] w-full rounded-lg bg-char px-3 text-slip"
            />
            <datalist id="ingredient-unit-options">
              {COMMON_INGREDIENT_UNITS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
            <p className="text-sm text-slip-dim">ใช้หน่วยเดียวกันกับตอนใส่สูตร เช่น สูตรใช้ 100 กรัม หน่วยต้องเป็นกรัม</p>
          </div>
          <NumberField
            id="ingredient-cost"
            label={`ต้นทุนต่อ 1 ${form.unit || 'หน่วย'} (บาท)`}
            value={form.costPerUnit}
            onChange={(value) => setForm({ ...form, costPerUnit: value })}
            step={0.0001}
          />
          <NumberField
            id="ingredient-threshold"
            label={`เตือนเมื่อเหลือไม่เกิน (${form.unit || 'หน่วย'}) — เว้นว่างได้`}
            value={form.lowStockThreshold}
            onChange={(value) => setForm({ ...form, lowStockThreshold: value })}
            step={0.001}
          />
          <CheckboxField
            label="เปิดใช้งาน (ปิดแล้วจะไม่นับต้นทุนและไม่ตัดยอดตัวนี้)"
            checked={form.isActive}
            onChange={(checked) => setForm({ ...form, isActive: checked })}
          />
          <FormActions error={formError} saving={saving} onCancel={() => setFormOpen(false)} />
        </form>
      </Modal>

      {/* ฟอร์มแก้ยอดของสาขา */}
      {stockAction && (
        <Modal
          title={`${STOCK_MODE_LABELS[stockAction.mode].title}: ${stockAction.item.name}`}
          open
          onClose={() => setStockAction(null)}
          maxWidth="max-w-sm"
        >
          <form onSubmit={submitStock} className="flex flex-col gap-4" noValidate>
            <p className="rounded-xl bg-char px-3 py-2 text-xs text-slip-dim">
              {stockAction.item.quantity === null
                ? 'สาขานี้ยังไม่เคยนับวัตถุดิบตัวนี้ บันทึกแล้วจะเริ่มนับและตัดยอดตามออเดอร์ตั้งแต่ตอนนี้'
                : `ตอนนี้เหลือ ${formatQty(stockAction.item.quantity)} ${stockAction.item.unit}`}
            </p>
            <NumberField
              id="ingredient-stock-qty"
              label={`${STOCK_MODE_LABELS[stockAction.mode].field} (${stockAction.item.unit})`}
              value={stockQty}
              onChange={setStockQty}
              step={0.001}
            />
            {stockAction.mode === 'RECEIVE' && (
              <NumberField
                id="ingredient-stock-cost"
                label={`ราคาที่ซื้อต่อ 1 ${stockAction.item.unit} (ไม่บังคับ)${
                  isAdmin ? ' — จะอัปเดตเป็นต้นทุนล่าสุด' : ''
                }`}
                value={stockCost}
                onChange={setStockCost}
                step={0.0001}
              />
            )}
            <TextField
              id="ingredient-stock-note"
              label="หมายเหตุ (ไม่บังคับ)"
              value={stockNote}
              onChange={setStockNote}
              placeholder={stockAction.mode === 'WASTE' ? 'เช่น เน่าเสีย / ทำหก' : 'เช่น เลขที่ใบส่งของ'}
            />
            <FormActions
              error={formError}
              saving={saving}
              onCancel={() => setStockAction(null)}
              submitLabel={STOCK_MODE_LABELS[stockAction.mode].submit}
            />
          </form>
        </Modal>
      )}

      {/* ประวัติการเข้าออก */}
      <Modal
        title={historyFor ? `ประวัติ: ${historyFor.name}` : 'ประวัติ'}
        open={historyFor !== null}
        onClose={() => setHistoryFor(null)}
        maxWidth="max-w-2xl"
      >
        {historyError && <p className="text-sm text-red-600">{historyError}</p>}
        {!historyError && history === null && <TableSkeleton rows={4} />}
        {history && history.length === 0 && (
          <p className="text-sm text-slip-dim">ยังไม่มีประวัติการเข้าออกในสาขานี้</p>
        )}
        {history && history.length > 0 && (
          <ul className="flex flex-col divide-y divide-rule/60">
            {history.map((log) => {
              const qty = Number(log.quantity);
              // ปรับยอดเก็บส่วนต่างที่มีเครื่องหมายอยู่แล้ว ส่วนตัดออกกับของเสียเก็บเป็นจำนวนบวก
              const signed = log.change_type === 'DEDUCT' || log.change_type === 'WASTE' ? -qty : qty;
              return (
                <li key={log.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold text-slip">
                      {LOG_LABELS[log.change_type]}
                      {log.order_code && <span className="ml-1.5 text-xs text-slip-dim">#{log.order_code}</span>}
                    </p>
                    <p className="text-xs text-slip-dim">
                      {formatThaiDateTime(log.created_at)}
                      {log.changed_by_name && ` · ${log.changed_by_name}`}
                      {log.unit_cost !== null && ` · ซื้อหน่วยละ ฿${formatBaht(log.unit_cost)}`}
                      {log.note && ` · ${log.note}`}
                    </p>
                  </div>
                  <p className="num text-right">
                    <span className={`font-bold ${signed < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                      {signed > 0 ? '+' : ''}
                      {formatQty(signed)}
                    </span>
                    <span className="ml-2 text-xs text-slip-dim">
                      {formatQty(Number(log.qty_before))} → {formatQty(Number(log.qty_after))}
                    </span>
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Modal>

      <ConfirmModal
        open={deleting !== null}
        title="ลบวัตถุดิบ"
        message={
          deleting
            ? `ต้องการลบ "${deleting.name}" ใช่หรือไม่? ถ้าอยู่ในสูตรหรือมีประวัติแล้วจะเปลี่ยนเป็นปิดใช้งานแทน`
            : ''
        }
        confirmText="ลบ"
        onConfirm={executeDelete}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
