'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { SessionUser } from '@/lib/auth';
import {
  BoxIcon,
  ChartIcon,
  CookingIcon,
  FoodMenuIcon,
  TagIcon,
  TableIcon,
  TicketIcon,
  UsersIcon,
  LogoutIcon,
  BuildingIcon,
  ReceiptIcon,
  ClockIcon,
  UserCircleIcon,
  LeafIcon,
  ExpandIcon,
} from '@/components/Icons';
import BranchSwitcher from '@/components/BranchSwitcher';
import { ROLE_LABELS, canOpenPage } from '@/lib/permissions';
import { STATIONS, stationAllows, writeStation, type Station, type StationId } from '@/lib/station';

/**
 * เมนูหลังบ้านทั้งหมด ประกาศไว้ที่เดียวเพื่อไม่ให้ลิงก์หลุดหายเวลาเพิ่มหน้า
 * ใครเห็นเมนูไหนตัดสินจากตารางสิทธิ์ (canOpenPage) และจุดที่ตั้งเครื่องไว้ (stationAllows)
 */
const NAV_ITEMS: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { href: '/admin', label: 'ภาพรวมร้าน', icon: ChartIcon },
  { href: '/admin/orders', label: 'กระดานออเดอร์', icon: CookingIcon },
  { href: '/admin/settlement', label: 'สรุปปิดยอด', icon: ReceiptIcon },
  { href: '/admin/menu', label: 'เมนูอาหาร', icon: FoodMenuIcon },
  { href: '/admin/stock', label: 'สต๊อกเมนู', icon: BoxIcon },
  { href: '/admin/ingredients', label: 'วัตถุดิบ', icon: LeafIcon },
  { href: '/admin/categories', label: 'หมวดหมู่', icon: TagIcon },
  { href: '/admin/tables', label: 'โต๊ะและ QR', icon: TableIcon },
  { href: '/admin/tickets', label: 'เรื่องแจ้งปัญหา', icon: TicketIcon },
  { href: '/admin/branches', label: 'จัดการสาขา', icon: BuildingIcon },
  { href: '/admin/users', label: 'ผู้ใช้ระบบ', icon: UsersIcon },
  { href: '/admin/logs', label: 'บันทึกการทำงาน', icon: ClockIcon },
  { href: '/admin/profile', label: 'ข้อมูลส่วนตัว', icon: UserCircleIcon },
];


/**
 * แถบเมนูหลังบ้าน แสดงชื่อผู้ใช้ที่ล็อกอินอยู่และปุ่มออกจากระบบ
 * ซ่อนเมนูเฉพาะแอดมินเมื่อผู้ใช้เป็น STAFF (การกันสิทธิ์จริงอยู่ที่ฝั่ง API)
 *
 * @param user - ผู้ใช้ที่ล็อกอินอยู่ ใช้ตัดสินว่าจะโชว์เมนูไหนบ้าง
 * @param station - จุดที่ตั้งเครื่องนี้ไว้ null คือไม่ได้ตั้ง (เห็นทุกเมนูตามบทบาท)
 * @param onEnterFocus - เข้าโหมดเต็มจอ
 * @returns แถบนำทางที่ใช้ได้ทั้งบนมือถือ (เลื่อนแนวนอน) และเดสก์ท็อป (คอลัมน์ซ้าย)
 */
export default function AdminNav({
  user,
  station,
  onEnterFocus,
}: {
  user: SessionUser;
  station: Station | null;
  onEnterFocus: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const items = NAV_ITEMS.filter(
    (item) => canOpenPage(user.role, item.href) && stationAllows(station, item.href),
  );

  /**
   * ออกจากระบบโดยเรียก API ล้าง cookie แล้วพากลับหน้าล็อกอิน
   *
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือลบ cookie และเปลี่ยนหน้า
   */
  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <nav className="flex shrink-0 flex-col border-b border-rule bg-white md:h-screen md:w-56 md:border-r md:border-b-0">
      {/* Header — คลิกเข้าสู่หน้าโปรไฟล์ส่วนตัว */}
      <Link
        href="/admin/profile"
        title="ดูโปรไฟล์และจัดการข้อมูลส่วนตัว"
        className="lm-header-solid block px-4 py-3.5 text-white transition-opacity hover:opacity-95 md:border-b md:border-white/10 group cursor-pointer"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white/25 font-bold text-sm text-white group-hover:bg-white/35 transition-colors">
            {user.fullName.slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-sm leading-tight text-white truncate">{user.fullName}</p>
              <UserCircleIcon className="w-3.5 h-3.5 text-white/70 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className="text-xs text-white/80 font-medium">
              {user.role === 'ADMIN'
                ? user.branchId
                  ? 'ผู้จัดการสาขา'
                  : 'เจ้าของร้าน (HQ)'
                : ROLE_LABELS[user.role]}
            </p>
          </div>
        </div>
      </Link>

      {/* ตัวสลับสาขาสำหรับ HQ หรือป้ายสาขาสำหรับ Staff */}
      <div className="px-3 pt-2.5 pb-1">
        <BranchSwitcher user={user} />
      </div>

      <ul className="flex gap-0.5 overflow-x-auto p-2 md:flex-1 md:flex-col md:overflow-y-auto">
        {items.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <li key={item.href} className="shrink-0 md:shrink">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[40px] items-center gap-2.5 rounded-md px-3 text-xs font-medium whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-green-50 text-green-700 font-semibold'
                    : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* ตั้งจุดของเครื่องนี้และเข้าโหมดเต็มจอ */}
      <div className="flex flex-col gap-1.5 border-t border-rule p-2">
        <label className="flex flex-col gap-1 px-1 text-[11px] font-medium text-zinc-500">
          เครื่องนี้ใช้ที่
          <select
            value={station?.id ?? ''}
            onChange={(e) => writeStation((e.target.value || null) as StationId | null)}
            className="min-h-[36px] rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-800 cursor-pointer"
          >
            <option value="">ไม่ระบุ (เห็นทุกเมนูตามสิทธิ์)</option>
            {STATIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={onEnterFocus}
          className="flex min-h-[38px] w-full items-center gap-2.5 rounded-md px-3 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 cursor-pointer"
        >
          <ExpandIcon className="w-4 h-4 shrink-0" />
          <span>เต็มจอ (ซ่อนเมนู)</span>
        </button>
      </div>

      <div className="border-t border-rule p-2">
        <button
          type="button"
          onClick={handleLogout}
          className="flex min-h-[38px] w-full items-center gap-2.5 rounded-md px-3 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
        >
          <LogoutIcon className="w-4 h-4 shrink-0" />
          <span>ออกจากระบบ</span>
        </button>
      </div>
    </nav>
  );
}
