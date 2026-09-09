'use client';

import { useCallback, useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import { TableSkeleton, EmptyState, ErrorState, Notice } from '@/components/DataState';
import { TextField, NumberField, SelectField, CheckboxField, FormActions } from '@/components/Field';
import { apiFetch, jsonBody } from '@/lib/client';
import { formatBaht } from '@/lib/format';

/** เมนู 1 แถวตามที่ GET /api/admin/menu-items คืนมา */
type MenuItem = {
  id: number;
  category_id: number;
  category_name: string;
  name: string;
  description: string | null;
  price: string;
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
          className="min-h-[44px] rounded-sm bg-flame px-4 font-medium text-char"
        >
          เพิ่มเมนู
        </button>
      </div>

      <div className="flex flex-wrap gap-3 border border-rule bg-griddle px-3 py-3">
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
              className="min-h-[44px] rounded-sm bg-flame px-4 font-medium text-char"
            >
              เพิ่มเมนู
            </button>
          }
        />
      )}

      {!loadError && items !== null && items.length > 0 && (
        <div className="overflow-x-auto border border-rule">
          <table className="w-full min-w-[46rem] border-collapse">
            <thead>
              <tr className="border-b border-rule bg-griddle text-left text-slip-dim">
                <th className="px-3 py-2 font-medium">ชื่อเมนู</th>
                <th className="px-3 py-2 font-medium">หมวดหมู่</th>
                <th className="px-3 py-2 text-right font-medium">ราคา (บาท)</th>
                <th className="px-3 py-2 text-right font-medium">เคยสั่ง</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
                <th className="px-3 py-2 font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-rule last:border-b-0 align-top">
                  <td className="px-3 py-2">
                    <p className="text-slip">{item.name}</p>
                    {item.description && (
                      <p className="text-sm text-slip-dim">{item.description}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slip-dim">{item.category_name}</td>
                  <td className="num px-3 py-2 text-right text-slip">{formatBaht(item.price)}</td>
                  <td className="num px-3 py-2 text-right text-slip-dim">{item.order_count}</td>
                  <td className="px-3 py-2">
                    <span className={item.is_available === 1 ? 'text-served' : 'text-slip-dim'}>
                      {item.is_available === 1 ? 'เปิดขาย' : 'ปิดขาย'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openForm(item)}
                        className="min-h-[44px] text-slip underline underline-offset-4"
                      >
                        แก้ไข
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        className="min-h-[44px] text-void underline underline-offset-4"
                      >
                        ลบ
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
