'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** เมนูนำทางล่างจอฝั่งลูกค้า วางไว้ครึ่งล่างเพราะกดด้วยนิ้วโป้งขณะถือมือถือ */
const CUSTOMER_TABS = [
  { suffix: '', label: 'เมนู' },
  { suffix: '/cart', label: 'ตะกร้า' },
  { suffix: '/status', label: 'สถานะ' },
  { suffix: '/ticket', label: 'แจ้งปัญหา' },
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
    <nav className="fixed inset-x-0 bottom-0 border-t border-rule bg-griddle shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
      <ul className="mx-auto flex max-w-md">
        {CUSTOMER_TABS.map((tab) => {
          const href = `/t/${token}${tab.suffix}`;
          const active = pathname === href;
          return (
            <li key={tab.suffix} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-sm ${
                  active ? 'font-medium text-flame' : 'text-slip-dim'
                }`}
              >
                {tab.label}
                <span
                  className={`h-1 w-6 rounded-full ${active ? 'bg-flame' : 'bg-transparent'}`}
                  aria-hidden="true"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
