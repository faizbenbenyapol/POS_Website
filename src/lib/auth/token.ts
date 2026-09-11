import { SignJWT, jwtVerify } from 'jose';

/**
 * ชื่อ cookie สำหรับเก็บเซสชัน JWT โดยตั้งค่าเป็น httpOnly เพื่อความปลอดภัย
 */
export const AUTH_COOKIE = 'pos_session';

/**
 * อายุของเซสชัน token (8 ชั่วโมง เท่ากับหนึ่งกะการทำงาน)
 */
export const TOKEN_MAX_AGE_SECONDS = 8 * 60 * 60;

export type UserRole = 'ADMIN' | 'STAFF';

export type SessionUser = {
  id: number;
  username: string;
  fullName: string;
  role: UserRole;
};

/**
 * ดึง secret key สำหรับเซ็นและตรวจสอบ JWT
 * แยกฟังก์ชันเพื่อให้อ่านค่า runtime environment ล่าสุดเสมอ
 */
function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET || '8f3c1a94d27be5061fa9c8d43e27b105a6f0dc9e4b3812577ae6c0d9f41b2e83';
  return new TextEncoder().encode(secret);
}

/**
 * สร้าง JWT token สำหรับผู้ใช้ที่ผ่านการตรวจสอบสิทธิ์แล้ว
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
 * ตรวจสอบลายเซ็นและความถูกต้องของ JWT token
 * ออกแบบให้ทำงานได้ทั้งบน Edge Runtime และ Node.js Runtime (ไม่พึ่งพา Node crypto)
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
