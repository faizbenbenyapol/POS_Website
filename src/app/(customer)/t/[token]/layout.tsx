import CustomerNav from './CustomerNav';
import QuickTicketButton from '@/components/QuickTicketButton';
import { findTableSession, sessionErrorMessage } from '@/lib/session';

/**
 * ชื่อร้านที่แสดงบนหัวหน้าจอลูกค้า
 * ยังไม่มีตารางตั้งค่าร้านในสเปก จึงประกาศเป็นค่าคงที่ไว้ที่เดียวก่อน
 */
const SHOP_NAME = 'ครัวบ้านไร่';

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
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 bg-char px-6">
        <div className="flex flex-col gap-4 rounded-xl bg-griddle p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-slip">เปิดหน้าสั่งอาหารไม่ได้</h1>
          <p className="text-slip-dim">{sessionErrorMessage(found.reason)}</p>
          <p className="text-slip-dim">
            ถ้าสแกนใหม่แล้วยังไม่ได้ กรุณาแจ้งพนักงานพร้อมบอกเลขโต๊ะที่นั่งอยู่
          </p>
        </div>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-char pb-20">
      <header className="sticky top-0 z-10 bg-griddle px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-md items-baseline justify-between gap-3">
          <p className="font-medium text-slip-dim">{SHOP_NAME}</p>
          <p className="text-slip">
            โต๊ะ <span className="num text-2xl font-semibold text-flame">{found.tableNo}</span>
          </p>
        </div>
        <div className="mx-auto mt-2 max-w-md">
          <QuickTicketButton
            token={token}
            category="OTHER"
            subject="เรียกพนักงาน"
            detail="ลูกค้ากดปุ่มเรียกพนักงานจากหน้าจอสั่งอาหาร"
            idleLabel="🔔 เรียกพนักงาน"
            sentLabel="✓ เรียกพนักงานแล้ว กำลังมาหา"
            className="min-h-[40px] w-full rounded-lg bg-flame/10 px-3 text-sm font-medium text-flame disabled:opacity-60"
          />
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-4">{children}</main>

      <CustomerNav token={token} />
    </div>
  );
}
