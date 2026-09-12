'use client';

import { useState, useEffect } from 'react';
import Modal from '@/components/Modal';
import { formatBaht, formatThaiDateTime, formatThaiTime } from '@/lib/format';
import { PrintIcon, CookingIcon, DrinkIcon } from '@/components/Icons';
import { printHtml } from '@/lib/print';

/** ข้อมูลรายการอาหารสำหรับพิมพ์ */
export type PrintItem = {
  itemName: string;
  quantity: number;
  unitPrice?: string | number;
  note?: string | null;
  categoryName?: string | null;
};

/** ข้อมูลการสั่งซื้อสำหรับสร้างสลิปตั๋วครัวและใบเสร็จ */
export type ReceiptData = {
  branchName?: string;
  branchAddress?: string;
  branchPhone?: string;
  tableNo: string;
  orderCode?: string;
  createdAt: string;
  items: PrintItem[];
  totalAmount?: string | number;
  paymentMethod?: string;
  cashTendered?: number;
  changeDue?: number;
  paidAt?: string;
  cashierName?: string;
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
  /** สถานีเริ่มต้นสำหรับตั๋วครัว */
  initialStation?: 'ALL' | 'KITCHEN' | 'BAR';
};

/** แผนผังคำแปลวิธีชำระเงิน */
const PAYMENT_METHOD_NAMES: Record<string, string> = {
  CASH: 'เงินสด',
  TRANSFER: 'โอนเงิน / PromptPay',
  CARD: 'บัตรเครดิต / เดบิต',
};

/**
 * ตรวจสอบว่ารายการนี้เป็นเครื่องดื่มหรือของหวานสำหรับสถานีบาร์น้ำหรือไม่
 *
 * @param item - รายการอาหาร
 * @returns true หากจัดอยู่ในกลุ่มบาร์เครื่องดื่ม
 */
export function isBarItem(item: PrintItem): boolean {
  const text = `${item.categoryName ?? ''} ${item.itemName}`.toLowerCase();
  return /เครื่องดื่ม|น้ำ|ชา|กาแฟ|เบียร์|ไวน์|ของหวาน|ขนม|ไอศกรีม|drink|beverage|bar|dessert|coffee|tea/i.test(
    text,
  );
}

/**
 * คอมโพเนนต์ Modal แสดงตัวอย่างสลิปและสั่งพิมพ์ตั๋วครัว / ใบเสร็จรับเงิน
 * ใช้ Print Engine อิสระเพื่อการพิมพ์ที่คมชัด ไม่หลุดขอบ ไม่ถูกตัดขาด
 *
 * @param props - พารามิเตอร์ของคอมโพเนนต์
 * @returns Modal ตัวอย่างสลิปพร้อมปุ่มสั่งพิมพ์
 */
export default function ReceiptPrintModal({
  open,
  onClose,
  type,
  data,
  initialStation = 'ALL',
}: ReceiptPrintModalProps) {
  const [station, setStation] = useState<'ALL' | 'KITCHEN' | 'BAR'>(initialStation);

  useEffect(() => {
    setStation(initialStation);
  }, [initialStation, open]);

  if (!data) return null;

  const isKitchen = type === 'KITCHEN';

  // รายการอาหารแยกตามสถานี
  const kitchenCount = data.items.filter((i) => !isBarItem(i)).length;
  const barCount = data.items.filter((i) => isBarItem(i)).length;

  const activeItems = isKitchen
    ? data.items.filter((item) => {
        if (station === 'ALL') return true;
        if (station === 'BAR') return isBarItem(item);
        return !isBarItem(item);
      })
    : data.items;

  const stationLabel =
    station === 'KITCHEN'
      ? 'ตั๋วห้องครัว (อาหาร)'
      : station === 'BAR'
      ? 'ตั๋วบาร์เครื่องดื่ม'
      : 'ตั๋วรวมทุกแผนก';

  /** สั่งพิมพ์ผ่าน Print Engine อิสระ ไม่ติดปัญหา CSS transform ของ modal */
  function handlePrint() {
    if (!data) return;

    if (isKitchen) {
      // ตั๋วห้องครัวหรือบาร์น้ำ
      const html = `
        <div style="width: 76mm; margin: 0 auto; padding: 4px; font-family: 'IBM Plex Sans Thai', sans-serif; color: #000000; line-height: 1.3;">
          <div style="text-align: center; border-bottom: 2px dashed #000; padding-bottom: 8px;">
            <div style="font-size: 16px; font-weight: 800;">--- ${stationLabel} ---</div>
            ${data.branchName ? `<div style="font-size: 13px; font-weight: 800; color: #000; margin-top: 2px;">สาขา: ${data.branchName}</div>` : ''}
            <div style="font-size: 32px; font-weight: 900; margin: 4px 0;">โต๊ะ ${data.tableNo}</div>
            ${data.orderCode ? `<div style="font-size: 12px; font-family: monospace;">รหัส: ${data.orderCode}</div>` : ''}
            <div style="font-size: 11px; color: #333;">เวลาสั่ง: ${formatThaiTime(data.createdAt)} (${formatThaiDateTime(data.createdAt).split(' ')[0]})</div>
          </div>

          <div style="margin: 10px 0; border-bottom: 2px dashed #000; padding-bottom: 8px;">
            ${
              activeItems.length === 0
                ? '<div style="text-align:center; padding: 12px 0; font-size: 13px;">(ไม่มีรายการในแผนกนี้)</div>'
                : activeItems
                    .map(
                      (item) => `
              <div style="margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; font-size: 15px; font-weight: 800;">
                  <span>${item.quantity}x ${item.itemName}</span>
                </div>
                ${
                  item.note
                    ? `<div style="font-size: 12px; font-weight: 700; color: #000; padding-left: 12px; margin-top: 2px;">
                        - หมายเหตุ: ${item.note}
                      </div>`
                    : ''
                }
              </div>
            `,
                    )
                    .join('')
            }
          </div>

          <div style="text-align: center; font-size: 13px; font-weight: 800; padding-top: 4px;">
            *** รวม ${activeItems.reduce((s, i) => s + i.quantity, 0)} รายการ ***
          </div>
        </div>
      `;

      printHtml(html, {
        title: `${stationLabel}-โต๊ะ${data.tableNo}`,
        pageStyle: '@page { margin: 2mm; size: 80mm auto; }',
      });
    } else {
      // ใบเสร็จรับเงิน
      const totalNum = Number(data.totalAmount || 0);
      const vatAmount = totalNum > 0 ? (totalNum * 7) / 107 : 0;
      const preTaxAmount = totalNum - vatAmount;

      const html = `
        <div style="width: 76mm; margin: 0 auto; padding: 4px; font-family: 'IBM Plex Sans Thai', sans-serif; color: #000000; line-height: 1.35;">
          <!-- หัวร้าน -->
          <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px;">
            <h1 style="font-size: 18px; font-weight: 900; margin: 0;">ครัวบ้านไร่</h1>
            ${data.branchName ? `<p style="font-size: 12px; font-weight: 700; margin: 2px 0;">สาขา: ${data.branchName}</p>` : ''}
            ${data.branchAddress ? `<p style="font-size: 10px; color: #444; margin: 1px 0;">${data.branchAddress}</p>` : ''}
            ${data.branchPhone ? `<p style="font-size: 10px; color: #444; margin: 1px 0;">โทร. ${data.branchPhone}</p>` : ''}
            <p style="font-size: 11px; margin-top: 3px; font-weight: 600;">ใบเสร็จรับเงินอย่างย่อ / Receipt</p>
          </div>

          <!-- ข้อมูลบิล -->
          <div style="font-size: 11px; margin-bottom: 8px; border-bottom: 1px dashed #000; padding-bottom: 6px;">
            <div style="display: flex; justify-content: space-between; font-weight: 700; font-size: 13px;">
              <span>โต๊ะ: ${data.tableNo}</span>
              ${data.orderCode ? `<span style="font-family: monospace;">#${data.orderCode}</span>` : ''}
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 2px; color: #333;">
              <span>วันที่: ${formatThaiDateTime(data.paidAt || data.createdAt)}</span>
            </div>
            ${data.cashierName ? `<div style="color: #333;">แคชเชียร์: ${data.cashierName}</div>` : ''}
          </div>

          <!-- รายการสินค้า -->
          <div style="margin-bottom: 8px; border-bottom: 1px dashed #000; padding-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 700; margin-bottom: 4px; border-bottom: 1px solid #ddd; padding-bottom: 2px;">
              <span>รายการ</span>
              <span>จำนวนเงิน</span>
            </div>
            ${data.items
              .map(
                (item) => `
              <div style="margin-bottom: 4px; font-size: 11px;">
                <div style="display: flex; justify-content: space-between;">
                  <span style="font-weight: 600;">${item.quantity}x ${item.itemName}</span>
                  <span style="font-family: monospace; font-weight: 700;">
                    ${item.unitPrice !== undefined ? formatBaht(Number(item.unitPrice) * item.quantity) : ''}
                  </span>
                </div>
                ${item.note ? `<div style="font-size: 10px; color: #555; padding-left: 10px;">* ${item.note}</div>` : ''}
              </div>
            `,
              )
              .join('')}
          </div>

          <!-- ยอดรวมและการชำระเงิน -->
          <div style="font-size: 12px; margin-bottom: 8px; border-bottom: 1px dashed #000; padding-bottom: 6px;">
            <div style="display: flex; justify-content: space-between; font-size: 15px; font-weight: 900; margin-bottom: 4px;">
              <span>ยอดรวมสุทธิ</span>
              <span style="font-family: monospace;">฿${data.totalAmount !== undefined ? formatBaht(data.totalAmount) : '0.00'}</span>
            </div>
            ${
              data.paymentMethod
                ? `
              <div style="display: flex; justify-content: space-between; font-size: 11px; color: #333; margin-bottom: 2px;">
                <span>วิธีชำระเงิน:</span>
                <span>${PAYMENT_METHOD_NAMES[data.paymentMethod] || data.paymentMethod}</span>
              </div>
              ${
                data.paymentMethod === 'CASH' && data.cashTendered !== undefined
                  ? `
                <div style="display: flex; justify-content: space-between; font-size: 11px; color: #333; margin-bottom: 2px;">
                  <span>รับเงินสด (Cash Tendered):</span>
                  <span style="font-family: monospace; font-weight: 700;">฿${formatBaht(data.cashTendered)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 11px; color: #333; margin-bottom: 4px;">
                  <span>เงินทอน (Change Due):</span>
                  <span style="font-family: monospace; font-weight: 700;">฿${formatBaht(data.changeDue ?? 0)}</span>
                </div>
              `
                  : ''
              }
            `
                : ''
            }
            ${
              totalNum > 0
                ? `
              <div style="border-top: 1px dotted #ccc; padding-top: 4px; font-size: 10px; color: #555;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                  <span>มูลค่าก่อนภาษี (Pre-VAT):</span>
                  <span style="font-family: monospace;">฿${formatBaht(preTaxAmount)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                  <span>ภาษีมูลค่าเพิ่ม (VAT 7%):</span>
                  <span style="font-family: monospace;">฿${formatBaht(vatAmount)}</span>
                </div>
                <div style="font-size: 9px; color: #666; text-align: right; margin-top: 2px;">(ราคารวมภาษีมูลค่าเพิ่มแล้ว)</div>
              </div>
            `
                : ''
            }
          </div>

          <!-- ท้ายใบเสร็จ -->
          <div style="text-align: center; font-size: 11px; color: #444; margin-top: 10px;">
            <div>ขอบคุณที่มาอุดหนุนครับ/ค่ะ</div>
            <div style="font-size: 10px; color: #777; margin-top: 2px;">Thank you for dining with us</div>
          </div>
        </div>
      `;

      printHtml(html, {
        title: `ใบเสร็จ-โต๊ะ${data.tableNo}`,
        pageStyle: '@page { margin: 2mm; size: 80mm auto; }',
      });
    }
  }

  return (
    <Modal
      title={isKitchen ? `ตั๋วพิมพ์ • โต๊ะ ${data.tableNo}` : `ใบเสร็จรับเงิน • โต๊ะ ${data.tableNo}`}
      open={open}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        {/* สลับแผนกสำหรับตั๋วครัว */}
        {isKitchen && (
          <div className="flex rounded-xl bg-zinc-100 p-1">
            <button
              type="button"
              onClick={() => setStation('ALL')}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition-all ${
                station === 'ALL'
                  ? 'bg-white text-zinc-900 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <span>ทั้งหมด</span>
              <span className="rounded-full bg-zinc-200 px-1.5 py-0.2 text-[10px] text-zinc-700">
                {data.items.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setStation('KITCHEN')}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition-all ${
                station === 'KITCHEN'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <CookingIcon className="w-3.5 h-3.5" />
              <span>ครัวอาหาร</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                  station === 'KITCHEN' ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {kitchenCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setStation('BAR')}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition-all ${
                station === 'BAR'
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <DrinkIcon className="w-3.5 h-3.5" />
              <span>บาร์เครื่องดื่ม</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                  station === 'BAR' ? 'bg-cyan-700 text-white' : 'bg-cyan-100 text-cyan-800'
                }`}
              >
                {barCount}
              </span>
            </button>
          </div>
        )}

        {/* ตัวอย่างสลิปบนหน้าจอ */}
        <div className="mx-auto w-full max-w-[80mm] rounded-xl border border-rule bg-white p-4 font-mono text-xs text-slip shadow-sm">
          {/* หัวสลิป */}
          <div className="text-center">
            {isKitchen ? (
              <>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                    station === 'BAR'
                      ? 'bg-cyan-100 text-cyan-800'
                      : station === 'KITCHEN'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-zinc-100 text-zinc-800'
                  }`}
                >
                  {stationLabel}
                </span>
                {data.branchName && (
                  <div className="mt-1 text-[11px] font-semibold text-zinc-600">
                    สาขา: {data.branchName}
                  </div>
                )}
                <div className="mt-1 text-2xl font-black text-slip">โต๊ะ {data.tableNo}</div>
              </>
            ) : (
              <>
                <h2 className="text-base font-bold text-slip">ครัวบ้านไร่</h2>
                {data.branchName && (
                  <p className="text-xs font-semibold text-zinc-700">สาขา: {data.branchName}</p>
                )}
                {data.branchAddress && (
                  <p className="text-[10px] text-zinc-500">{data.branchAddress}</p>
                )}
                {data.branchPhone && (
                  <p className="text-[10px] text-zinc-500">โทร. {data.branchPhone}</p>
                )}
                <p className="mt-1 text-[11px] text-slip-dim font-medium">ใบเสร็จรับเงินอย่างย่อ / Receipt</p>
                <div className="mt-2 flex justify-between border-b border-dashed border-rule pb-2 text-[11px]">
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
            {activeItems.length === 0 ? (
              <div className="py-4 text-center text-zinc-400 font-sans text-xs">
                (ไม่มีรายการในแผนกนี้)
              </div>
            ) : (
              activeItems.map((item, idx) => (
                <div key={idx} className="flex flex-col">
                  <div className="flex justify-between font-medium">
                    <span className="flex-1 font-bold">
                      {item.quantity}x {item.itemName}
                    </span>
                    {!isKitchen && item.unitPrice !== undefined && (
                      <span className="ml-2 num font-bold">
                        {formatBaht(Number(item.unitPrice) * item.quantity)}
                      </span>
                    )}
                  </div>
                  {item.note && (
                    <span className="pl-3 text-[11px] font-bold text-amber-700">
                      - หมายเหตุ: {item.note}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>

          <hr className="my-2 border-dashed border-rule" />

          {/* ท้ายสลิป */}
          {isKitchen ? (
            <div className="text-center font-bold text-xs text-slip">
              *** {stationLabel} (รวม {activeItems.reduce((s, i) => s + i.quantity, 0)} รายการ) ***
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {data.totalAmount !== undefined && (
                <>
                  <div className="flex justify-between font-bold text-sm text-slip">
                    <span>ยอดรวมทั้งสิ้น:</span>
                    <span className="num text-base font-black text-emerald-700">
                      ฿{formatBaht(data.totalAmount)}
                    </span>
                  </div>
                  {Number(data.totalAmount || 0) > 0 && (
                    <div className="border-t border-dotted border-rule pt-1 text-[10px] text-slip-dim flex flex-col gap-0.5">
                      <div className="flex justify-between">
                        <span>มูลค่าก่อนภาษี (Pre-VAT):</span>
                        <span className="num">
                          ฿{formatBaht(Number(data.totalAmount) - (Number(data.totalAmount) * 7) / 107)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>ภาษีมูลค่าเพิ่ม (VAT 7%):</span>
                        <span className="num">
                          ฿{formatBaht((Number(data.totalAmount) * 7) / 107)}
                        </span>
                      </div>
                      <div className="text-right text-[9px] text-zinc-400">
                        (ราคารวมภาษีมูลค่าเพิ่มแล้ว)
                      </div>
                    </div>
                  )}
                </>
              )}
              {data.paymentMethod && (
                <>
                  <div className="flex justify-between text-[11px] text-slip-dim pt-1 border-t border-dashed border-rule">
                    <span>ชำระด้วย:</span>
                    <span className="font-semibold text-slip">
                      {PAYMENT_METHOD_NAMES[data.paymentMethod] || data.paymentMethod}
                    </span>
                  </div>
                  {data.paymentMethod === 'CASH' && data.cashTendered !== undefined && (
                    <>
                      <div className="flex justify-between text-[11px] text-slip-dim">
                        <span>รับเงินสด:</span>
                        <span className="num font-semibold text-slip">฿{formatBaht(data.cashTendered)}</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-slip-dim">
                        <span>เงินทอน:</span>
                        <span className="num font-bold text-emerald-700">฿{formatBaht(data.changeDue ?? 0)}</span>
                      </div>
                    </>
                  )}
                </>
              )}
              <div className="mt-3 text-center text-[11px] text-slip-dim">
                ขอบคุณที่ใช้บริการ / Thank you
              </div>
            </div>
          )}
        </div>

        {/* ปุ่มสั่งพิมพ์ */}
        <div className="flex justify-end gap-2 border-t border-rule pt-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-xl bg-char px-4 text-xs font-bold text-slip transition-colors hover:bg-rule"
          >
            ปิด
          </button>
          <button
            type="button"
            disabled={isKitchen && activeItems.length === 0}
            onClick={handlePrint}
            className="flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-600 px-5 font-bold text-white shadow-xs transition-colors hover:bg-emerald-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PrintIcon className="w-4 h-4" />
            <span>
              {isKitchen
                ? `พิมพ์${stationLabel} (${activeItems.reduce((s, i) => s + i.quantity, 0)})`
                : 'พิมพ์ใบเสร็จ (80mm)'}
            </span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
