'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, jsonBody } from '@/lib/client';
import { useToast } from '@/components/Toast';
import { formatBaht, formatThaiDateTime } from '@/lib/format';
import {
  UserCircleIcon,
  LockIcon,
  BuildingIcon,
  ReceiptIcon,
  TicketIcon,
  CreditCardIcon,
  EyeIcon,
  CheckCircleIcon,
  RefreshIcon,
} from '@/components/Icons';

type UserProfileData = {
  profile: {
    id: number;
    username: string;
    fullName: string;
    role: 'ADMIN' | 'STAFF';
    branchId: number | null;
    branchName: string | null;
    branchCode: string | null;
    createdAt: string;
  };
  stats: {
    billsClosed: number;
    paymentsReceived: number;
    totalReceived: number;
    ticketsHandled: number;
  };
};

/**
 * หน้าข้อมูลส่วนตัวและการตั้งค่าความปลอดภัย (Staff Self-Service Profile & Password)
 * รองรับพนักงานทุกคน รวมถึงผู้จัดการสาขาและผู้ดูแลระบบ HQ
 */
export default function ProfilePage() {
  const router = useRouter();
  const { success: toastSuccess, error: toastError } = useToast();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<UserProfileData | null>(null);

  // ข้อมูลฟอร์มชื่อ-นามสกุล
  const [fullName, setFullName] = useState('');
  const [savingName, setSavingName] = useState(false);

  // ข้อมูลฟอร์มรหัสผ่าน
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  /** โหลดข้อมูลโปรไฟล์จาก API */
  async function loadProfile() {
    setLoading(true);
    const result = await apiFetch<UserProfileData>('/api/admin/users/profile');
    setLoading(false);
    if (result.ok) {
      setData(result.data);
      setFullName(result.data.profile.fullName);
    } else {
      toastError('โหลดข้อมูลไม่สำเร็จ', result.message);
    }
  }

  useEffect(() => {
    loadProfile();
  }, []);

  /** บันทึกการแก้ไขชื่อ-นามสกุล */
  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim() || fullName.trim().length < 2) {
      toastError('ข้อผิดพลาด', 'ชื่อ-นามสกุลต้องมีความยาวอย่างน้อย 2 ตัวอักษร');
      return;
    }

    setSavingName(true);
    const result = await apiFetch<{ fullName: string; message: string }>(
      '/api/admin/users/profile',
      {
        method: 'PUT',
        body: jsonBody({ fullName: fullName.trim() }),
      },
    );
    setSavingName(false);

    if (result.ok) {
      toastSuccess('สำเร็จ', result.data.message);
      if (data) {
        setData({
          ...data,
          profile: {
            ...data.profile,
            fullName: result.data.fullName,
          },
        });
      }
      // รีเฟรชหน้าเพื่อให้ Cookie ชุดใหม่ซิงก์สู่ AdminNav
      router.refresh();
    } else {
      toastError('บันทึกไม่สำเร็จ', result.message);
    }
  }

  /** บันทึกการเปลี่ยนรหัสผ่าน */
  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPassword) {
      toastError('ข้อผิดพลาด', 'กรุณาระบุรหัสผ่านปัจจุบัน');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      toastError('ข้อผิดพลาด', 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษร');
      return;
    }
    if (newPassword !== confirmPassword) {
      toastError('ข้อผิดพลาด', 'รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน');
      return;
    }

    setSavingPassword(true);
    const result = await apiFetch<{ message: string }>('/api/admin/users/profile', {
      method: 'PUT',
      body: jsonBody({
        currentPassword,
        newPassword,
        confirmPassword,
      }),
    });
    setSavingPassword(false);

    if (result.ok) {
      toastSuccess('สำเร็จ', result.data.message);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      toastError('เปลี่ยนรหัสผ่านไม่สำเร็จ', result.message);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-3">
        <RefreshIcon className="w-8 h-8 animate-spin text-emerald-600" />
        <p className="text-xs font-semibold text-zinc-500">กำลังโหลดข้อมูลโปรไฟล์ส่วนตัว…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-red-600 font-bold">ไม่พบข้อมูลผู้ใช้</p>
        <button
          type="button"
          onClick={loadProfile}
          className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
        >
          ลองใหม่อีกครั้ง
        </button>
      </div>
    );
  }

  const { profile, stats } = data;
  const isHq = profile.role === 'ADMIN' && profile.branchId === null;
  const isBranchManager = profile.role === 'ADMIN' && profile.branchId !== null;

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto pb-12">
      {/* หัวหน้าจอ */}
      <div>
        <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
          <UserCircleIcon className="w-6 h-6 text-emerald-600" />
          <span>ข้อมูลส่วนตัวและการตั้งค่าความปลอดภัย</span>
        </h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          ตรวจสอบรายละเอียดบัญชีผู้ใช้ สังกัดสาขา สถิติการปฏิบัติงาน และเปลี่ยนรหัสผ่านของคุณ
        </p>
      </div>

      {/* การ์ดข้อมูลส่วนตัวหลัก */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-800 font-black text-2xl text-white shadow-md">
              {profile.fullName.slice(0, 1)}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-black text-slate-900 leading-tight">
                  {profile.fullName}
                </h2>
                {isHq && (
                  <span className="rounded-full bg-amber-100 border border-amber-300 px-2.5 py-0.5 text-[11px] font-black text-amber-900">
                    👑 เจ้าของร้าน / สำนักงานใหญ่ (HQ)
                  </span>
                )}
                {isBranchManager && (
                  <span className="rounded-full bg-blue-100 border border-blue-300 px-2.5 py-0.5 text-[11px] font-black text-blue-900">
                    🏢 ผู้จัดการสาขา
                  </span>
                )}
                {!isHq && !isBranchManager && (
                  <span className="rounded-full bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 text-[11px] font-black text-emerald-900">
                    👨‍🍳 พนักงานประจำสาขา
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500 font-mono mt-1">
                ชื่อผู้ใช้: <span className="font-bold text-slate-800">@{profile.username}</span>
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-600">
                <div className="flex items-center gap-1">
                  <BuildingIcon className="w-3.5 h-3.5 text-zinc-400" />
                  <span>
                    สาขา: <strong className="text-slate-800">{profile.branchName || 'ทุกสาขา (HQ)'}</strong>
                    {profile.branchCode && <span className="text-[10px] text-zinc-400 font-mono ml-1">({profile.branchCode})</span>}
                  </span>
                </div>
                <span>•</span>
                <span>สร้างบัญชีเมื่อ: {formatThaiDateTime(profile.createdAt).split(' ')[0]}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 self-end sm:self-auto">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>กำลังใช้งานระบบ</span>
            </span>
          </div>
        </div>
      </div>

      {/* แถบสถิติการปฏิบัติงาน (Operational KPI Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500">บิลที่ปิดสำเร็จ</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <ReceiptIcon className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-slate-900">{stats.billsClosed}</span>
            <span className="text-xs text-zinc-500 ml-1">รอบโต๊ะ</span>
          </div>
          <p className="text-[11px] text-zinc-400 mt-1">จำนวนรอบการนั่งโต๊ะที่ทำการปิดบิล</p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500">ยอดเงินที่ตรวจรับแล้ว</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <CreditCardIcon className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-slate-900">฿{formatBaht(stats.totalReceived)}</span>
            <span className="text-xs text-zinc-500 ml-1">({stats.paymentsReceived} รายการ)</span>
          </div>
          <p className="text-[11px] text-zinc-400 mt-1">มูลค่าเงินสด/โอน/บัตรที่บันทึกรับ</p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500">เรื่องแจ้งปัญหาที่ดูแล</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
              <TicketIcon className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-slate-900">{stats.ticketsHandled}</span>
            <span className="text-xs text-zinc-500 ml-1">เรื่อง</span>
          </div>
          <p className="text-[11px] text-zinc-400 mt-1">เคสข้อร้องเรียนและตั๋วบริการที่รับผิดชอบ</p>
        </div>
      </div>

      {/* แบบฟอร์ม 2 คอลัมน์: แก้ไขชื่อ กับ เปลี่ยนรหัสผ่าน */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* คอลัมน์ 1: แก้ไขข้อมูลส่วนตัว */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
          <div className="flex items-center gap-2 border-b border-zinc-100 pb-3 mb-4">
            <UserCircleIcon className="w-5 h-5 text-emerald-600" />
            <h3 className="text-base font-bold text-slate-900">แก้ไขชื่อ-นามสกุล</h3>
          </div>

          <form onSubmit={handleSaveName} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="user-full-name" className="text-xs font-bold text-slate-700">
                ชื่อ-นามสกุล (Display Name)
              </label>
              <input
                id="user-full-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="เช่น สมชาย ใจดี"
                required
                className="min-h-[42px] rounded-xl border border-zinc-300 bg-white px-3 text-xs font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none"
              />
              <p className="text-[11px] text-zinc-500">
                ชื่อนี้จะแสดงบนแถบนำทาง หัวบิล และประวัติการบันทึกการทำงานในระบบ
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-zinc-400">ชื่อผู้ใช้งาน (Username)</label>
              <input
                type="text"
                value={profile.username}
                disabled
                className="min-h-[42px] rounded-xl border border-zinc-200 bg-zinc-100 px-3 text-xs font-bold text-zinc-500 cursor-not-allowed"
              />
              <p className="text-[10px] text-zinc-400">
                ชื่อผู้ใช้งานสำหรับเข้าสู่ระบบไม่สามารถแก้ไขด้วยตนเองได้ (ติดต่อแอดมิน)
              </p>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={savingName || fullName.trim() === profile.fullName}
                className="w-full flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {savingName ? (
                  <>
                    <RefreshIcon className="w-4 h-4 animate-spin" />
                    <span>กำลังบันทึก…</span>
                  </>
                ) : (
                  <>
                    <CheckCircleIcon className="w-4 h-4" />
                    <span>บันทึกชื่อ-นามสกุล</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* คอลัมน์ 2: เปลี่ยนรหัสผ่าน */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
          <div className="flex items-center gap-2 border-b border-zinc-100 pb-3 mb-4">
            <LockIcon className="w-5 h-5 text-amber-600" />
            <h3 className="text-base font-bold text-slate-900">เปลี่ยนรหัสผ่านความปลอดภัย</h3>
          </div>

          <form onSubmit={handleChangePassword} className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="current-password" className="text-xs font-bold text-slate-700">
                รหัสผ่านปัจจุบัน
              </label>
              <div className="relative">
                <input
                  id="current-password"
                  type={showCurrentPw ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="กรอกรหัสผ่านเดิมเพื่อยืนยัน"
                  required
                  className="min-h-[42px] w-full rounded-xl border border-zinc-300 bg-white px-3 pr-10 text-xs font-semibold text-slate-900 focus:border-amber-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPw((p) => !p)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 cursor-pointer"
                >
                  <EyeIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="new-password" className="text-xs font-bold text-slate-700">
                รหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)
              </label>
              <div className="relative">
                <input
                  id="new-password"
                  type={showNewPw ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="ตั้งรหัสผ่านใหม่"
                  required
                  minLength={6}
                  className="min-h-[42px] w-full rounded-xl border border-zinc-300 bg-white px-3 pr-10 text-xs font-semibold text-slate-900 focus:border-amber-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPw((p) => !p)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 cursor-pointer"
                >
                  <EyeIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="confirm-password" className="text-xs font-bold text-slate-700">
                ยืนยันรหัสผ่านใหม่
              </label>
              <div className="relative">
                <input
                  id="confirm-password"
                  type={showConfirmPw ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="กรอกรหัสผ่านใหม่อีกครั้ง"
                  required
                  minLength={6}
                  className="min-h-[42px] w-full rounded-xl border border-zinc-300 bg-white px-3 pr-10 text-xs font-semibold text-slate-900 focus:border-amber-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPw((p) => !p)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 cursor-pointer"
                >
                  <EyeIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
                className="w-full flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 text-xs font-bold text-white shadow-xs hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {savingPassword ? (
                  <>
                    <RefreshIcon className="w-4 h-4 animate-spin" />
                    <span>กำลังตรวจสอบและบันทึก…</span>
                  </>
                ) : (
                  <>
                    <LockIcon className="w-4 h-4" />
                    <span>อัปเดตรหัสผ่านใหม่</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
