'use client';

import { useCallback, useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import { TableSkeleton, EmptyState, ErrorState, Notice } from '@/components/DataState';
import { TextField, NumberField, SelectField, CheckboxField, FormActions } from '@/components/Field';
import MenuItemThumb from '@/components/MenuItemThumb';
import { apiFetch, jsonBody } from '@/lib/client';
import { formatBaht } from '@/lib/format';
import { PlusIcon } from '@/components/Icons';

/** เมนู 1 แถวตามที่ GET /api/admin/menu-items คืนมา */
type MenuItem = {
  id: number;
  category_id: number;
  category_name: string;
  name: string;
  description: string | null;
  price: string;
  image_url: string | null;
  is_available: number;
  order_count: number;
};

/** หมวดหมู่แบบย่อ ใช้เติมช่องเลือกหมวดในฟอร์มและตัวกรอง */
type CategoryOption = { id: number; name: string };

/** ค่าตั้งต้นของฟอร์มตอนกดเพิ่มเมนูใหม่ */
const EMPTY_FORM = {
  categoryId: '',
  name: '',
  description: '',
  price: '',
  imageUrl: '',
  isAvailable: true,
};

/**
 * หน้าจัดการเมนูอาหาร รองรับค้นหาตามชื่อและกรองตามหมวดหมู่
 * เมนูที่เคยถูกสั่งแล้วจะถูกเปลี่ยนเป็นปิดขายแทนการลบ เพื่อไม่ให้บิลเก่าพัง
 *
 * @returns หน้าจอตารางเมนูพร้อมฟอร์มใน modal
 */
export default function MenuPage() {
  const [items, setItems] = useState<MenuItem[] | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [keyword, setKeyword] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('0');
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string }>({
    tone: 'success',
    message: '',
  });
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  /**
   * โหลดรายการเมนูตามคำค้นและหมวดที่เลือกอยู่
   * ใส่ค่าตัวกรองผ่าน URLSearchParams เพื่อให้ตัวอักษรไทยและอักขระพิเศษถูก encode ถูกต้อง
   *
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือปรับ state ของรายการเมนู
   */
  const load = useCallback(async () => {
    setItems(null);
    setLoadError('');
    const params = new URLSearchParams({ categoryId: categoryFilter, q: keyword.trim() });
    const result = await apiFetch<MenuItem[]>(`/api/admin/menu-items?${params.toString()}`);
    if (result.ok) setItems(result.data);
    else setLoadError(result.message);
  }, [categoryFilter, keyword]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    /**
     * โหลดหมวดหมู่มาเติมช่องเลือก ทำครั้งเดียวตอนเปิดหน้าเพราะเปลี่ยนไม่บ่อย
     *
     * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือปรับ state ของรายการหมวดหมู่
     */
    async function loadCategories() {
      const result = await apiFetch<CategoryOption[]>('/api/admin/categories');
      if (result.ok) setCategories(result.data);
    }
    loadCategories();
  }, []);

  /**
   * เปิด modal ในโหมดเพิ่มใหม่หรือแก้ไข
   *
   * @param item - เมนูที่จะแก้ไข ถ้าไม่ส่งมาแปลว่าเพิ่มใหม่
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือเปิด modal พร้อมค่าตั้งต้นของฟอร์ม
   */
  function openForm(item?: MenuItem) {
    setEditing(item ?? null);
    setForm(
      item
        ? {
            categoryId: String(item.category_id),
            name: item.name,
            description: item.description ?? '',
            price: item.price,
            imageUrl: item.image_url ?? '',
            isAvailable: item.is_available === 1,
          }
        : { ...EMPTY_FORM, categoryId: String(categories[0]?.id ?? '') },
    );
    setFormError('');
    setModalOpen(true);
  }

  /**
   * บันทึกฟอร์มเมนู เลือกเองว่าจะสร้างใหม่หรือแก้ไขตามสถานะ editing
   *
   * @param event - เหตุการณ์ submit ใช้ยกเลิกการรีโหลดหน้า
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือเขียนข้อมูลลงฐานข้อมูลและรีโหลดตาราง
   */
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    const payload = {
      categoryId: Number(form.categoryId),
      name: form.name,
      description: form.description,
      price: Number(form.price || 0),
      imageUrl: form.imageUrl,
      isAvailable: form.isAvailable,
    };
    const result = editing
      ? await apiFetch(`/api/admin/menu-items/${editing.id}`, {
          method: 'PUT',
          body: jsonBody(payload),
        })
      : await apiFetch('/api/admin/menu-items', { method: 'POST', body: jsonBody(payload) });
    setSaving(false);

    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    setModalOpen(false);
    setNotice({
      tone: 'success',
      message: editing ? 'แก้ไขเมนูเรียบร้อยแล้ว' : 'เพิ่มเมนูใหม่เรียบร้อยแล้ว',
    });
    load();
  }

  /**
   * ลบเมนู ถามยืนยันก่อน และแสดงเหตุผลเมื่อระบบเปลี่ยนเป็นปิดขายแทน
   *
   * @param item - เมนูที่จะลบ
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือลบหรือปิดขายแล้วรีโหลดตาราง
   */
  async function handleDelete(item: MenuItem) {
    const confirmed = window.confirm(
      `ต้องการลบเมนู "${item.name}" ใช่หรือไม่\nถ้าเมนูนี้เคยถูกสั่งแล้ว ระบบจะเปลี่ยนเป็นปิดขายแทนการลบ`,
    );
    if (!confirmed) return;

    const result = await apiFetch<{ mode: string; message: string }>(
      `/api/admin/menu-items/${item.id}`,
      { method: 'DELETE' },
    );
    setNotice(
      result.ok
        ? { tone: 'success', message: result.data.message }
        : { tone: 'error', message: result.message },
    );
    if (result.ok) load();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slip">เมนูอาหาร</h1>
          <p className="text-slip-dim">ราคาที่แก้จะมีผลกับออเดอร์ใหม่เท่านั้น บิลเก่าไม่เปลี่ยนตาม</p>
        </div>
        <button
          type="button"
          onClick={() => openForm()}
          className="min-h-[44px] rounded-xl bg-[#06C755] px-4 font-bold text-sm text-white shadow-md shadow-[#06C755]/20 transition-all hover:bg-[#00A040] flex items-center gap-1.5"
        >
          <PlusIcon className="w-4 h-4" />
          <span>เพิ่มเมนู</span>
        </button>
      </div>

      <div className="flex flex-wrap gap-3 rounded-lg bg-griddle px-3 py-3 shadow-sm">
        <div className="min-w-[12rem] flex-1">
          <TextField
            id="menu-search"
            label="ค้นหาจากชื่อเมนู"
            value={keyword}
            onChange={setKeyword}
            placeholder="เช่น กะเพรา"
          />
        </div>
        <div className="min-w-[12rem] flex-1">
          <SelectField
            id="menu-category-filter"
            label="กรองตามหมวดหมู่"
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[
              { value: '0', label: 'ทุกหมวดหมู่' },
              ...categories.map((c) => ({ value: String(c.id), label: c.name })),
            ]}
          />
        </div>
      </div>

      <Notice
        tone={notice.tone}
        message={notice.message}
        onDismiss={() => setNotice({ tone: 'success', message: '' })}
      />

      {loadError && <ErrorState message={loadError} onRetry={load} />}
      {!loadError && items === null && <TableSkeleton rows={6} />}
      {!loadError && items !== null && items.length === 0 && (
        <EmptyState
          message={
            keyword || categoryFilter !== '0'
              ? 'ไม่พบเมนูที่ตรงกับเงื่อนไขที่กรองไว้ — ลองล้างคำค้นหรือเลือกหมวดอื่น'
              : 'ยังไม่มีเมนูในระบบ — เพิ่มเมนูแรกเพื่อให้ลูกค้าสั่งอาหารได้'
          }
          action={
            <button
              type="button"
              onClick={() => openForm()}
              className="min-h-[44px] rounded-xl bg-[#06C755] px-4 font-bold text-sm text-white shadow-md shadow-[#06C755]/20 transition-all hover:bg-[#00A040] flex items-center gap-1.5"
            >
              <PlusIcon className="w-4 h-4" />
              <span>เพิ่มเมนู</span>
            </button>
          }
        />
      )}

      {!loadError && items !== null && items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <article
              key={item.id}
              className="lm-card flex flex-col overflow-hidden transition-all hover:border-[#06C755]/50"
            >
              <MenuItemThumb
                name={item.name}
                imageUrl={item.image_url}
                size="h-36 w-full"
                rounded="rounded-none"
              />
              <div className="flex flex-1 flex-col gap-1.5 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 font-bold text-sm text-slip">{item.name}</p>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      item.is_available === 1 ? 'bg-[#06C755]/15 text-[#00A040]' : 'bg-char text-slip-dim'
                    }`}
                  >
                    {item.is_available === 1 ? 'เปิดขาย' : 'ปิดขาย'}
                  </span>
                </div>
                {item.description && <p className="text-xs text-slip-dim line-clamp-2">{item.description}</p>}
                <p className="text-xs font-semibold text-[#06C755]">{item.category_name}</p>
                <div className="mt-auto flex items-center justify-between pt-2">
                  <p className="num text-base font-extrabold text-slip">{formatBaht(item.price)} <span className="text-xs font-normal text-slip-dim">บาท</span></p>
                  <p className="num text-xs text-slip-dim">สั่งไปแล้ว <strong className="text-slip">{item.order_count}</strong> ครั้ง</p>
                </div>
                <div className="mt-3 flex gap-2 border-t border-rule/50 pt-3">
                  <button
                    type="button"
                    onClick={() => openForm(item)}
                    className="flex-1 rounded-xl border border-rule bg-paper py-2 text-xs font-bold text-slip transition-all hover:border-[#06C755] hover:text-[#06C755]"
                  >
                    แก้ไข
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    className="flex-1 rounded-xl border border-red-200 bg-red-50 py-2 text-xs font-bold text-red-600 transition-all hover:bg-red-100"
                  >
                    ลบ
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        title={editing ? `แก้ไขเมนู: ${editing.name}` : 'เพิ่มเมนูใหม่'}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <SelectField
            id="menu-category"
            label="หมวดหมู่"
            value={form.categoryId}
            onChange={(value) => setForm({ ...form, categoryId: value })}
            options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
          />
          <TextField
            id="menu-name"
            label="ชื่อเมนู"
            value={form.name}
            onChange={(value) => setForm({ ...form, name: value })}
            placeholder="เช่น กะเพราหมูสับไข่ดาว"
          />
          <TextField
            id="menu-description"
            label="คำอธิบายสั้น (ไม่บังคับ)"
            value={form.description}
            onChange={(value) => setForm({ ...form, description: value })}
            placeholder="เช่น เผ็ดกลาง ไข่ดาวไข่แดงเยิ้ม"
          />
          <NumberField
            id="menu-price"
            label="ราคา (บาท)"
            value={form.price}
            onChange={(value) => setForm({ ...form, price: value })}
            step={0.01}
          />
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <TextField
                id="menu-image"
                label="ลิงก์รูปภาพ (ไม่บังคับ)"
                value={form.imageUrl}
                onChange={(value) => setForm({ ...form, imageUrl: value })}
                placeholder="https://…"
                hint="วางลิงก์รูปอาหาร ถ้าไม่มีระบบจะโชว์ไอคอนตัวอักษรแทน"
              />
            </div>
            <MenuItemThumb name={form.name || '?'} imageUrl={form.imageUrl || null} />
          </div>
          <CheckboxField
            label="เปิดขาย (ลูกค้าเห็นเมนูนี้และสั่งได้)"
            checked={form.isAvailable}
            onChange={(checked) => setForm({ ...form, isAvailable: checked })}
          />
          <FormActions error={formError} saving={saving} onCancel={() => setModalOpen(false)} />
        </form>
      </Modal>
    </div>
  );
}
