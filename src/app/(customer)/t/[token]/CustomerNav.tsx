'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FoodMenuIcon, CartIcon, StatusIcon, TicketIcon } from '@/components/Icons';

/** เมนูนำทางล่างจอฝั่งลูกค้า วางไว้ครึ่งล่างเพราะกดด้วยนิ้วโป้งขณะถือมือถือ */
const CUSTOMER_TABS = [
  { suffix: '', label: 'เมนู', icon: FoodMenuIcon },
  { suffix: '/cart', label: 'ตะกร้า', icon: CartIcon },
  { suffix: '/status', label: 'สถานะ', icon: StatusIcon },
  { suffix: '/ticket', label: 'แจ้งปัญหา', icon: TicketIcon },
];

/**
 * แถบนำทางล่างจอฝั่งลูกค้า ไฮไลต์แท็บที่เปิดอยู่ด้วยสี accent
 * แยกเป็นคอมโพเนนต์แยกเพราะต้องใช้ usePathname ซึ่งต้องเป็น client component
 *
 * @param token - qr_token ของโต๊ะ ใช้ประกอบลิงก์ของแต่ละแท็บ
 * @returns แถบนำทางลอยด้านล่างจอ
 */
export default function CustomerNav({ token }: { token: string }) {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 lm-glass-bar border-t border-rule/80 px-2 py-1 shadow-lg">
      <ul className="mx-auto flex max-w-md items-center justify-around">
        {CUSTOMER_TABS.map((tab) => {
          const href = `/t/${token}${tab.suffix}`;
          const active = pathname === href;
          const IconComponent = tab.icon;
          return (
            <li key={tab.suffix} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl text-xs transition-all ${
                  active
                    ? 'font-bold text-[#06C755] bg-[#E8F9EE]'
                    : 'text-slip-dim hover:text-slip hover:bg-char'
                }`}
              >
                <IconComponent className="w-5 h-5" />
                <span>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
