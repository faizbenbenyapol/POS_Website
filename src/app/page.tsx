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
      <div className="lm-card overflow-hidden p-0 shadow-xl border border-slate-200">
        <div className="bg-slate-900 p-8 text-center text-white border-b border-slate-800">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 shadow-inner">
            <UtensilsIcon className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="mt-4 text-xl font-bold text-white">ระบบจัดการร้านและสั่งอาหาร</h1>
          <p className="mt-2 text-xs text-slate-400 leading-relaxed">
            ลูกค้าสแกน QR Code ที่โต๊ะเพื่อสั่งอาหาร <br />
            พนักงานและผู้ดูแลร้านเข้าใช้งานหลังบ้านผ่านระบบล็อกอิน
          </p>
        </div>
        <div className="p-6 flex flex-col gap-3">
          <Link
            href="/login"
            className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 font-bold text-sm text-white shadow-xs transition-colors hover:bg-emerald-700 active:scale-98 cursor-pointer"
          >
            <LockIcon className="w-4 h-4" />
            <span>เข้าสู่ระบบสำหรับพนักงาน</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
