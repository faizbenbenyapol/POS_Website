import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ระบบสั่งอาหารด้วย QR Code',
  description: 'ระบบขายหน้าร้านสำหรับร้านอาหารนั่งทาน ลูกค้าสแกน QR ที่โต๊ะแล้วสั่งเองได้',
};

/**
 * เลย์เอาต์ราก ครอบทุกหน้าในระบบ
 *
 * @param children - เนื้อหาของหน้าที่กำลังเปิดอยู่
 * @returns โครง HTML ระดับบนสุดของแอป
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
