import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import type { SessionUser } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';

/** ชื่อ Cookie สำหรับจำสาขาที่ HQ Admin กำลังเลือกดู */
export const ACTIVE_BRANCH_COOKIE = 'pos_active_branch';

/** ข้อมูลสาขาที่ใช้ในระบบ */
export type Branch = {
  id: number;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  businessDayCutoffHour: number;
  isActive: boolean;
};

type BranchRow = RowDataPacket & {
  id: number;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  business_day_cutoff_hour: number;
  is_active: number;
};

/**
 * ดึงสาขาที่ active อยู่ทั้งหมดในระบบ
 */
export async function getActiveBranches(): Promise<Branch[]> {
  const rows = await query<BranchRow>(
    'SELECT id, code, name, address, phone, business_day_cutoff_hour, is_active FROM branches WHERE is_active = 1 ORDER BY id',
  );
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    address: r.address,
    phone: r.phone,
    businessDayCutoffHour: r.business_day_cutoff_hour,
    isActive: r.is_active === 1,
  }));
}

/**
 * ดึงสาขาทั้งหมด (รวมทั้งที่เปิดและปิดใช้งาน) สำหรับหน้าจัดการสาขาของ HQ Admin
 */
export async function getAllBranches(): Promise<Branch[]> {
  const rows = await query<BranchRow>(
    'SELECT id, code, name, address, phone, business_day_cutoff_hour, is_active FROM branches ORDER BY id',
  );
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    address: r.address,
    phone: r.phone,
    businessDayCutoffHour: r.business_day_cutoff_hour,
    isActive: r.is_active === 1,
  }));
}

/**
 * อ่านสาขาที่เลือกไว้จาก Cookie ปัจจุบัน
 */
export async function getActiveBranchCookie(): Promise<number | null> {
  const cookieStore = await cookies();
  const val = cookieStore.get(ACTIVE_BRANCH_COOKIE)?.value;
  if (!val || val === 'all' || val === '0') return null;
  const num = Number(val);
  return Number.isInteger(num) && num > 0 ? num : null;
}

/**
 * บันทึกสาขาที่เลือกดูลงใน Cookie (สำหรับ HQ Admin)
 * หากส่ง null หรือ 0 หมายถึงเลือกดู "ทุกสาขา"
 */
export async function setActiveBranchCookie(branchId: number | null): Promise<void> {
  const cookieStore = await cookies();
  if (!branchId || branchId <= 0) {
    cookieStore.delete(ACTIVE_BRANCH_COOKIE);
  } else {
    cookieStore.set(ACTIVE_BRANCH_COOKIE, String(branchId), {
      httpOnly: false, // อนุญาตให้อ่านจาก client เพื่ออัปเดต UI ทันที
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // จำไว้ 30 วัน
    });
  }
}

/**
 * คำนวณ branch_id ที่มีผลบังคับใช้สำหรับคำขอปัจจุบัน (Tenant Isolation Guard):
 * 1. หากผู้ใช้เป็นพนักงานประจำสาขา (user.branchId !== null) -> ถูกล็อกให้ใช้สาขาของตนเองเสมอ (ข้าม Cookie ทุกกรณี)
 * 2. หากผู้ใช้เป็น HQ Admin (user.branchId === null):
 *    - ตรวจ query param ?branchId=... ก่อน (หากมีระบุใน URL)
 *    - หากไม่มี ให้ตรวจจาก Cookie pos_active_branch
 *    - หากไม่พบทั้งคู่ คืนค่า null (หมายถึง ดูข้อมูลภาพรวมทุกสาขา)
 *
 * @param request - คำขอที่อาจมี query parameter
 * @param user - ผู้ใช้ที่ล็อกอินอยู่
 * @returns branchId ที่ต้องใช้กรองใน SQL (หรือ null เมื่อดูทุกสาขา)
 */
export async function getEffectiveBranchId(
  request?: NextRequest | null,
  user?: SessionUser | null,
): Promise<number | null> {
  // หากเป็นพนักงานประจำสาขา ล็อกตามสาขาของตนเองเสมอ ห้ามหลุดไปสาขาอื่น
  if (user && typeof user.branchId === 'number' && user.branchId > 0) {
    return user.branchId;
  }

  // กรณีเป็น HQ Admin (branchId === null)
  // 1. ตรวจสอบ Query Parameter ก่อน
  if (request) {
    const paramVal = request.nextUrl.searchParams.get('branchId');
    if (paramVal !== null) {
      if (paramVal === 'all' || paramVal === '0' || paramVal === '') return null;
      const num = Number(paramVal);
      if (Number.isInteger(num) && num > 0) return num;
    }
  }

  // 2. ตรวจสอบจาก Cookie
  return getActiveBranchCookie();
}

/**
 * ดึงข้อมูลสาขาตาม ID
 */
export async function getBranchById(branchId: number): Promise<Branch | null> {
  const row = await queryOne<BranchRow>(
    'SELECT id, code, name, address, phone, business_day_cutoff_hour, is_active FROM branches WHERE id = ? LIMIT 1',
    [branchId],
  );
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    address: row.address,
    phone: row.phone,
    businessDayCutoffHour: row.business_day_cutoff_hour,
    isActive: row.is_active === 1,
  };
}

/**
 * ดึงข้อมูลสาขาที่มีผลบังคับใช้สำหรับคำขอปัจจุบัน
 * หากผู้ใช้เป็นพนักงาน จะคืนค่าสาขาของพนักงาน
 * หากเป็น HQ Admin และเลือกสาขาไว้ จะคืนค่าสาขานั้น
 * หากเลือกดูทุกสาขา จะคืนค่า null
 */
export async function getActiveBranch(
  request?: NextRequest | null,
  user?: SessionUser | null,
): Promise<Branch | null> {
  const branchId = await getEffectiveBranchId(request, user);
  if (!branchId) return null;
  return getBranchById(branchId);
}

