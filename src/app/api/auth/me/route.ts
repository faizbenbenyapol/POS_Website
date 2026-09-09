import { apiOk, apiError, ERROR_CODES } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';

/**
 * คืนข้อมูลผู้ใช้ที่ล็อกอินอยู่ ให้หน้าจอฝั่งร้านรู้ว่าใครใช้งานและมีสิทธิ์แค่ไหน
 *
 * @returns ข้อมูลผู้ใช้ปัจจุบัน หรือ 401 เมื่อยังไม่ได้ล็อกอิน
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return apiError(ERROR_CODES.UNAUTHORIZED, 'กรุณาเข้าสู่ระบบก่อนใช้งาน', 401);
  }
  return apiOk(user);
}
