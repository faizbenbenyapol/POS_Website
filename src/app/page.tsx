import Link from 'next/link';

/**
 * หน้าแรกของระบบ ทำหน้าที่เป็นทางแยกให้พนักงานเข้าหลังบ้าน
 * ส่วนลูกค้าจะไม่ผ่านหน้านี้เพราะสแกน QR เข้าที่ /t/{token} โดยตรง
 *
 * @returns หน้าจอต้อนรับพร้อมลิงก์ไปหน้าล็อกอิน
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <div className="flex flex-col gap-6 rounded-xl bg-griddle p-8 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold text-slip">ระบบสั่งอาหารด้วย QR Code</h1>
          <p className="mt-2 text-slip-dim">
            ลูกค้าสแกน QR ที่โต๊ะเพื่อสั่งอาหาร ส่วนพนักงานเข้าใช้งานหลังบ้านผ่านหน้าล็อกอิน
          </p>
        </div>
        <Link
          href="/login"
          className="flex min-h-[44px] items-center justify-center rounded-lg bg-flame px-6 font-medium text-char transition-colors duration-200 hover:bg-flame/90"
        >
          เข้าสู่ระบบสำหรับพนักงาน
        </Link>
      </div>
    </main>
  );
}
