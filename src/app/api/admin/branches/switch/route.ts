import type { NextRequest } from 'next/server';
import { apiOk, apiError, authFailureResponse, ERROR_CODES } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { setActiveBranchCookie } from '@/lib/branch';

/**
 * สลับสาขาที่กำลังดูอยู่สำหรับ HQ Admin
 * จะเขียนค่าลงใน Cookie 'pos_active_branch'
 * หากส่ง branchId = null หรือ 0 หมายถึงดู "ภาพรวมทุกสาขา"
 */
export async function POST(request: NextRequest) {
  const auth = await requireStaff('ADMIN');
  if (!auth.ok) return authFailureResponse(auth.reason);

  // ป้องกันพนักงานที่ถูกล็อกสาขา (branchId !== null) ไม่ให้สลับสาขา
  if (auth.user.branchId !== null && auth.user.branchId !== undefined) {
    return apiError(
      ERROR_CODES.FORBIDDEN,
      'พนักงานสาขาไม่สามารถสลับไปดูข้อมูลของสาขาอื่นได้',
      403,
    );
  }

  const body = await request.json().catch(() => ({}));
  const rawId = body?.branchId;
  const branchId = typeof rawId === 'number' && rawId > 0 ? rawId : null;

  await setActiveBranchCookie(branchId);

  return apiOk({
    activeBranchId: branchId,
    message: branchId ? `สลับไปยังสาขา ID ${branchId} สำเร็จ` : 'สลับไปยังภาพรวมทุกสาขาสำเร็จ',
  });
}
