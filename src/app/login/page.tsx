'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * ฟอร์มล็อกอินของพนักงาน ส่งข้อมูลไป POST /api/auth/login แล้วพาเข้าหลังบ้าน
 * แยกเป็นคอมโพเนนต์ย่อยเพราะต้องใช้ useSearchParams ซึ่งต้องอยู่ใต้ Suspense
 *
 * @returns ฟอร์มพร้อมสถานะกำลังส่งและข้อความผิดพลาดภาษาไทย
 */
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  /**
   * ส่งฟอร์มล็อกอิน และพาไปหน้าที่ผู้ใช้ตั้งใจเข้าตั้งแต่แรก (พารามิเตอร์ next)
   *
   * @param event - เหตุการณ์ submit ของฟอร์ม ใช้ยกเลิกการรีโหลดหน้า
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือตั้ง cookie และเปลี่ยนหน้า
   */
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const body = await res.json();
      if (body.ok) {
        const next = searchParams.get('next');
        router.replace(next && next.startsWith('/admin') ? next : '/admin');
        router.refresh();
        return;
      }
      setErrorMessage(body.error.message);
    } catch {
      setErrorMessage('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <label htmlFor="username" className="text-sm text-slip-dim">
          ชื่อผู้ใช้
        </label>
        <input
          id="username"
          name="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          className="min-h-[44px] rounded-lg bg-char px-3 text-slip placeholder:text-slip-dim"
          placeholder="เช่น staff01"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="password" className="text-sm text-slip-dim">
          รหัสผ่าน
        </label>
        <input
          id="password"
          name="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          className="min-h-[44px] rounded-lg bg-char px-3 text-slip"
        />
      </div>

      {errorMessage && (
        <p role="alert" className="rounded-lg border-l-4 border-void bg-char px-3 py-2 text-sm text-slip">
          {errorMessage}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="min-h-[44px] rounded-lg bg-flame px-4 font-medium text-char transition-opacity duration-200 disabled:opacity-60"
      >
        {submitting ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
      </button>
    </form>
  );
}

/**
 * หน้าล็อกอินของพนักงาน ทางเข้าเดียวของฝั่งร้าน
 * ห่อฟอร์มไว้ใน Suspense เพราะฟอร์มอ่าน useSearchParams เพื่อจำหน้าที่ผู้ใช้ตั้งใจเข้าตั้งแต่แรก
 *
 * @returns หน้าจอล็อกอินเต็มหน้า
 */
export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-8 px-6 py-10">
      <div className="flex flex-col gap-8 rounded-xl bg-griddle p-8 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold text-slip">เข้าสู่ระบบ</h1>
          <p className="mt-1 text-slip-dim">สำหรับพนักงานและผู้ดูแลร้านเท่านั้น</p>
        </div>

        <Suspense
          fallback={<div className="h-64 animate-pulse rounded-lg bg-char" aria-hidden="true" />}
        >
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
