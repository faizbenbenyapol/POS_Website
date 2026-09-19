import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, apiError, authFailureResponse, ERROR_CODES } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { execute, query, queryOne } from '@/lib/db';
import { branchSchema, firstErrorMessage } from '@/lib/validation';
import { getBusinessDayRange } from '@/lib/format';

export type BranchListRow = RowDataPacket & {
  id: number;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  business_day_cutoff_hour: number;
  vat_rate: string;
  vat_inclusive: number;
  service_charge_rate: string;
  promptpay_id: string | null;
  promptpay_name: string | null;
  is_active: number;
  created_at: string;
  table_count: number;
  today_order_count: number;
};

/**
 * ดึงรายการสาขาทั้งหมด พร้อมสถิติจำนวนโต๊ะและจำนวนออเดอร์วันนี้
 * HQ Admin จะเห็นทุกสาขา ส่วนพนักงานสาขาจะเห็นเฉพาะสาขาของตนเอง
 */
export async function GET() {
  const auth = await requireStaff();
  if (!auth.ok) return authFailureResponse(auth.reason);

  const todayRange = getBusinessDayRange();
  const isHqAdmin = auth.user.role === 'ADMIN' && (auth.user.branchId === null || auth.user.branchId === undefined);
  const filterBranchId = isHqAdmin ? null : (auth.user.branchId ?? 1);

  const rows = await query<BranchListRow>(
    `SELECT b.id, b.code, b.name, b.address, b.phone, b.business_day_cutoff_hour,
            b.vat_rate, b.vat_inclusive, b.service_charge_rate,
            b.promptpay_id, b.promptpay_name,
            b.is_active, b.created_at,
            (SELECT COUNT(*) FROM dining_tables t WHERE t.branch_id = b.id) AS table_count,
            (SELECT COUNT(*) FROM orders o
              WHERE o.branch_id = b.id
                AND o.created_at >= ? AND o.created_at < ?
                AND o.status <> 'CANCELLED') AS today_order_count
       FROM branches b
      WHERE (? IS NULL OR b.id = ?)
      ORDER BY b.id`,
    [todayRange.startSql, todayRange.endSql, filterBranchId, filterBranchId],
  );

  return apiOk(rows);
}

/**
 * สร้างสาขาใหม่ในระบบ (สงวนสิทธิ์เฉพาะ HQ Admin เท่านั้น)
 */
export async function POST(request: NextRequest) {
  const auth = await requireStaff('ADMIN');
  if (!auth.ok) return authFailureResponse(auth.reason);

  // ตรวจสอบว่าเป็น HQ Admin (branchId === null)
  if (auth.user.branchId !== null && auth.user.branchId !== undefined) {
    return apiError(
      ERROR_CODES.FORBIDDEN,
      'เฉพาะผู้ดูแลระบบส่วนกลาง (HQ Admin) เท่านั้นที่สามารถสร้างสาขาใหม่ได้',
      403,
    );
  }

  const parsed = branchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, firstErrorMessage(parsed.error));
  }

  const {
    code,
    name,
    address,
    phone,
    businessDayCutoffHour,
    vatRate,
    vatInclusive,
    serviceChargeRate,
    promptpayId,
    promptpayName,
    isActive,
  } = parsed.data;

  const duplicate = await queryOne<RowDataPacket & { id: number }>(
    'SELECT id FROM branches WHERE code = ? LIMIT 1',
    [code.toUpperCase()],
  );
  if (duplicate) {
    return apiError(
      ERROR_CODES.VALIDATION_ERROR,
      `มีรหัสสาขา ${code.toUpperCase()} อยู่แล้ว กรุณาใช้รหัสสาขาอื่น`,
    );
  }

  const result = await execute(
    `INSERT INTO branches
       (code, name, address, phone, business_day_cutoff_hour,
        vat_rate, vat_inclusive, service_charge_rate, promptpay_id, promptpay_name, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      code.toUpperCase(),
      name,
      address || null,
      phone || null,
      businessDayCutoffHour,
      vatRate,
      vatInclusive ? 1 : 0,
      serviceChargeRate,
      promptpayId ? promptpayId.replace(/[\s-]/g, '') : null,
      promptpayName || null,
      isActive ? 1 : 0,
    ],
  );

  return apiOk({ id: result.insertId, code: code.toUpperCase() }, 201);
}
