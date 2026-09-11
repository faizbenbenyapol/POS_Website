/**
 * เครื่องมือช่วยสั่งพิมพ์เอกสาร (Print Engine) ผ่าน Iframe อิสระ
 * ป้องกันปัญหา CSS Transform, Modal Backdrop และ Fixed Positioning ของ dialog
 * ที่ทำให้การพิมพ์ผ่าน window.print() ปกติหลุดขอบหรือถูกตัดครึ่งล่าง
 *
 * @param contentHtml - รหัส HTML ของเนื้อหาที่ต้องการพิมพ์
 * @param options - การตั้งค่าเพิ่มเติม เช่น หัวข้อเอกสาร, รูปแบบหน้ากระดาษ
 */
export function printHtml(
  contentHtml: string,
  options?: {
    title?: string;
    pageStyle?: string;
  },
): void {
  if (typeof window === 'undefined') return;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  iframe.title = options?.title || 'พิมพ์เอกสาร';

  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    window.print();
    return;
  }

  const defaultPageStyle = options?.pageStyle || `
    @page {
      margin: 8mm;
      size: auto;
    }
  `;

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html lang="th">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${options?.title || 'พิมพ์เอกสาร'}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
          ${defaultPageStyle}
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            font-family: 'IBM Plex Sans Thai', -apple-system, BlinkMacSystemFont, sans-serif;
            color: #18181b;
            background: #ffffff;
            line-height: 1.4;
          }
          .num {
            font-family: 'IBM Plex Mono', monospace;
            font-variant-numeric: tabular-nums;
          }
        </style>
      </head>
      <body>
        ${contentHtml}
      </body>
    </html>
  `);
  doc.close();

  // รอให้รูปภาพและฟอนต์โหลดเสร็จก่อนสั่งพิมพ์
  iframe.contentWindow?.focus();
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (err) {
      console.error('Print failed:', err);
    } finally {
      // ลบ iframe ออกหลังจากพิมพ์เสร็จ
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 2000);
    }
  }, 350);
}
