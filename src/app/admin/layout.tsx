import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import AdminNav from '@/components/AdminNav';

/**
 * เลย์เอาต์ของทุกหน้าหลังบ้าน ตรวจซ้ำอีกชั้นว่าล็อกอินแล้วจริง
 * ถึงจะมี middleware กันอยู่แล้ว แต่ตรวจที่นี่ด้วยเพราะเป็นชั้นที่อ่านข้อมูลผู้ใช้จริง
 *
 * @param children - เนื้อหาของหน้าหลังบ้านที่กำลังเปิด
 * @returns โครงหน้าหลังบ้านที่มีแถบเมนูและพื้นที่เนื้อหา
 */
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex min-h-screen flex-col bg-char md:flex-row">
      <AdminNav user={user} />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
