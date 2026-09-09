'use client';

import { useCallback, useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import { TableSkeleton, EmptyState, ErrorState, Notice } from '@/components/DataState';
import { TextField, SelectField, CheckboxField, FormActions } from '@/components/Field';
import { apiFetch, jsonBody } from '@/lib/client';
import { formatThaiDate } from '@/lib/format';

/** ผู้ใช้ 1 แถวตามที่ GET /api/admin/users คืนมา (ไม่มี password_hash) */
type SystemUser = {
  id: number;
  username: string;
  full_name: string;
  role: 'ADMIN' | 'STAFF';
  is_active: number;
  created_at: string;
  activity_count: number;
};

/** ค่าตั้งต้นของฟอร์มตอนกดเพิ่มผู้ใช้ใหม่ */
const EMPTY_FORM = {
  username: '',
  password: '',
  fullName: '',
  role: 'STAFF',
  isActive: true,
};

/** ตัวเลือกบทบาทพร้อมคำอธิบายภาษาไทย */
const ROLE_OPTIONS = [
  { value: 'STAFF', label: 'พนักงาน (ดูออเดอร์ ปิดบิล ตอบ ticket)' },
  { value: 'ADMIN', label: 'ผู้ดูแลระบบ (ทำได้ทุกอย่าง)' },
];

/**
 * หน้าจัดการผู้ใช้ระบบ เข้าได้เฉพาะแอดมิน
 * บัญชีที่เคยทำรายการในระบบแล้วจะถูกปิดใช้งานแทนการลบ เพื่อให้ยังสืบย้อนได้ว่าใครทำอะไร
 *
 * @returns หน้าจอตารางผู้ใช้พร้อมฟอร์มใน modal
 */
export default function UsersPage() {
  const [items, setItems] = useState<SystemUser[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string }>({
    tone: 'success',
    message: '',
  });
  const [editing, setEditing] = useState<SystemUser | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  /**
   * โหลดรายชื่อผู้ใช้ระบบทั้งหมดใหม่
   *
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือปรับ state ของรายการผู้ใช้
   */
  const load = useCallback(async () => {
    setItems(null);
    setLoadError('');
    const result = await apiFetch<SystemUser[]>('/api/admin/users');
    if (result.ok) setItems(result.data);
    else setLoadError(result.message);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * เปิด modal ในโหมดเพิ่มใหม่หรือแก้ไข ตอนแก้ไขจะเว้นช่องรหัสผ่านว่างไว้เสมอ
   * เพราะระบบเก็บแต่ hash จึงเอารหัสผ่านเดิมมาแสดงไม่ได้
   *
   * @param user - ผู้ใช้ที่จะแก้ไข ถ้าไม่ส่งมาแปลว่าเพิ่มใหม่
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือเปิด modal พร้อมค่าตั้งต้นของฟอร์ม
   */
  function openForm(user?: SystemUser) {
    setEditing(user ?? null);
    setForm(
      user
        ? {
            username: user.username,
            password: '',
            fullName: user.full_name,
            role: user.role,
            isActive: user.is_active === 1,
          }
        : EMPTY_FORM,
    );
    setFormError('');
    setModalOpen(true);
  }

  /**
   * บันทึกฟอร์มผู้ใช้ รหัสผ่านจะถูก hash ที่ฝั่งเซิร์ฟเวอร์ก่อนบันทึกเสมอ
   *
   * @param event - เหตุการณ์ submit ใช้ยกเลิกการรีโหลดหน้า
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือเขียนข้อมูลลงฐานข้อมูลและรีโหลดตาราง
   */
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    const result = editing
      ? await apiFetch(`/api/admin/users/${editing.id}`, { method: 'PUT', body: jsonBody(form) })
      : await apiFetch('/api/admin/users', { method: 'POST', body: jsonBody(form) });
    setSaving(false);

    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    setModalOpen(false);
    setNotice({
      tone: 'success',
      message: editing ? 'แก้ไขข้อมูลผู้ใช้เรียบร้อยแล้ว' : 'เพิ่มผู้ใช้ใหม่เรียบร้อยแล้ว',
    });
    load();
  }

  /**
   * ลบผู้ใช้ ถามยืนยันก่อน และแสดงเหตุผลเมื่อระบบเปลี่ยนเป็นปิดใช้งานแทน
   *
   * @param user - ผู้ใช้ที่จะลบ
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือลบหรือปิดใช้งานแล้วรีโหลดตาราง
   */
  async function handleDelete(user: SystemUser) {
    const confirmed = window.confirm(
      `ต้องการลบผู้ใช้ "${user.username}" ใช่หรือไม่\nถ้าบัญชีนี้เคยทำรายการในระบบแล้ว ระบบจะเปลี่ยนเป็นปิดใช้งานแทนการลบ`,
    );
    if (!confirmed) return;

    const result = await apiFetch<{ mode: string; message: string }>(
      `/api/admin/users/${user.id}`,
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
          <h1 className="text-xl font-semibold text-slip">ผู้ใช้ระบบ</h1>
          <p className="text-slip-dim">บัญชีสำหรับพนักงานและผู้ดูแลร้าน ลูกค้าไม่ต้องมีบัญชี</p>
        </div>
        <button
          type="button"
          onClick={() => openForm()}
          className="min-h-[44px] rounded-sm bg-flame px-4 font-medium text-char"
        >
          เพิ่มผู้ใช้
        </button>
      </div>

      <Notice
        tone={notice.tone}
        message={notice.message}
        onDismiss={() => setNotice({ tone: 'success', message: '' })}
      />

      {loadError && <ErrorState message={loadError} onRetry={load} />}
      {!loadError && items === null && <TableSkeleton rows={4} />}
      {!loadError && items !== null && items.length === 0 && (
        <EmptyState
          message="ยังไม่มีผู้ใช้ในระบบ — เพิ่มบัญชีพนักงานคนแรกเพื่อให้เข้าใช้งานหลังบ้านได้"
          action={
            <button
              type="button"
              onClick={() => openForm()}
              className="min-h-[44px] rounded-sm bg-flame px-4 font-medium text-char"
            >
              เพิ่มผู้ใช้คนแรก
            </button>
          }
        />
      )}

      {!loadError && items !== null && items.length > 0 && (
        <div className="overflow-x-auto border border-rule">
          <table className="w-full min-w-[44rem] border-collapse">
            <thead>
              <tr className="border-b border-rule bg-griddle text-left text-slip-dim">
                <th className="px-3 py-2 font-medium">ชื่อผู้ใช้</th>
                <th className="px-3 py-2 font-medium">ชื่อ-สกุล</th>
                <th className="px-3 py-2 font-medium">บทบาท</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
                <th className="px-3 py-2 font-medium">สร้างเมื่อ</th>
                <th className="px-3 py-2 font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {items.map((user) => (
                <tr key={user.id} className="border-b border-rule last:border-b-0">
                  <td className="num px-3 py-2 text-slip">{user.username}</td>
                  <td className="px-3 py-2 text-slip">{user.full_name}</td>
                  <td className="px-3 py-2 text-slip-dim">
                    {user.role === 'ADMIN' ? 'ผู้ดูแลระบบ' : 'พนักงาน'}
                  </td>
                  <td className="px-3 py-2">
                    <span className={user.is_active === 1 ? 'text-served' : 'text-slip-dim'}>
                      {user.is_active === 1 ? 'ใช้งานได้' : 'ปิดใช้งาน'}
                    </span>
                  </td>
                  <td className="num px-3 py-2 text-slip-dim">{formatThaiDate(user.created_at)}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openForm(user)}
                        className="min-h-[44px] text-slip underline underline-offset-4"
                      >
                        แก้ไข
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(user)}
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
        title={editing ? `แก้ไขผู้ใช้: ${editing.username}` : 'เพิ่มผู้ใช้ใหม่'}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <TextField
            id="user-username"
            label="ชื่อผู้ใช้"
            value={form.username}
            onChange={(value) => setForm({ ...form, username: value })}
            placeholder="เช่น staff02"
            hint="ใช้ได้เฉพาะ a-z 0-9 จุด และขีดล่าง"
          />
          <TextField
            id="user-fullname"
            label="ชื่อ-สกุล"
            value={form.fullName}
            onChange={(value) => setForm({ ...form, fullName: value })}
            placeholder="เช่น สมชาย ใจดี"
          />
          <TextField
            id="user-password"
            type="password"
            label="รหัสผ่าน"
            value={form.password}
            onChange={(value) => setForm({ ...form, password: value })}
            hint={
              editing
                ? 'เว้นว่างไว้ถ้าไม่ต้องการเปลี่ยนรหัสผ่านเดิม'
                : 'อย่างน้อย 8 ตัวอักษร'
            }
          />
          <SelectField
            id="user-role"
            label="บทบาท"
            value={form.role}
            onChange={(value) => setForm({ ...form, role: value })}
            options={ROLE_OPTIONS}
          />
          <CheckboxField
            label="เปิดใช้งาน (บัญชีนี้ล็อกอินเข้าระบบได้)"
            checked={form.isActive}
            onChange={(checked) => setForm({ ...form, isActive: checked })}
          />
          <FormActions error={formError} saving={saving} onCancel={() => setModalOpen(false)} />
        </form>
      </Modal>
    </div>
  );
}
