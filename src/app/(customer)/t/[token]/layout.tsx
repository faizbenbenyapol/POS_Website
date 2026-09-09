import Link from 'next/link';
import { findTableSession, sessionErrorMessage } from '@/lib/session';

/**
 * ชื่อร้านที่แสดงบนหัวหน้าจอลูกค้า
 * ยังไม่มีตารางตั้งค่าร้านในสเปก จึงประกาศเป็นค่าคงที่ไว้ที่เดียวก่อน
 */
const SHOP_NAME = 'ครัวบ้านไร่';

/** เมนูนำทางล่างจอฝั่งลูกค้า วางไว้ครึ่งล่างเพราะกดด้วยนิ้วโป้งขณะถือมือถือ */
const CUSTOMER_TABS = [
  { suffix: '', label: 'เมนู' },
  { suffix: '/cart', label: 'ตะกร้า' },
  { suffix: '/status', label: 'สถานะ' },
  { suffix: '/ticket', label: 'แจ้งปัญหา' },
];

/** พารามิเตอร์เส้นทางของ Next.js 15 เป็น Promise จึงต้อง await ก่อนใช้ */
type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
};

/**
 * เลย์เอาต์ของทุกหน้าฝั่งลูกค้า ตรวจ token ก่อนแสดงอะไรทั้งสิ้น
 * ถ้า token ใช้ไม่ได้จะแสดงหน้าแจ้งเตือนที่บอกวิธีแก้ แทนที่จะปล่อยให้หน้าจอว่างเปล่า
 *
 * @param children - เนื้อหาของหน้าลูกค้าที่กำลังเปิด
 * @param params - พารามิเตอร์เส้นทางที่มี token ของโต๊ะ
 * @returns โครงหน้าลูกค้าพร้อมหัวและแถบนำทางล่างจอ
 */
export default async function CustomerLayout({ children, params }: LayoutProps) {
  const { token } = await params;
  const found = await findTableSession(token);

  if (!found.ok) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6">
        <h1 className="text-xl font-semibold text-slip">เปิดหน้าสั่งอาหารไม่ได้</h1>
        <p className="text-slip-dim">{sessionErrorMessage(found.reason)}</p>
        <p className="text-slip-dim">
          ถ้าสแกนใหม่แล้วยังไม่ได้ กรุณาแจ้งพนักงานพร้อมบอกเลขโต๊ะที่นั่งอยู่
        </p>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col pb-20">
      <header className="sticky top-0 z-10 border-b border-rule bg-char px-4 py-3">
        <div className="mx-auto flex max-w-md items-baseline justify-between gap-3">
          <p className="text-slip-dim">{SHOP_NAME}</p>
          <p className="text-slip">
            โต๊ะ <span className="num text-2xl font-semibold">{found.tableNo}</span>
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-4">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 border-t border-rule bg-griddle">
        <ul className="mx-auto flex max-w-md">
          {CUSTOMER_TABS.map((tab) => (
            <li key={tab.suffix} className="flex-1">
              <Link
                href={`/t/${token}${tab.suffix}`}
                className="flex min-h-[56px] items-center justify-center text-slip-dim"
              >
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
