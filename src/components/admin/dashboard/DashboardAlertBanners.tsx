'use client';

import Link from 'next/link';
import { TicketIcon, AlertTriangleIcon, BoxIcon, LeafIcon } from '@/components/Icons';
import type { LowIngredient, LowStockItem, StaleOrder } from './types';

type DashboardAlertBannersProps = {
  urgentOpenTicketCount: number;
  staleOrders: StaleOrder[];
  stalePendingMinutes: number;
  lowStockItems?: LowStockItem[];
  lowStockThreshold?: number;
  lowIngredients?: LowIngredient[];
  lowIngredientCount?: number;
};

/**
 * แถบเตือนสิ่งที่ต้องรีบจัดการบนหัวแดชบอร์ด
 *
 * @param lowStockItems - เมนูที่ของใกล้หมดหรือหมดแล้ว เรียงจากเหลือน้อยที่สุด
 * @param lowStockThreshold - จำนวนคงเหลือที่ถือว่าใกล้หมด ใช้อธิบายเกณฑ์ในข้อความ
 * @param lowIngredients - วัตถุดิบที่ใกล้หมดหรือติดลบ (แสดงไม่เกินที่ API ส่งมา)
 * @param lowIngredientCount - จำนวนวัตถุดิบที่ต้องจัดการทั้งหมด
 */
export default function DashboardAlertBanners({
  urgentOpenTicketCount,
  staleOrders,
  stalePendingMinutes,
  lowStockItems = [],
  lowStockThreshold = 0,
  lowIngredients = [],
  lowIngredientCount = 0,
}: DashboardAlertBannersProps) {
  if (
    urgentOpenTicketCount <= 0 &&
    staleOrders.length === 0 &&
    lowStockItems.length === 0 &&
    lowIngredients.length === 0
  ) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2.5">
      {urgentOpenTicketCount > 0 && (
        <div
          role="alert"
          className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700"
        >
          <div className="flex items-center gap-2">
            <TicketIcon className="w-3.5 h-3.5 shrink-0" />
            <span>
              มีเรื่องแจ้งปัญหาเร่งด่วนที่ยังไม่มีใครรับ{' '}
              <strong className="font-bold">{urgentOpenTicketCount}</strong> เรื่อง
            </span>
          </div>
          <Link
            href="/admin/tickets"
            className="font-semibold text-red-700 underline underline-offset-2 hover:text-red-800"
          >
            ดูเรื่องแจ้ง
          </Link>
        </div>
      )}

      {staleOrders.length > 0 && (
        <div
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800"
        >
          <p className="font-semibold">
            ออเดอร์รอครัวรับเกิน {stalePendingMinutes} นาที:{' '}
            {staleOrders.map((o) => (
              <span key={o.id} className="ml-2 font-normal text-amber-700">
                {o.branch_name ? `[${o.branch_name}] ` : ''}โต๊ะ <strong>{o.table_no}</strong> ({o.waiting_minutes} นาที)
              </span>
            ))}
          </p>
          <Link
            href="/admin/orders"
            className="mt-1 block font-semibold text-amber-800 underline underline-offset-2 hover:text-amber-900"
          >
            ไปกระดานออเดอร์
          </Link>
        </div>
      )}

      {/* ของใกล้หมด เตือนก่อนที่ลูกค้าจะกดสั่งแล้วระบบตัดจนต้องยกเลิกทีหลัง */}
      {lowStockItems.length > 0 && (
        <div
          role="alert"
          className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-2.5 text-xs text-orange-800"
        >
          <p className="flex items-center gap-2 font-semibold">
            <BoxIcon className="w-3.5 h-3.5 shrink-0" />
            <span>
              เมนูที่ของใกล้หมด (เหลือ {lowStockThreshold} ที่หรือน้อยกว่า){' '}
              {lowStockItems.length} รายการ
            </span>
          </p>
          <p className="mt-1">
            {lowStockItems.map((item) => (
              <span key={item.menu_item_id} className="mr-3 font-normal text-orange-700">
                {item.branch_name ? `[${item.branch_name}] ` : ''}
                {item.name}{' '}
                <strong className="font-bold">
                  {item.stock_qty <= 0 ? 'หมดแล้ว' : `เหลือ ${item.stock_qty}`}
                </strong>
              </span>
            ))}
          </p>
          <Link
            href="/admin/stock"
            className="mt-1 block font-semibold text-orange-800 underline underline-offset-2 hover:text-orange-900"
          >
            ไปหน้าสต๊อกเมนู
          </Link>
        </div>
      )}

      {/* วัตถุดิบใกล้หมดหรือติดลบ เตือนให้สั่งของก่อนหมด หรือไปนับของจริงเมื่อยอดติดลบ */}
      {lowIngredients.length > 0 && (
        <div
          role="alert"
          className="rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-2.5 text-xs text-yellow-900"
        >
          <p className="flex items-center gap-2 font-semibold">
            <LeafIcon className="w-3.5 h-3.5 shrink-0" />
            <span>วัตถุดิบใกล้หมดหรือยอดติดลบ {lowIngredientCount} รายการ</span>
          </p>
          <p className="mt-1">
            {lowIngredients.map((item) => (
              <span key={`${item.branch_name ?? ''}-${item.ingredient_id}`} className="mr-3 font-normal text-yellow-800">
                {item.branch_name ? `[${item.branch_name}] ` : ''}
                {item.name}{' '}
                <strong className="font-bold">
                  {item.quantity < 0
                    ? `ติดลบ ${Math.abs(item.quantity).toLocaleString('th-TH', { maximumFractionDigits: 3 })} ${item.unit} (ควรนับของจริง)`
                    : `เหลือ ${item.quantity.toLocaleString('th-TH', { maximumFractionDigits: 3 })} ${item.unit}`}
                </strong>
              </span>
            ))}
            {lowIngredientCount > lowIngredients.length && (
              <span className="font-normal text-yellow-800">
                และอีก {lowIngredientCount - lowIngredients.length} รายการ
              </span>
            )}
          </p>
          <Link
            href="/admin/ingredients"
            className="mt-1 block font-semibold text-yellow-900 underline underline-offset-2 hover:text-yellow-950"
          >
            ไปหน้าวัตถุดิบ
          </Link>
        </div>
      )}
    </div>
  );
}
