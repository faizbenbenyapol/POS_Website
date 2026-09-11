'use client';

/**
 * Root error boundary สำหรับดักจับข้อผิดพลาดใน root layout
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="th">
      <body className="min-h-screen flex items-center justify-center bg-[#f8f9fa] p-6 font-sans">
        <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm text-center">
          <span className="inline-block rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-600 mb-3">
            ข้อผิดพลาดระดับระบบ
          </span>
          <h1 className="text-lg font-bold text-zinc-900">ระบบเกิดข้อผิดพลาดร้ายแรง</h1>
          <p className="mt-2 text-xs text-zinc-500">
            ขออภัยในความไม่สะดวก กรุณารีเฟรชหน้าเว็บหรือลองใหม่อีกครั้ง
          </p>
          <div className="mt-5 flex justify-center">
            <button
              type="button"
              onClick={() => reset()}
              className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 transition-colors shadow-xs cursor-pointer"
            >
              โหลดหน้านี้ใหม่
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
