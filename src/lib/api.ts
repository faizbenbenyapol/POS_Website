import { NextResponse } from 'next/server';

/**
 * รหัสข้อผิดพลาดทั้งหมดที่ API ของระบบนี้คืนได้ ประกาศรวมไว้ที่เดียว
 * เพื่อไม่ให้แต่ละ route สะกดรหัสไม่ตรงกันจนฝั่งหน้าจอเช็คพลาด
 */
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  NOT_FOUND: 'NOT_FOUND',
  SERVER_ERROR: 'SERVER_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** รูปแบบผลลัพธ์มาตรฐานตามหัวข้อ 8 ของ plan.md ใช้เหมือนกันทุก endpoint */
export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

/**
 * คืนผลลัพธ์สำเร็จในรูปแบบมาตรฐาน { ok: true, data }
 *
 * @param data - ข้อมูลที่จะส่งกลับให้ฝั่งหน้าจอ
 * @param status - HTTP status ปกติ 200 ใช้ 201 ตอนสร้างข้อมูลใหม่
 * @returns NextResponse พร้อม JSON body
 */
export function apiOk<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ ok: true, data }, { status });
}

/**
 * คืนผลลัพธ์ล้มเหลวในรูปแบบมาตรฐาน { ok: false, error }
 * ข้อความต้องเป็นภาษาไทยที่บอกวิธีแก้ ไม่ใช่คำขอโทษลอย ๆ
 *
 * @param code - รหัสข้อผิดพลาดจาก ERROR_CODES ให้ฝั่งหน้าจอเช็คได้
 * @param message - ข้อความภาษาไทยบอกผู้ใช้ว่าต้องทำอะไรต่อ
 * @param status - HTTP status ที่ตรงกับความหมายของ error
 * @returns NextResponse พร้อม JSON body
 */
export function apiError(
  code: ErrorCode,
  message: string,
  status = 400,
): NextResponse<ApiResponse<never>> {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

/**
 * แปลงผลตรวจสิทธิ์ที่ไม่ผ่านจาก requireStaff ให้เป็นคำตอบ HTTP พร้อมข้อความไทย
 * รวมไว้ที่เดียวเพื่อให้ทุก endpoint ตอบเหมือนกันเวลาสิทธิ์ไม่ถึง
 *
 * @param reason - เหตุผลที่ requireStaff คืนมา
 * @returns NextResponse สถานะ 401 หรือ 403
 */
export function authFailureResponse(reason: 'UNAUTHORIZED' | 'FORBIDDEN') {
  if (reason === 'FORBIDDEN') {
    return apiError(
      ERROR_CODES.FORBIDDEN,
      'บัญชีนี้ไม่มีสิทธิ์ใช้งานส่วนนี้ กรุณาให้ผู้ดูแลระบบดำเนินการแทน',
      403,
    );
  }
  return apiError(ERROR_CODES.UNAUTHORIZED, 'กรุณาเข้าสู่ระบบก่อนใช้งาน', 401);
}

/**
 * แปลง id ที่มาจาก URL เป็นตัวเลขบวก กันคนยิง /api/admin/menu-items/abc เข้ามา
 *
 * @param raw - ค่าพารามิเตอร์ที่ได้จาก URL
 * @returns ตัวเลข id หรือ null เมื่อรูปแบบไม่ถูกต้อง
 */
export function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}
