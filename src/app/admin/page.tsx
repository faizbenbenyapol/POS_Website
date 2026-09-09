'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { TableSkeleton, EmptyState, ErrorState } from '@/components/DataState';
import SalesTrend from '@/components/SalesTrend';
import { apiFetch } from '@/lib/client';
import { formatBaht, formatBahtWithSign, formatThaiTime } from '@/lib/format';

/** ออเดอร์ที่ค้างรอครัวรับนานเกินเกณฑ์ ใช้ทำแถบเตือนบนสุด */
type StaleOrder = {
  id: number;
  order_code: string;
  table_no: string;
  created_at: string;
  waiting_minutes: number;
};

/** เมนูขายดีของวัน ใช้วาดแท่งแนวนอน */
type TopMenu = { item_name: string; quantity: number; amount: string };

/** ยอดขาย 1 วันสำหรับกราฟเส้น */
type TrendPoint = { sale_date: string; total: string };

/** ข้อมูลทั้งชุดที่ GET /api/admin/dashboard คืนมา */
type DashboardData = {
  todayRevenue: number;
  todayBillCount: number;
  yesterdayRevenue: number;
  yesterdayBillCount: number;
  todayOrderCount: number;
  openTableCount: number;
  unpaidAmount: number;
  stalePendingMinutes: number;
  staleOrders: StaleOrder[];
  topMenus: TopMenu[];
  salesTrend: TrendPoint[];
  openTicketCount: number;
  urgentOpenTicketCount: number;
};

/** ระยะเวลาระหว่างการดึงข้อมูลใหม่ ให้ตัวเลขบนจอตามความจริงของหน้าร้าน */
const POLL_INTERVAL_MS = 30000;

/**
 * เขียนประโยคเปรียบเทียบยอดขายวันนี้กับเมื่อวานเป็นภาษาคน
 * ตั้งใจไม่ใช้เปอร์เซ็นต์ลอย ๆ เพราะ "+18%" ไม่บอกว่าหายไปกี่บาท
 * เจ้าของร้านตัดสินใจจากจำนวนเงินจริงมากกว่าอัตราส่วน
 *
 * @param today - ยอดขายวันนี้
 * @param yesterday - ยอดขายเมื่อวาน
 * @returns ประโยคภาษาไทยที่บอกส่วนต่างเป็นบาท
 */
function compareWithYesterday(today: number, yesterday: number): string {
  if (yesterday === 0 && today === 0) {
    return 'ยังไม่มียอดขายทั้งวันนี้และเมื่อวาน';
  }
  if (yesterday === 0) {
    return `เมื่อวานยังไม่มีบิลปิด วันนี้เก็บได้แล้ว ${formatBahtWithSign(today)}`;
  }
  const diff = today - yesterday;
  if (diff === 0) {
    return `เท่ากับเมื่อวานพอดี (เมื่อวาน ${formatBahtWithSign(yesterday)})`;
  }
  const direction = diff > 0 ? 'มากกว่า' : 'น้อยกว่า';
  return `${direction}เมื่อวาน ${formatBahtWithSign(Math.abs(diff))} (เมื่อวาน ${formatBahtWithSign(yesterday)})`;
}

/**
 * หน้า Dashboard สรุปว่า "วันนี้ร้านเป็นยังไง"
 * ยอดขายวันนี้เป็นตัวเลขเอกตัวเดียวที่เด่นที่สุด ตัวอื่นเล็กกว่าอย่างชัดเจนตามหัวข้อ 13
 *
 * @returns หน้าจอสรุปข้อมูลสำคัญของร้าน
 */
export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loadError, setLoadError] = useState('');

  /**
   * ดึงข้อมูลสรุปทั้งชุดจากเซิร์ฟเวอร์
   *
   * @param showSkeleton - true ตอนเปิดหน้าครั้งแรก ให้โชว์โครงร่างแทนตัวเลขเก่า
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือปรับ state ของข้อมูลสรุป
   */
  const load = useCallback(async (showSkeleton: boolean) => {
    if (showSkeleton) {
      setData(null);
      setLoadError('');
    }
    const result = await apiFetch<DashboardData>('/api/admin/dashboard');
    if (result.ok) setData(result.data);
    else if (showSkeleton) setLoadError(result.message);
  }, []);

  useEffect(() => {
    load(true);
    const timer = window.setInterval(() => load(false), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  // หัวข้อต้องขึ้นตั้งแต่ตอนกำลังโหลด ผู้ใช้จะได้รู้ว่ามาถูกหน้าแล้วระหว่างรอข้อมูล
  if (loadError || data === null) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-slip">ภาพรวมร้าน</h1>
        {loadError ? (
          <ErrorState message={loadError} onRetry={() => load(true)} />
        ) : (
          <TableSkeleton rows={6} />
        )}
      </div>
    );
  }

  const maxQuantity = Math.max(1, ...data.topMenus.map((menu) => menu.quantity));

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold text-slip">ภาพรวมร้าน</h1>

      {data.urgentOpenTicketCount > 0 && (
        <div role="alert" className="border-l-2 border-void bg-griddle px-4 py-3">
          <p className="text-slip">
            มีเรื่องแจ้งปัญหาเร่งด่วนที่ยังไม่มีใครรับ{' '}
            <span className="num">{data.urgentOpenTicketCount}</span> เรื่อง
          </p>
          <Link href="/admin/tickets" className="text-slip underline underline-offset-4">
            เปิดดูเรื่องแจ้งปัญหา
          </Link>
        </div>
      )}

      {data.staleOrders.length > 0 && (
        <div role="alert" className="border-l-2 border-waiting bg-griddle px-4 py-3">
          <p className="text-slip">
            มีออเดอร์ค้างสถานะรอครัวรับเกิน{' '}
            <span className="num">{data.stalePendingMinutes}</span> นาที{' '}
            <span className="num">{data.staleOrders.length}</span> ใบ
          </p>
          <ul className="mt-1">
            {data.staleOrders.map((order) => (
              <li key={order.id} className="text-slip-dim">
                โต๊ะ <span className="num text-slip">{order.table_no}</span> ·{' '}
                <span className="num">{order.order_code}</span> · สั่งเมื่อ{' '}
                <span className="num">{formatThaiTime(order.created_at)}</span> · รอมาแล้ว{' '}
                <span className="num">{order.waiting_minutes}</span> นาที
              </li>
            ))}
          </ul>
          <Link href="/admin/orders" className="text-slip underline underline-offset-4">
            ไปที่กระดานออเดอร์
          </Link>
        </div>
      )}

      <section>
        <p className="text-slip-dim">ยอดขายวันนี้ (เก็บเงินแล้ว)</p>
        <p className="num text-5xl leading-tight font-semibold text-slip">
          {formatBahtWithSign(data.todayRevenue)}
        </p>
        <p className="mt-1 text-slip-dim">
          {compareWithYesterday(data.todayRevenue, data.yesterdayRevenue)}
        </p>
        <p className="text-slip-dim">
          ปิดบิลไปแล้ว <span className="num text-slip">{data.todayBillCount}</span> บิล
        </p>
      </section>

      <section className="flex flex-col divide-y divide-rule border-y border-rule">
        <div className="flex items-baseline justify-between py-2">
          <span className="text-slip-dim">ออเดอร์วันนี้ (ไม่นับที่ยกเลิก)</span>
          <span className="num text-slip">{data.todayOrderCount} ใบ</span>
        </div>
        <div className="flex items-baseline justify-between py-2">
          <span className="text-slip-dim">โต๊ะที่กำลังนั่งอยู่</span>
          <span className="num text-slip">{data.openTableCount} โต๊ะ</span>
        </div>
        <div className="flex items-baseline justify-between py-2">
          <span className="text-slip-dim">ยอดค้างชำระของโต๊ะที่ยังไม่ปิดบิล</span>
          <span className="num text-slip">{formatBahtWithSign(data.unpaidAmount)}</span>
        </div>
        <div className="flex items-baseline justify-between py-2">
          <span className="text-slip-dim">เรื่องแจ้งปัญหาที่ยังไม่ปิด</span>
          <span className="num text-slip">{data.openTicketCount} เรื่อง</span>
        </div>
      </section>

      <section>
        <h2 className="font-semibold text-slip">5 เมนูขายดีของวันนี้</h2>
        {data.topMenus.length === 0 ? (
          <EmptyState message="วันนี้ยังไม่มีรายการอาหารที่สั่งเข้ามา — ตัวเลขจะขึ้นทันทีที่ลูกค้าโต๊ะแรกกดยืนยันสั่ง" />
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {data.topMenus.map((menu) => (
              <li key={menu.item_name}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate text-slip">{menu.item_name}</span>
                  <span className="num text-slip">{menu.quantity} จาน</span>
                  <span className="num w-24 text-right text-slip-dim">
                    {formatBaht(menu.amount)}
                  </span>
                </div>
                <div
                  className="mt-1 h-2 bg-slip-dim"
                  style={{ width: `${(menu.quantity / maxQuantity) * 100}%` }}
                  aria-hidden="true"
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-semibold text-slip">ยอดขาย 7 วันล่าสุด</h2>
        <SalesTrend points={data.salesTrend} />
      </section>
    </div>
  );
}
