import Link from 'next/link';
import { UtensilsIcon, LockIcon } from '@/components/Icons';

/**
 * หน้าแรกของระบบ ทำหน้าที่เป็นทางแยกให้พนักงานเข้าหลังบ้าน
 * ส่วนลูกค้าจะไม่ผ่านหน้านี้เพราะสแกน QR เข้าที่ /t/{token} โดยตรง
 *
 * @returns หน้าจอต้อนรับพร้อมลิงก์ไปหน้าล็อกอิน
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6 py-10">
      <div className="lm-card overflow-hidden p-0 shadow-xl">
        <div className="lm-header-gradient p-8 text-center text-white">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/20 shadow-inner">
            <UtensilsIcon className="w-8 h-8 text-white" />
          </div>
          <h1 className="mt-4 text-xl font-black text-white">ระบบสั่งอาหารด้วย QR Code</h1>
          <p className="mt-2 text-xs text-white/80 leading-relaxed">
            ลูกค้าสแกน QR Code ที่โต๊ะเพื่อสั่งอาหาร <br />
            ส่วนพนักงานและผู้ดูแลร้านเข้าใช้งานหลังบ้านผ่านระบบล็อกอิน
          </p>
        </div>
        <div className="p-6 flex flex-col gap-3">
          <Link
            href="/login"
            className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#06C755] px-6 font-bold text-sm text-white shadow-md shadow-[#06C755]/20 transition-all hover:bg-[#00A040] active:scale-95"
          >
            <LockIcon className="w-4 h-4" />
            <span>เข้าสู่ระบบสำหรับพนักงาน</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
