import { CloseIcon } from '@/components/Icons';

/**
 * โครงร่างระหว่างโหลดข้อมูลตาราง แสดงแทน spinner ตามข้อกำหนดหัวข้อ 14.5
 * เพื่อให้ผู้ใช้เห็นล่วงหน้าว่าสิ่งที่กำลังมาหน้าตาเป็นตารางกี่แถว
 *
 * @param rows - จำนวนแถวจำลองที่จะแสดง ปกติ 5 แถวพอให้เห็นรูปร่าง
 * @returns บล็อกโครงร่างที่กะพริบเบา ๆ
 */
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="กำลังโหลดข้อมูล">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-12 animate-pulse rounded-lg bg-griddle" />
      ))}
    </div>
  );
}

/**
 * สถานะไม่มีข้อมูล ต้องบอกว่าทำอะไรต่อได้ ไม่ใช่แค่บอกว่า "ไม่มีข้อมูล"
 *
 * @param message - ประโยคบอกสถานการณ์ปัจจุบันและสิ่งที่ทำได้
 * @param action - ปุ่มหรือลิงก์ให้ผู้ใช้ลงมือทำต่อได้ทันที
 * @returns กล่องสถานะว่าง
 */
export function EmptyState({
  message,
  action,
}: {
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border-2 border-dashed border-rule px-4 py-8">
      <p className="text-slip-dim">{message}</p>
      {action}
    </div>
  );
}

/**
 * สถานะผิดพลาด ต้องบอกว่าเกิดอะไรและแก้อย่างไร พร้อมปุ่มลองใหม่เสมอ
 *
 * @param message - ข้อความอธิบายปัญหาและวิธีแก้
 * @param onRetry - ฟังก์ชันโหลดข้อมูลใหม่
 * @returns กล่องสถานะผิดพลาด
 */
export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className="rounded-lg border-l-4 border-void bg-griddle px-4 py-4 shadow-sm">
      <p className="text-slip">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 min-h-[44px] text-slip underline underline-offset-4"
      >
        ลองโหลดใหม่อีกครั้ง
      </button>
    </div>
  );
}

/**
 * แถบแจ้งผลหลังบันทึกหรือลบข้อมูล ใช้บอกกรณีที่ระบบเปลี่ยนการลบเป็นปิดใช้งาน
 * ไม่สื่อความหมายด้วยสีอย่างเดียว จึงมีคำว่า "สำเร็จ" หรือ "ผิดพลาด" กำกับ
 *
 * @param tone - 'success' เมื่อทำสำเร็จ 'error' เมื่อไม่สำเร็จ
 * @param message - ข้อความที่จะแสดง
 * @param onDismiss - ฟังก์ชันปิดแถบแจ้งผล
 * @returns แถบแจ้งผล หรือ null เมื่อไม่มีข้อความ
 */
export function Notice({
  tone,
  message,
  onDismiss,
}: {
  tone: 'success' | 'error';
  message: string;
  onDismiss: () => void;
}) {
  if (!message) return null;
  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-lg border-l-4 bg-griddle px-4 py-3 shadow-sm ${
        tone === 'success' ? 'border-served' : 'border-void'
      }`}
    >
      <span className="shrink-0 text-slip-dim">{tone === 'success' ? 'สำเร็จ' : 'ผิดพลาด'}</span>
      <p className="min-w-0 flex-1 text-slip">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="ปิดข้อความแจ้งเตือน"
        className="shrink-0 text-slip-dim hover:text-slip"
      >
        <CloseIcon className="w-4 h-4" />
      </button>
    </div>
  );
}
