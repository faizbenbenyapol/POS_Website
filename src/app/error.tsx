'use client';

import { useEffect } from 'react';

/**
 * Error boundary ประจำแอปพลิเคชันสำหรับดักจับ runtime exception ในระดับ route
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // บันทึก error ลงใน console เพื่อการตรวจสอบย้อนหลัง
    console.error('Unhandled runtime error:', error);
  }, [error]);

  return (
    <div className="min-h-[50vh] flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-rule bg-white p-6 shadow-xs text-center">
        <span className="inline-block rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-600 mb-3">
          ระบบพบข้อผิดพลาด
        </span>
        <h2 className="text-lg font-bold text-slip">ไม่สามารถโหลดข้อมูลหน้านี้ได้</h2>
        <p className="mt-2 text-xs text-slip-dim">
          เกิดปัญหาขึ้นชั่วคราวในการประมวลผลข้อมูล กรุณากดปุ่มเพื่อลองใหม่อีกครั้ง
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 transition-colors shadow-xs cursor-pointer"
          >
            ลองใหม่อีกครั้ง
          </button>
        </div>
      </div>
    </div>
  );
}
