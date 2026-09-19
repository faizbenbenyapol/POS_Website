'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { SessionUser } from '@/lib/auth/token';
import AdminNav from '@/components/AdminNav';
import { CloseIcon } from '@/components/Icons';
import { canOpenPage } from '@/lib/permissions';
import {
  STATION_EVENT,
  readFocusMode,
  readStation,
  stationAllows,
  writeFocusMode,
  type Station,
} from '@/lib/station';

/** ตัวจับจอไม่ให้ดับ (Screen Wake Lock API) เท่าที่ต้องใช้ บางเบราว์เซอร์ไม่มี */
type WakeLockHandle = { release: () => Promise<void> };

/**
 * โครงหน้าหลังบ้านฝั่งเบราว์เซอร์: แถบเมนู โหมดประจำจุด และโหมดเต็มจอ
 *
 * โหมดประจำจุด: ถ้าเครื่องนี้ตั้งเป็นครัวแล้วเปิดหน้าที่ครัวไม่ได้ใช้ จะพากลับหน้าแรกของจุดนั้น
 * โหมดเต็มจอ: ซ่อนแถบเมนู ขยายพื้นที่ทำงาน ขอเต็มจอจากเบราว์เซอร์ (ถ้ารองรับ)
 * และกันจอดับระหว่างเปิดค้างไว้ เหมาะกับจอครัวและจอบาร์ที่เปิดกระดานทั้งวัน
 *
 * @param user - ผู้ใช้ที่ล็อกอินอยู่
 * @param children - เนื้อหาของหน้า
 * @returns โครงหน้าหลังบ้าน
 */
export default function AdminShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [station, setStation] = useState<Station | null>(null);
  const [focus, setFocus] = useState(false);
  const enteredFullscreen = useRef(false);

  // อ่านค่าของเครื่องหลังหน้าโหลด (อ่านตอน render ฝั่งเซิร์ฟเวอร์ไม่ได้) และฟังการเปลี่ยนจุด
  useEffect(() => {
    setStation(readStation());
    setFocus(readFocusMode());
    const onChange = () => setStation(readStation());
    window.addEventListener(STATION_EVENT, onChange);
    return () => window.removeEventListener(STATION_EVENT, onChange);
  }, []);

  // เปิดหน้าที่จุดนี้ไม่ได้ใช้ -> พาไปหน้าแรกของจุด (หรือหน้าแรกที่บทบาทนี้เปิดได้)
  useEffect(() => {
    if (!station || stationAllows(station, pathname)) return;
    const candidates = [station.home, ...(station.pages ?? [])];
    const target = candidates.find((p) => canOpenPage(user.role, p) && stationAllows(station, p));
    if (target && target !== pathname) router.replace(target);
  }, [station, pathname, user.role, router]);

  /**
   * ออกจากโหมดเต็มจอ แสดงแถบเมนูกลับมา และคืนเต็มจอของเบราว์เซอร์
   */
  const exitFocus = useCallback(() => {
    setFocus(false);
    writeFocusMode(false);
    enteredFullscreen.current = false;
    if (typeof document !== 'undefined' && document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    }
  }, []);

  /**
   * เข้าโหมดเต็มจอ ซ่อนแถบเมนูก่อนเสมอ แล้วค่อยขอเต็มจอจากเบราว์เซอร์
   * iPad / iPhone บางรุ่นไม่ให้หน้าเว็บเต็มจอ แถบเมนูก็ยังซ่อนได้ตามปกติ
   */
  const enterFocus = useCallback(() => {
    setFocus(true);
    writeFocusMode(true);
    const root = document.documentElement;
    if (root.requestFullscreen && !document.fullscreenElement) {
      root
        .requestFullscreen()
        .then(() => {
          enteredFullscreen.current = true;
        })
        .catch(() => undefined);
    }
  }, []);

  // กด Esc ออกจากเต็มจอของเบราว์เซอร์ = ออกจากโหมดเต็มจอของระบบด้วย ไม่ให้ค้างครึ่ง ๆ
  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && enteredFullscreen.current) exitFocus();
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, [exitFocus]);

  // กันจอดับระหว่างโหมดเต็มจอ ขอใหม่ทุกครั้งที่กลับมาที่แท็บ เพราะเบราว์เซอร์ปล่อยเองเมื่อสลับแท็บ
  useEffect(() => {
    if (!focus) return;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<WakeLockHandle> };
    };
    if (!nav.wakeLock) return;
    let lock: WakeLockHandle | null = null;
    let cancelled = false;
    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      nav.wakeLock!
        .request('screen')
        .then((handle) => {
          if (cancelled) handle.release().catch(() => undefined);
          else lock = handle;
        })
        .catch(() => undefined);
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', acquire);
      lock?.release().catch(() => undefined);
    };
  }, [focus]);

  // ใช้โครงเดียวกันทั้งสองโหมด (ตำแหน่ง main ไม่เปลี่ยน) เพื่อไม่ให้เนื้อหาของหน้าถูกสร้างใหม่ตอนสลับโหมด
  // ไม่อย่างนั้นกระดานออเดอร์จะโหลดใหม่และตัวกรองที่ตั้งไว้หายทุกครั้งที่กดเต็มจอ
  return (
    <div className={`flex min-h-screen flex-col bg-char ${focus ? '' : 'md:flex-row'}`}>
      {/* แถบบางด้านบนแทนปุ่มลอย ปุ่มลอยเคยทับปุ่มของหน้า (เช่นปุ่มรีเฟรชของกระดานออเดอร์) */}
      {focus && (
        <div className="sticky top-0 z-40 flex h-10 shrink-0 items-center justify-between gap-3 border-b border-rule bg-white/95 px-3 backdrop-blur md:px-4">
          <p className="min-w-0 truncate text-xs text-zinc-500">
            <span className="font-semibold text-zinc-800">{user.fullName}</span>
            {station && <span> · {station.label}</span>}
          </p>
          <button
            type="button"
            onClick={exitFocus}
            className="flex min-h-[32px] shrink-0 items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 cursor-pointer"
          >
            <CloseIcon className="w-3.5 h-3.5" />
            ออกจากเต็มจอ
          </button>
        </div>
      )}
      {!focus && <AdminNav user={user} station={station} onEnterFocus={enterFocus} />}
      <main className={`min-w-0 flex-1 ${focus ? 'px-3 py-3 md:px-4 md:py-4' : 'px-4 py-6 md:px-8 md:py-8'}`}>
        {children}
      </main>
    </div>
  );
}
