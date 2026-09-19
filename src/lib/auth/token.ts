import { SignJWT, jwtVerify } from 'jose';
import { isRole, type Role } from '@/lib/permissions';

/**
 * ชื่อ cookie สำหรับเก็บเซสชัน JWT โดยตั้งค่าเป็น httpOnly เพื่อความปลอดภัย
 */
export const AUTH_COOKIE = 'pos_session';

/**
 * อายุของเซสชัน token (8 ชั่วโมง เท่ากับหนึ่งกะการทำงาน)
 */
export const TOKEN_MAX_AGE_SECONDS = 8 * 60 * 60;

/** บทบาทของผู้ใช้ รายการและสิทธิ์ของแต่ละบทบาทอยู่ใน src/lib/permissions.ts */
export type UserRole = Role;

export type SessionUser = {
  id: number;
  username: string;
  fullName: string;
  role: UserRole;
  branchId?: number | null;
  branchName?: string | null;
};

/**
 * ดึง secret key สำหรับเซ็นและตรวจสอบ JWT
 * แยกฟังก์ชันเพื่อให้อ่านค่า runtime environment ล่าสุดเสมอ
 */
function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured in environment variables');
  }
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
      !isRole(payload.role)
    ) {
      return null;
    }
    const branchId = typeof payload.branchId === 'number' ? payload.branchId : null;
    const branchName = typeof payload.branchName === 'string' ? payload.branchName : null;
    return {
      id: payload.id,
      username: payload.username,
      fullName: payload.fullName,
      role: payload.role,
      branchId,
      branchName,
    };
  } catch {
    return null;
  }
}

