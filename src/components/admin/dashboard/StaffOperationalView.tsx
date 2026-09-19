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
  ReceiptIcon,
} from '@/components/Icons';
import DashboardAlertBanners from './DashboardAlertBanners';
import type { StaffDashboardData } from './types';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, canOpenPage } from '@/lib/permissions';

/** เมนูลัดทั้งหมด หน้าจอจะกรองเหลือเฉพาะหน้าที่บทบาทของผู้ใช้เปิดได้ */
const QUICK_LINKS = [
  { href: '/admin/orders', title: 'กระดานออเดอร์ & ครัว', hint: 'รับออเดอร์ / เสิร์ฟ / เช็คบิล', icon: CartIcon },
  { href: '/admin/settlement', title: 'สรุปปิดยอด (Z-Report)', hint: 'พิมพ์ใบปิดกะ / ตรวจนับเงินสด', icon: ReceiptIcon },
  { href: '/admin/tables', title: 'โต๊ะและ QR Code', hint: 'เปิดโต๊ะ / ย้ายโต๊ะ / พิมพ์ป้าย', icon: TableIcon },
  { href: '/admin/menu', title: 'เมนูอาหาร', hint: 'สลับสถานะ ของหมด/มีขาย', icon: FoodMenuIcon },
];

type StaffOperationalViewProps = {
  data: StaffDashboardData;
};

export default function StaffOperationalView({ data }: StaffOperationalViewProps) {
  const quickLinks = QUICK_LINKS.filter((link) => canOpenPage(data.userRole, link.href));
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
        lowStockItems={data.lowStockItems}
        lowStockThreshold={data.lowStockThreshold}
        lowIngredients={data.lowIngredients}
        lowIngredientCount={data.lowIngredientCount}
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
            {data.openTableCount}
            <span className="text-xs font-normal text-slip-dim ml-1.5">โต๊ะ</span>
          </p>
          <p className="mt-1 text-[11px] text-slip-dim">
            กำลังเปิดให้บริการและรอเช็คบิล
          </p>
        </div>

        <div className="rounded-2xl border border-rule bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slip-dim">ออเดอร์วันนี้</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <CartIcon className="w-5 h-5" />
            </span>
          </div>
          <p className="num mt-2 text-3xl font-black text-blue-700">
            {data.todayOrderCount}
            <span className="text-xs font-normal text-slip-dim ml-1.5">ใบสั่ง</span>
          </p>
          <p className="mt-1 text-[11px] text-slip-dim">
            จำนวนออเดอร์ทั้งหมดในวันทำการนี้
          </p>
        </div>


        <div className="rounded-2xl border border-rule bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slip-dim">เรื่องแจ้งปัญหาที่รอดำเนินการ</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-700">
              <TicketIcon className="w-5 h-5" />
            </span>
          </div>
          <p className="num mt-2 text-3xl font-black text-red-700">
            {data.urgentOpenTicketCount}
            <span className="text-xs font-normal text-slip-dim ml-1.5">เรื่อง</span>
          </p>
          <p className="mt-1 text-[11px] text-slip-dim">
            คำขอความช่วยเหลือจากลูกค้าและพนักงาน
          </p>
        </div>
      </div>

      {/* เมนูลัด แสดงเฉพาะหน้าที่บทบาทนี้เปิดได้ (ครัวไม่เห็นปิดยอด แคชเชียร์ไม่เห็นเมนูอาหาร) */}
      {quickLinks.length > 0 && (
        <div className="rounded-2xl border border-rule bg-white p-5 shadow-xs">
          <h3 className="text-sm font-bold text-slip mb-3">เมนูลัด</h3>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {quickLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center gap-3 rounded-xl border border-rule p-3 hover:bg-zinc-50 hover:border-slate-300 transition-all group"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 group-hover:scale-105 transition-transform">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slip">{link.title}</p>
                    <p className="text-[11px] text-slip-dim">{link.hint}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ขอบเขตสิทธิ์ของบทบาทนี้ */}
      <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 text-xs text-slip-dim">
        <div className="flex items-center gap-1.5 font-bold text-slip mb-1">
          <InfoIcon className="w-4 h-4 shrink-0 text-slate-500" />
          <span>สิทธิ์ของบัญชีนี้ ({ROLE_LABELS[data.userRole]})</span>
        </div>
        <ul className="list-disc list-inside space-y-1 text-[11px] ml-1">
          <li>{ROLE_DESCRIPTIONS[data.userRole]}</li>
          <li>ยอดขาย รายได้ กำไร และการจัดการผู้ใช้ระบบ สงวนสิทธิ์เฉพาะบัญชีเจ้าของร้าน (ADMIN)</li>
        </ul>
      </div>
    </div>
  );
}
