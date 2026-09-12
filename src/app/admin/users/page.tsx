'use client';

import { useCallback, useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import ConfirmModal from '@/components/ConfirmModal';
import { TableSkeleton, EmptyState, ErrorState, Notice } from '@/components/DataState';
import { TextField, SelectField, CheckboxField, FormActions } from '@/components/Field';
import { apiFetch, jsonBody } from '@/lib/client';
import { formatThaiDate } from '@/lib/format';
import { PlusIcon, CrownIcon, BriefcaseIcon, BanIcon, EyeIcon, BuildingIcon } from '@/components/Icons';

/** ผู้ใช้ 1 แถวตามที่ GET /api/admin/users คืนมา (ไม่มี password_hash) */
type SystemUser = {
  id: number;
  username: string;
  full_name: string;
  role: 'ADMIN' | 'STAFF';
  branch_id: number | null;
  branch_name: string | null;
  is_active: number;
  created_at: string;
  activity_count: number;
};

type BranchSimple = {
  id: number;
  code: string;
  name: string;
};

/** ค่าตั้งต้นของฟอร์มตอนกดเพิ่มผู้ใช้ใหม่ */
const EMPTY_FORM = {
  username: '',
  password: '',
  fullName: '',
  role: 'STAFF',
  branchId: '1',
  isActive: true,
};

/** ตัวเลือกบทบาทพร้อมคำอธิบายภาษาไทย */
const ROLE_OPTIONS = [
  { value: 'STAFF', label: 'พนักงาน (ดูออเดอร์ ปิดบิล ตอบ ticket ประจำสาขา)' },
  { value: 'ADMIN', label: 'ผู้ดูแลระบบ (เข้าถึงทุกส่วน)' },
];

/**
 * หน้าจัดการผู้ใช้ระบบ เข้าได้เฉพาะแอดมิน
 * รองรับการกำหนดสาขาที่สังกัด หรือกำหนดให้เป็นผู้ดูแลระบบส่วนกลาง (HQ Admin)
 */
export default function UsersPage() {
  const [items, setItems] = useState<SystemUser[] | null>(null);
  const [branches, setBranches] = useState<BranchSimple[]>([]);
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
   * โหลดรายชื่อผู้ใช้ระบบทั้งหมดและสาขา
   */
  const load = useCallback(async () => {
    setItems(null);
    setLoadError('');
    const [uRes, bRes] = await Promise.all([
      apiFetch<SystemUser[]>('/api/admin/users'),
      apiFetch<BranchSimple[]>('/api/admin/branches'),
    ]);

    if (uRes.ok) setItems(uRes.data);
    else setLoadError(uRes.message);

    if (bRes.ok && Array.isArray(bRes.data)) {
      setBranches(bRes.data);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * เปิด modal ในโหมดเพิ่มใหม่หรือแก้ไข
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
            branchId: user.branch_id !== null && user.branch_id !== undefined ? String(user.branch_id) : '',
            isActive: user.is_active === 1,
          }
        : EMPTY_FORM,
    );
    setFormError('');
    setModalOpen(true);
  }

  /**
   * บันทึกฟอร์มผู้ใช้
   */
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError('');

    const payload = {
      username: form.username,
      password: form.password,
      fullName: form.fullName,
      role: form.role,
      branchId: form.branchId ? Number(form.branchId) : null,
      isActive: form.isActive,
    };

    const result = editing
      ? await apiFetch(`/api/admin/users/${editing.id}`, { method: 'PUT', body: jsonBody(payload) })
      : await apiFetch('/api/admin/users', { method: 'POST', body: jsonBody(payload) });
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

  async function executeDelete() {
    if (!deletingUser) return;
    const target = deletingUser;
    setDeletingUser(null);

    const result = await apiFetch<{ mode: string; message: string }>(
      `/api/admin/users/${target.id}`,
      { method: 'DELETE' },
    );
    if (!result.ok) {
      setNotice({ tone: 'error', message: result.message });
      return;
    }
    setNotice({ tone: 'success', message: result.data.message });
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slip">ผู้ใช้ระบบ (User Management)</h1>
          <p className="text-xs text-slip-dim">
            จัดการบัญชีผู้ใช้ระบบ กำหนดบทบาท และจัดสรรสาขาประจำของพนักงาน
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openForm()}
            className="min-h-[40px] rounded-xl bg-emerald-600 px-4 font-bold text-xs text-white shadow-xs transition-colors hover:bg-emerald-700 flex items-center gap-1.5 cursor-pointer"
          >
            <PlusIcon className="w-4 h-4" />
            <span>เพิ่มผู้ใช้ใหม่</span>
          </button>
        </div>
      </div>

      {notice.message && (
        <Notice
          tone={notice.tone}
          message={notice.message}
          onDismiss={() => setNotice({ tone: 'success', message: '' })}
        />
      )}

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
        <div className="overflow-x-auto rounded-xl border border-rule bg-white shadow-xs">
          <table className="w-full min-w-[44rem] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-rule bg-zinc-50/75 font-semibold text-zinc-500 uppercase tracking-wider">
                <th className="px-4 py-3">ชื่อผู้ใช้</th>
                <th className="px-4 py-3">ชื่อ-สกุล</th>
                <th className="px-4 py-3">บทบาท</th>
                <th className="px-4 py-3">สาขาที่สังกัด</th>
                <th className="px-4 py-3">สถานะ</th>
                <th className="px-4 py-3">สร้างเมื่อ</th>
                <th className="px-4 py-3 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {items.map((user) => (
                <tr key={user.id} className="hover:bg-zinc-50/50 transition-colors">
                  <td className="num px-4 py-3 font-semibold text-zinc-900">{user.username}</td>
                  <td className="px-4 py-3 text-zinc-800">{user.full_name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold ${
                        user.role === 'ADMIN'
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : 'bg-zinc-100 text-zinc-700'
                      }`}
                    >
                      {user.role === 'ADMIN' ? 'ผู้ดูแลระบบ' : 'พนักงาน'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {user.branch_id === null ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                        <span>สำนักงานใหญ่ (HQ)</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700">
                        <BuildingIcon className="w-3 h-3 text-zinc-500" />
                        <span>{user.branch_name || `สาขา #${user.branch_id}`}</span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        user.is_active === 1
                          ? 'bg-green-50 text-green-700'
                          : 'bg-zinc-100 text-zinc-500'
                      }`}
                    >
                      {user.is_active === 1 ? 'ใช้งานได้' : 'ปิดใช้งาน'}
                    </span>
                  </td>
                  <td className="num px-4 py-3 text-zinc-500">{formatThaiDate(user.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => openForm(user)}
                        className="rounded-md border border-rule px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 transition cursor-pointer"
                      >
                        แก้ไข
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(user)}
                        className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-600 hover:bg-red-100 transition cursor-pointer"
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
          ระบบกำหนดขอบเขตอำนาจหน้าที่อย่างชัดเจน เพื่อความปลอดภัยในการดำเนินงานหน้าร้าน และจำกัดการเข้าถึงข้อมูลตามสาขา
        </p>

        <div className="overflow-x-auto rounded-xl border border-rule">
          <table className="w-full min-w-[34rem] text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-rule bg-zinc-50 font-bold text-slip-dim">
                <th className="px-4 py-2.5">ฟังก์ชันการทำงาน</th>
                <th className="px-4 py-2.5 text-center">
                  <span className="inline-flex items-center justify-center gap-1.5 text-slate-900">
                    <CrownIcon className="w-4 h-4 text-amber-600" />
                    <span>เจ้าของร้าน (HQ Admin)</span>
                  </span>
                </th>
                <th className="px-4 py-2.5 text-center">
                  <span className="inline-flex items-center justify-center gap-1.5 text-slate-900">
                    <BriefcaseIcon className="w-4 h-4 text-slate-600" />
                    <span>พนักงานสาขา (STAFF)</span>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              <tr>
                <td className="px-4 py-2.5 font-medium text-slip">ดูภาพรวมยอดขาย กำไร และสถิติการเงินร้าน</td>
                <td className="px-4 py-2.5 text-center text-emerald-700 font-bold">เข้าถึงได้ทุกสาขา</td>
                <td className="px-4 py-2.5 text-center text-slate-500 font-medium">
                  <span className="inline-flex items-center gap-1 text-red-600">
                    <BanIcon className="w-3.5 h-3.5" />
                    <span>ปิดการเข้าถึง</span>
                  </span>
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-medium text-slip">จัดการข้อมูลสาขา (เพิ่ม/แก้ไขสาขา)</td>
                <td className="px-4 py-2.5 text-center text-emerald-700 font-bold">ทำได้ทุกอย่าง</td>
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
                <td className="px-4 py-2.5 font-medium text-slip">จัดการเมนูหลัก และราคาพิเศษเฉพาะสาขา</td>
                <td className="px-4 py-2.5 text-center text-emerald-700 font-bold">ทำได้ทุกสาขา</td>
                <td className="px-4 py-2.5 text-center text-amber-700 font-semibold">
                  <span className="inline-flex items-center gap-1">
                    <EyeIcon className="w-3.5 h-3.5 text-amber-600" />
                    <span>ดู & สลับของหมดในสาขาได้</span>
                  </span>
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-medium text-slip">กระดานออเดอร์และเช็คบิล</td>
                <td className="px-4 py-2.5 text-center text-green-700 font-bold">สลับดูได้ทุกสาขา</td>
                <td className="px-4 py-2.5 text-center text-green-700 font-bold">เฉพาะสาขาของตนเอง</td>
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
            placeholder="เช่น staff_ari01"
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

          <SelectField
            id="user-branch"
            label="สาขาที่สังกัด"
            value={form.branchId}
            onChange={(value) => setForm({ ...form, branchId: value })}
            options={[
              { value: '', label: 'สำนักงานใหญ่ (HQ / เข้าถึงทุกสาขา)' },
              ...branches.map((b) => ({
                value: String(b.id),
                label: `${b.name} (${b.code})`,
              })),
            ]}
          />
          <p className="text-xs text-zinc-500 -mt-2">
            {form.role === 'STAFF'
              ? 'พนักงานต้องถูกล็อกไว้กับสาขาใดสาขาหนึ่งเพื่อความปลอดภัย'
              : 'หากเลือกสำนักงานใหญ่จะสามารถสลับดูข้อมูลได้ทุกสาขา'}
          </p>

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
