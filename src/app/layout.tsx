import type { Metadata } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/Toast';

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
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(registrations) {
                  for (let registration of registrations) {
                    registration.unregister();
                  }
                });
                if ('caches' in window) {
                  caches.keys().then(function(names) {
                    for (let name of names) caches.delete(name);
                  });
                }
              }
            `,
          }}
        />
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

