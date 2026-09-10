'use client';

import Modal from '@/components/Modal';
import { formatBaht, formatThaiDateTime, formatThaiTime } from '@/lib/format';
import { PrintIcon } from '@/components/Icons';

/** ข้อมูลรายการอาหารสำหรับพิมพ์ */
export type PrintItem = {
  itemName: string;
  quantity: number;
  unitPrice?: string | number;
  note?: string | null;
};

/** ข้อมูลการสั่งซื้อสำหรับสร้างสลิปตั๋วครัวและใบเสร็จ */
export type ReceiptData = {
  tableNo: string;
  orderCode?: string;
  createdAt: string;
  items: PrintItem[];
  totalAmount?: string | number;
  paymentMethod?: string;
  paidAt?: string;
};

/** พารามิเตอร์สำหรับคอมโพเนนต์ ReceiptPrintModal */
type ReceiptPrintModalProps = {
  /** เปิด/ปิด Modal */
  open: boolean;
  /** ฟังก์ชันปิด Modal */
  onClose: () => void;
  /** ประเภทสลิป: 'KITCHEN' = ตั๋วครัว, 'RECEIPT' = ใบเสร็จรับเงิน */
  type: 'KITCHEN' | 'RECEIPT';
  /** ข้อมูลออเดอร์ที่จะพิมพ์ */
  data: ReceiptData | null;
};

/** แผนผังคำแปลวิธีชำระเงิน */
const PAYMENT_METHOD_NAMES: Record<string, string> = {
  CASH: 'เงินสด',
  TRANSFER: 'โอนเงินผ่านธนาคาร',
  CARD: 'บัตรเครดิต/เดบิต',
};

/**
 * คอมโพเนนต์ Modal แสดงตัวอย่างสลิปและสั่งพิมพ์ตั๋วครัว / ใบเสร็จรับเงิน
 * ออกแบบเลย์เอาต์ตามขนาดสลิปมาตรฐาน 80mm สำหรับเครื่องพิมพ์ความร้อน
 *
 * @param props - พารามิเตอร์ของคอมโพเนนต์
 * @returns Modal ตัวอย่างสลิปพร้อมปุ่มสั่งพิมพ์
 */
export default function ReceiptPrintModal({
  open,
  onClose,
  type,
  data,
}: ReceiptPrintModalProps) {
  if (!data) return null;

  const isKitchen = type === 'KITCHEN';

  /** สั่งเปิดหน้าต่างสั่งพิมพ์ของเบราว์เซอร์ */
  function handlePrint() {
    window.print();
  }

  return (
    <Modal
      title={isKitchen ? `พิมพ์ตั๋วครัว โต๊ะ ${data.tableNo}` : `พิมพ์ใบเสร็จ โต๊ะ ${data.tableNo}`}
      open={open}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        {/* ตัวอย่างสลิปพิมพ์ */}
        <div className="printable-receipt mx-auto w-full max-w-[80mm] rounded-lg border border-rule bg-white p-4 font-mono text-xs text-slip shadow-sm">
          {/* หัวสลิป */}
          <div className="text-center">
            {isKitchen ? (
              <>
                <h2 className="text-lg font-bold">--- ตั๋วครัว ---</h2>
                <div className="mt-1 text-2xl font-black">โต๊ะ {data.tableNo}</div>
              </>
            ) : (
              <>
                <h2 className="text-base font-bold">POS RESTAURANT</h2>
                <p className="text-[11px] text-slip-dim">ใบเสร็จรับเงิน / Receipt</p>
                <div className="mt-2 flex justify-between border-b border-dashed border-rule pb-2">
                  <span>โต๊ะ: {data.tableNo}</span>
                  <span>{formatThaiDateTime(data.paidAt || data.createdAt)}</span>
                </div>
              </>
            )}

            {data.orderCode && (
              <p className="mt-1 text-[11px] text-slip-dim">
                {isKitchen ? `เวลาสั่ง: ${formatThaiTime(data.createdAt)} | ` : ''}
                รหัส: {data.orderCode}
              </p>
            )}
          </div>

          <hr className="my-2 border-dashed border-rule" />

          {/* รายการอาหาร */}
          <div className="flex flex-col gap-1.5">
            {data.items.map((item, idx) => (
              <div key={idx} className="flex flex-col">
                <div className="flex justify-between font-medium">
                  <span className="flex-1">
                    {item.quantity}x {item.itemName}
                  </span>
                  {!isKitchen && item.unitPrice !== undefined && (
                    <span className="ml-2">
                      {formatBaht(Number(item.unitPrice) * item.quantity)}
                    </span>
                  )}
                </div>
                {item.note && (
                  <span className="pl-3 text-[11px] font-bold text-void">
                    ** หมายเหตุ: {item.note}
                  </span>
                )}
              </div>
            ))}
          </div>

          <hr className="my-2 border-dashed border-rule" />

          {/* ท้ายสลิป */}
          {isKitchen ? (
            <div className="text-center font-bold">*** ส่งห้องครัว ***</div>
          ) : (
            <div className="flex flex-col gap-1">
              {data.totalAmount !== undefined && (
                <div className="flex justify-between font-bold text-sm">
                  <span>ยอดรวมทั้งสิ้น:</span>
                  <span>{formatBaht(data.totalAmount)}</span>
                </div>
              )}
              {data.paymentMethod && (
                <div className="flex justify-between text-[11px] text-slip-dim">
                  <span>ชำระด้วย:</span>
                  <span>{PAYMENT_METHOD_NAMES[data.paymentMethod] || data.paymentMethod}</span>
                </div>
              )}
              <div className="mt-3 text-center text-[11px] text-slip-dim">
                ขอบคุณที่ใช้บริการ / Thank you
              </div>
            </div>
          )}
        </div>

        {/* ปุ่มควบคุม (จะถูกซ่อนเมื่อสั่งพิมพ์ด้วย class no-print) */}
        <div className="no-print flex justify-end gap-2 border-t border-rule pt-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-lg bg-char px-4 text-slip transition-colors hover:bg-rule"
          >
            ปิด
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex min-h-[44px] items-center gap-2 rounded-lg bg-[#06C755] px-5 font-bold text-white shadow-sm transition-opacity hover:opacity-90"
          >
            <PrintIcon className="w-5 h-5" />
            <span>{isKitchen ? 'พิมพ์ตั๋วครัว' : 'พิมพ์ใบเสร็จ'}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
