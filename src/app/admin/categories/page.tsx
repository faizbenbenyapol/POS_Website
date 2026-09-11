'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Modal from '@/components/Modal';
import ConfirmModal from '@/components/ConfirmModal';
import { TableSkeleton, EmptyState, ErrorState, Notice } from '@/components/DataState';
import { TextField, NumberField, CheckboxField, FormActions } from '@/components/Field';
import { apiFetch, jsonBody } from '@/lib/client';

import { PlusIcon } from '@/components/Icons';

/** หมวดหมู่ 1 แถวตามที่ GET /api/admin/categories คืนมา */
type Category = {
  id: number;
  name: string;
  sort_order: number;
  is_active: number;
  menu_item_count: number;
};

/** ค่าตั้งต้นของฟอร์มตอนกดเพิ่มหมวดหมู่ใหม่ */
const EMPTY_FORM = { name: '', sortOrder: '0', isActive: true };

/**
 * หน้าจัดการหมวดหมู่เมนู เพิ่ม แก้ไข และลบได้ครบ
 * หมวดที่มีเมนูอยู่จะถูกเปลี่ยนเป็นปิดใช้งานแทนการลบ และแจ้งผู้ใช้ด้วยข้อความชัดเจน
 *
 * @returns หน้าจอตารางหมวดหมู่พร้อมฟอร์มใน modal
 */
export default function CategoriesPage() {
  const [items, setItems] = useState<Category[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string }>({
    tone: 'success',
    message: '',
  });
  const [editing, setEditing] = useState<Category | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ role: string; fullName: string } | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);

  /**
   * โหลดรายการหมวดหมู่จากเซิร์ฟเวอร์ใหม่ทั้งชุด
   * ใช้ทั้งตอนเปิดหน้าและหลังบันทึก/ลบ เพื่อให้ตัวเลขจำนวนเมนูตรงกับความจริงเสมอ
   *
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือปรับ state ของรายการและข้อความผิดพลาด
   */
  const load = useCallback(async () => {
    setItems(null);
    setLoadError('');
    const result = await apiFetch<Category[]>('/api/admin/categories');
    if (result.ok) setItems(result.data);
    else setLoadError(result.message);
  }, []);

  useEffect(() => {
    load();
    apiFetch<{ role: string; fullName: string }>('/api/auth/me').then((res) => {
      if (res.ok) setCurrentUser(res.data);
    });
  }, [load]);

  /**
   * เปิด modal ในโหมดเพิ่มใหม่หรือแก้ไข ขึ้นกับว่าส่งหมวดหมู่เข้ามาหรือไม่
   *
   * @param category - หมวดหมู่ที่จะแก้ไข ถ้าไม่ส่งมาแปลว่าเพิ่มใหม่
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือเปิด modal พร้อมค่าตั้งต้นของฟอร์ม
   */
  function openForm(category?: Category) {
    setEditing(category ?? null);
    setForm(
      category
        ? {
            name: category.name,
            sortOrder: String(category.sort_order),
            isActive: category.is_active === 1,
          }
        : EMPTY_FORM,
    );
    setFormError('');
    setModalOpen(true);
  }

  /**
   * บันทึกฟอร์ม เลือกเองว่าจะสร้างใหม่หรือแก้ไขตามสถานะ editing
   *
   * @param event - เหตุการณ์ submit ใช้ยกเลิกการรีโหลดหน้า
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือเขียนข้อมูลลงฐานข้อมูลและรีโหลดตาราง
   */
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    const payload = {
      name: form.name,
      sortOrder: Number(form.sortOrder || 0),
      isActive: form.isActive,
    };
    const result = editing
      ? await apiFetch(`/api/admin/categories/${editing.id}`, {
          method: 'PUT',
          body: jsonBody(payload),
        })
      : await apiFetch('/api/admin/categories', { method: 'POST', body: jsonBody(payload) });
    setSaving(false);

    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    setModalOpen(false);
    setNotice({
      tone: 'success',
      message: editing ? 'แก้ไขหมวดหมู่เรียบร้อยแล้ว' : 'เพิ่มหมวดหมู่ใหม่เรียบร้อยแล้ว',
    });
    load();
  }

  function handleDelete(category: Category) {
    setDeletingCategory(category);
  }

  /**
   * ดำเนินการลบหมวดหมู่จริงหลังจากยืนยันใน ConfirmModal
   */
  async function executeDelete() {
    if (!deletingCategory) return;
    const target = deletingCategory;
    setDeletingCategory(null);

    const result = await apiFetch<{ mode: string; message: string }>(
      `/api/admin/categories/${target.id}`,
      { method: 'DELETE' },
    );
    setNotice(
      result.ok
        ? { tone: 'success', message: result.data.message }
        : { tone: 'error', message: result.message },
    );
    if (result.ok) load();
  }

  if (currentUser && currentUser.role !== 'ADMIN') {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center shadow-xs">
        <h2 className="text-base font-bold text-amber-900">หน้านี้สงวนสิทธิ์เฉพาะเจ้าของร้าน (ADMIN)</h2>
        <p className="mt-1 text-xs text-amber-700">
          พนักงานไม่มีสิทธิ์จัดการโครงสร้างหมวดหมู่ กรุณาใช้งานผ่านเมนูปฏิบัติการ
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Link
            href="/admin/orders"
            className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition-colors cursor-pointer"
          >
            ไปกระดานออเดอร์
          </Link>
          <Link
            href="/admin/tables"
            className="rounded-xl border border-rule bg-white px-4 py-2 text-xs font-bold text-slip shadow-xs hover:bg-zinc-50"
          >
            ไปโต๊ะและ QR
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slip">หมวดหมู่เมนู</h1>
          <p className="text-slip-dim">ลำดับที่ตั้งไว้คือลำดับที่ลูกค้าเห็นบนแถบหมวดหมู่</p>
        </div>
        <button
          type="button"
          onClick={() => openForm()}
          className="min-h-[42px] rounded-xl bg-emerald-600 px-4 font-bold text-xs text-white shadow-xs transition-colors hover:bg-emerald-700 flex items-center gap-1.5 cursor-pointer"
        >
          <PlusIcon className="w-4 h-4" />
          <span>เพิ่มหมวดหมู่</span>
        </button>
      </div>

      <Notice
        tone={notice.tone}
        message={notice.message}
        onDismiss={() => setNotice({ tone: 'success', message: '' })}
      />

      {loadError && <ErrorState message={loadError} onRetry={load} />}
      {!loadError && items === null && <TableSkeleton />}
      {!loadError && items !== null && items.length === 0 && (
        <EmptyState
          message="ยังไม่มีหมวดหมู่ในระบบ — เพิ่มหมวดแรกก่อน แล้วค่อยไปเพิ่มเมนูในหมวดนั้น"
          action={
            <button
              type="button"
              onClick={() => openForm()}
              className="min-h-[44px] rounded-xl bg-emerald-600 px-4 font-bold text-sm text-white shadow-xs transition-colors hover:bg-emerald-700 flex items-center gap-1.5 cursor-pointer"
            >
              <PlusIcon className="w-4 h-4" />
              <span>เพิ่มหมวดหมู่แรก</span>
            </button>
          }
        />
      )}

      {!loadError && items !== null && items.length > 0 && (
        <div className="overflow-x-auto rounded-lg bg-griddle shadow-sm">
          <table className="w-full min-w-[36rem] border-collapse">
            <thead>
              <tr className="bg-char text-left text-slip-dim">
                <th className="px-3 py-2 font-medium">ชื่อหมวดหมู่</th>
                <th className="px-3 py-2 text-right font-medium">ลำดับ</th>
                <th className="px-3 py-2 text-right font-medium">จำนวนเมนู</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
                <th className="px-3 py-2 font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {items.map((category) => (
                <tr key={category.id} className="border-b border-rule last:border-b-0">
                  <td className="px-3 py-2 text-slip">{category.name}</td>
                  <td className="num px-3 py-2 text-right text-slip">{category.sort_order}</td>
                  <td className="num px-3 py-2 text-right text-slip">{category.menu_item_count}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-sm ${
                        category.is_active === 1 ? 'bg-served/10 text-served' : 'bg-char text-slip-dim'
                      }`}
                    >
                      {category.is_active === 1 ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openForm(category)}
                        className="rounded-lg border border-rule bg-paper px-3 py-1 text-xs font-semibold text-slip transition-colors hover:border-slate-400 hover:text-slate-900 cursor-pointer"
                      >
                        แก้ไข
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(category)}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 transition-all hover:bg-red-100"
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
        title={editing ? `แก้ไขหมวดหมู่: ${editing.name}` : 'เพิ่มหมวดหมู่ใหม่'}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <TextField
            id="category-name"
            label="ชื่อหมวดหมู่"
            value={form.name}
            onChange={(value) => setForm({ ...form, name: value })}
            placeholder="เช่น ของทานเล่น"
          />
          <NumberField
            id="category-sort"
            label="ลำดับการแสดง (เลขน้อยขึ้นก่อน)"
            value={form.sortOrder}
            onChange={(value) => setForm({ ...form, sortOrder: value })}
          />
          <CheckboxField
            label="เปิดใช้งาน (ลูกค้าเห็นหมวดนี้บนหน้าเมนู)"
            checked={form.isActive}
            onChange={(checked) => setForm({ ...form, isActive: checked })}
          />
          <FormActions
            error={formError}
            saving={saving}
            onCancel={() => setModalOpen(false)}
          />
        </form>
      </Modal>

      <ConfirmModal
        open={deletingCategory !== null}
        title="ยืนยันการลบหมวดหมู่"
        message={`ต้องการลบหมวดหมู่ "${deletingCategory?.name}" ใช่หรือไม่?\nถ้าหมวดนี้มีเมนูอยู่ ระบบจะเปลี่ยนเป็นปิดใช้งานแทนการลบ เพื่อรักษาประวัติการสั่งซื้อ`}
        confirmText="ยืนยันลบ"
        tone="danger"
        onConfirm={executeDelete}
        onClose={() => setDeletingCategory(null)}
      />
    </div>
  );
}
