import { apiOk } from '@/lib/api';
import { clearAuthCookie } from '@/lib/auth';

/**
 * ล้าง cookie ที่เก็บ JWT ทำให้ผู้ใช้หลุดจากระบบทันที
 * ไม่ตรวจว่าล็อกอินอยู่หรือไม่ เพราะการล้าง cookie ที่ไม่มีอยู่ก็ไม่เสียหาย
 *
 * @returns ผลลัพธ์สำเร็จเสมอ ให้หน้าจอพากลับไปหน้าล็อกอินได้เลย
 */
export async function POST() {
  await clearAuthCookie();
  return apiOk({ loggedOut: true });
}
