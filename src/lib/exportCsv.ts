/**
 * ปรับแต่งข้อความฟิลด์ให้ปลอดภัยสำหรับไฟล์ CSV (ใส่เครื่องหมายอัฒภาคครอบหากมีคอมมา หรือเครื่องหมายอัญประกาศ)
 *
 * @param cell - ข้อมูล 1 ช่องในตาราง
 * @returns ข้อความรูปแบบ CSV ที่ผ่านการ escape เรียบร้อยแล้ว
 */
function escapeCsvCell(cell: string | number | null | undefined): string {
  if (cell === null || cell === undefined) return '""';
  const str = String(cell);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

/**
 * ดาวน์โหลดไฟล์ CSV ในเบราว์เซอร์พร้อม UTF-8 BOM Header (\uFEFF)
 * ช่วยให้โปรแกรม Microsoft Excel ทั้งบน Windows และ Mac เปิดอ่านภาษาไทยได้อย่างถูกต้อง
 *
 * @param filename - ชื่อไฟล์ที่จะดาวน์โหลด เช่น 'sales-report-2026-09-10.csv'
 * @param headers - แถวหัวคอลัมน์
 * @param rows - ข้อมูลแต่ละแถวในตาราง
 */
export function downloadCsvFile(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
) {
  const headerLine = headers.map(escapeCsvCell).join(',');
  const rowLines = rows.map((row) => row.map(escapeCsvCell).join(','));
  const csvContent = '\uFEFF' + [headerLine, ...rowLines].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
