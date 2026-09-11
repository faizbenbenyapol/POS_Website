import type { NextRequest } from 'next/server';
import { apiOk, apiError, ERROR_CODES } from '@/lib/api';
import { authenticate, createToken, setAuthCookie } from '@/lib/auth';
import { loginSchema, firstErrorMessage } from '@/lib/validation';
import { createRateLimiter, getClientIp } from '@/lib/rateLimit';

/** จำกัดการล็อกอินผิด 5 ครั้ง/นาที ต่อ username กัน brute-force เจาะรหัสผ่าน */
const loginByUsername = createRateLimiter('login-user', { maxRequests: 5, windowMs: 60000 });

/** จำกัด 20 ครั้ง/นาที ต่อ IP กันยิงขนานหลาย username พร้อมกัน */
const loginByIp = createRateLimiter('login-ip', { maxRequests: 20, windowMs: 60000 });

/**
 * รับชื่อผู้ใช้กับรหัสผ่าน ตรวจกับตาราง users แล้วออก JWT ใส่ httpOnly cookie
 * ไม่ส่ง token กลับใน body เพื่อไม่ให้ฝั่งเบราว์เซอร์เก็บลง localStorage ได้
 * มี rate limit 2 ชั้น: ต่อ username และ ต่อ IP
 *
 * @param request - คำขอที่มี body เป็น JSON { username, password }
 * @returns ข้อมูลผู้ใช้ที่ล็อกอินสำเร็จ หรือ error พร้อมข้อความภาษาไทย
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(ERROR_CODES.VALIDATION_ERROR, 'ข้อมูลที่ส่งมาไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง');
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(ERROR_CODES.VALIDATION_ERROR, firstErrorMessage(parsed.error));
  }

  // ตรวจ rate limit ก่อนตรวจรหัสผ่าน เพื่อไม่ให้ brute-force ถึงชั้น bcrypt
  const ip = getClientIp(request.headers);
  const ipCheck = loginByIp(ip);
  if (!ipCheck.allowed) {
    const waitSec = Math.ceil(ipCheck.retryAfterMs / 1000);
    return apiError(
      ERROR_CODES.VALIDATION_ERROR,
      `มีการพยายามเข้าสู่ระบบมากเกินไป กรุณารอ ${waitSec} วินาทีแล้วลองใหม่`,
      429,
    );
  }

  const userCheck = loginByUsername(parsed.data.username);
  if (!userCheck.allowed) {
    const waitSec = Math.ceil(userCheck.retryAfterMs / 1000);
    return apiError(
      ERROR_CODES.VALIDATION_ERROR,
      `ลองเข้าสู่ระบบด้วยชื่อผู้ใช้นี้มากเกินไป กรุณารอ ${waitSec} วินาทีแล้วลองใหม่`,
      429,
    );
  }

  const result = await authenticate(parsed.data.username, parsed.data.password);
  if (!result.ok) {
    if (result.reason === 'ACCOUNT_DISABLED') {
      return apiError(
        ERROR_CODES.ACCOUNT_DISABLED,
        'บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบให้เปิดใช้งานก่อน',
        403,
      );
    }
    return apiError(
      ERROR_CODES.INVALID_CREDENTIALS,
      'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจตัวสะกดแล้วลองใหม่',
      401,
    );
  }

  await setAuthCookie(await createToken(result.user));
  return apiOk(result.user);
}
