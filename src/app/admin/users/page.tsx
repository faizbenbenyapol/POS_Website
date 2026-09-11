'use client';

import { useCallback, useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import ConfirmModal from '@/components/ConfirmModal';
import { TableSkeleton, EmptyState, ErrorState, Notice } from '@/components/DataState';
import { TextField, SelectField, CheckboxField, FormActions } from '@/components/Field';
import { apiFetch, jsonBody } from '@/lib/client';
import { formatThaiDate } from '@/lib/format';
import { PlusIcon, CrownIcon, BriefcaseIcon, BanIcon, EyeIcon } from '@/components/Icons';

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
  const [deletingUser, setDeletingUser] = useState<SystemUser | null>(null);

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

  function handleDelete(user: SystemUser) {
    setDeletingUser(user);
  }

  /**
   * ดำเนินการลบผู้ใช้จริงหลังจากผ่านการยืนยันใน ConfirmModal
   */
  async function executeDelete() {
    if (!deletingUser) return;
    const target = deletingUser;
    setDeletingUser(null);

    const result = await apiFetch<{ mode: string; message: string }>(
      `/api/admin/users/${target.id}`,
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
          className="min-h-[42px] rounded-xl bg-emerald-600 px-4 font-bold text-xs text-white shadow-xs transition-colors hover:bg-emerald-700 flex items-center gap-1.5 cursor-pointer"
        >
          <PlusIcon className="w-4 h-4" />
          <span>เพิ่มผู้ใช้</span>
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
              className="min-h-[44px] rounded-xl bg-emerald-600 px-4 font-bold text-sm text-white shadow-xs transition-colors hover:bg-emerald-700 flex items-center gap-1.5 cursor-pointer"
            >
              <PlusIcon className="w-4 h-4" />
              <span>เพิ่มผู้ใช้คนแรก</span>
            </button>
          }
        />
      )}

      {!loadError && items !== null && items.length > 0 && (
        <div className="overflow-x-auto rounded-lg bg-griddle shadow-sm">
          <table className="w-full min-w-[44rem] border-collapse">
            <thead>
              <tr className="bg-char text-left text-slip-dim">
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
                    <span
                      className={`rounded-full px-2 py-0.5 text-sm ${
                        user.is_active === 1 ? 'bg-served/10 text-served' : 'bg-char text-slip-dim'
                      }`}
                    >
                      {user.is_active === 1 ? 'ใช้งานได้' : 'ปิดใช้งาน'}
                    </span>
                  </td>
                  <td className="num px-3 py-2 text-slip-dim">{formatThaiDate(user.created_at)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openForm(user)}
                        className="rounded-lg border border-rule bg-paper px-3 py-1 text-xs font-semibold text-slip transition-colors hover:border-slate-400 hover:text-slate-900 cursor-pointer"
                      >
                        แก้ไข
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(user)}
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

      {/* Role Permissions Matrix Guide */}
      <div className="rounded-2xl border border-rule bg-white p-5 shadow-xs">
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-sm font-bold text-slip">ตารางเปรียบเทียบสิทธิ์การใช้งาน (Permissions Matrix)</h2>
        </div>
        <p className="text-xs text-slip-dim mb-3.5">
          ระบบกำหนดขอบเขตอำนาจหน้าที่อย่างชัดเจน เพื่อความปลอดภัยในการดำเนินงานหน้าร้าน และปกป้องข้อมูลทางการเงินของเจ้าของร้าน
        </p>

        <div className="overflow-x-auto rounded-xl border border-rule">
          <table className="w-full min-w-[34rem] text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-rule bg-zinc-50 font-bold text-slip-dim">
                <th className="px-4 py-2.5">ฟังก์ชันการทำงาน</th>
                <th className="px-4 py-2.5 text-center">
                  <span className="inline-flex items-center justify-center gap-1.5 text-slate-900">
                    <CrownIcon className="w-4 h-4 text-amber-600" />
                    <span>เจ้าของร้าน (ADMIN)</span>
                  </span>
                </th>
                <th className="px-4 py-2.5 text-center">
                  <span className="inline-flex items-center justify-center gap-1.5 text-slate-900">
                    <BriefcaseIcon className="w-4 h-4 text-slate-600" />
                    <span>พนักงานหน้าร้าน (STAFF)</span>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              <tr>
                <td className="px-4 py-2.5 font-medium text-slip">ดูภาพรวมยอดขาย กำไร และสถิติการเงินร้าน</td>
                <td className="px-4 py-2.5 text-center text-emerald-700 font-bold">เข้าถึงได้ 100%</td>
                <td className="px-4 py-2.5 text-center text-slate-500 font-medium">
                  <span className="inline-flex items-center gap-1 text-red-600">
                    <BanIcon className="w-3.5 h-3.5" />
                    <span>ปิดการเข้าถึง</span>
                  </span>
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-medium text-slip">จัดการบัญชีผู้ใช้ระบบ (เพิ่ม/แก้/ลบพนักงาน)</td>
                <td className="px-4 py-2.5 text-center text-emerald-700 font-bold">เข้าถึงได้ 100%</td>
                <td className="px-4 py-2.5 text-center text-slate-500 font-medium">
                  <span className="inline-flex items-center gap-1 text-red-600">
                    <BanIcon className="w-3.5 h-3.5" />
                    <span>ปิดการเข้าถึง</span>
                  </span>
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-medium text-slip">จัดการเมนูอาหาร (เพิ่ม, แก้ราคา, อัปโหลดรูป, ลบ)</td>
                <td className="px-4 py-2.5 text-center text-emerald-700 font-bold">ทำได้ทุกอย่าง</td>
                <td className="px-4 py-2.5 text-center text-amber-700 font-semibold">
                  <span className="inline-flex items-center gap-1">
                    <EyeIcon className="w-3.5 h-3.5 text-amber-600" />
                    <span>ดู & สลับของหมดได้เท่านั้น</span>
                  </span>
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-medium text-slip">จัดการหมวดหมู่อาหาร</td>
                <td className="px-4 py-2.5 text-center text-emerald-700 font-bold">ทำได้ทุกอย่าง</td>
                <td className="px-4 py-2.5 text-center text-slate-500 font-medium">
                  <span className="inline-flex items-center gap-1 text-red-600">
                    <BanIcon className="w-3.5 h-3.5" />
                    <span>ปิดการเข้าถึง</span>
                  </span>
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-medium text-slip">เพิ่มหรือลบโครงสร้างโต๊ะในร้าน</td>
                <td className="px-4 py-2.5 text-center text-emerald-700 font-bold">ทำได้</td>
                <td className="px-4 py-2.5 text-center text-slate-500 font-medium">
                  <span className="inline-flex items-center gap-1 text-red-600">
                    <BanIcon className="w-3.5 h-3.5" />
                    <span>ลบ/เพิ่มโต๊ะไม่ได้</span>
                  </span>
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-medium text-slip">สร้าง QR Code ใหม่ประจำโต๊ะ (Regenerate QR)</td>
                <td className="px-4 py-2.5 text-center text-green-700 font-bold"> ทำได้</td>
                <td className="px-4 py-2.5 text-center text-green-700 font-bold"> ทำได้ (เมื่อเคลียร์โต๊ะ)</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-medium text-slip">พิมพ์ป้าย QR Code ตั้งโต๊ะ (A4/A5) และสลิป (80mm)</td>
                <td className="px-4 py-2.5 text-center text-green-700 font-bold"> ทำได้</td>
                <td className="px-4 py-2.5 text-center text-green-700 font-bold"> ทำได้</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-medium text-slip">กระดานออเดอร์ (รับออเดอร์, อัปเดตสถานะ กำลังทำ/เสิร์ฟแล้ว)</td>
                <td className="px-4 py-2.5 text-center text-green-700 font-bold"> ทำได้</td>
                <td className="px-4 py-2.5 text-center text-green-700 font-bold"> ทำได้</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-medium text-slip">แคชเชียร์เช็คบิล คิดเงิน และพิมพ์ใบเสร็จ</td>
                <td className="px-4 py-2.5 text-center text-green-700 font-bold"> ทำได้</td>
                <td className="px-4 py-2.5 text-center text-green-700 font-bold"> ทำได้</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-medium text-slip">รับเรื่องแจ้งปัญหาจากลูกค้าที่โต๊ะ</td>
                <td className="px-4 py-2.5 text-center text-green-700 font-bold"> ทำได้</td>
                <td className="px-4 py-2.5 text-center text-green-700 font-bold"> ทำได้</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

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

      <ConfirmModal
        open={deletingUser !== null}
        title="ยืนยันการลบผู้ใช้"
        message={`ต้องการลบผู้ใช้ "${deletingUser?.username}" (${deletingUser?.full_name}) ใช่หรือไม่?\nถ้าบัญชีนี้เคยทำรายการในระบบแล้ว ระบบจะเปลี่ยนเป็นปิดใช้งานแทนการลบ เพื่อรักษาประวัติการทำงาน`}
        confirmText="ยืนยันลบ"
        tone="danger"
        onConfirm={executeDelete}
        onClose={() => setDeletingUser(null)}
      />
    </div>
  );
}
