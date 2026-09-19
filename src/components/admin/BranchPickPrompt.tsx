'use client';

import { useEffect, useState } from 'react';
import { apiFetch, jsonBody } from '@/lib/client';

/** สาขาที่ HQ Admin เลือกได้ ตามที่ GET /api/admin/branches คืนมา */
type BranchOption = { id: number; code: string; name: string; is_active: number };

/**
 * แถบให้ HQ Admin ที่ดูภาพรวมทุกสาขาเลือกสาขาได้จากหน้านั้นเลย
 * ใช้กับหน้าที่ข้อมูลเป็นของแต่ละสาขา (สต๊อกเมนู ยอดวัตถุดิบ) ซึ่งดูแบบรวมทุกสาขาไม่ได้
 * กดแล้วสลับสาขาและรีโหลดหน้า เพื่อให้แถบเลือกสาขาด้านข้างกับข้อมูลทุกส่วนตรงกัน
 *
 * @param label - ข้อความเหนือปุ่ม เช่น "เลือกสาขาที่ต้องการดูสต๊อก"
 * @returns ปุ่มสาขาที่เปิดใช้งาน หรือ null เมื่อผู้ใช้ไม่ใช่ HQ Admin หรือโหลดรายชื่อสาขาไม่ได้
 */
export default function BranchPickPrompt({ label }: { label: string }) {
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // สลับสาขาได้เฉพาะ HQ Admin (ไม่ผูกสาขา) พนักงานสาขาถูกล็อกไว้ที่สาขาตัวเองอยู่แล้ว
    Promise.all([
      apiFetch<{ role: string; branchId: number | null }>('/api/auth/me'),
      apiFetch<BranchOption[]>('/api/admin/branches'),
    ]).then(([me, res]) => {
      if (!me.ok || me.data.role !== 'ADMIN' || me.data.branchId !== null) return;
      if (res.ok) setBranches(res.data.filter((b) => b.is_active));
    });
  }, []);

  /**
   * สลับไปดูสาขาที่เลือกแล้วรีโหลดหน้า
   *
   * @param branchId - รหัสสาขาที่เลือก
   * @returns ไม่คืนค่า มีผลข้างเคียงคือตั้ง cookie สาขาและรีโหลดหน้า
   */
  async function switchBranch(branchId: number) {
    setSwitching(true);
    setError('');
    const res = await apiFetch<unknown>('/api/admin/branches/switch', {
      method: 'POST',
      body: jsonBody({ branchId }),
    });
    if (res.ok) {
      window.location.reload();
      return;
    }
    setSwitching(false);
    setError(res.message);
  }

  if (branches.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-zinc-600">{label}</p>
      <div className="flex flex-wrap gap-2">
        {branches.map((branch) => (
          <button
            key={branch.id}
            type="button"
            disabled={switching}
            onClick={() => switchBranch(branch.id)}
            className="min-h-[44px] rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50 cursor-pointer"
          >
            {branch.name} ({branch.code})
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
