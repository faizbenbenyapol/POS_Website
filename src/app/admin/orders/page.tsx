'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Modal from '@/components/Modal';
import ConfirmModal from '@/components/ConfirmModal';
import PromptPayQR from '@/components/PromptPayQR';
import ReceiptPrintModal, { ReceiptData } from '@/components/ReceiptPrintModal';
import CancelReasonModal from '@/components/CancelReasonModal';
import CancellationAuditModal from '@/components/CancellationAuditModal';
import { TableSkeleton, EmptyState, ErrorState, Notice } from '@/components/DataState';
import { SelectField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { apiFetch, jsonBody } from '@/lib/client';
import { downloadCsvFile } from '@/lib/exportCsv';
import { formatBaht, formatBahtWithSign, formatThaiTime } from '@/lib/format';
import {
  BellIcon,
  BellOffIcon,
  DownloadIcon,
  CookingIcon,
  CheckIcon,
  CloseIcon,
  PrintIcon,
  CreditCardIcon,
} from '@/components/Icons';

/** ออเดอร์ 1 ใบบนกระดาน */
type BoardOrder = {
  id: number;
  branch_id?: number | null;
  branch_name?: string | null;
  order_code: string;
  status: string;
  total_amount: string;
  created_at: string;
  session_id: number;
  session_status: string;
  table_no: string;
};

/** รายการอาหารของออเดอร์บนกระดาน */
type BoardItem = {
  id: number;
  order_id: number;
  item_name: string;
  unit_price: string;
  quantity: number;
  note: string | null;
  status: string;
};

/** คำอธิบายสถานะภาษาไทย มีข้อความกำกับเสมอ ไม่สื่อความหมายด้วยสีอย่างเดียว */
const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'รอครัวรับ', className: 'bg-char text-slip-dim' },
  PREPARING: { label: 'กำลังทำ', className: 'bg-waiting/10 text-waiting' },
  SERVED: { label: 'เสิร์ฟแล้ว', className: 'bg-served/10 text-served' },
  CANCELLED: { label: 'ยกเลิกแล้ว', className: 'bg-void/10 text-void' },
};

/** ตัวเลือกกรองสถานะบนหัวกระดาน */
const STATUS_FILTERS = [
  { value: '', label: 'ทุกสถานะ' },
  { value: 'PENDING', label: 'รอครัวรับ' },
  { value: 'PREPARING', label: 'กำลังทำ' },
  { value: 'SERVED', label: 'เสิร์ฟแล้ว' },
  { value: 'CANCELLED', label: 'ยกเลิกแล้ว' },
];

/** วิธีชำระเงินที่ร้านรับ ตรงกับ ENUM ในตาราง payments */
const PAYMENT_METHODS = [
  { value: 'CASH', label: 'เงินสด' },
  { value: 'TRANSFER', label: 'โอนเงิน' },
  { value: 'CARD', label: 'บัตรเครดิต/เดบิต' },
];

/** ระยะเวลาระหว่างการดึงกระดานใหม่ ต้องไม่เกิน 10 วินาทีตามเกณฑ์ของเฟส 5 */
const POLL_INTERVAL_MS = 10000;

/**
 * แปลงวันนี้เป็นข้อความ YYYY-MM-DD สำหรับตัวกรองวันที่
 *
 * @returns ข้อความวันที่รูปแบบที่ input type="date" รับได้
 */
function todayInputValue(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * สังเคราะห์เสียงสัญญาณเตือนเมื่อมีออเดอร์ใหม่เข้ามาด้วย Web Audio API
 * ไม่ต้องพึ่งพาไฟล์เสียงภายนอก (.mp3)
 */
function playNewOrderSound() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // ป้องกันการทำงานล้มเหลวหากเบราว์เซอร์ยังไม่เปิดให้เล่นเสียงอัตโนมัติก่อนคลิก
  }
}

/**
 * กระดานออเดอร์ฝั่งร้าน จัดแบบกองใบสั่งเรียงใหม่สุดขึ้นบน
 * ดึงข้อมูลใหม่ทุก 10 วินาทีด้วยการ poll ธรรมดาตามข้อกำหนดหัวข้อ 10
 *
 * @returns หน้าจอกระดานออเดอร์พร้อมปุ่มเปลี่ยนสถานะและปิดบิล
 */
export default function OrdersBoardPage() {
  const [orders, setOrders] = useState<BoardOrder[] | null>(null);
  const [items, setItems] = useState<BoardItem[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState(todayInputValue());
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string }>({
    tone: 'success',
    message: '',
  });
  const [checkoutOrder, setCheckoutOrder] = useState<BoardOrder | null>(null);
  const [payMethod, setPayMethod] = useState('CASH');
  const [checkingOut, setCheckingOut] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printType, setPrintType] = useState<'KITCHEN' | 'RECEIPT'>('KITCHEN');
  const [printData, setPrintData] = useState<ReceiptData | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [currentUser, setCurrentUser] = useState<{ role: string; fullName: string } | null>(null);
  const [cancelConfirmOrder, setCancelConfirmOrder] = useState<BoardOrder | null>(null);
  const [cancelItemTarget, setCancelItemTarget] = useState<{ item: BoardItem; order: BoardOrder } | null>(null);
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const { warning: toastWarning } = useToast();
  const knownOrderIdsRef = useRef<Set<number> | null>(null);

  /**
   * เปิด Modal สำหรับพิมพ์ตั๋วครัวของออเดอร์
   *
   * @param order - ข้อมูลใบสั่งอาหาร
   * @param orderItems - รายการอาหารในใบสั่ง
   */
  function handleOpenKitchenPrint(order: BoardOrder, orderItems: BoardItem[]) {
    setPrintType('KITCHEN');
    setPrintData({
      tableNo: order.table_no,
      orderCode: order.order_code,
      createdAt: order.created_at,
      items: orderItems
        .filter((i) => i.status !== 'CANCELLED')
        .map((i) => ({
          itemName: i.item_name,
          quantity: i.quantity,
          note: i.note,
        })),
    });
    setPrintModalOpen(true);
  }

  /**
   * โหลดกระดานใหม่ตามตัวกรองปัจจุบัน
   *
   * @param showSkeleton - true ตอนเปิดหน้าหรือเปลี่ยนตัวกรอง ให้โชว์โครงร่าง
   *                       false ตอน poll ตามรอบ เพื่อไม่ให้กระดานกะพริบขณะพนักงานกำลังอ่าน
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือปรับ state ของกระดาน
   */
  const load = useCallback(
    async (showSkeleton: boolean) => {
      if (showSkeleton) {
        setOrders(null);
        setLoadError('');
      }
      const params = new URLSearchParams({ status: statusFilter, date: dateFilter });
      const result = await apiFetch<{ orders: BoardOrder[]; items: BoardItem[] }>(
        `/api/admin/orders?${params.toString()}`,
      );
      if (!result.ok) {
        if (showSkeleton) setLoadError(result.message);
        return;
      }

      const newOrders = result.data.orders;
      if (knownOrderIdsRef.current !== null && soundEnabled) {
        const hasNewOrder = newOrders.some((o) => !knownOrderIdsRef.current!.has(o.id));
        if (hasNewOrder) {
          playNewOrderSound();
          setNotice({
            tone: 'success',
            message: 'มีออเดอร์ใหม่เข้ามาที่หน้ากระดาน!',
          });
        }
      }
      knownOrderIdsRef.current = new Set(newOrders.map((o) => o.id));

      setOrders(newOrders);
      setItems(result.data.items);
    },
    [statusFilter, dateFilter, soundEnabled],
  );

  useEffect(() => {
    load(true);
  }, [load]);

  useEffect(() => {
    load(true);
    apiFetch<{ role: string; fullName: string }>('/api/auth/me').then((res) => {
      if (res.ok) setCurrentUser(res.data);
    });
    const interval = window.setInterval(() => load(false), 5000);
    return () => window.clearInterval(interval);
  }, [load]);

  /**
   * เปลี่ยนสถานะของใบสั่งทั้งใบด้วยการกดครั้งเดียว
   *
   * @param order - ใบสั่งที่จะเปลี่ยนสถานะ
   * @param status - สถานะใหม่
   * @param reason - เหตุผลการยกเลิก (ถ้ามี)
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือเขียนสถานะลงฐานข้อมูลและรีโหลดกระดาน
   */
  async function changeOrderStatus(order: BoardOrder, status: string, reason?: string) {
    const result = await apiFetch(`/api/admin/orders/${order.id}`, {
      method: 'PATCH',
      body: jsonBody({ status, reason }),
    });
    if (!result.ok) {
      setNotice({ tone: 'error', message: result.message });
      return;
    }
    load(false);
  }

  /**
   * เปลี่ยนสถานะอาหารรายจาน ใช้ตอนบางจานเสร็จก่อนหรือทำจานนั้นไม่ได้
   *
   * @param item - รายการอาหารที่จะเปลี่ยนสถานะ
   * @param status - สถานะใหม่
   * @param reason - เหตุผลการยกเลิก (ถ้ามี)
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือเขียนสถานะลงฐานข้อมูลและรีโหลดกระดาน
   */
  async function changeItemStatus(item: BoardItem, status: string, reason?: string) {
    const result = await apiFetch(`/api/admin/order-items/${item.id}`, {
      method: 'PATCH',
      body: jsonBody({ status, reason }),
    });
    if (!result.ok) {
      setNotice({ tone: 'error', message: result.message });
      return;
    }
    load(false);
  }

  /**
   * ปิดบิลของโต๊ะ บันทึกการชำระเงินแล้วปิดรอบการนั่งให้โต๊ะกลับมาว่าง
   *
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือบันทึก payments และรีโหลดกระดาน
   */
  async function handleCheckout() {
    if (!checkoutOrder) return;
    setCheckingOut(true);
    const result = await apiFetch<{ total: number }>(
      `/api/admin/sessions/${checkoutOrder.session_id}/checkout`,
      { method: 'POST', body: jsonBody({ method: payMethod }) },
    );
    setCheckingOut(false);

    if (!result.ok) {
      setNotice({ tone: 'error', message: result.message });
      return;
    }

    const sessionOrders = orders?.filter((o) => o.session_id === checkoutOrder.session_id) ?? [];
    const sessionOrderIds = new Set(sessionOrders.map((o) => o.id));
    const sessionItems = items.filter((i) => sessionOrderIds.has(i.order_id) && i.status !== 'CANCELLED');

    setNotice({
      tone: 'success',
      message: `ปิดบิลโต๊ะ ${checkoutOrder.table_no} แล้ว เก็บเงิน ${formatBahtWithSign(result.data.total)} โต๊ะกลับมาว่างพร้อมรับลูกค้ากลุ่มใหม่`,
    });

    setPrintType('RECEIPT');
    setPrintData({
      tableNo: checkoutOrder.table_no,
      createdAt: checkoutOrder.created_at,
      items: sessionItems.map((i) => ({
        itemName: i.item_name,
        quantity: i.quantity,
        unitPrice: i.unit_price,
        note: i.note,
      })),
      totalAmount: result.data.total,
      paymentMethod: payMethod,
      orderCode: checkoutOrder.order_code,
      paidAt: new Date().toISOString(),
      cashierName: currentUser?.fullName,
    });
    setCheckoutOrder(null);
    setPrintModalOpen(true);
    load(false);
  }

  /**
   * สร้างและดาวน์โหลดไฟล์ CSV สำหรับรายการออเดอร์ตามตัวกรองปัจจุบัน
   */
  function handleExportOrdersCsv() {
    if (!orders || orders.length === 0) return;
    const filename = `orders-report-${dateFilter || 'all'}.csv`;
    const headers = [
      'รหัสออเดอร์',
      'สาขา',
      'เลขโต๊ะ',
      'วันเวลาที่สั่ง',
      'สถานะออเดอร์',
      'รายการอาหารทั้งหมด',
      'ยอดรวม (บาท)',
      'สถานะรอบโต๊ะ',
    ];

    const rows = orders.map((order) => {
      const orderItems = items.filter((i) => i.order_id === order.id);
      const itemsSummary = orderItems
        .map((i) => `${i.quantity}x ${i.item_name}${i.note ? ` (${i.note})` : ''}`)
        .join(' | ');

      const statusObj = STATUS_LABELS[order.status] ?? STATUS_LABELS.PENDING;

      return [
        order.order_code,
        order.branch_name || '-',
        order.table_no,
        formatThaiTime(order.created_at),
        statusObj.label,
        itemsSummary,
        order.total_amount,
        order.session_status === 'CLOSED' ? 'ปิดบิลแล้ว' : 'กำลังเปิด',
      ];
    });

    downloadCsvFile(filename, headers, rows);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slip">กระดานออเดอร์</h1>
          <p className="text-slip-dim">อัปเดตอัตโนมัติทุก 10 วินาที ใบสั่งใหม่ขึ้นบนสุด</p>
        </div>
        {currentUser?.role === 'ADMIN' && (
          <button
            type="button"
            onClick={() => setAuditModalOpen(true)}
            className="flex min-h-[42px] items-center gap-1.5 rounded-xl border border-rule bg-white px-4 text-xs font-bold text-slip transition-colors hover:bg-zinc-50 shadow-xs cursor-pointer"
          >
            <span>📜 บันทึกประวัติการยกเลิก (Audit Log)</span>
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg bg-griddle px-3 py-3 shadow-sm">
        <div className="min-w-[12rem] flex-1">
          <SelectField
            id="order-status-filter"
            label="กรองตามสถานะ"
            value={statusFilter}
            onChange={setStatusFilter}
            options={STATUS_FILTERS}
          />
        </div>
        <div className="min-w-[12rem] flex-1">
          <div className="flex flex-col gap-2">
            <label htmlFor="order-date-filter" className="text-sm text-slip-dim">
              วันที่
            </label>
            <input
              id="order-date-filter"
              type="date"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
              className="min-h-[44px] w-full rounded-lg bg-char px-3 text-slip"
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setSoundEnabled((prev) => {
                const next = !prev;
                if (next) playNewOrderSound();
                return next;
              });
            }}
            className={`min-h-[44px] rounded-lg px-4 font-medium transition-colors flex items-center gap-2 ${
              soundEnabled
                ? 'bg-flame/10 text-flame hover:bg-flame/20'
                : 'bg-char text-slip-dim hover:bg-rule'
            }`}
          >
            {soundEnabled ? (
              <>
                <BellIcon className="w-5 h-5" />
                <span>เปิดเสียงเตือน</span>
              </>
            ) : (
              <>
                <BellOffIcon className="w-5 h-5" />
                <span>ปิดเสียงเตือน</span>
              </>
            )}
          </button>
          {soundEnabled && (
            <button
              type="button"
              onClick={playNewOrderSound}
              title="ทดสอบระดับเสียงกระดิ่ง"
              className="min-h-[44px] rounded-lg bg-char px-3 text-xs font-semibold text-slip-dim hover:bg-rule hover:text-slip transition-colors"
            >
              ทดสอบเสียง
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={handleExportOrdersCsv}
          disabled={!orders || orders.length === 0}
          className="min-h-[44px] rounded-lg bg-char px-4 text-slip transition-colors hover:bg-rule disabled:opacity-50 flex items-center gap-2"
        >
          <DownloadIcon className="w-5 h-5" />
          <span>ส่งออกออเดอร์ CSV</span>
        </button>
      </div>

      <Notice
        tone={notice.tone}
        message={notice.message}
        onDismiss={() => setNotice({ tone: 'success', message: '' })}
      />

      {loadError && <ErrorState message={loadError} onRetry={() => load(true)} />}
      {!loadError && orders === null && <TableSkeleton rows={4} />}
      {!loadError && orders !== null && orders.length === 0 && (
        <EmptyState
          message="ยังไม่มีออเดอร์ตามเงื่อนไขที่เลือก — เปิดหน้าโต๊ะจากหน้าจัดการโต๊ะเพื่อทดสอบสั่งอาหาร"
          action={
            <Link
              href="/admin/tables"
              className="flex min-h-[44px] items-center rounded-lg bg-griddle px-4 text-slip shadow-sm"
            >
              ไปหน้าโต๊ะและ QR
            </Link>
          }
        />
      )}

      {!loadError &&
        orders !== null &&
        orders.map((order) => {
          const status = STATUS_LABELS[order.status] ?? STATUS_LABELS.PENDING;
          const orderItems = items.filter((item) => item.order_id === order.id);
          const closed = order.session_status === 'CLOSED';

          return (
            <article key={order.id} className="lm-card overflow-hidden">
              <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-rule bg-char px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 font-bold text-sm text-white shadow-xs">
                    {order.table_no}
                  </span>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm text-slip">โต๊ะ {order.table_no}</span>
                      {order.branch_name && (
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600">
                          {order.branch_name}
                        </span>
                      )}
                    </div>
                    <p className="num text-xs text-slip-dim">{order.order_code} · {formatThaiTime(order.created_at)}</p>
                  </div>
                </div>
                <span className={`ml-auto rounded-full px-3 py-1 font-bold text-xs ${status.className}`}>
                  {status.label}
                </span>
                <span className="num text-base font-bold text-emerald-700">
                  {formatBaht(order.total_amount)}
                </span>
              </header>

              <ul className="px-4 py-2">
                {orderItems.map((item) => {
                  const itemStatus = STATUS_LABELS[item.status] ?? STATUS_LABELS.PENDING;
                  return (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-rule px-3 py-2 last:border-b-0"
                    >
                      <span className="num text-slip-dim">×{item.quantity}</span>
                      <span className="min-w-0 flex-1 text-slip">{item.item_name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-sm ${itemStatus.className}`}>
                        {itemStatus.label}
                      </span>
                      {!closed && item.status !== 'CANCELLED' && (
                        <div className="flex gap-2">
                          {item.status !== 'SERVED' && (
                            <button
                              type="button"
                              onClick={() => changeItemStatus(item, 'SERVED')}
                              className="min-h-[44px] rounded-lg bg-char px-3 text-slip"
                            >
                              เสิร์ฟจานนี้
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setCancelItemTarget({ item, order })}
                            className="min-h-[44px] rounded-lg bg-void/10 px-3 text-void hover:bg-void/20 transition-colors cursor-pointer"
                          >
                            ยกเลิกจานนี้
                          </button>
                        </div>
                      )}
                      {item.note && (
                        <p className="w-full text-sm text-waiting">หมายเหตุ: {item.note}</p>
                      )}
                    </li>
                  );
                })}
              </ul>

              <footer className="flex flex-wrap gap-2 border-t border-rule px-3 py-2">
                {closed ? (
                  <p className="text-slip-dim">บิลของโต๊ะนี้ปิดแล้ว แก้ไขไม่ได้</p>
                ) : (
                  <>
                    {order.status === 'PENDING' && (
                      <button
                        type="button"
                        onClick={() => changeOrderStatus(order, 'PREPARING')}
                        className="min-h-[42px] rounded-xl bg-emerald-600 px-4 font-bold text-xs text-white shadow-xs hover:bg-emerald-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <CookingIcon className="w-4 h-4" />
                        <span>ครัวรับแล้ว เริ่มทำ</span>
                      </button>
                    )}
                    {order.status === 'PREPARING' && (
                      <button
                        type="button"
                        onClick={() => changeOrderStatus(order, 'SERVED')}
                        className="min-h-[42px] rounded-xl bg-emerald-600 px-4 font-bold text-xs text-white shadow-xs hover:bg-emerald-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <CheckIcon className="w-4 h-4" />
                        <span>เสิร์ฟครบทั้งใบแล้ว</span>
                      </button>
                    )}
                    {order.status !== 'CANCELLED' && (
                      <button
                        type="button"
                        onClick={() => {
                          if (currentUser?.role !== 'ADMIN') {
                            toastWarning('สงวนสิทธิ์เฉพาะเจ้าของร้าน (ADMIN)', 'หากจำเป็นต้องยกเลิกออเดอร์ทั้งใบ กรุณาแจ้งผู้จัดการ');
                            return;
                          }
                          setCancelConfirmOrder(order);
                        }}
                        className="min-h-[42px] rounded-xl bg-red-50 border border-red-200 px-4 font-bold text-xs text-red-700 hover:bg-red-100 transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <CloseIcon className="w-4 h-4" />
                        <span>ยกเลิกทั้งใบ</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleOpenKitchenPrint(order, orderItems)}
                      className="min-h-[42px] rounded-xl border border-rule bg-white px-4 font-bold text-xs text-slip hover:bg-slate-50 transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <PrintIcon className="w-4 h-4" />
                      <span>พิมพ์ตั๋วครัว</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCheckoutOrder(order);
                        setPayMethod('CASH');
                      }}
                      className="min-h-[42px] rounded-xl border border-emerald-600 bg-emerald-50 px-4 font-bold text-xs text-emerald-800 hover:bg-emerald-600 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <CreditCardIcon className="w-4 h-4" />
                      <span>ปิดบิลโต๊ะ {order.table_no}</span>
                    </button>
                  </>
                )}
              </footer>
            </article>
          );
        })}

      <Modal
        title={checkoutOrder ? `ปิดบิลโต๊ะ ${checkoutOrder.table_no}` : 'ปิดบิล'}
        open={checkoutOrder !== null}
        onClose={() => setCheckoutOrder(null)}
      >
        {checkoutOrder && (() => {
          const sessionOrders = orders?.filter((o) => o.session_id === checkoutOrder.session_id) ?? [];
          const sessionOrderIds = new Set(sessionOrders.map((o) => o.id));
          const sessionItems = items.filter((i) => sessionOrderIds.has(i.order_id) && i.status !== 'CANCELLED');
          const checkoutTotal = sessionItems.reduce((sum, i) => sum + Number(i.unit_price) * i.quantity, 0);

          return (
            <div className="flex flex-col gap-4">
              <p className="text-slip-dim">
                ระบบจะรวมทุกใบสั่งของรอบการนั่งนี้ ยกเว้นรายการที่ยกเลิก แล้วปิดโต๊ะให้ว่าง
                เมื่อปิดแล้วจะแก้ไขออเดอร์ของรอบนี้ไม่ได้อีก
              </p>
              <SelectField
                id="checkout-method"
                label="วิธีชำระเงิน"
                value={payMethod}
                onChange={setPayMethod}
                options={PAYMENT_METHODS}
              />
              {payMethod === 'TRANSFER' && (
                <PromptPayQR amount={checkoutTotal} />
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCheckoutOrder(null)}
                  className="min-h-[44px] rounded-lg bg-char px-4 text-slip"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleCheckout}
                  disabled={checkingOut}
                  className="min-h-[44px] rounded-lg bg-flame px-4 font-medium text-char disabled:opacity-60"
                >
                  {checkingOut ? 'กำลังปิดบิล…' : 'ยืนยันปิดบิล'}
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      <ReceiptPrintModal
        open={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        type={printType}
        data={printData}
      />

      {/* Modal บังคับระบุเหตุผลการยกเลิกอาหารรายจาน เพื่อบันทึก Audit Log */}
      {cancelItemTarget && (
        <CancelReasonModal
          open={Boolean(cancelItemTarget)}
          title={`ยกเลิกรายการ: ${cancelItemTarget.item.item_name} (×${cancelItemTarget.item.quantity})`}
          subtitle={`โต๊ะ ${cancelItemTarget.order.table_no} · ออเดอร์ ${cancelItemTarget.order.order_code}`}
          amountText={`฿${formatBaht(Number(cancelItemTarget.item.unit_price) * cancelItemTarget.item.quantity)}`}
          onConfirm={(reason) => {
            changeItemStatus(cancelItemTarget.item, 'CANCELLED', reason);
            setCancelItemTarget(null);
          }}
          onClose={() => setCancelItemTarget(null)}
        />
      )}

      {/* Modal บังคับระบุเหตุผลการ Void ยกเลิกออเดอร์ทั้งใบ (เฉพาะ ADMIN) */}
      {cancelConfirmOrder && (
        <CancelReasonModal
          open={Boolean(cancelConfirmOrder)}
          title={`ยกเลิกออเดอร์ทั้งใบ: ${cancelConfirmOrder.order_code}`}
          subtitle={`โต๊ะ ${cancelConfirmOrder.table_no} · มูลค่ารวมทั้งใบ`}
          amountText={`฿${formatBaht(cancelConfirmOrder.total_amount)}`}
          onConfirm={(reason) => {
            changeOrderStatus(cancelConfirmOrder, 'CANCELLED', reason);
            setCancelConfirmOrder(null);
          }}
          onClose={() => setCancelConfirmOrder(null)}
        />
      )}

      {/* Modal ดูประวัติการยกเลิกย้อนหลังสำหรับผู้จัดการ/เจ้าของร้าน */}
      <CancellationAuditModal
        open={auditModalOpen}
        onClose={() => setAuditModalOpen(false)}
      />
    </div>
  );
}
