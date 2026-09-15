'use client';

import { useState, useEffect } from 'react';
import Modal from '@/components/Modal';
import { formatBaht, formatThaiDateTime, formatThaiTime } from '@/lib/format';
import { PrintIcon, CookingIcon, DrinkIcon } from '@/components/Icons';
import { printHtml } from '@/lib/print';
import type { BillTotals } from '@/lib/billing';

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
  /** ยอดบิลครบทุกบรรทัดที่เซิร์ฟเวอร์คำนวณและบันทึกไว้จริง */
  bill?: BillTotals;
  /** การชำระเงินทุกช่องทางของบิลนี้ */
  payments?: ReceiptPayment[];
  paymentMethod?: string;
  cashTendered?: number;
  changeDue?: number;
  paidAt?: string;
  cashierName?: string;
};

/** การชำระเงินหนึ่งช่องทางที่แสดงบนใบเสร็จ */
export type ReceiptPayment = {
  method: string;
  amount: number;
  receivedAmount?: number | null;
  changeAmount?: number;
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


/** บรรทัดหนึ่งบรรทัดในส่วนสรุปยอดของใบเสร็จ */
type TotalLine = {
  label: string;
  amount: number;
  /** true เมื่อเป็นตัวเลขที่ต้องแสดงเครื่องหมายลบนำหน้า เช่น ส่วนลด */
  negative?: boolean;
  /** true เมื่อเป็นบรรทัดยอดสุทธิที่ต้องเน้นเป็นพิเศษ ไม่รวมอยู่ในรายการย่อย */
  emphasis?: boolean;
};

/**
 * หายอดสุทธิที่ต้องพิมพ์บนใบเสร็จ
 * ใช้ยอดจาก bill ที่เซิร์ฟเวอร์คำนวณไว้เป็นหลัก ถ้าไม่มีจึงถอยไปใช้ totalAmount แบบเดิม
 * เพื่อให้ใบเสร็จของบิลเก่าที่ปิดก่อนมีระบบส่วนลดยังพิมพ์ได้เหมือนเดิม
 *
 * @param data - ข้อมูลใบเสร็จ
 * @returns ยอดสุทธิหน่วยบาท
 */
function receiptGrandTotal(data: ReceiptData): number {
  if (data.bill) return data.bill.grandTotal;
  return Number(data.totalAmount || 0);
}

/**
 * สร้างบรรทัดสรุปยอดของใบเสร็จตามลำดับ ยอดอาหาร -> ส่วนลด -> ค่าบริการ -> VAT
 * บรรทัดที่เป็นศูนย์จะถูกตัดออก เพื่อไม่ให้สลิปยาวเกินจำเป็น
 *
 * @param data - ข้อมูลใบเสร็จ
 * @returns บรรทัดสรุปยอดที่ต้องแสดง ไม่รวมบรรทัดยอดสุทธิ
 */
function buildTotalLines(data: ReceiptData): TotalLine[] {
  const bill = data.bill;
  if (!bill) return [];

  const lines: TotalLine[] = [{ label: 'ยอดรวมค่าอาหาร', amount: bill.subtotal }];

  if (bill.discountAmount > 0) {
    const suffix = bill.discountType === 'PERCENT' ? ` (${bill.discountValue}%)` : '';
    lines.push({ label: `ส่วนลด${suffix}`, amount: bill.discountAmount, negative: true });
  }
  if (bill.serviceChargeAmount > 0) {
    lines.push({
      label: `ค่าบริการ ${bill.serviceChargeRate}%`,
      amount: bill.serviceChargeAmount,
    });
  }
  if (bill.vatRate > 0) {
    lines.push({ label: 'มูลค่าก่อนภาษี (Pre-VAT)', amount: bill.vatBase });
    lines.push({
      label: `ภาษีมูลค่าเพิ่ม ${bill.vatRate}%${bill.vatInclusive ? ' (รวมในราคาแล้ว)' : ''}`,
      amount: bill.vatAmount,
    });
  }
  return lines;
}

/**
 * สร้างบรรทัดการชำระเงินของใบเสร็จ รองรับทั้งการจ่ายช่องทางเดียวและแบ่งจ่ายหลายช่องทาง
 * บิลเก่าที่ไม่มีอาเรย์ payments จะถอยไปอ่าน paymentMethod แบบเดิม
 *
 * @param data - ข้อมูลใบเสร็จ
 * @returns บรรทัดการชำระเงินและเงินทอนที่ต้องแสดง
 */
function buildPaymentLines(data: ReceiptData): TotalLine[] {
  const lines: TotalLine[] = [];

  if (data.payments && data.payments.length > 0) {
    for (const payment of data.payments) {
      const name = PAYMENT_METHOD_NAMES[payment.method] || payment.method;
      lines.push({ label: `ชำระด้วย${name}`, amount: payment.amount });
      if (payment.method === 'CASH' && payment.receivedAmount != null) {
        lines.push({ label: 'รับเงินสด (Cash Tendered)', amount: Number(payment.receivedAmount) });
      }
    }
    const totalChange = data.payments.reduce((sum, p) => sum + (p.changeAmount ?? 0), 0);
    if (totalChange > 0) lines.push({ label: 'เงินทอน (Change Due)', amount: totalChange });
    return lines;
  }

  if (data.paymentMethod) {
    const name = PAYMENT_METHOD_NAMES[data.paymentMethod] || data.paymentMethod;
    lines.push({ label: `ชำระด้วย${name}`, amount: receiptGrandTotal(data) });
    if (data.paymentMethod === 'CASH' && data.cashTendered !== undefined) {
      lines.push({ label: 'รับเงินสด (Cash Tendered)', amount: data.cashTendered });
      lines.push({ label: 'เงินทอน (Change Due)', amount: data.changeDue ?? 0 });
    }
  }
  return lines;
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
      const lines = buildTotalLines(data);
      const paymentLines = buildPaymentLines(data);

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
            ${lines
              .filter((l) => !l.emphasis)
              .map(
                (l) => `
              <div style="display: flex; justify-content: space-between; font-size: 11px; color: #333; margin-bottom: 2px;">
                <span>${l.label}</span>
                <span style="font-family: monospace;">${l.negative ? '-' : ''}฿${formatBaht(l.amount)}</span>
              </div>`,
              )
              .join('')}
            <div style="display: flex; justify-content: space-between; font-size: 15px; font-weight: 900; margin: 4px 0; border-top: 1px solid #000; padding-top: 4px;">
              <span>ยอดรวมสุทธิ</span>
              <span style="font-family: monospace;">฿${formatBaht(receiptGrandTotal(data))}</span>
            </div>
            ${paymentLines
              .map(
                (l) => `
              <div style="display: flex; justify-content: space-between; font-size: 11px; color: #333; margin-bottom: 2px;">
                <span>${l.label}</span>
                <span style="font-family: monospace; font-weight: 700;">฿${formatBaht(l.amount)}</span>
              </div>`,
              )
              .join('')}
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
              {/* สรุปยอดทีละบรรทัดจากยอดที่เซิร์ฟเวอร์คำนวณไว้จริง ไม่ถอด VAT กลับเอง */}
              {buildTotalLines(data).map((line) => (
                <div key={line.label} className="flex justify-between text-xs text-slip-dim">
                  <span>{line.label}</span>
                  <span className={`num ${line.negative ? 'text-red-700 font-semibold' : ''}`}>
                    {line.negative ? '-' : ''}฿{formatBaht(line.amount)}
                  </span>
                </div>
              ))}

              <div className="flex justify-between border-t border-rule pt-1 font-bold text-sm text-slip">
                <span>ยอดรวมสุทธิ:</span>
                <span className="num text-base font-black text-emerald-700">
                  ฿{formatBaht(receiptGrandTotal(data))}
                </span>
              </div>

              {buildPaymentLines(data).map((line, idx) => (
                <div
                  key={`${line.label}-${idx}`}
                  className="flex justify-between text-xs text-slip-dim"
                >
                  <span>{line.label}</span>
                  <span className="num font-semibold text-slip">฿{formatBaht(line.amount)}</span>
                </div>
              ))}

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
