'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Modal from '@/components/Modal';
import { TableSkeleton, EmptyState, ErrorState, Notice } from '@/components/DataState';
import { SelectField } from '@/components/Field';
import { apiFetch, jsonBody } from '@/lib/client';
import { formatBaht, formatBahtWithSign, formatThaiTime } from '@/lib/format';

/** ออเดอร์ 1 ใบบนกระดาน */
type BoardOrder = {
  id: number;
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
  PENDING: { label: 'รอครัวรับ', className: 'text-slip-dim' },
  PREPARING: { label: 'กำลังทำ', className: 'text-waiting' },
  SERVED: { label: 'เสิร์ฟแล้ว', className: 'text-served' },
  CANCELLED: { label: 'ยกเลิกแล้ว', className: 'text-void' },
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
      setOrders(result.data.orders);
      setItems(result.data.items);
    },
    [statusFilter, dateFilter],
  );

  useEffect(() => {
    load(true);
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => load(false), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  /**
   * เปลี่ยนสถานะของใบสั่งทั้งใบด้วยการกดครั้งเดียว
   *
   * @param order - ใบสั่งที่จะเปลี่ยนสถานะ
   * @param status - สถานะใหม่
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือเขียนสถานะลงฐานข้อมูลและรีโหลดกระดาน
   */
  async function changeOrderStatus(order: BoardOrder, status: string) {
    const result = await apiFetch(`/api/admin/orders/${order.id}`, {
      method: 'PATCH',
      body: jsonBody({ status }),
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
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือเขียนสถานะลงฐานข้อมูลและรีโหลดกระดาน
   */
  async function changeItemStatus(item: BoardItem, status: string) {
    const result = await apiFetch(`/api/admin/order-items/${item.id}`, {
      method: 'PATCH',
      body: jsonBody({ status }),
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
    setNotice({
      tone: 'success',
      message: `ปิดบิลโต๊ะ ${checkoutOrder.table_no} แล้ว เก็บเงิน ${formatBahtWithSign(result.data.total)} โต๊ะกลับมาว่างพร้อมรับลูกค้ากลุ่มใหม่`,
    });
    setCheckoutOrder(null);
    load(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slip">กระดานออเดอร์</h1>
        <p className="text-slip-dim">อัปเดตอัตโนมัติทุก 10 วินาที ใบสั่งใหม่ขึ้นบนสุด</p>
      </div>

      <div className="flex flex-wrap gap-3 border border-rule bg-griddle px-3 py-3">
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
              className="min-h-[44px] w-full rounded-sm border border-rule bg-char px-3 text-slip"
            />
          </div>
        </div>
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
              className="flex min-h-[44px] items-center rounded-sm border border-rule px-4 text-slip"
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
            <article key={order.id} className="border border-rule">
              <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-rule bg-griddle px-3 py-2">
                <span className="num text-2xl font-semibold text-slip">{order.table_no}</span>
                <span className="num text-slip-dim">{formatThaiTime(order.created_at)}</span>
                <span className="num text-sm text-slip-dim">{order.order_code}</span>
                <span className={`ml-auto ${status.className}`}>{status.label}</span>
                <span className="num w-24 text-right text-slip">
                  {formatBaht(order.total_amount)}
                </span>
              </header>

              <ul>
                {orderItems.map((item) => {
                  const itemStatus = STATUS_LABELS[item.status] ?? STATUS_LABELS.PENDING;
                  return (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-rule px-3 py-2 last:border-b-0"
                    >
                      <span className="num text-slip-dim">×{item.quantity}</span>
                      <span className="min-w-0 flex-1 text-slip">{item.item_name}</span>
                      <span className={itemStatus.className}>{itemStatus.label}</span>
                      {!closed && item.status !== 'CANCELLED' && (
                        <div className="flex gap-2">
                          {item.status !== 'SERVED' && (
                            <button
                              type="button"
                              onClick={() => changeItemStatus(item, 'SERVED')}
                              className="min-h-[44px] rounded-sm border border-rule px-3 text-slip"
                            >
                              เสิร์ฟจานนี้
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => changeItemStatus(item, 'CANCELLED')}
                            className="min-h-[44px] rounded-sm border border-rule px-3 text-void"
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
                        className="min-h-[44px] rounded-sm bg-flame px-4 font-medium text-char"
                      >
                        ครัวรับแล้ว เริ่มทำ
                      </button>
                    )}
                    {order.status === 'PREPARING' && (
                      <button
                        type="button"
                        onClick={() => changeOrderStatus(order, 'SERVED')}
                        className="min-h-[44px] rounded-sm bg-flame px-4 font-medium text-char"
                      >
                        เสิร์ฟครบทั้งใบแล้ว
                      </button>
                    )}
                    {order.status !== 'CANCELLED' && (
                      <button
                        type="button"
                        onClick={() => changeOrderStatus(order, 'CANCELLED')}
                        className="min-h-[44px] rounded-sm border border-rule px-4 text-void"
                      >
                        ยกเลิกทั้งใบ
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setCheckoutOrder(order);
                        setPayMethod('CASH');
                      }}
                      className="min-h-[44px] rounded-sm border border-rule px-4 text-slip"
                    >
                      ปิดบิลโต๊ะ {order.table_no}
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
        {checkoutOrder && (
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
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCheckoutOrder(null)}
                className="min-h-[44px] rounded-sm border border-rule px-4 text-slip"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleCheckout}
                disabled={checkingOut}
                className="min-h-[44px] rounded-sm bg-flame px-4 font-medium text-char disabled:opacity-60"
              >
                {checkingOut ? 'กำลังปิดบิล…' : 'ยืนยันปิดบิล'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
