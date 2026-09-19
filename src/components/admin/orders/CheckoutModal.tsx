'use client';

import { useCallback, useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import TransferQrPanel from './TransferQrPanel';
import { CloseIcon, PlusIcon } from '@/components/Icons';
import { apiFetch } from '@/lib/client';
import { formatBaht } from '@/lib/format';
import {
  DEFAULT_MONEY_SETTINGS,
  calculateBill,
  roundBaht,
  validatePayments,
  type BillTotals,
  type BranchMoneySettings,
  type DiscountInput,
  type DiscountType,
  type PaymentInput,
  type PaymentMethod,
} from '@/lib/billing';
import { PAYMENT_METHODS, STATUS_LABELS, type BoardItem, type BoardOrder } from './types';

/** จำนวนเงินที่พนักงานกดรับบ่อย ใช้เป็นปุ่มด่วนแทนการพิมพ์ */
const QUICK_TENDER_AMOUNTS = [100, 500, 1000];

/** จำนวนเงินที่ใช้กดบวกเพิ่มทีละก้อน เมื่อลูกค้ายื่นแบงก์หลายใบ */
const TENDER_INCREMENTS = [20, 50, 100];

/** จำนวนช่องทางชำระเงินสูงสุดต่อหนึ่งบิล ต้องตรงกับ checkoutSchema ฝั่งเซิร์ฟเวอร์ */
const MAX_PAYMENT_ROWS = 3;

/** แถวการชำระเงินหนึ่งช่องทางที่แคชเชียร์กำลังกรอกอยู่ เก็บเป็นข้อความเพื่อให้พิมพ์ได้ลื่น */
type PaymentRow = {
  method: PaymentMethod;
  amount: string;
  receivedAmount: string;
  /** คำขอรับเงินโอนที่ได้รับเงินแล้ว ใช้เฉพาะแถวโอนเงิน null คือยังไม่ได้ยืนยัน */
  paymentRequestId: number | null;
};

/**
 * หน้าต่างปิดบิลของรอบการนั่ง 1 รอบ
 *
 * คิดยอดครบทุกบรรทัดตามลำดับ ยอดรวม -> ส่วนลด -> ค่าบริการ -> VAT
 * โดยเรียก calculateBill ตัวเดียวกับที่เซิร์ฟเวอร์ใช้ตอนบันทึกจริง ตัวเลขบนจอจึงไม่มีทางเพี้ยน
 * และรองรับการแบ่งจ่ายหลายช่องทางในบิลเดียว เช่น เงินสดบางส่วนและโอนบางส่วน
 *
 * @param order - ใบสั่งที่กดปิดบิล ใช้อ้างอิงโต๊ะและรอบการนั่ง null คือปิดหน้าต่าง
 * @param sessionOrders - ใบสั่งทั้งหมดในรอบการนั่งเดียวกัน ใช้หาว่าอาหารค้างอยู่ใบไหน
 * @param sessionItems - รายการอาหารทั้งหมดในรอบนี้ ไม่รวมรายการที่ยกเลิกแล้ว
 * @param isAdmin - true เมื่อผู้ใช้เป็นเจ้าของร้าน ใช้ตัดสินว่าให้ส่วนลดได้หรือไม่
 * @param checkingOut - true ระหว่างกำลังบันทึกการชำระเงิน ใช้กันกดซ้ำ
 * @param onClose - ปิดหน้าต่างโดยไม่บันทึก
 * @param onConfirm - ยืนยันปิดบิล รับ (รายการชำระเงิน, ส่วนลด, ยอดบิลที่คำนวณได้)
 * @param onRequestCancelItem - ขอยกเลิกอาหารที่ลูกค้าไม่รับแล้ว หน้าแม่จะเปิด modal ระบุเหตุผล
 * @returns หน้าต่างปิดบิลพร้อมส่วนลด ค่าบริการ VAT และการแบ่งจ่ายหลายช่องทาง
 */
export default function CheckoutModal({
  order,
  sessionOrders,
  sessionItems,
  isAdmin,
  checkingOut,
  onClose,
  onConfirm,
  onRequestCancelItem,
}: {
  order: BoardOrder | null;
  sessionOrders: BoardOrder[];
  sessionItems: BoardItem[];
  isAdmin: boolean;
  checkingOut: boolean;
  onClose: () => void;
  onConfirm: (payments: PaymentInput[], discount: DiscountInput, bill: BillTotals) => void;
  onRequestCancelItem: (item: BoardItem, order: BoardOrder) => void;
}) {
  const [settings, setSettings] = useState<BranchMoneySettings>(DEFAULT_MONEY_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [discountType, setDiscountType] = useState<DiscountType>('NONE');
  const [discountValue, setDiscountValue] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [payments, setPayments] = useState<PaymentRow[]>([
    { method: 'CASH', amount: '', receivedAmount: '', paymentRequestId: null },
  ]);
  const [unservedAcknowledged, setUnservedAcknowledged] = useState(false);

  const sessionId = order?.session_id ?? null;

  // ดึงค่าตั้ง VAT และค่าบริการของสาขาที่บิลนี้สังกัด ทุกครั้งที่เปิดบิลใบใหม่
  useEffect(() => {
    if (sessionId === null) return;
    let cancelled = false;
    setSettingsLoaded(false);
    apiFetch<{ settings: BranchMoneySettings }>(`/api/admin/sessions/${sessionId}/checkout`).then(
      (res) => {
        if (cancelled) return;
        if (res.ok) setSettings(res.data.settings);
        setSettingsLoaded(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // ล้างค่าที่กรอกไว้ทุกครั้งที่เปิดบิลใบใหม่ ไม่ให้ยอดของโต๊ะก่อนหน้าค้างมา
  useEffect(() => {
    setDiscountType('NONE');
    setDiscountValue('');
    setDiscountReason('');
    setPayments([{ method: 'CASH', amount: '', receivedAmount: '', paymentRequestId: null }]);
    setUnservedAcknowledged(false);
  }, [sessionId]);

  const discount: DiscountInput = {
    type: discountType,
    value: Number(discountValue) || 0,
    reason: discountReason.trim() || null,
  };

  // ใช้ฟังก์ชันคำนวณตัวเดียวกับฝั่งเซิร์ฟเวอร์ ตัวเลขที่ลูกค้าเห็นกับที่บันทึกจริงจึงตรงกันเสมอ
  const bill = calculateBill(sessionItems, settings, discount);

  /**
   * แก้ค่าของแถวชำระเงินแถวหนึ่ง
   *
   * @param index - ลำดับแถวที่จะแก้ เริ่มจาก 0
   * @param patch - ฟิลด์ที่ต้องการเปลี่ยน
   */
  const updatePayment = useCallback((index: number, patch: Partial<PaymentRow>) => {
    setPayments((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }, []);

  const paymentInputs: PaymentInput[] = payments.map((row) => ({
    method: row.method,
    amount: Number(row.amount) || 0,
    receivedAmount:
      row.method === 'CASH' && row.receivedAmount !== '' ? Number(row.receivedAmount) : null,
    paymentRequestId: row.method === 'TRANSFER' ? row.paymentRequestId : null,
  }));

  // เงินโอนทุกแถวต้องได้รับการยืนยันว่าเงินเข้าแล้ว (เซิร์ฟเวอร์ตรวจซ้ำอีกชั้นตอนปิดบิล)
  const unconfirmedTransfer = payments.some(
    (row) => row.method === 'TRANSFER' && row.paymentRequestId === null,
  );

  const paidTotal = roundBaht(paymentInputs.reduce((sum, p) => sum + p.amount, 0));
  const remaining = roundBaht(bill.grandTotal - paidTotal);
  const paymentCheck = validatePayments(paymentInputs, bill.grandTotal);

  if (!order) {
    return (
      <Modal title="ปิดบิล" open={false} onClose={onClose}>
        {null}
      </Modal>
    );
  }

  // รายการที่ครัวยังทำค้างอยู่ ปิดบิลไปแล้วจะแก้ไม่ได้อีก จึงต้องเตือนก่อน
  const unservedItems = sessionItems.filter(
    (i) => i.status === 'PENDING' || i.status === 'PREPARING',
  );

  const discountNeedsReason = bill.discountAmount > 0 && !discount.reason;
  const canConfirm =
    settingsLoaded &&
    !checkingOut &&
    bill.grandTotal > 0 &&
    paymentCheck.ok &&
    !unconfirmedTransfer &&
    !discountNeedsReason &&
    (unservedItems.length === 0 || unservedAcknowledged);

  return (
    <Modal title={`ปิดบิลโต๊ะ ${order.table_no}`} open onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-slip-dim text-sm">
          ระบบจะรวมทุกใบสั่งของรอบการนั่งนี้ ยกเว้นรายการที่ยกเลิก แล้วปิดโต๊ะให้ว่าง
          เมื่อปิดแล้วจะแก้ไขออเดอร์ของรอบนี้ไม่ได้อีก
        </p>

        {/* สรุปยอดบิลทีละบรรทัด ให้แคชเชียร์อ่านให้ลูกค้าฟังได้ตรงตามใบเสร็จ */}
        <div className="flex flex-col gap-1.5 rounded-xl bg-slate-50 p-3.5 border border-rule">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slip-dim">ยอดรวมค่าอาหาร</span>
            <span className="num font-semibold text-slip">฿{formatBaht(bill.subtotal)}</span>
          </div>

          {bill.discountAmount > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-red-700">
                ส่วนลด
                {bill.discountType === 'PERCENT' ? ` (${bill.discountValue}%)` : ''}
              </span>
              <span className="num font-semibold text-red-700">
                -฿{formatBaht(bill.discountAmount)}
              </span>
            </div>
          )}

          {bill.serviceChargeAmount > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slip-dim">ค่าบริการ {bill.serviceChargeRate}%</span>
              <span className="num font-semibold text-slip">
                ฿{formatBaht(bill.serviceChargeAmount)}
              </span>
            </div>
          )}

          {bill.vatRate > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slip-dim">
                ภาษีมูลค่าเพิ่ม {bill.vatRate}%
                <span className="ml-1 text-xs">
                  {bill.vatInclusive ? '(รวมในราคาแล้ว)' : '(บวกเพิ่ม)'}
                </span>
              </span>
              <span className="num font-semibold text-slip">฿{formatBaht(bill.vatAmount)}</span>
            </div>
          )}

          <div className="mt-1 flex items-center justify-between border-t border-rule pt-2">
            <span className="font-bold text-sm text-slate-700">ยอดที่ต้องชำระ</span>
            <span className="num text-2xl font-black text-emerald-700">
              ฿{formatBaht(bill.grandTotal)}
            </span>
          </div>
        </div>

        {/* ส่วนลดของบิล สงวนสิทธิ์เฉพาะเจ้าของร้านเช่นเดียวกับการยกเลิกออเดอร์ทั้งใบ */}
        {isAdmin ? (
          <div className="flex flex-col gap-2.5 rounded-xl border border-rule bg-white p-3.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-slate-800">ส่วนลดของบิล</span>
              <div className="flex rounded-lg bg-zinc-100 p-0.5 border border-zinc-200">
                {(
                  [
                    { value: 'NONE', label: 'ไม่ลด' },
                    { value: 'AMOUNT', label: 'ลดเป็นบาท' },
                    { value: 'PERCENT', label: 'ลดเป็น %' },
                  ] as { value: DiscountType; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setDiscountType(opt.value);
                      if (opt.value === 'NONE') {
                        setDiscountValue('');
                        setDiscountReason('');
                      }
                    }}
                    className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-all cursor-pointer ${
                      discountType === opt.value
                        ? 'bg-white text-zinc-900 shadow-xs font-bold'
                        : 'text-zinc-500 hover:text-zinc-900'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {discountType !== 'NONE' && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder={discountType === 'PERCENT' ? 'เช่น 10' : 'เช่น 50'}
                    aria-label="จำนวนส่วนลด"
                    className="min-h-[44px] w-32 rounded-lg border border-slate-300 bg-white px-3 text-base font-bold text-slate-900 focus:border-emerald-600 focus:outline-hidden"
                  />
                  <span className="text-sm font-semibold text-slip-dim">
                    {discountType === 'PERCENT' ? 'เปอร์เซ็นต์' : 'บาท'}
                  </span>
                </div>
                <input
                  type="text"
                  value={discountReason}
                  onChange={(e) => setDiscountReason(e.target.value)}
                  maxLength={255}
                  placeholder="เหตุผลของส่วนลด (บังคับกรอก)"
                  aria-label="เหตุผลของส่วนลด"
                  className={`min-h-[44px] w-full rounded-lg border bg-white px-3 text-sm text-slate-900 focus:outline-hidden ${
                    discountNeedsReason
                      ? 'border-red-400 focus:border-red-500'
                      : 'border-slate-300 focus:border-emerald-600'
                  }`}
                />
                {discountNeedsReason && (
                  <p className="text-sm font-semibold text-red-600">
                    ต้องระบุเหตุผลของส่วนลดทุกครั้ง เพื่อให้ตรวจสอบย้อนหลังได้
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="rounded-lg bg-zinc-50 border border-rule px-3 py-2 text-sm text-slip-dim">
            การให้ส่วนลดสงวนสิทธิ์เฉพาะเจ้าของร้าน (ADMIN) หากต้องลดราคาบิลนี้ กรุณาแจ้งผู้จัดการ
          </p>
        )}

        {/* เตือนพนักงานเมื่อยังมีอาหารค้างไม่เสิร์ฟ */}
        {unservedItems.length > 0 && (
          <div className="flex flex-col gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3.5">
            <p className="font-bold text-sm text-amber-900">
              ยังมีอาหารค้างไม่เสิร์ฟ {unservedItems.length} รายการ กรุณาแจ้งลูกค้าก่อนเก็บเงิน
            </p>
            <ul className="flex flex-col gap-1.5">
              {unservedItems.map((item) => {
                const itemOrder = sessionOrders.find((o) => o.id === item.order_id);
                const itemStatus = STATUS_LABELS[item.status] ?? STATUS_LABELS.PENDING;
                return (
                  <li
                    key={item.id}
                    className="flex items-center gap-2 rounded-lg border border-amber-200 bg-white px-2.5 py-1.5"
                  >
                    <span className="num shrink-0 text-sm font-bold text-slip-dim">
                      ×{item.quantity}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slip">
                      {item.item_name}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${itemStatus.className}`}
                    >
                      {itemStatus.label}
                    </span>
                    {itemOrder && (
                      <button
                        type="button"
                        onClick={() => {
                          // ปิด modal ปิดบิลก่อน แล้วเปิดหน้าระบุเหตุผลการยกเลิก
                          onClose();
                          onRequestCancelItem(item, itemOrder);
                        }}
                        className="shrink-0 rounded-lg border border-void/40 px-2.5 py-1.5 text-sm font-bold text-void hover:bg-void/10 transition-colors cursor-pointer"
                      >
                        ลูกค้าไม่รับแล้ว
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            <label className="flex items-start gap-2 text-sm font-semibold text-amber-900 cursor-pointer">
              <input
                type="checkbox"
                checked={unservedAcknowledged}
                onChange={(e) => setUnservedAcknowledged(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-amber-600"
              />
              <span>แจ้งลูกค้าแล้วและลูกค้ายืนยันชำระเงินทั้งที่อาหารยังไม่ครบ</span>
            </label>
          </div>
        )}

        {/* ช่องทางการชำระเงิน รองรับแบ่งจ่ายหลายช่องทางในบิลเดียว */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-slate-800">ช่องทางการชำระเงิน</span>
            {payments.length < MAX_PAYMENT_ROWS && (
              <button
                type="button"
                onClick={() =>
                  setPayments((prev) => [
                    ...prev,
                    {
                      method: 'TRANSFER',
                      amount: remaining > 0 ? String(remaining) : '',
                      receivedAmount: '',
                      paymentRequestId: null,
                    },
                  ])
                }
                className="flex min-h-[38px] items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-sm font-bold text-emerald-800 hover:bg-emerald-100 transition-colors cursor-pointer"
              >
                <PlusIcon className="w-4 h-4" />
                <span>แบ่งจ่ายอีกช่องทาง</span>
              </button>
            )}
          </div>

          {payments.map((row, index) => {
            const rowAmount = Number(row.amount) || 0;
            const rowReceived = Number(row.receivedAmount) || 0;
            const rowChange = Math.max(0, rowReceived - rowAmount);
            const missingForRow = roundBaht(remaining + rowAmount);

            return (
              <div
                key={index}
                className="flex flex-col gap-2.5 rounded-xl border border-rule bg-white p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={row.method}
                    onChange={(e) =>
                      updatePayment(index, {
                        method: e.target.value as PaymentMethod,
                        receivedAmount: '',
                        paymentRequestId: null,
                      })
                    }
                    aria-label={`ช่องทางชำระเงินลำดับที่ ${index + 1}`}
                    className="min-h-[44px] flex-1 rounded-lg border border-slate-300 bg-white px-2.5 text-sm font-semibold text-slip cursor-pointer"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={row.amount}
                    onChange={(e) => updatePayment(index, { amount: e.target.value })}
                    placeholder="ยอดที่ตัดเข้าช่องทางนี้"
                    aria-label={`ยอดที่ตัดเข้าช่องทางลำดับที่ ${index + 1}`}
                    className="min-h-[44px] w-36 rounded-lg border border-slate-300 bg-white px-3 text-base font-bold text-slate-900 focus:border-emerald-600 focus:outline-hidden"
                  />

                  {missingForRow > 0 && (
                    <button
                      type="button"
                      onClick={() => updatePayment(index, { amount: String(missingForRow) })}
                      className="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                      title="เติมยอดที่ยังขาดให้ช่องทางนี้"
                    >
                      เติมยอดที่เหลือ
                    </button>
                  )}

                  {payments.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setPayments((prev) => prev.filter((_, i) => i !== index))}
                      aria-label="ลบช่องทางชำระเงินนี้"
                      className="flex h-[44px] w-[44px] items-center justify-center rounded-lg border border-rule text-slip-dim hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
                    >
                      <CloseIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* ส่วนรับเงินสดและคำนวณเงินทอน เฉพาะช่องทาง CASH */}
                {row.method === 'CASH' && (
                  <div className="flex flex-col gap-2 rounded-lg border border-emerald-200 bg-emerald-50/40 p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-slate-800">รับเงินสดมา (บาท)</span>
                      <span className="text-xs text-slate-500">กดปุ่มด่วนหรือพิมพ์จำนวนเงิน</span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => updatePayment(index, { receivedAmount: String(rowAmount) })}
                        className="min-h-[36px] rounded-lg border border-emerald-300 bg-white px-3 text-sm font-bold text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer"
                      >
                        พอดี (฿{formatBaht(rowAmount)})
                      </button>
                      {QUICK_TENDER_AMOUNTS.map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => updatePayment(index, { receivedAmount: String(amt) })}
                          className={`min-h-[36px] rounded-lg border px-3 text-sm font-bold transition-colors cursor-pointer ${
                            rowReceived === amt
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          ฿{amt}
                        </button>
                      ))}
                      {TENDER_INCREMENTS.map((inc) => (
                        <button
                          key={`inc-${inc}`}
                          type="button"
                          onClick={() =>
                            updatePayment(index, { receivedAmount: String(rowReceived + inc) })
                          }
                          className="min-h-[36px] rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                          title={`บวกเพิ่ม ${inc} บาท`}
                        >
                          +{inc}
                        </button>
                      ))}
                    </div>

                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={row.receivedAmount}
                      onChange={(e) => updatePayment(index, { receivedAmount: e.target.value })}
                      placeholder={String(rowAmount)}
                      aria-label="เงินสดที่รับมาจากลูกค้า"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-bold text-slate-900 focus:border-emerald-600 focus:outline-hidden"
                    />

                    {rowChange > 0 && (
                      <div className="rounded-lg bg-emerald-100/70 p-2.5 text-emerald-950 border border-emerald-300 flex items-center justify-between">
                        <span className="text-sm font-bold">เงินทอนที่ต้องคืนลูกค้า:</span>
                        <span className="num text-lg font-black text-emerald-800">
                          ฿{formatBaht(rowChange)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* สร้าง QR พร้อมเพย์และรอยืนยันว่าเงินเข้า ก่อนยอมให้ปิดบิลด้วยเงินโอน */}
                {row.method === 'TRANSFER' && (
                  <TransferQrPanel
                    sessionId={order.session_id}
                    amount={rowAmount}
                    onConfirmedChange={(paymentRequestId) =>
                      updatePayment(index, { paymentRequestId })
                    }
                  />
                )}
              </div>
            );
          })}

          {/* สถานะยอดที่ตัดแล้วเทียบกับยอดบิล */}
          {!paymentCheck.ok && paymentCheck.message && (
            <div className="rounded-lg bg-red-50 p-2.5 text-sm font-bold text-red-600 border border-red-200">
              {paymentCheck.message}
            </div>
          )}
          {paymentCheck.ok && unconfirmedTransfer && (
            <div className="rounded-lg bg-amber-50 p-2.5 text-sm font-bold text-amber-800 border border-amber-200">
              ยอดครบแล้ว รอยืนยันว่าเงินโอนเข้าก่อนจึงจะปิดบิลได้
            </div>
          )}
          {paymentCheck.ok && !unconfirmedTransfer && (
            <div className="rounded-lg bg-blue-50 p-2.5 text-sm font-bold text-blue-700 border border-blue-200 flex items-center justify-between">
              <span>ยอดชำระครบแล้ว</span>
              <span className="num">
                รับเข้า ฿{formatBaht(paidTotal)}
                {paymentCheck.changeDue > 0 && ` · ทอน ฿${formatBaht(paymentCheck.changeDue)}`}
              </span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-rule">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-lg bg-char px-4 text-sm font-semibold text-slip hover:bg-zinc-200 transition-colors"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={() => onConfirm(paymentInputs, discount, bill)}
            disabled={!canConfirm}
            className="min-h-[44px] rounded-lg bg-emerald-600 px-5 text-sm font-bold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            {checkingOut ? 'กำลังปิดบิล…' : 'ยืนยันปิดบิล'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
