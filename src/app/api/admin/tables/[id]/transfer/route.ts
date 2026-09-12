import type { NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { apiOk, apiError, authFailureResponse, ERROR_CODES, parseId } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { withTransaction } from '@/lib/db';
import { transferTableSchema, firstErrorMessage } from '@/lib/validation';

/** พารามิเตอร์เส้นทางของ Next.js 15 */
type RouteContext = { params: Promise<{ id: string }> };

type TransferFailure =
  | 'INVALID_PARAMS'
  | 'SAME_TABLE'
  | 'SOURCE_NOT_FOUND'
  | 'SOURCE_NOT_OPEN'
  | 'FORBIDDEN'
  | 'TARGET_NOT_FOUND'
  | 'DIFFERENT_BRANCH'
  | 'TARGET_INACTIVE'
  | 'TARGET_OCCUPIED';

/**
 * ย้ายรอบการนั่ง (Session) จากโต๊ะหนึ่งไปยังอีกโต๊ะหนึ่ง
 * ใช้เมื่อลูกค้าย้ายที่นั่ง เช่น เปลี่ยนโต๊ะใหญ่ขึ้น หรือเปลี่ยนตำแหน่ง
 *
 * ออเดอร์ รายการอาหาร และตั๋วแจ้งปัญหาจะย้ายตามไปยังโต๊ะใหม่ทันที
 *
 * @param request - JSON body { targetTableId }
 * @param context - id ของโต๊ะต้นทาง
 * @returns ผลการย้าย หรือ error พร้อมข้อความไทย
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireStaff();
  if (!auth.ok) return authFailureResponse(auth.reason);

  const sourceTableId = parseId((await context.params).id);
  if (!sourceTableId) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, 'รหัสโต๊ะต้นทางไม่ถูกต้อง');
  }

  const parsed = transferTableSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, firstErrorMessage(parsed.error));
  }

  const { targetTableId } = parsed.data;
  if (sourceTableId === targetTableId) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, 'โต๊ะต้นทางและโต๊ะปลายทางต้องไม่ใช่โต๊ะเดียวกัน', 400);
  }

  const result = await withTransaction<
    | {
        ok: true;
        sessionId: number;
        sourceTableNo: string;
        targetTableNo: string;
      }
    | { ok: false; reason: TransferFailure }
  >(async (conn) => {
    // 1. ตรวจสอบโต๊ะต้นทาง
    const [sourceTables] = await conn.execute<
      (RowDataPacket & { id: number; branch_id: number; table_no: string; is_active: number })[]
    >('SELECT id, branch_id, table_no, is_active FROM dining_tables WHERE id = ? FOR UPDATE', [
      sourceTableId,
    ]);
    const sourceTable = sourceTables[0];
    if (!sourceTable) return { ok: false, reason: 'SOURCE_NOT_FOUND' };

    // ตรวจสอบ tenant isolation
    if (auth.user.branchId && auth.user.branchId !== sourceTable.branch_id) {
      return { ok: false, reason: 'FORBIDDEN' };
    }

    // ตรวจสอบ session ที่เปิดอยู่ของโต๊ะต้นทาง
    const [openSessions] = await conn.execute<
      (RowDataPacket & { id: number; branch_id: number; status: string })[]
    >("SELECT id, branch_id, status FROM table_sessions WHERE table_id = ? AND status = 'OPEN' FOR UPDATE", [
      sourceTableId,
    ]);
    const session = openSessions[0];
    if (!session) return { ok: false, reason: 'SOURCE_NOT_OPEN' };

    // 2. ตรวจสอบโต๊ะปลายทาง
    const [targetTables] = await conn.execute<
      (RowDataPacket & { id: number; branch_id: number; table_no: string; is_active: number })[]
    >('SELECT id, branch_id, table_no, is_active FROM dining_tables WHERE id = ? FOR UPDATE', [
      targetTableId,
    ]);
    const targetTable = targetTables[0];
    if (!targetTable) return { ok: false, reason: 'TARGET_NOT_FOUND' };

    // ต้องอยู่สาขาเดียวกัน
    if (targetTable.branch_id !== sourceTable.branch_id) {
      return { ok: false, reason: 'DIFFERENT_BRANCH' };
    }

    if (targetTable.is_active !== 1) {
      return { ok: false, reason: 'TARGET_INACTIVE' };
    }

    // ตรวจว่าโต๊ะปลายทางว่างอยู่จริงหรือไม่
    const [targetOccupied] = await conn.execute<(RowDataPacket & { id: number })[]>(
      "SELECT id FROM table_sessions WHERE table_id = ? AND status = 'OPEN' FOR UPDATE",
      [targetTableId],
    );
    if (targetOccupied.length > 0) {
      return { ok: false, reason: 'TARGET_OCCUPIED' };
    }

    // 3. ดำเนินการย้าย session ไปยังโต๊ะใหม่
    await conn.execute('UPDATE table_sessions SET table_id = ? WHERE id = ?', [
      targetTableId,
      session.id,
    ]);

    // ย้ายตั๋วแจ้งปัญหาที่ยังค้างอยู่ของโต๊ะต้นทางไปยังโต๊ะใหม่
    await conn.execute(
      "UPDATE tickets SET table_id = ? WHERE table_id = ? AND status IN ('OPEN', 'IN_PROGRESS')",
      [targetTableId, sourceTableId],
    );

    return {
      ok: true,
      sessionId: session.id,
      sourceTableNo: sourceTable.table_no,
      targetTableNo: targetTable.table_no,
    };
  });

  if (!result.ok) {
    if (result.reason === 'FORBIDDEN') {
      return apiError(ERROR_CODES.FORBIDDEN, 'ไม่มีสิทธิ์จัดการโต๊ะของสาขาอื่น', 403);
    }
    if (result.reason === 'SOURCE_NOT_FOUND') {
      return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบโต๊ะต้นทาง', 404);
    }
    if (result.reason === 'SOURCE_NOT_OPEN') {
      return apiError(
        ERROR_CODES.VALIDATION_ERROR,
        'โต๊ะต้นทางไม่มีรอบการนั่งที่เปิดอยู่ (ไม่พบลูกค้านั่ง)',
        409,
      );
    }
    if (result.reason === 'TARGET_NOT_FOUND') {
      return apiError(ERROR_CODES.NOT_FOUND, 'ไม่พบโต๊ะปลายทางที่ต้องการย้าย', 404);
    }
    if (result.reason === 'DIFFERENT_BRANCH') {
      return apiError(ERROR_CODES.VALIDATION_ERROR, 'ไม่สามารถย้ายโต๊ะข้ามสาขาได้', 400);
    }
    if (result.reason === 'TARGET_INACTIVE') {
      return apiError(
        ERROR_CODES.VALIDATION_ERROR,
        'โต๊ะปลายทางถูกปิดใช้งานอยู่ กรุณาเลือกโต๊ะอื่น',
        409,
      );
    }
    if (result.reason === 'TARGET_OCCUPIED') {
      return apiError(
        ERROR_CODES.VALIDATION_ERROR,
        'โต๊ะปลายทางมีลูกค้านั่งอยู่แล้ว ไม่สามารถย้ายซ้อนได้',
        409,
      );
    }
    return apiError(ERROR_CODES.VALIDATION_ERROR, 'ไม่สามารถย้ายโต๊ะได้ กรุณาลองใหม่อีกครั้ง');
  }

  return apiOk({
    sessionId: result.sessionId,
    sourceTableNo: result.sourceTableNo,
    targetTableNo: result.targetTableNo,
    message: `ย้ายรอบการนั่งจากโต๊ะ ${result.sourceTableNo} ไปยังโต๊ะ ${result.targetTableNo} เรียบร้อยแล้ว`,
  });
}
