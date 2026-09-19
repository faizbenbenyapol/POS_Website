'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { BranchListRow } from '@/app/api/admin/branches/route';
import Modal from '@/components/Modal';
import { BuildingIcon, PlusIcon, FoodMenuIcon } from '@/components/Icons';
import { useToast } from '@/components/Toast';

export default function BranchesPage() {
  const { success: showSuccessToast, error: showErrorToast } = useToast();
  const [branches, setBranches] = useState<BranchListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<BranchListRow | null>(null);

  // Form states
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [cutoffHour, setCutoffHour] = useState(4);
  // ค่าตั้งเรื่องเงินของสาขา ใช้เป็นตัวตั้งต้นของทุกบิลที่ปิดในสาขานี้
  const [vatRate, setVatRate] = useState(7);
  const [vatInclusive, setVatInclusive] = useState(true);
  const [serviceChargeRate, setServiceChargeRate] = useState(0);
  // บัญชีพร้อมเพย์ที่ใช้สร้าง QR รับเงินโอนตอนปิดบิล
  const [promptpayId, setPromptpayId] = useState('');
  const [promptpayName, setPromptpayName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ role: string; branchId: number | null } | null>(null);

  const loadBranches = useCallback(async () => {
    try {
      setLoading(true);
      const [res, meRes] = await Promise.all([
        fetch('/api/admin/branches'),
        fetch('/api/auth/me'),
      ]);
      const json = await res.json();
      if (json.ok && Array.isArray(json.data)) {
        setBranches(json.data);
      }
      const meJson = await meRes.json();
      if (meJson.ok && meJson.data) {
        setCurrentUser(meJson.data);
      }
    } catch {
      showErrorToast('ไม่สามารถโหลดข้อมูลสาขาได้');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  const isHqAdmin = currentUser ? (currentUser.role === 'ADMIN' && currentUser.branchId === null) : true;

  function openCreateModal() {
    setEditingBranch(null);
    setCode('');
    setName('');
    setAddress('');
    setPhone('');
    setCutoffHour(4);
    setVatRate(7);
    setVatInclusive(true);
    setServiceChargeRate(0);
    setPromptpayId('');
    setPromptpayName('');
    setIsActive(true);
    setModalOpen(true);
  }

  function openEditModal(branch: BranchListRow) {
    setEditingBranch(branch);
    setCode(branch.code);
    setName(branch.name);
    setAddress(branch.address || '');
    setPhone(branch.phone || '');
    setCutoffHour(branch.business_day_cutoff_hour ?? 4);
    setVatRate(Number(branch.vat_rate ?? 7));
    setVatInclusive(Number(branch.vat_inclusive ?? 1) === 1);
    setServiceChargeRate(Number(branch.service_charge_rate ?? 0));
    setPromptpayId(branch.promptpay_id ?? '');
    setPromptpayName(branch.promptpay_name ?? '');
    setIsActive(branch.is_active === 1);
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      showErrorToast('กรุณากรอกรหัสและชื่อสาขา');
      return;
    }

    setSubmitting(true);
    try {
      if (editingBranch) {
        // Edit
        const res = await fetch(`/api/admin/branches/${editingBranch.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: code.trim(),
            name: name.trim(),
            address: address.trim() || null,
            phone: phone.trim() || null,
            businessDayCutoffHour: Number(cutoffHour),
            vatRate: Number(vatRate),
            vatInclusive,
            serviceChargeRate: Number(serviceChargeRate),
            promptpayId: promptpayId.trim(),
            promptpayName: promptpayName.trim(),
            isActive,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          showErrorToast(json.error?.message || json.message || 'บันทึกข้อมูลไม่สำเร็จ');
          return;
        }
        showSuccessToast('อัปเดตข้อมูลสาขาสำเร็จ');
      } else {
        // Create
        const res = await fetch('/api/admin/branches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: code.trim().toUpperCase(),
            name: name.trim(),
            address: address.trim() || null,
            phone: phone.trim() || null,
            businessDayCutoffHour: Number(cutoffHour),
            vatRate: Number(vatRate),
            vatInclusive,
            serviceChargeRate: Number(serviceChargeRate),
            promptpayId: promptpayId.trim(),
            promptpayName: promptpayName.trim(),
            isActive,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          showErrorToast(json.error?.message || json.message || 'สร้างสาขาใหม่ไม่สำเร็จ');
          return;
        }
        showSuccessToast('เพิ่มสาขาใหม่สำเร็จ');
      }

      setModalOpen(false);
      loadBranches();
    } catch {
      showErrorToast('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSwitchToBranch(targetBranchId: number) {
    try {
      const res = await fetch('/api/admin/branches/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchId: targetBranchId }),
      });
      const json = await res.json();
      if (json.ok) {
        showSuccessToast(json.data.message || 'สลับสาขาสำเร็จ');
        window.location.reload();
      } else {
        showErrorToast(json.error?.message || 'สลับสาขาไม่สำเร็จ');
      }
    } catch {
      showErrorToast('เกิดข้อผิดพลาดในการสลับสาขา');
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slip flex items-center gap-2">
            <BuildingIcon className="w-5 h-5 text-emerald-600" />
            <span>จัดการสาขา (Branch Management)</span>
          </h1>
          <p className="text-xs text-slip-dim mt-0.5">
            บริหารจัดการสาขาในเครือข่าย กำหนดเวลาตัดรอบ และปรับแต่งราคาอาหารรายสาขา
          </p>
        </div>
        {isHqAdmin && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-700 active:scale-95 cursor-pointer"
          >
            <PlusIcon className="w-4 h-4" />
            <span>เพิ่มสาขาใหม่</span>
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-rule bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-rule bg-zinc-50/75 text-zinc-500 font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">รหัสสาขา</th>
                <th className="px-4 py-3">ชื่อสาขา & ข้อมูลติดต่อ</th>
                <th className="px-4 py-3 text-center">ตัดรอบวัน</th>
                <th className="px-4 py-3 text-center">จำนวนโต๊ะ</th>
                <th className="px-4 py-3 text-center">ออเดอร์วันนี้</th>
                <th className="px-4 py-3 text-center">สถานะ</th>
                <th className="px-4 py-3 text-right">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-zinc-400">
                    กำลังโหลดข้อมูลสาขา...
                  </td>
                </tr>
              )}
              {!loading && branches.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-zinc-400">
                    ยังไม่มีข้อมูลสาขา
                  </td>
                </tr>
              )}
              {!loading &&
                branches.map((b) => (
                  <tr key={b.id} className="hover:bg-zinc-50/50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-zinc-900">
                      <span className="inline-block rounded bg-zinc-100 px-2 py-0.5 font-mono text-[11px] text-zinc-700">
                        {b.code}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-zinc-900">{b.name}</div>
                      <div className="text-[11px] text-zinc-500">
                        {b.address || 'ไม่ระบุที่อยู่'} {b.phone && `• โทร ${b.phone}`}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-zinc-600">
                      {String(b.business_day_cutoff_hour).padStart(2, '0')}:00 น.
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 font-semibold text-blue-700 text-[11px]">
                        {b.table_count} โต๊ะ
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 text-[11px]">
                        {b.today_order_count} ออเดอร์
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          b.is_active === 1
                            ? 'bg-green-50 text-green-700'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            b.is_active === 1 ? 'bg-green-600' : 'bg-red-600'
                          }`}
                        />
                        {b.is_active === 1 ? 'เปิดใช้งาน' : 'ปิดชั่วคราว'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          href={`/admin/branches/${b.id}/menu`}
                          className="inline-flex items-center gap-1 rounded-md border border-rule px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 transition"
                          title="ปรับแต่งราคาและของหมดเฉพาะสาขา"
                        >
                          <FoodMenuIcon className="w-3.5 h-3.5 text-zinc-500" />
                          <span>ราคาเมนู</span>
                        </Link>
                        {isHqAdmin && (
                          <button
                            type="button"
                            onClick={() => handleSwitchToBranch(b.id)}
                            className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 transition cursor-pointer"
                            title="สลับมุมมองทั้งระบบเป็นสาขานี้"
                          >
                            <span>เข้าสู่สาขา</span>
                          </button>
                        )}
                        {isHqAdmin && (
                          <button
                            type="button"
                            onClick={() => openEditModal(b)}
                            className="rounded-md border border-rule px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 transition cursor-pointer"
                          >
                            แก้ไข
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingBranch ? 'แก้ไขข้อมูลสาขา' : 'เพิ่มสาขาใหม่'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="branchCode" className="block text-xs font-medium text-zinc-700 mb-1">
                รหัสสาขา (เช่น BKK-ARI)
              </label>
              <input
                id="branchCode"
                name="branchCode"
                value={code}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCode(e.target.value.toUpperCase())}
                placeholder="BKK-ARI"
                required
                className="w-full h-9 rounded-md border border-zinc-300 bg-white px-3 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label htmlFor="cutoffHour" className="block text-xs font-medium text-zinc-700 mb-1">
                เวลาตัดรอบวัน (น.)
              </label>
              <input
                id="cutoffHour"
                name="cutoffHour"
                type="number"
                value={String(cutoffHour)}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCutoffHour(Number(e.target.value))}
                min={0}
                max={23}
                required
                className="w-full h-9 rounded-md border border-zinc-300 bg-white px-3 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* ค่าตั้งเรื่องเงิน มีผลกับทุกบิลที่ปิดในสาขานี้ตั้งแต่บันทึกเป็นต้นไป */}
          <div className="rounded-md border border-zinc-200 bg-zinc-50/60 p-3">
            <p className="text-xs font-bold text-zinc-800 mb-2">ภาษีและค่าบริการของสาขา</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="vatRate" className="block text-xs font-medium text-zinc-700 mb-1">
                  อัตราภาษีมูลค่าเพิ่ม (%)
                </label>
                <input
                  id="vatRate"
                  name="vatRate"
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  value={String(vatRate)}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setVatRate(Number(e.target.value))}
                  className="w-full h-9 rounded-md border border-zinc-300 bg-white px-3 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label
                  htmlFor="serviceChargeRate"
                  className="block text-xs font-medium text-zinc-700 mb-1"
                >
                  ค่าบริการ Service Charge (%)
                </label>
                <input
                  id="serviceChargeRate"
                  name="serviceChargeRate"
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  value={String(serviceChargeRate)}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setServiceChargeRate(Number(e.target.value))
                  }
                  className="w-full h-9 rounded-md border border-zinc-300 bg-white px-3 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
            <label className="mt-2.5 flex items-start gap-2 text-xs text-zinc-700 cursor-pointer">
              <input
                type="checkbox"
                checked={vatInclusive}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setVatInclusive(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-emerald-600"
              />
              <span>
                ราคาเมนูรวมภาษีมูลค่าเพิ่มแล้ว
                <span className="block text-zinc-500">
                  ติ๊กไว้ = ถอด VAT ออกมาแสดงบนใบเสร็จโดยยอดที่ลูกค้าจ่ายเท่าเดิม
                  ไม่ติ๊ก = บวก VAT เพิ่มท้ายบิล
                </span>
              </span>
            </label>
          </div>

          {/* บัญชีพร้อมเพย์ของสาขา ลูกค้าสแกน QR ตอนปิดบิลแล้วเงินเข้าบัญชีนี้ */}
          <div className="rounded-md border border-zinc-200 bg-zinc-50/60 p-3">
            <p className="text-xs font-bold text-zinc-800 mb-2">รับเงินโอนผ่าน QR พร้อมเพย์</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="promptpayId" className="block text-xs font-medium text-zinc-700 mb-1">
                  เลขพร้อมเพย์
                </label>
                <input
                  id="promptpayId"
                  name="promptpayId"
                  inputMode="numeric"
                  value={promptpayId}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPromptpayId(e.target.value)}
                  placeholder="เช่น 0812345678"
                  className="w-full h-9 rounded-md border border-zinc-300 bg-white px-3 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label htmlFor="promptpayName" className="block text-xs font-medium text-zinc-700 mb-1">
                  ชื่อบัญชีที่แสดงใต้ QR
                </label>
                <input
                  id="promptpayName"
                  name="promptpayName"
                  value={promptpayName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPromptpayName(e.target.value)}
                  placeholder="เช่น บจก. ร้านอาหารตัวอย่าง"
                  className="w-full h-9 rounded-md border border-zinc-300 bg-white px-3 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              ใช้ได้ทั้งเบอร์มือถือ 10 หลัก เลขบัตรประชาชนหรือเลขผู้เสียภาษี 13 หลัก และ e-Wallet 15 หลัก
              เว้นว่างไว้ถ้าสาขานี้ยังไม่รับโอน ค่าเริ่มต้น 0812345678 เป็นบัญชีตัวอย่าง ต้องเปลี่ยนก่อนใช้งานจริง
            </p>
          </div>

          <div>
            <label htmlFor="branchName" className="block text-xs font-medium text-zinc-700 mb-1">
              ชื่อสาขา
            </label>
            <input
              id="branchName"
              name="branchName"
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              placeholder="เช่น สาขาอารีย์"
              required
              className="w-full h-9 rounded-md border border-zinc-300 bg-white px-3 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label htmlFor="branchAddress" className="block text-xs font-medium text-zinc-700 mb-1">
              ที่อยู่สาขา
            </label>
            <input
              id="branchAddress"
              name="branchAddress"
              value={address}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddress(e.target.value)}
              placeholder="เช่น ซอยอารีย์ พญาไท กทม."
              className="w-full h-9 rounded-md border border-zinc-300 bg-white px-3 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label htmlFor="branchPhone" className="block text-xs font-medium text-zinc-700 mb-1">
              เบอร์โทรติดต่อ
            </label>
            <input
              id="branchPhone"
              name="branchPhone"
              value={phone}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhone(e.target.value)}
              placeholder="เช่น 02-999-8888"
              className="w-full h-9 rounded-md border border-zinc-300 bg-white px-3 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-rule bg-zinc-50 p-3">
            <div>
              <div className="font-semibold text-xs text-zinc-800">เปิดให้บริการสาขานี้</div>
              <div className="text-[11px] text-zinc-500">
                หากปิดการใช้งาน ลูกค้าจะไม่สามารถสั่งอาหารจากโต๊ะในสาขานี้ได้
              </div>
            </div>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              disabled={editingBranch?.id === 1}
              className="h-4 w-4 rounded border-rule text-emerald-600 focus:ring-emerald-500 cursor-pointer"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-rule">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-rule px-3.5 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
