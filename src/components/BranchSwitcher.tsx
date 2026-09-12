'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { SessionUser } from '@/lib/auth';
import { BuildingIcon, GlobeAltIcon, ChevronDownIcon } from '@/components/Icons';

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

  async function handleSwitch(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    const newId = val === 'all' || val === '0' ? null : Number(val);
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

  return (
    <div className="relative">
      <label htmlFor="branch-switcher-select" className="sr-only">เลือกสาขา</label>
      <div className="flex items-center gap-1.5 rounded-lg border border-rule bg-zinc-50 px-2 py-1 text-xs transition-colors hover:bg-zinc-100/80">
        {activeBranchId ? (
          <BuildingIcon className="w-3.5 h-3.5 text-green-600 shrink-0" />
        ) : (
          <GlobeAltIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
        )}
        <select
          id="branch-switcher-select"
          value={activeBranchId ?? 'all'}
          onChange={handleSwitch}
          disabled={loading}
          className="w-full bg-transparent font-medium text-zinc-700 focus:outline-none cursor-pointer py-0.5 truncate appearance-none pr-4"
        >
          <option value="all">ทุกสาขา (ภาพรวมองค์กร)</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({b.code})
            </option>
          ))}
        </select>
        <ChevronDownIcon className="w-3 h-3 text-zinc-400 pointer-events-none absolute right-2" />
      </div>
    </div>
  );
}
