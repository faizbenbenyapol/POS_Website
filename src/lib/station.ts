import type { BoardViewMode, StationFilter } from '@/components/admin/orders/types';

/**
 * โหมดประจำจุด: บอกว่าเครื่องนี้ตั้งอยู่ที่ไหนในร้าน แล้วแสดงเฉพาะเมนูที่จุดนั้นใช้
 *
 * เก็บที่ตัวเครื่อง (localStorage) ไม่ผูกกับบัญชีผู้ใช้ เพราะพนักงานคนเดียวกันอาจอยู่เคาน์เตอร์วันนี้
 * แล้วเข้าครัวพรุ่งนี้ แต่แท็บเล็ตที่ติดผนังครัวไม่ย้ายไปไหน
 *
 * โหมดนี้แค่ซ่อนเมนูให้หน้าจอสะอาด สิทธิ์จริงมาจากบทบาทของผู้ใช้ (src/lib/permissions.ts)
 * เมนูที่เห็นจึงเป็นส่วนที่ทั้งจุดนี้ใช้และบทบาทของผู้ใช้เปิดได้
 */

/** จุดในร้านที่ตั้งเครื่องได้ */
export type StationId = 'COUNTER' | 'KITCHEN' | 'BAR' | 'MANAGER';

/** ค่าตั้งของจุดหนึ่ง */
export type Station = {
  id: StationId;
  label: string;
  /** หน้าที่จุดนี้ใช้ null คือเห็นทุกหน้าที่บทบาทเปิดได้ */
  pages: string[] | null;
  /** หน้าที่เปิดมาเจอเมื่อเข้าหน้าที่จุดนี้ไม่ได้ใช้ */
  home: string;
  /** ค่าตั้งต้นของกระดานออเดอร์เมื่อเปิดจากจุดนี้ */
  board: { view: BoardViewMode; station: StationFilter };
};

/** จุดทั้งหมด เรียงตามที่แสดงในตัวเลือก */
export const STATIONS: Station[] = [
  {
    id: 'COUNTER',
    label: 'เคาน์เตอร์ / แคชเชียร์',
    pages: ['/admin/orders', '/admin/tables', '/admin/settlement', '/admin/tickets', '/admin/profile'],
    home: '/admin/orders',
    board: { view: 'LIST', station: 'ALL' },
  },
  {
    id: 'KITCHEN',
    label: 'ครัว',
    pages: ['/admin/orders', '/admin/stock', '/admin/ingredients', '/admin/tickets', '/admin/profile'],
    home: '/admin/orders',
    board: { view: 'KDS', station: 'KITCHEN' },
  },
  {
    id: 'BAR',
    label: 'บาร์เครื่องดื่ม',
    pages: ['/admin/orders', '/admin/stock', '/admin/ingredients', '/admin/tickets', '/admin/profile'],
    home: '/admin/orders',
    board: { view: 'KDS', station: 'BAR' },
  },
  {
    id: 'MANAGER',
    label: 'ผู้จัดการ (เห็นทุกเมนู)',
    pages: null,
    home: '/admin',
    board: { view: 'LIST', station: 'ALL' },
  },
];

/** คีย์ใน localStorage ของจุดที่ตั้งเครื่องไว้ */
const STATION_KEY = 'pos-station';

/** คีย์ใน localStorage ของโหมดเต็มจอ (ซ่อนแถบเมนู) */
const FOCUS_KEY = 'pos-focus-mode';

/** ชื่อ event ที่ยิงเมื่อเปลี่ยนจุด ให้ทุกส่วนของหน้าอัปเดตตามทันที */
export const STATION_EVENT = 'pos-station-change';

/**
 * อ่านจุดที่ตั้งเครื่องไว้ ครอบ try/catch เพราะบางโหมดของเบราว์เซอร์อ่าน localStorage ไม่ได้
 *
 * @returns จุดที่ตั้งไว้ หรือ null เมื่อยังไม่ได้ตั้ง (เห็นทุกเมนูตามบทบาท)
 */
export function readStation(): Station | null {
  if (typeof window === 'undefined') return null;
  try {
    const id = window.localStorage.getItem(STATION_KEY);
    return STATIONS.find((s) => s.id === id) ?? null;
  } catch {
    return null;
  }
}

/**
 * ตั้งจุดของเครื่องนี้ แล้วแจ้งทุกส่วนของหน้าให้อัปเดต
 *
 * @param id - จุดที่เลือก null คือเลิกตั้ง (เห็นทุกเมนูตามบทบาท)
 */
export function writeStation(id: StationId | null): void {
  try {
    if (id) window.localStorage.setItem(STATION_KEY, id);
    else window.localStorage.removeItem(STATION_KEY);
  } catch {
    // เขียนไม่ได้ก็ยังใช้ค่าในหน้านี้ต่อได้จนกว่าจะรีเฟรช
  }
  window.dispatchEvent(new Event(STATION_EVENT));
}

/**
 * ตรวจว่าจุดนี้ใช้หน้านี้หรือไม่
 *
 * @param station - จุดของเครื่อง null คือไม่ได้ตั้ง
 * @param pathname - เส้นทางของหน้า
 * @returns true เมื่อจุดนี้ใช้หน้านี้ หรือเมื่อไม่ได้ตั้งจุด
 */
export function stationAllows(station: Station | null, pathname: string): boolean {
  if (!station?.pages) return true;
  return station.pages.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * อ่านว่าเครื่องนี้เปิดโหมดเต็มจอค้างไว้หรือไม่
 *
 * @returns true เมื่อเปิดไว้
 */
export function readFocusMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(FOCUS_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * จำสถานะโหมดเต็มจอของเครื่องนี้
 *
 * @param on - true เมื่อเปิดโหมดเต็มจอ
 */
export function writeFocusMode(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(FOCUS_KEY, '1');
    else window.localStorage.removeItem(FOCUS_KEY);
  } catch {
    // เขียนไม่ได้ก็ไม่เป็นไร แค่รีเฟรชแล้วแถบเมนูจะกลับมา
  }
}
