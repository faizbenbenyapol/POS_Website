'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LockIcon } from '@/components/Icons';

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
        <label htmlFor="username" className="text-xs font-bold text-slip-dim">
          ชื่อผู้ใช้
        </label>
        <input
          id="username"
          name="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          className="min-h-[46px] rounded-xl border border-rule bg-char px-4 text-sm text-slip placeholder:text-slip-dim focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 transition-all"
          placeholder="เช่น admin หรือ staff01"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="password" className="text-xs font-bold text-slip-dim">
          รหัสผ่าน
        </label>
        <input
          id="password"
          name="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          className="min-h-[46px] rounded-xl border border-rule bg-char px-4 text-sm text-slip focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 transition-all"
          placeholder="••••••••"
        />
      </div>

      {errorMessage && (
        <p role="alert" className="rounded-xl border-l-4 border-void bg-void/10 px-3 py-2 text-xs font-medium text-void">
          {errorMessage}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-2 min-h-[48px] rounded-xl bg-emerald-600 px-4 font-bold text-sm text-white shadow-xs transition-colors hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
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
      <div className="lm-card overflow-hidden p-0 shadow-xl border border-slate-200">
        <div className="bg-slate-900 p-6 text-white text-center border-b border-slate-800">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 shadow-inner">
            <LockIcon className="w-7 h-7 text-emerald-400" />
          </div>
          <h1 className="mt-3 text-xl font-bold text-white">เข้าสู่ระบบหลังบ้าน</h1>
          <p className="mt-1 text-xs text-slate-400">สำหรับพนักงานและผู้ดูแลร้านเท่านั้น</p>
        </div>

        <div className="p-6">
          <Suspense
            fallback={<div className="h-48 animate-pulse rounded-xl bg-char" aria-hidden="true" />}
          >
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
