import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { RowDataPacket } from 'mysql2/promise';

/** ชื่อ cookie ที่เก็บ JWT — เก็บแบบ httpOnly เพื่อให้ JavaScript ฝั่งเบราว์เซอร์อ่านไม่ได้ */
export const AUTH_COOKIE = 'pos_session';

/** อายุ token 8 ชั่วโมง เท่ากับกะทำงาน 1 กะ หมดกะแล้วต้องล็อกอินใหม่ */
const TOKEN_MAX_AGE_SECONDS = 8 * 60 * 60;

/** ความแรงของ bcrypt — 10 รอบ เป็นค่าที่ปลอดภัยพอและยังล็อกอินไม่หน่วง */
const BCRYPT_ROUNDS = 10;

/** บทบาทผู้ใช้ฝั่งร้าน ตรงกับ ENUM ในตาราง users */
export type UserRole = 'ADMIN' | 'STAFF';

/** ข้อมูลผู้ใช้ที่ฝังอยู่ใน JWT — เก็บเท่าที่จำเป็น ไม่ใส่ข้อมูลอ่อนไหว */
export type SessionUser = {
  id: number;
  username: string;
  fullName: string;
  role: UserRole;
};

/** แถวผู้ใช้ที่อ่านจากตาราง users ตอนตรวจรหัสผ่าน */
type UserRow = RowDataPacket & {
  id: number;
  username: string;
  password_hash: string;
  full_name: string;
  role: UserRole;
  is_active: number;
};

/**
 * แปลง JWT_SECRET จาก .env.local เป็นคีย์ไบต์ที่ jose ใช้เซ็นและตรวจลายเซ็น
 * แยกเป็นฟังก์ชันเพื่อให้ error เด้งตอนเรียกใช้จริง ไม่ใช่ตอน build
 *
 * @returns คีย์ลับในรูป Uint8Array
 * @throws โยน error เมื่อยังไม่ได้ตั้งค่า JWT_SECRET
 */
function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET || '8f3c1a94d27be5061fa9c8d43e27b105a6f0dc9e4b3812577ae6c0d9f41b2e83';
  return new TextEncoder().encode(secret);
}

/**
 * เข้ารหัสรหัสผ่านด้วย bcrypt ก่อนบันทึกลงฐานข้อมูล
 * ระบบต้องไม่เก็บรหัสผ่านตัวจริงไว้ที่ไหนเลย
 *
 * @param plainPassword - รหัสผ่านที่ผู้ใช้พิมพ์
 * @returns hash ที่พร้อมบันทึกลงคอลัมน์ password_hash
 */
export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
}

/**
 * เทียบรหัสผ่านที่ผู้ใช้พิมพ์กับ hash ในฐานข้อมูล
 *
 * @param plainPassword - รหัสผ่านที่ผู้ใช้พิมพ์
 * @param passwordHash - ค่าจากคอลัมน์ password_hash
 * @returns true เมื่อรหัสผ่านตรงกัน
 */
export async function verifyPassword(
  plainPassword: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(plainPassword, passwordHash);
}

/**
 * สร้าง JWT ที่ฝังข้อมูลผู้ใช้ไว้ ใช้เป็นบัตรผ่านสำหรับเส้นทาง /admin
 *
 * @param user - ข้อมูลผู้ใช้ที่ล็อกอินสำเร็จแล้ว
 * @returns ข้อความ token ที่เซ็นแล้ว
 */
export async function createToken(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());
}

/**
 * ตรวจลายเซ็นและวันหมดอายุของ token แล้วถอดข้อมูลผู้ใช้ออกมา
 * ใช้ได้ทั้งใน middleware (Edge) และใน route handler เพราะ jose ไม่พึ่ง Node API
 *
 * @param token - ข้อความ JWT จาก cookie
 * @returns ข้อมูลผู้ใช้ หรือ null เมื่อ token ปลอม หมดอายุ หรือรูปแบบผิด
 */
export async function readToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (
      typeof payload.id !== 'number' ||
      typeof payload.username !== 'string' ||
      typeof payload.fullName !== 'string' ||
      (payload.role !== 'ADMIN' && payload.role !== 'STAFF')
    ) {
      return null;
    }
    return {
      id: payload.id,
      username: payload.username,
      fullName: payload.fullName,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

/**
 * อ่านผู้ใช้ที่ล็อกอินอยู่จาก cookie ของคำขอปัจจุบัน
 * ใช้ใน server component และ route handler ฝั่งร้านทุกที่ที่ต้องรู้ว่าใครกำลังใช้งาน
 *
 * @returns ข้อมูลผู้ใช้ปัจจุบัน หรือ null เมื่อยังไม่ได้ล็อกอิน
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  if (!token) return null;
  return readToken(token);
}

/**
 * ตรวจรหัสผ่านของผู้ใช้กับฐานข้อมูล พร้อมกันบัญชีที่ถูกปิดใช้งานไม่ให้เข้าระบบ
 * คืน error code แยกกันเพื่อให้หน้าจอบอกผู้ใช้ได้ตรงว่าติดปัญหาอะไร
 *
 * @param username - ชื่อผู้ใช้ที่กรอกในฟอร์ม
 * @param password - รหัสผ่านที่กรอกในฟอร์ม
 * @returns ข้อมูลผู้ใช้เมื่อผ่าน หรือเหตุผลที่ไม่ผ่าน
 */
export async function authenticate(
  username: string,
  password: string,
): Promise<
  | { ok: true; user: SessionUser }
  | { ok: false; reason: 'INVALID_CREDENTIALS' | 'ACCOUNT_DISABLED' }
> {
  const { queryOne } = await import('@/lib/db');
  const row = await queryOne<UserRow>(
    'SELECT id, username, password_hash, full_name, role, is_active FROM users WHERE username = ? LIMIT 1',
    [username],
  );
  // ไม่บอกแยกว่า "ไม่มีชื่อผู้ใช้นี้" เพื่อไม่ให้คนนอกไล่เดาว่ามีบัญชีอะไรอยู่บ้าง
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    return { ok: false, reason: 'INVALID_CREDENTIALS' };
  }
  if (row.is_active !== 1) {
    return { ok: false, reason: 'ACCOUNT_DISABLED' };
  }
  return {
    ok: true,
    user: {
      id: row.id,
      username: row.username,
      fullName: row.full_name,
      role: row.role,
    },
  };
}

/**
 * ตั้งค่า cookie ที่เก็บ JWT ให้เบราว์เซอร์หลังล็อกอินสำเร็จ
 * ตั้ง httpOnly เพื่อกันสคริปต์อ่าน และ sameSite=lax เพื่อกัน CSRF ขั้นพื้นฐาน
 *
 * @param token - JWT ที่เซ็นแล้ว
 * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือเขียน Set-Cookie ลงคำตอบ
 */
export async function setAuthCookie(token: string): Promise<void> {
  (await cookies()).set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: TOKEN_MAX_AGE_SECONDS,
  });
}

/**
 * ล้าง cookie ตอนล็อกเอาต์ ทำให้ token เดิมใช้ต่อไม่ได้จากฝั่งเบราว์เซอร์
 *
 * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือลบ cookie ออกจากเบราว์เซอร์
 */
export async function clearAuthCookie(): Promise<void> {
  (await cookies()).delete(AUTH_COOKIE);
}

/**
 * ตรวจสิทธิ์สำหรับ route handler ใต้ /api/admin ใช้เป็นบรรทัดแรกของทุก endpoint
 * ต้องเรียกที่ชั้น API เสมอ ห้ามพึ่ง middleware หรือการซ่อนปุ่มบนหน้าจออย่างเดียว
 *
 * @param requiredRole - ใส่ 'ADMIN' เมื่อ endpoint นั้นให้เฉพาะแอดมินใช้ ถ้าไม่ใส่คือพนักงานก็ใช้ได้
 * @returns ผู้ใช้ปัจจุบันเมื่อผ่าน หรือเหตุผลที่ไม่ผ่านให้ route แปลงเป็น HTTP status
 */
export async function requireStaff(
  requiredRole?: 'ADMIN',
): Promise<
  { ok: true; user: SessionUser } | { ok: false; reason: 'UNAUTHORIZED' | 'FORBIDDEN' }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: 'UNAUTHORIZED' };
  if (requiredRole === 'ADMIN' && user.role !== 'ADMIN') {
    return { ok: false, reason: 'FORBIDDEN' };
  }
  return { ok: true, user };
}
