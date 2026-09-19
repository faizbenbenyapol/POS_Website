'use client';

import {
  BellIcon,
  BellOffIcon,
  ClockIcon,
  DownloadIcon,
  KanbanIcon,
  ListIcon,
  RefreshIcon,
  VolumeIcon,
} from '@/components/Icons';
import { SelectField } from '@/components/Field';
import ActionMenu, { ActionMenuDivider, ActionMenuItem } from './ActionMenu';
import { STATUS_FILTERS, type BoardViewMode } from './types';

/** รอบเวลาดึงข้อมูลใหม่ที่เลือกได้ หน่วยเป็นวินาที 0 คือหยุดรีเฟรชอัตโนมัติ */
const REFRESH_OPTIONS = [
  { value: 5, label: 'รีเฟรชทุก 5 วินาที', short: '5 วิ' },
  { value: 10, label: 'รีเฟรชทุก 10 วินาที', short: '10 วิ' },
  { value: 30, label: 'รีเฟรชทุก 30 วินาที', short: '30 วิ' },
  { value: 0, label: 'หยุดรีเฟรชอัตโนมัติ', short: 'ปิด' },
];

/**
 * แถบเครื่องมือหัวกระดานออเดอร์
 * บนจอเหลือเฉพาะของที่ใช้ตลอดกะ คือ สลับมุมมอง ปุ่มรีเฟรช กรองสถานะ และกรองเลขโต๊ะ
 * ส่วนค่าที่ตั้งครั้งเดียวจบ (วันที่ทำการ รอบรีเฟรช เสียง ส่งออก CSV ประวัติการยกเลิก)
 * ถูกยุบไว้ในเมนูจุดสามจุดเพื่อลดจำนวนคอนโทรลที่พนักงานต้องกวาดตาผ่านช่วงร้านแน่น
 *
 * @param viewMode - มุมมองที่เลือกอยู่ ('LIST' รายการ หรือ 'KDS' คอลัมน์ครัว)
 * @param onChangeViewMode - เรียกเมื่อสลับมุมมอง
 * @param lastSyncTime - เวลาที่ดึงข้อมูลสำเร็จครั้งล่าสุด ข้อความว่างแปลว่ายังไม่เคยซิงก์
 * @param countdown - วินาทีที่เหลือก่อนรีเฟรชรอบถัดไป
 * @param refreshIntervalSec - รอบรีเฟรชปัจจุบัน หน่วยวินาที 0 คือหยุดอัตโนมัติ
 * @param onChangeRefreshInterval - เรียกเมื่อเลือกรอบรีเฟรชใหม่
 * @param isSyncing - true ระหว่างกำลังดึงข้อมูล ใช้หมุนไอคอนและกันกดซ้ำ
 * @param onManualRefresh - สั่งดึงข้อมูลใหม่ทันที
 * @param statusFilter - สถานะที่กรองอยู่ ข้อความว่างคือทุกสถานะ
 * @param onChangeStatusFilter - เรียกเมื่อเปลี่ยนตัวกรองสถานะ
 * @param dateFilter - วันทำการที่ดูอยู่ รูปแบบ YYYY-MM-DD
 * @param onChangeDateFilter - เรียกเมื่อเปลี่ยนวันทำการ
 * @param tableFilter - ข้อความค้นหาเลขโต๊ะ ข้อความว่างคือทุกโต๊ะ
 * @param onChangeTableFilter - เรียกเมื่อพิมพ์หรือล้างเลขโต๊ะ
 * @param soundEnabled - สถานะเปิด/ปิดเสียงแจ้งเตือนออเดอร์ใหม่
 * @param onToggleSound - สลับเปิด/ปิดเสียงแจ้งเตือน
 * @param soundSettingsOpen - true เมื่อแผงตั้งค่าเสียงกำลังเปิดอยู่
 * @param onToggleSoundSettings - เปิด/ปิดแผงตั้งค่าเสียง
 * @param canExport - false เมื่อยังไม่มีออเดอร์ให้ส่งออก ใช้ปิดปุ่ม CSV
 * @param onExportCsv - สั่งดาวน์โหลดรายงาน CSV ตามตัวกรองปัจจุบัน
 * @param isAdmin - true เมื่อผู้ใช้เป็นเจ้าของร้าน ใช้ตัดสินว่าจะโชว์เมนูประวัติการยกเลิก
 * @param onOpenAuditLog - เปิดหน้าต่างประวัติการยกเลิกย้อนหลัง
 * @returns แถบหัวกระดานพร้อมแถวตัวกรองที่เหลือเฉพาะของจำเป็น
 */
export default function OrderToolbar({
  viewMode,
  onChangeViewMode,
  lastSyncTime,
  countdown,
  refreshIntervalSec,
  onChangeRefreshInterval,
  isSyncing,
  onManualRefresh,
  statusFilter,
  onChangeStatusFilter,
  dateFilter,
  onChangeDateFilter,
  tableFilter,
  onChangeTableFilter,
  soundEnabled,
  onToggleSound,
  soundSettingsOpen,
  onToggleSoundSettings,
  canExport,
  onExportCsv,
  isAdmin,
  onOpenAuditLog,
}: {
  viewMode: BoardViewMode;
  onChangeViewMode: (mode: BoardViewMode) => void;
  lastSyncTime: string;
  countdown: number;
  refreshIntervalSec: number;
  onChangeRefreshInterval: (seconds: number) => void;
  isSyncing: boolean;
  onManualRefresh: () => void;
  statusFilter: string;
  onChangeStatusFilter: (status: string) => void;
  dateFilter: string;
  onChangeDateFilter: (date: string) => void;
  tableFilter: string;
  onChangeTableFilter: (tableNo: string) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  soundSettingsOpen: boolean;
  onToggleSoundSettings: () => void;
  canExport: boolean;
  onExportCsv: () => void;
  isAdmin: boolean;
  onOpenAuditLog: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-bold text-slip">กระดานออเดอร์</h1>
            {/* ตัวสลับมุมมอง รายการ vs KDS */}
            <div className="flex items-center rounded-xl bg-zinc-100 p-1 border border-zinc-200 shadow-2xs">
              <button
                type="button"
                onClick={() => onChangeViewMode('LIST')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold transition-all cursor-pointer ${
                  viewMode === 'LIST' ? 'bg-white text-slip shadow-xs' : 'text-slip-dim hover:text-slip'
                }`}
              >
                <ListIcon className="w-4 h-4" />
                <span>รายการ</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeViewMode('KDS')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold transition-all cursor-pointer ${
                  viewMode === 'KDS' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slip-dim hover:text-slip'
                }`}
              >
                <KanbanIcon className="w-4 h-4" />
                <span>กระดานครัว (KDS)</span>
              </button>
            </div>
          </div>
          <div className="mt-1 flex items-center gap-2 text-sm text-slip-dim">
            {refreshIntervalSec > 0 ? (
              <span className="flex items-center gap-1.5">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    isSyncing ? 'bg-emerald-500 animate-ping' : 'bg-emerald-500'
                  }`}
                />
                <span>ซิงก์ล่าสุด {lastSyncTime || '-'} · รีเฟรชใน {countdown} วิ</span>
              </span>
            ) : (
              <span className="font-medium text-amber-700">หยุดรีเฟรชอัตโนมัติชั่วคราว</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onManualRefresh}
            title="ดึงข้อมูลใหม่ทันที"
            disabled={isSyncing}
            className="flex h-[40px] w-[40px] items-center justify-center rounded-xl border border-rule bg-white text-slip-dim hover:text-slip hover:bg-zinc-50 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
          >
            <RefreshIcon className={`w-4 h-4 ${isSyncing ? 'animate-spin text-emerald-600' : ''}`} />
          </button>

          {/* คำสั่งที่ตั้งครั้งเดียวจบ ยุบไว้ในเมนูเดียวเพื่อเคลียร์พื้นที่หน้าจอ */}
          <ActionMenu label="ตั้งค่ากระดาน" title="วันที่ รอบรีเฟรช เสียง และการส่งออก">
            <div className="flex flex-col gap-1 px-1.5 py-1" onClick={(e) => e.stopPropagation()}>
              <label htmlFor="order-date-filter" className="text-sm font-semibold text-slip">
                วันทำการที่ดูอยู่
              </label>
              <input
                id="order-date-filter"
                type="date"
                value={dateFilter}
                onChange={(event) => onChangeDateFilter(event.target.value)}
                className="min-h-[40px] w-full rounded-lg border border-rule bg-white px-2.5 text-sm text-slip"
              />
            </div>

            <div className="flex flex-col gap-1 px-1.5 pb-1.5" onClick={(e) => e.stopPropagation()}>
              <span id="order-refresh-interval" className="text-sm font-semibold text-slip">
                รอบรีเฟรชอัตโนมัติ
              </span>
              {/* ปุ่มแบ่งช่องแทน dropdown ของเบราว์เซอร์ กดครั้งเดียวจบ และไม่หลุดออกนอกเมนูบนจอสัมผัส */}
              <div
                role="radiogroup"
                aria-labelledby="order-refresh-interval"
                className="grid grid-cols-4 gap-1 rounded-lg border border-rule bg-zinc-50 p-1"
              >
                {REFRESH_OPTIONS.map((option) => {
                  const selected = refreshIntervalSec === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      title={option.label}
                      onClick={() => onChangeRefreshInterval(option.value)}
                      className={`min-h-[36px] rounded-md px-2 text-xs font-semibold transition-colors cursor-pointer ${
                        selected ? 'bg-white text-emerald-700 shadow-xs ring-1 ring-emerald-200' : 'text-slip-dim hover:text-slip'
                      }`}
                    >
                      {option.short}
                    </button>
                  );
                })}
              </div>
            </div>

            <ActionMenuDivider />

            <ActionMenuItem
              icon={
                soundEnabled ? (
                  <BellIcon className="w-4 h-4 text-amber-600" />
                ) : (
                  <BellOffIcon className="w-4 h-4" />
                )
              }
              label={soundEnabled ? 'ปิดเสียงแจ้งเตือน' : 'เปิดเสียงแจ้งเตือน'}
              hint={soundEnabled ? 'ตอนนี้เปิดอยู่' : 'ตอนนี้ปิดอยู่'}
              onClick={onToggleSound}
            />
            <ActionMenuItem
              icon={<VolumeIcon className="w-4 h-4" />}
              label={soundSettingsOpen ? 'ซ่อนแผงตั้งค่าเสียง' : 'ตั้งค่าโทนเสียงและความดัง'}
              onClick={onToggleSoundSettings}
            />

            <ActionMenuDivider />

            <ActionMenuItem
              icon={<DownloadIcon className="w-4 h-4" />}
              label="ส่งออกออเดอร์เป็น CSV"
              hint={canExport ? 'ตามวันที่และตัวกรองที่เลือกอยู่' : 'ยังไม่มีออเดอร์ให้ส่งออก'}
              disabled={!canExport}
              onClick={onExportCsv}
            />
            {isAdmin && (
              <ActionMenuItem
                icon={<ClockIcon className="w-4 h-4" />}
                label="บันทึกประวัติการยกเลิก"
                hint="เฉพาะเจ้าของร้าน"
                onClick={onOpenAuditLog}
              />
            )}
          </ActionMenu>
        </div>
      </div>

      {/* แถวตัวกรองที่ใช้จริงตลอดกะ เหลือแค่สถานะกับเลขโต๊ะ */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg bg-griddle px-3 py-3 shadow-sm">
        <div className="min-w-[12rem] flex-1">
          <SelectField
            id="order-status-filter"
            label="กรองตามสถานะ"
            value={statusFilter}
            onChange={onChangeStatusFilter}
            options={STATUS_FILTERS}
          />
        </div>
        <div className="w-full sm:w-44">
          <div className="flex flex-col gap-2">
            <label htmlFor="order-table-filter" className="text-sm text-slip-dim">
              เลขโต๊ะ
            </label>
            <div className="relative">
              <input
                id="order-table-filter"
                type="text"
                placeholder="ทุกโต๊ะ..."
                value={tableFilter}
                onChange={(event) => onChangeTableFilter(event.target.value)}
                className="min-h-[44px] w-full rounded-lg bg-char px-3 text-sm text-slip focus:outline-none"
              />
              {tableFilter && (
                <button
                  type="button"
                  onClick={() => onChangeTableFilter('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-slip-dim hover:text-slip cursor-pointer"
                  title="ล้างตัวกรองโต๊ะ"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
