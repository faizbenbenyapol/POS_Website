import { randomBytes } from 'crypto';
import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, apiError, authFailureResponse, ERROR_CODES, parseId } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { execute, queryOne } from '@/lib/db';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * สร้าง QR Token ใหม่ประจำโต๊ะ (Regenerate Table QR)
 * ใช้เมื่อต้องการเปลี่ยนป้าย หรือเมื่อลูกค้ากลุ่มเดิมเช็คบิลลุกไปแล้ว
 * เพื่อตัดสิทธิ์ QR เดิม ป้องกันลูกค้าเก่านำรูปที่ถ่ายไว้ไปแอบสั่งอาหารจากนอกร้าน
 *
 * สิทธิ์: ทั้ง ADMIN และ STAFF สามารถกดสร้างใหม่ได้
 *
 * @param _request - คำขอเรียก API
 * @param context - พารามิเตอร์เส้นทางที่มี id ของโต๊ะ
 * @returns ข้อมูลโต๊ะพร้อม qrToken ใหม่
 */
export async function POST(_request: NextRequest, context: RouteContext) {
  const auth = await requireStaff();
  if (!auth.ok) return authFailureResponse(auth.reason);

  const id = parseId((await context.params).id);
  if (!id) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, 'รหัสโต๊ะไม่ถูกต้อง กรุณากลับไปเลือกใหม่');
  }

  // ตรวจสอบว่าโต๊ะมีจริงในระบบ
  const table = await queryOne<RowDataPacket & { id: number; table_no: string; is_active: number }>(
    'SELECT id, table_no, is_active FROM dining_tables WHERE id = ? LIMIT 1',
    [id],
  );

  if (!table) {
    return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบโต๊ะนี้ อาจถูกลบไปแล้ว กรุณารีเฟรชหน้า', 404);
  }

  // สุ่ม token ใหม่ 32 ตัวอักษร
  const newToken = randomBytes(16).toString('hex');

  // ปิดรอบการนั่งเดิมของโต๊ะนี้ที่ยังค้างอยู่ เพื่อเริ่มรอบใหม่ที่สะอาดหมดจด
  await execute(
    "UPDATE table_sessions SET status = 'CLOSED', closed_at = NOW(), closed_by = ? WHERE table_id = ? AND status = 'OPEN'",
    [auth.user.id, id],
  );

  // อัปเดต qr_token ใหม่ลงใน dining_tables
  await execute('UPDATE dining_tables SET qr_token = ? WHERE id = ?', [newToken, id]);

  return apiOk({
    id: table.id,
    tableNo: table.table_no,
    qrToken: newToken,
    message: `สร้าง QR Code ใหม่สำหรับโต๊ะ ${table.table_no} เรียบร้อยแล้ว (QR เดิมถูกยกเลิกทันที)`,
  });
}
