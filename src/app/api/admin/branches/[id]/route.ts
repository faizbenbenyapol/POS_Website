import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, apiError, authFailureResponse, ERROR_CODES, parseId } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { execute, queryOne } from '@/lib/db';
import { updateBranchSchema, firstErrorMessage } from '@/lib/validation';

type RouteContext = { params: Promise<{ id: string }> };

type BranchDetailRow = RowDataPacket & {
  id: number;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  business_day_cutoff_hour: number;
  is_active: number;
  created_at: string;
  updated_at: string;
};

/**
 * ดึงข้อมูลรายละเอียดของสาขา
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireStaff();
  if (!auth.ok) return authFailureResponse(auth.reason);

  const id = parseId((await context.params).id);
  if (!id) return apiError(ERROR_CODES.VALIDATION_ERROR, 'รหัสสาขาไม่ถูกต้อง');

  // ตรวจสิทธิ์: หากไม่ใช่ HQ Admin และ id ไม่ตรงกับสาขาของตนเอง -> ห้ามเข้าถึง
  if (auth.user.branchId && auth.user.branchId !== id) {
    return apiError(ERROR_CODES.FORBIDDEN, 'ไม่มีสิทธิ์เข้าถึงข้อมูลสาขาอื่น', 403);
  }

  const branch = await queryOne<BranchDetailRow>(
    'SELECT * FROM branches WHERE id = ? LIMIT 1',
    [id],
  );
  if (!branch) return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบสาขานี้ในระบบ', 404);

  return apiOk(branch);
}

/**
 * แก้ไขข้อมูลสาขา (สงวนสิทธิ์เฉพาะ HQ Admin เท่านั้น)
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireStaff('ADMIN');
  if (!auth.ok) return authFailureResponse(auth.reason);

  if (auth.user.branchId !== null && auth.user.branchId !== undefined) {
    return apiError(ERROR_CODES.FORBIDDEN, 'เฉพาะ HQ Admin เท่านั้นที่สามารถแก้ไขข้อมูลสาขาได้', 403);
  }

  const id = parseId((await context.params).id);
  if (!id) return apiError(ERROR_CODES.VALIDATION_ERROR, 'รหัสสาขาไม่ถูกต้อง');

  const parsed = updateBranchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, firstErrorMessage(parsed.error));
  }

  const existing = await queryOne<BranchDetailRow>(
    'SELECT * FROM branches WHERE id = ? LIMIT 1',
    [id],
  );
  if (!existing) return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบสาขานี้ในระบบ', 404);

  // ห้ามปิดการใช้งานสาขาหลักที่ id = 1
  if (id === 1 && parsed.data.isActive === false) {
    return apiError(
      ERROR_CODES.VALIDATION_ERROR,
      'ไม่สามารถปิดการใช้งานสาขาหลัก (สำนักงานใหญ่) ได้',
      409,
    );
  }

  // ตรวจสอบความซ้ำซ้อนของ code หากมีการเปลี่ยน
  if (parsed.data.code && parsed.data.code.toUpperCase() !== existing.code) {
    const dup = await queryOne<RowDataPacket & { id: number }>(
      'SELECT id FROM branches WHERE code = ? AND id <> ? LIMIT 1',
      [parsed.data.code.toUpperCase(), id],
    );
    if (dup) {
      return apiError(
        ERROR_CODES.VALIDATION_ERROR,
        `มีรหัสสาขา ${parsed.data.code.toUpperCase()} อยู่แล้ว กรุณาใช้รหัสสาขาอื่น`,
      );
    }
  }

  const code = parsed.data.code ? parsed.data.code.toUpperCase() : existing.code;
  const name = parsed.data.name ?? existing.name;
  const address = parsed.data.address !== undefined ? parsed.data.address : existing.address;
  const phone = parsed.data.phone !== undefined ? parsed.data.phone : existing.phone;
  const cutoff = parsed.data.businessDayCutoffHour ?? existing.business_day_cutoff_hour;
  const isActive = parsed.data.isActive !== undefined ? (parsed.data.isActive ? 1 : 0) : existing.is_active;

  await execute(
    `UPDATE branches
        SET code = ?, name = ?, address = ?, phone = ?,
            business_day_cutoff_hour = ?, is_active = ?
      WHERE id = ?`,
    [code, name, address || null, phone || null, cutoff, isActive, id],
  );

  return apiOk({ id, code, name, isActive: isActive === 1 });
}
