'use client';

import Link from 'next/link';
import { CartIcon, TableIcon, FoodMenuIcon, TicketIcon } from '@/components/Icons';

const QUICK_LINKS = [
  {
    href: '/admin/orders',
    icon: CartIcon,
    label: 'กระดานออเดอร์',
    sub: 'ติดตามสถานะอาหาร',
  },
  {
    href: '/admin/tables',
    icon: TableIcon,
    label: 'จัดการโต๊ะ',
    sub: 'เปิดโต๊ะ พิมพ์ QR code',
  },
  {
    href: '/admin/menu',
    icon: FoodMenuIcon,
    label: 'เมนูอาหาร',
    sub: 'เพิ่มเมนู ปรับราคา',
  },
  {
    href: '/admin/tickets',
    icon: TicketIcon,
    label: 'แจ้งปัญหา',
    sub: 'เรื่องร้องเรียน',
  },
];

export default function DashboardQuickNav() {
  return (
    <section className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
      {QUICK_LINKS.map(({ href, icon: Icon, label, sub }) => (
        <Link
          key={href}
          href={href}
          className="flex items-center gap-3 rounded-md border border-zinc-200 bg-white px-4 py-3 transition-colors hover:bg-zinc-50 hover:border-zinc-300"
        >
          <Icon className="w-4 h-4 shrink-0 text-zinc-400" />
          <div>
            <p className="text-xs font-medium text-zinc-800">{label}</p>
            <p className="text-[11px] text-zinc-400">{sub}</p>
          </div>
        </Link>
      ))}
    </section>
  );
}
