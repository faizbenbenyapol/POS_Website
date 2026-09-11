'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { TableSkeleton, EmptyState, ErrorState } from '@/components/DataState';
import QuickTicketButton from '@/components/QuickTicketButton';
import { apiFetch } from '@/lib/client';
import { formatBaht, formatBahtWithSign, formatThaiTime } from '@/lib/format';

/** ออเดอร์ 1 ใบของโต๊ะ */
type Order = {
  id: number;
  order_code: string;
  status: string;
  total_amount: string;
  created_at: string;
};

/** รายการอาหารในออเดอร์ พร้อมสถานะรายรายการ */
type OrderItem = {
  id: number;
  order_id: number;
  item_name: string;
  unit_price: string;
  quantity: number;
  note: string | null;
  status: string;
};

/**
 * คำอธิบายสถานะเป็นภาษาไทย พร้อมสีกำกับแบบชิปพื้นสี
 * ต้องมีข้อความเสมอ ห้ามสื่อความหมายด้วยสีอย่างเดียว ตามข้อกำหนดการเข้าถึงได้
 */
const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'รอครัวรับ', className: 'bg-char text-slip-dim' },
  PREPARING: { label: 'กำลังทำ', className: 'bg-waiting/10 text-waiting' },
  SERVED: { label: 'เสิร์ฟแล้ว', className: 'bg-served/10 text-served' },
  CANCELLED: { label: 'ยกเลิกแล้ว', className: 'bg-void/10 text-void' },
};

/** ระยะเวลาระหว่างการดึงสถานะใหม่ (มิลลิวินาที) ตามข้อกำหนดหัวข้อ 10 ให้ใช้ poll ธรรมดา */
const POLL_INTERVAL_MS = 10000;

/**
 * หน้าสถานะออเดอร์ของโต๊ะ แสดงเป็นใบสั่งเรียงตามรอบที่สั่ง
 * ดึงข้อมูลใหม่ทุก 10 วินาที เพื่อให้ลูกค้าเห็นความคืบหน้าโดยไม่ต้องกดรีเฟรชเอง
 *
 * @param params - พารามิเตอร์เส้นทางที่มี token ของโต๊ะ
 * @returns หน้าสถานะพร้อมยอดสะสมของโต๊ะ
 */
export default function StatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loadError, setLoadError] = useState('');

  /**
   * ดึงออเดอร์ทั้งหมดของรอบการนั่งปัจจุบัน
   *
   * @param showSkeleton - true เมื่อเปิดหน้าครั้งแรก ให้ล้างข้อมูลเดิมเพื่อโชว์โครงร่าง
   *                       false เมื่อดึงซ้ำตามรอบ poll เพื่อไม่ให้หน้าจอกะพริบ
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือปรับ state ของออเดอร์และยอดรวม
   */
  const load = useCallback(
    async (showSkeleton: boolean) => {
      if (showSkeleton) {
        setOrders(null);
        setLoadError('');
      }
      const result = await apiFetch<{
        orders: Order[];
        items: OrderItem[];
        total: number;
      }>(`/api/public/orders?token=${encodeURIComponent(token)}`);

      if (!result.ok) {
        if (showSkeleton) setLoadError(result.message);
        return;
      }
      setOrders(result.data.orders);
      setItems(result.data.items);
      setTotal(result.data.total);
    },
    [token],
  );

  useEffect(() => {
    load(true);
    const timer = window.setInterval(() => load(false), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  if (loadError) {
    return <ErrorState message={loadError} onRetry={() => load(true)} />;
  }
  if (orders === null) {
    return <TableSkeleton rows={3} />;
  }
  if (orders.length === 0) {
    return (
      <EmptyState
        message="ยังไม่มีออเดอร์ของโต๊ะนี้ — เลือกอาหารจากหน้าเมนูแล้วกดยืนยันสั่งได้เลย"
        action={
          <Link
            href={`/t/${token}`}
            className="flex min-h-[44px] items-center rounded-lg bg-flame px-4 font-medium text-char"
          >
            ไปหน้าเมนู
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-44">
      <h1 className="text-xl font-bold text-slip">สถานะอาหารของโต๊ะนี้</h1>

      {orders.map((order, index) => (
        <section key={order.id} className="lm-card overflow-hidden">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-char px-4 py-3">
            <p className="font-bold text-sm text-slip">ใบสั่งที่ {index + 1}</p>
            <p className="num text-xs font-medium text-slip-dim">
              {order.order_code} · {formatThaiTime(order.created_at)}
            </p>
          </header>

          <ul className="px-4 py-2">
            {items
              .filter((item) => item.order_id === order.id)
              .map((item) => {
                const status = STATUS_LABELS[item.status] ?? STATUS_LABELS.PENDING;
                return (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-rule py-2.5 last:border-b-0"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="num font-bold text-xs text-emerald-700">×{item.quantity}</span>
                      <span className="min-w-0 flex-1 text-sm font-medium text-slip">{item.item_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${status.className}`}>
                        {status.label}
                      </span>
                      <span className="num font-bold text-xs text-slip">
                        {formatBaht(Number(item.unit_price) * item.quantity)}
                      </span>
                    </div>
                    {item.note && (
                      <p className="w-full text-xs font-medium text-void pl-5">** หมายเหตุ: {item.note}</p>
                    )}
                  </li>
                );
              })}
          </ul>
        </section>
      ))}

      <div className="fixed inset-x-0 bottom-16 z-20 px-4">
        <div className="mx-auto flex max-w-md flex-col gap-2 rounded-2xl bg-white border border-zinc-200 p-4 shadow-xl">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-bold text-slip-dim">ยอดสะสมของโต๊ะ (ไม่รวมรายการยกเลิก)</span>
            <span className="num text-lg font-black text-emerald-700">{formatBahtWithSign(total)}</span>
          </div>
          <QuickTicketButton
            token={token}
            category="PAYMENT"
            subject="ขอเช็คบิล/ชำระเงิน"
            detail={`ลูกค้าขอปิดบิลและชำระเงิน ยอดสะสม ${formatBahtWithSign(total)}`}
            idleLabel="ขอเช็คบิล / ชำระเงิน"
            sentLabel="แจ้งพนักงานแล้ว กำลังนำบิลมาให้"
            className="min-h-[48px] w-full rounded-xl bg-emerald-600 px-4 font-bold text-sm text-white shadow-xs transition-colors hover:bg-emerald-700 disabled:opacity-80 cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}
