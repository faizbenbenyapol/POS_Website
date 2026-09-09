'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { SessionUser } from '@/lib/auth';

/** เมนูหลังบ้านทั้งหมด ประกาศไว้ที่เดียวเพื่อไม่ให้ลิงก์หลุดหายเวลาเพิ่มหน้า */
const NAV_ITEMS: { href: string; label: string; adminOnly: boolean }[] = [
  { href: '/admin', label: 'ภาพรวมร้าน', adminOnly: false },
  { href: '/admin/orders', label: 'กระดานออเดอร์', adminOnly: false },
  { href: '/admin/menu', label: 'เมนูอาหาร', adminOnly: false },
  { href: '/admin/categories', label: 'หมวดหมู่', adminOnly: false },
  { href: '/admin/tables', label: 'โต๊ะและ QR', adminOnly: false },
  { href: '/admin/tickets', label: 'เรื่องแจ้งปัญหา', adminOnly: false },
  { href: '/admin/users', label: 'ผู้ใช้ระบบ', adminOnly: true },
];

/**
 * แถบเมนูหลังบ้าน แสดงชื่อผู้ใช้ที่ล็อกอินอยู่และปุ่มออกจากระบบ
 * ซ่อนเมนูเฉพาะแอดมินเมื่อผู้ใช้เป็น STAFF (การกันสิทธิ์จริงอยู่ที่ฝั่ง API)
 *
 * @param user - ผู้ใช้ที่ล็อกอินอยู่ ใช้ตัดสินว่าจะโชว์เมนูไหนบ้าง
 * @returns แถบนำทางที่ใช้ได้ทั้งบนมือถือ (เลื่อนแนวนอน) และเดสก์ท็อป (คอลัมน์ซ้าย)
 */
export default function AdminNav({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || user.role === 'ADMIN');

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
    <nav className="flex shrink-0 flex-col border-b border-rule bg-griddle shadow-sm md:h-screen md:w-56 md:border-r md:border-b-0">
      <div className="border-rule px-4 py-3 md:border-b">
        <p className="font-medium text-slip">{user.fullName}</p>
        <p className="text-sm text-slip-dim">
          {user.role === 'ADMIN' ? 'ผู้ดูแลระบบ' : 'พนักงาน'}
        </p>
      </div>

      <ul className="flex gap-1 overflow-x-auto px-2 py-2 md:flex-1 md:flex-col md:overflow-y-auto">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href} className="shrink-0 md:shrink">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[44px] items-center rounded-lg px-3 font-medium whitespace-nowrap ${
                  active
                    ? 'bg-flame/10 text-flame'
                    : 'text-slip-dim hover:bg-char hover:text-slip'
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="border-rule px-2 py-2 md:border-t">
        <button
          type="button"
          onClick={handleLogout}
          className="flex min-h-[44px] w-full items-center rounded-lg px-3 text-slip-dim hover:bg-char hover:text-slip"
        >
          ออกจากระบบ
        </button>
      </div>
    </nav>
  );
}
