import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_COOKIE, readToken } from '@/lib/auth/token';

/**
 * กันเส้นทาง /admin ไม่ให้เข้าถึงได้ถ้ายังไม่ได้ล็อกอิน และเด้งคนที่ล็อกอินแล้ว
 * ออกจากหน้า /login เพื่อไม่ให้ล็อกอินซ้อน
 *
 * หมายเหตุ: ชั้นนี้เป็นแค่ด่านแรกเพื่อประสบการณ์ใช้งาน การตรวจสิทธิ์จริงยังต้องทำ
 * ซ้ำในทุก route handler ใต้ /api/admin เสมอ เพราะ middleware ไม่ได้ครอบ API ทั้งหมด
 *
 * @param request - คำขอที่กำลังเข้ามา ใช้อ่าน cookie และเส้นทาง
 * @returns คำสั่ง redirect เมื่อสิทธิ์ไม่ผ่าน หรือปล่อยผ่านเมื่อทุกอย่างเรียบร้อย
 */
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const user = token ? await readToken(token) : null;

  // ยังไม่ได้ล็อกอินแต่จะเข้าหลังบ้าน → ส่งไปหน้า login พร้อมจำหน้าเดิมไว้
  if (pathname.startsWith('/admin') && !user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  // ล็อกอินอยู่แล้วแต่เปิดหน้า login → พาเข้าหลังบ้านตามบทบาท
  if (pathname === '/login' && user) {
    const target = user.role === 'ADMIN' ? '/admin' : '/admin/orders';
    return NextResponse.redirect(new URL(target, request.url));
  }

  // พนักงาน (STAFF) พยายามเข้าหน้าจัดการผู้ใช้ระบบ → ส่งไปกระดานออเดอร์
  if (pathname.startsWith('/admin/users') && user?.role === 'STAFF') {
    return NextResponse.redirect(new URL('/admin/orders', request.url));
  }

  return NextResponse.next();
}

/** ให้ middleware ทำงานเฉพาะสองเส้นทางนี้ เพื่อไม่ให้ไปหน่วงหน้าลูกค้าและไฟล์ static */
export const config = {
  matcher: ['/admin/:path*', '/login'],
};
