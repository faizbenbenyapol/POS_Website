import CustomerNav from './CustomerNav';
import QuickTicketButton from '@/components/QuickTicketButton';
import { UtensilsIcon, BellIcon } from '@/components/Icons';
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
      <header className="sticky top-0 z-30 h-[52px] lm-header-gradient px-4 shadow-sm flex items-center">
        <div className="mx-auto flex w-full max-w-md items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-white">
              <UtensilsIcon className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-white/80 leading-tight truncate">
                {found.branchName ? `${SHOP_NAME} (${found.branchName})` : SHOP_NAME}
              </p>
              <h2 className="text-xs font-bold text-white leading-tight truncate">สั่งอาหารออนไลน์</h2>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <QuickTicketButton
              token={token}
              category="OTHER"
              subject="เรียกพนักงาน"
              detail="ลูกค้ากดปุ่มเรียกพนักงานจากหน้าจอสั่งอาหาร"
              idleLabel={
                <span className="inline-flex items-center gap-1.5">
                  <BellIcon className="w-3.5 h-3.5 text-white/80" />
                  <span>เรียกพนักงาน</span>
                </span>
              }
              sentLabel="แจ้งแล้ว"
              className="min-h-[32px] rounded-full bg-white/15 px-3 text-xs font-medium text-white transition-all hover:bg-white/25 disabled:opacity-80 flex items-center justify-center border border-white/20 active:scale-95 shadow-xs cursor-pointer"
            />
            <div className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-900 shadow-xs">
              <span className="text-slate-500 font-medium">โต๊ะ</span>
              <span className="num text-sm font-black text-emerald-700">{found.tableNo}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-2">{children}</main>

      <CustomerNav token={token} />
    </div>
  );
}
