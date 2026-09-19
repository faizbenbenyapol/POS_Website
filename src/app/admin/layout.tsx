import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import AdminShell from '@/components/AdminShell';

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

  return <AdminShell user={user}>{children}</AdminShell>;
}
