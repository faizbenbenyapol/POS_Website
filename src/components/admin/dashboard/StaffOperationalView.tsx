'use client';

import Link from 'next/link';
import {
  BriefcaseIcon,
  TableIcon,
  CartIcon,
  TicketIcon,
  FoodMenuIcon,
  InfoIcon,
  BuildingIcon,
} from '@/components/Icons';
import DashboardAlertBanners from './DashboardAlertBanners';
import type { StaffDashboardData } from './types';

type StaffOperationalViewProps = {
  data: StaffDashboardData;
};

export default function StaffOperationalView({ data }: StaffOperationalViewProps) {
  return (
    <div className="flex flex-col gap-5 pb-8">
      {/* Welcome Card for Staff */}
      <div className="rounded-2xl border border-rule bg-white p-6 shadow-xs">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                <BriefcaseIcon className="w-3.5 h-3.5 text-slate-500" />
                <span>หน้าต่างปฏิบัติการพนักงานหน้าร้าน (STAFF)</span>
              </span>
              {data.branchName && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
                  <BuildingIcon className="w-3 h-3" />
                  {data.branchName}
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-slip">
              ยินดีต้อนรับ, คุณ{data.userFullName || 'พนักงาน'}
            </h1>
            <p className="mt-1 text-xs text-slip-dim">
              จัดการออเดอร์ เสิร์ฟอาหาร เช็คบิล พิมพ์ใบเสร็จ และดูแลโต๊ะได้ทันทีจากหน้านี้
            </p>
          </div>
          <div className="hidden sm:block text-right">
            <span className="rounded-xl bg-zinc-50 border border-rule px-3 py-1.5 text-xs font-mono font-medium text-slip-dim">
              สถานะ: พร้อมให้บริการ
            </span>
          </div>
        </div>
      </div>

      {/* Alert Banners */}
      <DashboardAlertBanners
        urgentOpenTicketCount={data.urgentOpenTicketCount}
        staleOrders={data.staleOrders}
        stalePendingMinutes={data.stalePendingMinutes}
      />

      {/* Quick Operational Metrics */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-rule bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slip-dim">โต๊ะที่มีลูกค้านั่ง</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <TableIcon className="w-5 h-5" />
            </span>
          </div>
          <p className="num mt-2 text-3xl font-black text-slip">
            {data.openTableCount} <span className="text-xs font-normal text-slip-dim">โต๊ะ</span>
          </p>
          <Link
            href="/admin/tables"
            className="mt-3 inline-flex items-center text-xs font-bold text-emerald-700 hover:underline"
          >
            ดูโต๊ะและ QR →
          </Link>
        </div>

        <div className="rounded-2xl border border-rule bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slip-dim">ออเดอร์วันนี้</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <CartIcon className="w-5 h-5" />
            </span>
          </div>
          <p className="num mt-2 text-3xl font-black text-slip">
            {data.todayOrderCount} <span className="text-xs font-normal text-slip-dim">รายการ</span>
          </p>
          <Link
            href="/admin/orders"
            className="mt-3 inline-flex items-center text-xs font-bold text-blue-600 hover:underline"
          >
            ไปกระดานออเดอร์ →
          </Link>
        </div>

        <div className="rounded-2xl border border-rule bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slip-dim">เรื่องแจ้งปัญหาที่รอ</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <TicketIcon className="w-5 h-5" />
            </span>
          </div>
          <p className="num mt-2 text-3xl font-black text-slip">
            {data.openTicketCount} <span className="text-xs font-normal text-slip-dim">เรื่อง</span>
          </p>
          <Link
            href="/admin/tickets"
            className="mt-3 inline-flex items-center text-xs font-bold text-amber-600 hover:underline"
          >
            ดูเรื่องแจ้งปัญหา →
          </Link>
        </div>
      </div>

      {/* Quick Action Buttons */}
      <div className="rounded-2xl border border-rule bg-white p-5 shadow-xs">
        <h3 className="text-sm font-bold text-slip mb-3">เมนูลัดสำหรับพนักงาน</h3>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <Link
            href="/admin/orders"
            className="flex items-center gap-3 rounded-xl border border-rule p-3 hover:bg-zinc-50 hover:border-slate-300 transition-all group"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 group-hover:scale-105 transition-transform">
              <CartIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slip">กระดานออเดอร์ & ครัว</p>
              <p className="text-[11px] text-slip-dim">เช็คบิล / รับเงิน / เสิร์ฟ</p>
            </div>
          </Link>

          <Link
            href="/admin/tables"
            className="flex items-center gap-3 rounded-xl border border-rule p-3 hover:bg-zinc-50 hover:border-slate-300 transition-all group"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 group-hover:scale-105 transition-transform">
              <TableIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slip">โต๊ะและ QR Code</p>
              <p className="text-[11px] text-slip-dim">พิมพ์ป้าย / สร้าง QR ใหม่</p>
            </div>
          </Link>

          <Link
            href="/admin/menu"
            className="flex items-center gap-3 rounded-xl border border-rule p-3 hover:bg-zinc-50 hover:border-slate-300 transition-all group"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 group-hover:scale-105 transition-transform">
              <FoodMenuIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slip">เมนูอาหาร</p>
              <p className="text-[11px] text-slip-dim">สลับสถานะ ของหมด/มีขาย</p>
            </div>
          </Link>
        </div>
      </div>

      {/* Role Policy Explanation */}
      <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 text-xs text-slip-dim">
        <div className="flex items-center gap-1.5 font-bold text-slip mb-1">
          <InfoIcon className="w-4 h-4 shrink-0 text-slate-500" />
          <span>ขอบเขตสิทธิ์การใช้งานบัญชีพนักงาน (STAFF Policy):</span>
        </div>
        <ul className="list-disc list-inside space-y-1 text-[11px] ml-1">
          <li>สามารถดูแลโต๊ะ รับออเดอร์ เสิร์ฟอาหาร เช็คบิลคิดเงิน และพิมพ์ใบเสร็จ/ตั๋วครัว ได้อย่างเต็มรูปแบบ</li>
          <li>สามารถพิมพ์ป้าย QR Code ตั้งโต๊ะ และกดสร้าง QR Code ใหม่เมื่อเคลียร์โต๊ะได้</li>
          <li>ข้อมูลสรุปยอดขาย รายได้รวม กำไร และการจัดการผู้ใช้ระบบ สงวนสิทธิ์เฉพาะบัญชีเจ้าของร้าน (ADMIN)</li>
        </ul>
      </div>
    </div>
  );
}
