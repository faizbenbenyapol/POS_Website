'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { SessionUser } from '@/lib/auth';
import { BuildingIcon, GlobeAltIcon } from '@/components/Icons';
import CustomSelect, { type SelectOption } from '@/components/Select';

type BranchOption = {
  id: number;
  code: string;
  name: string;
  is_active: number;
};

/**
 * Dropdown ตัวเลือกสลับสาขาสำหรับ HQ Admin
 * และป้ายระบุสาขาประจำสำหรับพนักงานสาขา
 */
export default function BranchSwitcher({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const isHqAdmin = user.role === 'ADMIN' && (user.branchId === null || user.branchId === undefined);

  useEffect(() => {
    // อ่านค่า Cookie pos_active_branch บน client side
    const match = document.cookie.match(/(?:^|; )pos_active_branch=([^;]*)/);
    if (match && match[1] && match[1] !== '0' && match[1] !== 'all') {
      const num = Number(match[1]);
      if (Number.isInteger(num) && num > 0) {
        setActiveBranchId(num);
      }
    }

    if (isHqAdmin) {
      fetch('/api/admin/branches')
        .then((res) => res.json())
        .then((res) => {
          if (res.ok && Array.isArray(res.data)) {
            setBranches(res.data.filter((b: BranchOption) => b.is_active === 1));
          }
        })
        .catch(() => {});
    }
  }, [isHqAdmin]);

  // หากเป็นพนักงานสาขา แสดงป้ายชื่อสาขาของตนเอง (ห้ามสลับ)
  if (!isHqAdmin) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-zinc-50 px-2.5 py-1.5 border border-rule text-xs">
        <BuildingIcon className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        <span className="font-semibold text-zinc-700 truncate">{user.branchName || 'สาขาประจำ'}</span>
      </div>
    );
  }

  /**
   * สลับสาขาที่กำลังดูอยู่ แล้วรีโหลดหน้าเพื่อให้ข้อมูลทุกส่วนอิงสาขาใหม่
   *
   * @param value - ค่าจาก dropdown: 'all' คือดูภาพรวมทุกสาขา นอกนั้นเป็น id สาขาในรูป string
   * ผลข้างเคียง: ยิง POST ไปตั้งค่า cookie สาขาที่ฝั่งเซิร์ฟเวอร์ และรีโหลดหน้าเมื่อสำเร็จ
   */
  async function handleSwitch(value: string) {
    const newId = value === 'all' || value === '0' ? null : Number(value);
    setLoading(true);
    try {
      const res = await fetch('/api/admin/branches/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchId: newId }),
      });
      if (res.ok) {
        setActiveBranchId(newId);
        window.location.reload();
      }
    } finally {
      setLoading(false);
    }
  }

  // รายการตัวเลือกสาขา: ภาพรวมทุกสาขาไว้บนสุด ตามด้วยสาขาที่เปิดใช้งาน
  const options: SelectOption[] = [
    {
      value: 'all',
      label: 'ทุกสาขา (ภาพรวมองค์กร)',
      icon: <GlobeAltIcon className="w-4 h-4 text-blue-600" />,
    },
    ...branches.map((b) => ({
      value: String(b.id),
      label: `${b.name} (${b.code})`,
      icon: <BuildingIcon className="w-4 h-4 text-green-600" />,
    })),
  ];

  return (
    <CustomSelect
      id="branch-switcher-select"
      value={activeBranchId === null ? 'all' : String(activeBranchId)}
      onChange={handleSwitch}
      options={options}
      disabled={loading}
      icon={
        activeBranchId ? (
          <BuildingIcon className="w-4 h-4 text-green-600" />
        ) : (
          <GlobeAltIcon className="w-4 h-4 text-blue-600" />
        )
      }
    />
  );
}
