import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { execute, queryOne } from '@/lib/db';

/** ข้อมูลโต๊ะและรอบการนั่งที่ฝั่งลูกค้าต้องใช้ทุกหน้า */
export type TableSession = {
  tableId: number;
  tableNo: string;
  sessionId: number;
  branchId: number;
  branchName: string;
  branchCode: string;
};

/** แถวโต๊ะที่ค้นด้วย qr_token พร้อมข้อมูลสาขา */
type TableWithBranchRow = RowDataPacket & {
  id: number;
  table_no: string;
  is_active: number;
  branch_id: number;
  branch_name: string;
  branch_code: string;
  branch_is_active: number;
};

/** แถวรอบการนั่งที่กำลังเปิดอยู่ของโต๊ะ */
type SessionRow = RowDataPacket & { id: number };

/**
 * สาเหตุที่ token ใช้ไม่ได้ แยกเป็นรหัสเพื่อให้หน้าจอบอกวิธีแก้ได้ตรงกรณี
 */
export type SessionError = 'TABLE_NOT_FOUND' | 'TABLE_INACTIVE' | 'TABLE_NOT_OPEN' | 'BRANCH_INACTIVE';

/**
 * ตรวจ qr_token จากลิงก์ QR แล้วคืนรอบการนั่งที่เปิดอยู่ของโต๊ะนั้น
 * ไม่เปิดรอบให้อัตโนมัติอีกแล้ว (Approach A) เพราะพนักงานต้องเป็นคนเปิดโต๊ะ
 * เพื่อเป็นจุดยืนยันว่ามีลูกค้านั่งจริง
 *
 * นี่คือด่านตรวจสิทธิ์เดียวของฝั่งลูกค้า ทุก API ฝั่งลูกค้าต้องเรียกฟังก์ชันนี้ก่อนเสมอ
 * เพื่อไม่ให้ลูกค้าโต๊ะหนึ่งอ่านหรือแก้ข้อมูลของโต๊ะอื่นได้
 *
 * @param token - qr_token 32 ตัวอักษรที่ติดมากับลิงก์
 * @returns ข้อมูลโต๊ะและ session id เมื่อ token ใช้ได้ หรือรหัสสาเหตุเมื่อใช้ไม่ได้
 */
export async function resolveTableSession(
  token: string,
): Promise<{ ok: true; session: TableSession } | { ok: false; reason: SessionError }> {
  const table = await queryOne<TableWithBranchRow>(
    `SELECT t.id, t.table_no, t.is_active, t.branch_id,
            b.name AS branch_name, b.code AS branch_code, b.is_active AS branch_is_active
       FROM dining_tables t
       JOIN branches b ON b.id = t.branch_id
      WHERE t.qr_token = ? LIMIT 1`,
    [token],
  );
  if (!table) return { ok: false, reason: 'TABLE_NOT_FOUND' };
  if (table.is_active !== 1) return { ok: false, reason: 'TABLE_INACTIVE' };
  if (table.branch_is_active !== 1) return { ok: false, reason: 'BRANCH_INACTIVE' };

  const open = await queryOne<SessionRow>(
    "SELECT id FROM table_sessions WHERE table_id = ? AND status = 'OPEN' ORDER BY id DESC LIMIT 1",
    [table.id],
  );

  if (!open) return { ok: false, reason: 'TABLE_NOT_OPEN' };

  return {
    ok: true,
    session: {
      tableId: table.id,
      tableNo: table.table_no,
      sessionId: open.id,
      branchId: table.branch_id,
      branchName: table.branch_name,
      branchCode: table.branch_code,
    },
  };
}

/**
 * ตรวจ token โดยไม่เปิดรอบการนั่งใหม่ ใช้กับหน้าที่แค่อ่านข้อมูล เช่นหน้าสถานะออเดอร์
 * แยกจาก resolveTableSession เพื่อไม่ให้การกดดูสถานะเฉย ๆ ไปเปิดรอบใหม่ให้โต๊ะที่เพิ่งปิดบิล
 *
 * @param token - qr_token 32 ตัวอักษรที่ติดมากับลิงก์
 * @returns ข้อมูลโต๊ะและ session id ที่เปิดอยู่ (เป็น null ถ้าไม่มีรอบเปิด) หรือรหัสสาเหตุ
 */
export async function findTableSession(
  token: string,
): Promise<
  | {
      ok: true;
      tableId: number;
      tableNo: string;
      sessionId: number | null;
      branchId: number;
      branchName: string;
      branchCode: string;
    }
  | { ok: false; reason: SessionError }
> {
  const table = await queryOne<TableWithBranchRow>(
    `SELECT t.id, t.table_no, t.is_active, t.branch_id,
            b.name AS branch_name, b.code AS branch_code, b.is_active AS branch_is_active
       FROM dining_tables t
       JOIN branches b ON b.id = t.branch_id
      WHERE t.qr_token = ? LIMIT 1`,
    [token],
  );
  if (!table) return { ok: false, reason: 'TABLE_NOT_FOUND' };
  if (table.is_active !== 1) return { ok: false, reason: 'TABLE_INACTIVE' };
  if (table.branch_is_active !== 1) return { ok: false, reason: 'BRANCH_INACTIVE' };

  const open = await queryOne<SessionRow>(
    "SELECT id FROM table_sessions WHERE table_id = ? AND status = 'OPEN' ORDER BY id DESC LIMIT 1",
    [table.id],
  );
  return {
    ok: true,
    tableId: table.id,
    tableNo: table.table_no,
    sessionId: open?.id ?? null,
    branchId: table.branch_id,
    branchName: table.branch_name,
    branchCode: table.branch_code,
  };
}

/** errno ที่ MySQL คืนเมื่อ INSERT ชน unique index */
const ER_DUP_ENTRY = 1062;

/** จำนวนครั้งที่จะลองอ่าน session ซ้ำหลัง INSERT ชน unique */
const MAX_RETRY = 2;

/**
 * เปิดรอบการนั่งใหม่สำหรับโต๊ะ โดยพนักงานเป็นคนกด
 * ใช้ unique index บน open_table_id กัน race condition —
 * ถ้าสองพนักงานกดเปิดพร้อมกัน คนที่สองจะได้ session ที่คนแรกสร้าง
 *
 * @param tableId - รหัสโต๊ะที่ต้องการเปิด
 * @param userId - รหัสพนักงานที่กดเปิด (บันทึกลง opened_by)
 * @returns session id ที่เปิดอยู่
 */
export async function openTableSession(
  tableId: number,
  userId: number,
): Promise<{ sessionId: number; created: boolean }> {
  // ตรวจว่ามี session เปิดอยู่แล้วหรือไม่
  const existing = await queryOne<SessionRow>(
    "SELECT id FROM table_sessions WHERE table_id = ? AND status = 'OPEN' LIMIT 1",
    [tableId],
  );
  if (existing) return { sessionId: existing.id, created: false };

  // ดึง branch_id ของโต๊ะเพื่อผูกกับ session
  const table = await queryOne<RowDataPacket & { branch_id: number }>(
    'SELECT branch_id FROM dining_tables WHERE id = ? LIMIT 1',
    [tableId],
  );
  const branchId = table?.branch_id ?? 1;

  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    try {
      const result: ResultSetHeader = await execute(
        "INSERT INTO table_sessions (table_id, branch_id, status, opened_by) VALUES (?, ?, 'OPEN', ?)",
        [tableId, branchId, userId],
      );
      return { sessionId: result.insertId, created: true };
    } catch (err: unknown) {
      const mysqlErr = err as { errno?: number };
      if (mysqlErr.errno === ER_DUP_ENTRY) {
        // unique index ชน แปลว่ามีคนเปิดไปแล้วพอดี ลองอ่านซ้ำ
        const retried = await queryOne<SessionRow>(
          "SELECT id FROM table_sessions WHERE table_id = ? AND status = 'OPEN' LIMIT 1",
          [tableId],
        );
        if (retried) return { sessionId: retried.id, created: false };
        // ถ้าอ่านไม่เจอ อาจมีคนปิดไปพอดี ลองสร้างใหม่
        continue;
      }
      throw err;
    }
  }
  // ไม่ควรมาถึงจุดนี้ แต่กันไว้เผื่อ edge case ผิดปกติ
  throw new Error(`Failed to open session for table ${tableId} after ${MAX_RETRY + 1} attempts`);
}

/**
 * แปลงสาเหตุที่ token ใช้ไม่ได้ให้เป็นข้อความไทยที่บอกลูกค้าว่าต้องทำอะไรต่อ
 * ลูกค้าอยู่หน้าโต๊ะ จึงต้องบอกวิธีแก้ที่ทำได้จริงตรงนั้น ไม่ใช่ศัพท์เทคนิค
 *
 * @param reason - รหัสสาเหตุจาก resolveTableSession หรือ findTableSession
 * @returns ข้อความภาษาไทยพร้อมแสดงบนหน้าจอ
 */
export function sessionErrorMessage(reason: SessionError): string {
  if (reason === 'BRANCH_INACTIVE') {
    return 'สาขานี้ปิดให้บริการชั่วคราว ขออภัยในความไม่สะดวก';
  }
  if (reason === 'TABLE_INACTIVE') {
    return 'โต๊ะนี้ปิดใช้งานชั่วคราว กรุณาแจ้งพนักงานเพื่อย้ายโต๊ะหรือเปิดโต๊ะให้ใหม่';
  }
  if (reason === 'TABLE_NOT_OPEN') {
    return 'โต๊ะนี้ยังไม่ได้เปิดรอบการนั่ง กรุณาแจ้งพนักงานเพื่อเปิดโต๊ะก่อนสั่งอาหาร';
  }
  return 'ไม่พบโต๊ะนี้ในระบบ กรุณาสแกน QR บนโต๊ะอีกครั้ง หรือแจ้งพนักงานให้ช่วยตรวจสอบ';
}
