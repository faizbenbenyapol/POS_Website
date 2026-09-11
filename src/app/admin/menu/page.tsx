'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Modal from '@/components/Modal';
import ConfirmModal from '@/components/ConfirmModal';
import { TableSkeleton, EmptyState, ErrorState, Notice } from '@/components/DataState';
import { TextField, NumberField, SelectField, CheckboxField, FormActions } from '@/components/Field';
import MenuItemThumb from '@/components/MenuItemThumb';
import { apiFetch, jsonBody } from '@/lib/client';
import { formatBaht } from '@/lib/format';
import { PlusIcon, PhotoIcon, UploadIcon, CloseIcon } from '@/components/Icons';

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

/** รูปภาพตัวอย่างอาหารยอดนิยม สำหรับคลิกเลือกด่วนเมื่อยังไม่มีรูป */
const FOOD_PRESETS = [
  { label: 'กะเพรา', url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=640&q=80' },
  { label: 'ผัดไทย', url: 'https://images.unsplash.com/photo-1559314809-0d155014e29e?w=640&q=80' },
  { label: 'ต้มยำกุ้ง', url: 'https://images.unsplash.com/photo-1541518763669-27fef04b14ea?w=640&q=80' },
  { label: 'ข้าวผัด', url: 'https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?w=640&q=80' },
  { label: 'ปีกไก่ทอด', url: 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=640&q=80' },
  { label: 'ชาไทยเย็น', url: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=640&q=80' },
  { label: 'ยำวุ้นเส้น', url: 'https://images.unsplash.com/photo-1553163147-622ab57be1c7?w=640&q=80' },
  { label: 'หมูสะเต๊ะ', url: 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=640&q=80' },
];

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
  const [currentUser, setCurrentUser] = useState<{ role: string; fullName: string } | null>(null);
  const [deletingItem, setDeletingItem] = useState<MenuItem | null>(null);
  const [imageInputMode, setImageInputMode] = useState<'upload' | 'url'>('upload');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * จัดการอัปโหลดไฟล์รูปภาพจากเครื่องไปยังเซิร์ฟเวอร์
   *
   * @param file - ไฟล์รูปภาพที่เลือก
   */
  async function handleFileUpload(file: File) {
    setUploading(true);
    setUploadError('');
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/admin/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.ok) {
        setForm((prev) => ({ ...prev, imageUrl: data.data.url }));
      } else {
        setUploadError(data.error?.message || 'อัปโหลดรูปภาพไม่สำเร็จ');
      }
    } catch {
      setUploadError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setUploading(false);
    }
  }

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
    apiFetch<{ role: string; fullName: string }>('/api/auth/me').then((res) => {
      if (res.ok) setCurrentUser(res.data);
    });
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
    setUploadError('');
    setImageInputMode('upload');
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

  function handleDelete(item: MenuItem) {
    setDeletingItem(item);
  }

  /**
   * ดำเนินการลบเมนูจริงหลังผ่านการยืนยันใน ConfirmModal
   */
  async function executeDelete() {
    if (!deletingItem) return;
    const target = deletingItem;
    setDeletingItem(null);

    const result = await apiFetch<{ mode: string; message: string }>(
      `/api/admin/menu-items/${target.id}`,
      { method: 'DELETE' },
    );
    setNotice(
      result.ok
        ? { tone: 'success', message: result.data.message }
        : { tone: 'error', message: result.message },
    );
    if (result.ok) load();
  }

  /**
   * สลับสถานะเปิดขาย / ของหมด ได้ทันที (ทั้ง ADMIN และ STAFF ทำได้)
   */
  async function toggleAvailability(item: MenuItem) {
    const nextVal = item.is_available !== 1;
    setItems((prev) =>
      prev ? prev.map((it) => (it.id === item.id ? { ...it, is_available: nextVal ? 1 : 0 } : it)) : null,
    );

    const result = await apiFetch(`/api/admin/menu-items/${item.id}`, {
      method: 'PATCH',
      body: jsonBody({ isAvailable: nextVal }),
    });

    if (result.ok) {
      setNotice({
        tone: 'success',
        message: `เปลี่ยนสถานะเมนู "${item.name}" เป็น "${nextVal ? 'เปิดขาย' : 'ปิดขาย (ของหมด)'}" เรียบร้อยแล้ว`,
      });
    } else {
      setNotice({ tone: 'error', message: result.message });
      load();
    }
  }

  const isAdmin = currentUser?.role === 'ADMIN';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slip">เมนูอาหาร</h1>
          <p className="text-xs text-slip-dim">ราคาที่แก้จะมีผลกับออเดอร์ใหม่เท่านั้น บิลเก่าไม่เปลี่ยนตาม</p>
        </div>
        <div className="flex items-center gap-2">
          {!isAdmin && currentUser && (
            <span className="rounded-full bg-zinc-100 border border-rule px-3 py-1 text-xs text-slip-dim font-medium">
              สิทธิ์พนักงาน: สลับสถานะของหมดได้ (แก้ไขราคา/ลบสงวนสิทธิ์เจ้าของร้าน)
            </span>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={() => openForm()}
              className="min-h-[42px] rounded-xl bg-emerald-600 px-4 font-bold text-xs text-white shadow-xs transition-colors hover:bg-emerald-700 flex items-center gap-1.5 cursor-pointer"
            >
              <PlusIcon className="w-4 h-4" />
              <span>เพิ่มเมนู</span>
            </button>
          )}
        </div>
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
              className="min-h-[44px] rounded-xl bg-emerald-600 px-4 font-bold text-sm text-white shadow-xs transition-colors hover:bg-emerald-700 flex items-center gap-1.5 cursor-pointer"
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
              className="lm-card flex flex-col overflow-hidden transition-all hover:border-slate-300"
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
                  <button
                    type="button"
                    onClick={() => toggleAvailability(item)}
                    title="คลิกเพื่อสลับ เปิดขาย / ของหมด"
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer shadow-xs ${
                      item.is_available === 1
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200'
                        : 'bg-red-50 text-red-700 border border-red-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200'
                    }`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${
                        item.is_available === 1 ? 'bg-emerald-500' : 'bg-red-500'
                      }`}
                    />
                    <span>{item.is_available === 1 ? 'เปิดขาย' : 'ของหมด'}</span>
                    <span className="text-[10px] opacity-70">(สลับ)</span>
                  </button>
                </div>
                {item.description && <p className="text-xs text-slip-dim line-clamp-2">{item.description}</p>}
                <p className="text-xs font-semibold text-emerald-700">{item.category_name}</p>
                <div className="mt-auto flex items-center justify-between pt-2">
                  <p className="num text-base font-extrabold text-slip">{formatBaht(item.price)} <span className="text-xs font-normal text-slip-dim">บาท</span></p>
                  <p className="num text-xs text-slip-dim">สั่งไปแล้ว <strong className="text-slip">{item.order_count}</strong> ครั้ง</p>
                </div>
                {isAdmin && (
                  <div className="mt-3 flex gap-2 border-t border-rule/50 pt-3">
                    <button
                      type="button"
                      onClick={() => openForm(item)}
                      className="flex-1 rounded-xl border border-rule bg-paper py-2 text-xs font-semibold text-slip transition-colors hover:border-slate-400 hover:text-slate-900 cursor-pointer"
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
                )}
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
          {/* ส่วนจัดการรูปภาพอาหารพร้อม Live Preview ชัดเจน */}
          <div className="flex flex-col gap-2.5 rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-3.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-700">
                รูปภาพอาหาร (โชว์บนเมนูลูกค้า)
              </label>
              {!form.imageUrl && (
                <div className="flex rounded-lg border border-zinc-200 bg-white p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setImageInputMode('upload')}
                    className={`rounded-md px-2.5 py-1 font-semibold transition-all ${
                      imageInputMode === 'upload'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-zinc-500 hover:text-zinc-800'
                    }`}
                  >
                    อัปโหลดรูป
                  </button>
                  <button
                    type="button"
                    onClick={() => setImageInputMode('url')}
                    className={`rounded-md px-2.5 py-1 font-semibold transition-all ${
                      imageInputMode === 'url'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-zinc-500 hover:text-zinc-800'
                    }`}
                  >
                    ใส่ลิงก์ URL
                  </button>
                </div>
              )}
            </div>

            {/* หากมีรูปภาพแล้ว: แสดงตัวอย่างขนาดใหญ่ชัดเจน พร้อมปุ่มลบรูป */}
            {form.imageUrl ? (
              <div className="relative overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs">
                <div className="relative h-44 w-full bg-zinc-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={form.imageUrl}
                    alt={form.name || 'ตัวอย่างรูปภาพอาหาร'}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, imageUrl: '' })}
                      className="rounded-lg bg-red-600/90 text-white px-3 py-1.5 text-xs font-semibold shadow-md backdrop-blur-xs hover:bg-red-700 transition-colors flex items-center gap-1"
                    >
                      <CloseIcon className="w-3.5 h-3.5" />
                      <span>ลบรูปภาพ</span>
                    </button>
                  </div>
                  <div className="absolute bottom-2.5 left-2.5 rounded-md bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-xs flex items-center gap-1.5">
                    <PhotoIcon className="w-3.5 h-3.5 text-emerald-400" />
                    <span>
                      {form.imageUrl.startsWith('/uploads/') ? 'รูปภาพจากเครื่องของคุณ' : 'รูปภาพจากลิงก์เว็บ'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              /* หากยังไม่มีรูป: แสดงกล่องเลือกไฟล์ หรือ ช่องกรอกลิงก์ */
              <div className="flex flex-col gap-2.5">
                {imageInputMode === 'upload' ? (
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file);
                        e.target.value = '';
                      }}
                    />
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => fileInputRef.current?.click()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          fileInputRef.current?.click();
                        }
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const file = e.dataTransfer.files?.[0];
                        if (file) handleFileUpload(file);
                      }}
                      className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all ${
                        uploading
                          ? 'border-emerald-400 bg-emerald-50/50'
                          : 'border-zinc-300 bg-white hover:border-emerald-500 hover:bg-emerald-50/20'
                      }`}
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                        {uploading ? (
                          <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
                        ) : (
                          <UploadIcon className="w-6 h-6" />
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-zinc-800">
                          {uploading
                            ? 'กำลังอัปโหลดรูปภาพ...'
                            : 'คลิกเพื่อเลือกรูปภาพจากเครื่อง หรือลากไฟล์มาวาง'}
                        </p>
                        <p className="mt-1 text-[11px] text-zinc-400">
                          รองรับ JPG, PNG, WEBP ขนาดไม่เกิน 5 MB
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <TextField
                      id="menu-image"
                      label="ลิงก์รูปภาพ (URL)"
                      value={form.imageUrl}
                      onChange={(value) => setForm({ ...form, imageUrl: value })}
                      placeholder="https://images.unsplash.com/..."
                      hint="วางลิงก์รูปภาพโดยตรง ระบบจะดึงภาพมาแสดงตัวอย่างทันที"
                    />
                  </div>
                )}

                {uploadError && (
                  <p role="alert" className="text-xs font-semibold text-red-600 bg-red-50 rounded-lg p-2 border border-red-200">
                    {uploadError}
                  </p>
                )}

                {/* ตัวเลือกลัดรูปภาพอาหารยอดนิยม (Presets) */}
                <div className="pt-1">
                  <p className="text-[11px] font-semibold text-zinc-500 mb-1.5">
                    หรือคลิกเลือกรูปภาพอาหารตัวอย่าง:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {FOOD_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setForm({ ...form, imageUrl: preset.url })}
                        className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition-all hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-700"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          <CheckboxField
            label="เปิดขาย (ลูกค้าเห็นเมนูนี้และสั่งได้)"
            checked={form.isAvailable}
            onChange={(checked) => setForm({ ...form, isAvailable: checked })}
          />
          <FormActions error={formError} saving={saving} onCancel={() => setModalOpen(false)} />
        </form>
      </Modal>

      <ConfirmModal
        open={deletingItem !== null}
        title="ยืนยันการลบเมนู"
        message={`ต้องการลบเมนู "${deletingItem?.name}" ใช่หรือไม่?\nถ้าเมนูนี้เคยถูกสั่งแล้ว ระบบจะเปลี่ยนเป็นปิดขายแทนการลบ เพื่อรักษาประวัติการสั่งซื้อ`}
        confirmText="ยืนยันลบ"
        tone="danger"
        onConfirm={executeDelete}
        onClose={() => setDeletingItem(null)}
      />
    </div>
  );
}
