import type { Metadata } from 'next';
import { IBM_Plex_Sans_Thai, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

/** ฟอนต์หลักของทั้งระบบ มีคู่ละตินในตระกูลเดียวกัน ไทย-อังกฤษจึงไม่เพี้ยน */
const plexThai = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-thai',
  display: 'swap',
});

/** ฟอนต์ monospace ใช้เฉพาะตัวเลขเงิน เวลา รหัสออเดอร์ และรหัส ticket */
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ระบบสั่งอาหารด้วย QR Code',
  description: 'ระบบขายหน้าร้านสำหรับร้านอาหารนั่งทาน ลูกค้าสแกน QR ที่โต๊ะแล้วสั่งเองได้',
};

/**
 * เลย์เอาต์ราก ครอบทุกหน้าในระบบ ทำหน้าที่ผูกตัวแปรฟอนต์เข้ากับ <html>
 * เพื่อให้ CSS token ในไฟล์ globals.css เรียกใช้ฟอนต์ได้ทุกหน้า
 *
 * @param children - เนื้อหาของหน้าที่กำลังเปิดอยู่
 * @returns โครง HTML ระดับบนสุดของแอป
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" className={`${plexThai.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
