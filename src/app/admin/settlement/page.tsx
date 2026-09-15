'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, jsonBody } from '@/lib/client';
import { downloadCsvFile } from '@/lib/exportCsv';
import { printHtml } from '@/lib/print';
import { formatBaht, formatThaiDate, formatThaiDateTime, formatThaiTime } from '@/lib/format';
import { TableSkeleton, ErrorState } from '@/components/DataState';
import {
  CalendarIcon,
  RefreshIcon,
  DownloadIcon,
  PrintIcon,
  BuildingIcon,
  MoneyIcon,
  CreditCardIcon,
  AlertTriangleIcon,
  ChartIcon,
  CheckCircleIcon,
  LockIcon,
} from '@/components/Icons';
import Modal from '@/components/Modal';
import type { DailySettlementReport } from '@/app/api/admin/settlement/route';

/**
 * คืนค่าสตริงวันที่ของวันนี้ในรูปแบบ YYYY-MM-DD
 */
function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * คืนค่าสตริงวันที่ของเมื่อวานในรูปแบบ YYYY-MM-DD
 */
function getYesterdayDateString(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * แปลงผลต่างเงินสดเป็นข้อความไทยบอกว่าเงินตรง ขาด หรือเกินอยู่เท่าไร
 *
 * @param difference - ผลต่างหน่วยบาท (เงินสดที่นับได้จริง ลบด้วยเงินสดตามระบบ)
 * @returns ข้อความสรุปผลต่างพร้อมจำนวนเงิน
 */
function describeCashDifference(difference: number): string {
  if (difference === 0) return 'ตรงกับระบบพอดี';
  if (difference > 0) return `เกิน ฿${formatBaht(difference)}`;
  return `ขาด ฿${formatBaht(Math.abs(difference))}`;
}

/**
 * หน้าจอสรุปปิดยอดประจำวัน (End-of-Day Settlement / Z-Report)
 * รองรับทั้งพนักงานแคชเชียร์ (STAFF) และผู้ดูแลระบบ (ADMIN)
 */
export default function DailySettlementPage() {
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString());
  const [report, setReport] = useState<DailySettlementReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [countedCashInput, setCountedCashInput] = useState('');
  const [closeNote, setCloseNote] = useState('');
  const [isClosing, setIsClosing] = useState(false);
  const [closeError, setCloseError] = useState('');

  const fetchSettlement = useCallback(async (date: string, showSkeleton = true) => {
    if (showSkeleton) {
      setLoading(true);
      setLoadError('');
    }
    setIsRefreshing(true);
    try {
      const url = date ? `/api/admin/settlement?date=${encodeURIComponent(date)}` : '/api/admin/settlement';
      const res = await apiFetch<DailySettlementReport>(url);
      if (res.ok) {
        setReport(res.data);
        setLoadError('');
      } else {
        setLoadError(res.message);
      }
    } catch {
      setLoadError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchSettlement(selectedDate, true);
  }, [selectedDate, fetchSettlement]);

  /**
   * ส่งคำขอปิดยอดประจำวันไปยังเซิร์ฟเวอร์ แล้วแทนที่รายงานบนหน้าจอด้วยฉบับที่ถูกแช่แข็งแล้ว
   * ช่องเงินสดที่นับได้ไม่บังคับ ถ้าเว้นว่างระบบจะไม่คำนวณยอดขาด/เกิน
   */
  async function handleCloseSettlement() {
    if (!report) return;

    const trimmed = countedCashInput.trim();
    const countedCash = trimmed === '' ? null : Number(trimmed);
    if (countedCash !== null && (!Number.isFinite(countedCash) || countedCash < 0)) {
      setCloseError('ยอดเงินสดที่นับได้ต้องเป็นตัวเลขและต้องไม่ติดลบ');
      return;
    }

    setIsClosing(true);
    setCloseError('');
    const res = await apiFetch<DailySettlementReport>('/api/admin/settlement', {
      method: 'POST',
      body: jsonBody({
        date: report.businessDate,
        countedCash,
        note: closeNote.trim() || undefined,
      }),
    });
    setIsClosing(false);

    if (res.ok) {
      setReport(res.data);
      setCloseModalOpen(false);
      setCountedCashInput('');
      setCloseNote('');
    } else {
      setCloseError(res.message);
    }
  }

  /** ส่งออกรายงานสรุปปิดกะประจำวันเป็นไฟล์ CSV */
  function handleExportCsv() {
    if (!report) return;
    const filename = `settlement-${report.branchCode}-${report.businessDate}.csv`;
    const thaiDate = formatThaiDate(report.businessDate);

    const headers = ['หัวข้อรายงาน', 'รายละเอียด / ข้อมูล', 'จำนวน / ยอดเงิน (บาท)'];
    const rows: (string | number)[][] = [
      [`รายงานสรุปปิดยอดประจำวัน (Z-Report) - ${report.branchName}`, '', ''],
      ['วันที่ทำการ (Business Date)', thaiDate, report.businessDate],
      ['ช่วงเวลาวันทำการ', `${report.startTime} ถึง ${report.endTime}`, `ตัดรอบ ${report.cutoffHour}:00 น.`],
      ['เวลาออกรายงาน', formatThaiDateTime(report.generatedAt), ''],
      [
        'สถานะการปิดยอด',
        report.closure
          ? `ปิดยอดแล้ว - ใบที่ Z-${report.closure.zNumber}`
          : 'ยังไม่ปิดยอด (ตัวเลขยังเปลี่ยนได้)',
        '',
      ],
      ...(report.closure
        ? [
            ['ผู้ปิดยอด', report.closure.closedByName, ''],
            ['เวลาที่ปิดยอด', formatThaiDateTime(report.closure.closedAt), ''],
            ['หมายเหตุการปิดกะ', report.closure.note || '-', ''],
          ]
        : []),
      ['', '', ''],
      ['--- สรุปยอดขายรวม (Sales Summary) ---', '', ''],
      ['ยอดขายสุทธิรวม (Net Sales)', 'ยอดรวมทุกช่องทางชำระเงิน', report.totalRevenue],
      ['จำนวนบิลที่ปิดแล้ว', 'บิลที่ชำระเงินสำเร็จ', report.totalBills],
      ['ยอดเฉลี่ยต่อบิล', 'บาท / บิล', Math.round(report.avgBillAmount)],
      ['เวลาบิลแรกของวัน', report.firstPaymentTime ? formatThaiTime(report.firstPaymentTime) : '-', ''],
      ['เวลาบิลสุดท้ายของวัน', report.lastPaymentTime ? formatThaiTime(report.lastPaymentTime) : '-', ''],
      ['', '', ''],
      ['--- แยกตามช่องทางชำระเงิน (Payment Methods) ---', '', ''],
      ['เงินสด (CASH)', `${report.paymentMethods.find((m) => m.method === 'CASH')?.count || 0} รายการ`, report.cashTotal],
      ['โอนเงิน / พร้อมเพย์ (TRANSFER)', `${report.paymentMethods.find((m) => m.method === 'TRANSFER')?.count || 0} รายการ`, report.transferTotal],
      ['บัตรเครดิต / เดบิต (CARD)', `${report.paymentMethods.find((m) => m.method === 'CARD')?.count || 0} รายการ`, report.cardTotal],
      ['', '', ''],
      ['--- การตรวจนับเงินสดในลิ้นชัก (Cash Drawer Audit) ---', '', ''],
      ['เงินสดตามระบบที่ต้องส่งมอบ', 'ยอดเงินสดที่เก็บจริงในวันทำการ', report.cashTotal],
      [
        'เงินสดที่นับได้จริงในลิ้นชัก',
        report.closure
          ? report.closure.countedCash === null
            ? 'ปิดยอดแล้วแต่ไม่ได้บันทึกยอดนับเงิน'
            : `นับและบันทึกโดย ${report.closure.closedByName}`
          : 'ยังไม่ปิดยอด จึงยังไม่มียอดนับเงิน',
        report.closure?.countedCash ?? '',
      ],
      [
        'ผลต่างเงินสดขาด/เกิน',
        report.closure?.cashDifference == null
          ? '-'
          : describeCashDifference(report.closure.cashDifference),
        report.closure?.cashDifference ?? '',
      ],
      ['', '', ''],
      ['--- รายการยกเลิกและมูลค่าสูญเสีย (Void Loss) ---', '', ''],
      ['จำนวนรายการที่ถูกยกเลิก', 'รวมทุกรายการที่ยกเลิก', report.totalVoidCount],
      ['มูลค่าความเสียหายที่ถูกตัดออก', 'บาท', report.totalVoidAmount],
      ...report.voidReasons.map((v) => [`สาเหตุ: ${v.reason}`, `${v.count} รายการ`, v.total]),
      ['', '', ''],
      ['--- ยอดรับเงินรายพนักงานแคชเชียร์ ---', '', ''],
      ...report.cashiers.map((c) => [
        `แคชเชียร์: ${c.cashierName} (${c.method})`,
        `${c.count} รายการ`,
        c.total,
      ]),
      ['', '', ''],
      ['--- ยอดขายแยกตามหมวดหมู่อาหาร ---', '', ''],
      ...report.categorySales.map((cat) => [
        `หมวดหมู่: ${cat.categoryName}`,
        `ขายได้ ${cat.quantity} รายการ`,
        cat.total,
      ]),
      ['', '', ''],
      ['--- 10 อันดับเมนูขายดีประจำวัน ---', '', ''],
      ...report.topItems.map((item, idx) => [
        `อันดับ ${idx + 1}: ${item.itemName}`,
        `ขายได้ ${item.quantity} รายการ`,
        item.total,
      ]),
    ];

    downloadCsvFile(filename, headers, rows);
  }

  /** สั่งพิมพ์สลิปความร้อน 80mm Z-Report */
  function handlePrintZReport() {
    if (!report) return;

    const thaiDate = formatThaiDate(report.businessDate);
    const printedAt = formatThaiDateTime(new Date());

    const html = `
      <div style="width: 76mm; margin: 0 auto; padding: 4px; font-family: 'IBM Plex Sans Thai', sans-serif; color: #000000; line-height: 1.35;">
        <!-- Header -->
        <div style="text-align: center; border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 8px;">
          <h1 style="font-size: 18px; font-weight: 900; margin: 0;">ครัวบ้านไร่</h1>
          <p style="font-size: 13px; font-weight: 700; margin: 2px 0;">สาขา: ${report.branchName}</p>
          <div style="font-size: 14px; font-weight: 800; margin-top: 4px; border: 1px solid #000; padding: 2px 4px; display: inline-block;">
            ใบสรุปยอดปิดกะ / ปิดวัน (Z-REPORT)
          </div>
          <div style="font-size: 13px; font-weight: 900; margin-top: 5px;">
            ${
              report.closure
                ? `เลขที่ใบปิดยอด: Z-${report.closure.zNumber}`
                : '*** ฉบับร่าง - ยังไม่ได้ปิดยอด ***'
            }
          </div>
          <div style="font-size: 11px; margin-top: 6px; color: #111;">
            <div>วันที่ทำการ: <strong>${thaiDate}</strong></div>
            <div>ตัดรอบ: ${report.cutoffHour}:00 น.</div>
            <div style="font-size: 10px; color: #444;">เวลาพิมพ์: ${printedAt}</div>
          </div>
        </div>

        <!-- Sales Summary -->
        <div style="border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
          <div style="font-size: 12px; font-weight: 800; margin-bottom: 4px; text-transform: uppercase;">
            === สรุปยอดขาย (SALES SUMMARY) ===
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; color: #333;">
            <span>ยอดค่าอาหารก่อนส่วนลด (GROSS)</span>
            <span>฿${formatBaht(report.grossSalesAmount)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; color: #333; margin-top: 2px;">
            <span>หักส่วนลด (DISCOUNT)</span>
            <span>-฿${formatBaht(report.discountAmount)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; color: #333; margin-top: 2px; margin-bottom: 3px;">
            <span>บวกค่าบริการ (SERVICE)</span>
            <span>฿${formatBaht(report.serviceChargeAmount)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 15px; font-weight: 900; border-top: 1px solid #000; padding-top: 3px;">
            <span>ยอดขายสุทธิ (NET SALES)</span>
            <span>฿${formatBaht(report.totalRevenue)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; color: #333; margin-top: 2px;">
            <span>ในยอดนี้เป็น VAT</span>
            <span>฿${formatBaht(report.vatAmount)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 12px; margin-top: 3px;">
            <span>จำนวนบิลที่ชำระแล้ว</span>
            <span style="font-weight: 700;">${report.totalBills} บิล</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 12px; margin-top: 2px;">
            <span>ยอดเฉลี่ยต่อบิล</span>
            <span>฿${formatBaht(report.avgBillAmount)}</span>
          </div>
          ${
            report.firstPaymentTime
              ? `<div style="display: flex; justify-content: space-between; font-size: 11px; color: #333; margin-top: 2px;">
                  <span>เวลาบิลแรก - บิลสุดท้าย</span>
                  <span>${formatThaiTime(report.firstPaymentTime)} - ${report.lastPaymentTime ? formatThaiTime(report.lastPaymentTime) : '-'}</span>
                </div>`
              : ''
          }
        </div>

        <!-- Payment Breakdown -->
        <div style="border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
          <div style="font-size: 12px; font-weight: 800; margin-bottom: 4px;">
            === ช่องทางชำระเงิน (PAYMENTS) ===
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 700;">
            <span>1. เงินสด (CASH)</span>
            <span>฿${formatBaht(report.cashTotal)}</span>
          </div>
          <div style="font-size: 10px; color: #444; text-align: right; margin-bottom: 3px;">
            (${report.paymentMethods.find((m) => m.method === 'CASH')?.count || 0} บิล)
          </div>

          <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 700;">
            <span>2. โอนเงิน / QR PromptPay</span>
            <span>฿${formatBaht(report.transferTotal)}</span>
          </div>
          <div style="font-size: 10px; color: #444; text-align: right; margin-bottom: 3px;">
            (${report.paymentMethods.find((m) => m.method === 'TRANSFER')?.count || 0} บิล)
          </div>

          <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 700;">
            <span>3. บัตรเครดิต / เดบิต</span>
            <span>฿${formatBaht(report.cardTotal)}</span>
          </div>
          <div style="font-size: 10px; color: #444; text-align: right;">
            (${report.paymentMethods.find((m) => m.method === 'CARD')?.count || 0} บิล)
          </div>
        </div>

        <!-- Cash Drawer Audit Section -->
        <div style="border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 6px; background-color: #fafafa; padding: 6px; border: 1px solid #ddd;">
          <div style="font-size: 12px; font-weight: 800; margin-bottom: 4px;">
            === ตรวจนับเงินสดลิ้นชัก (CASH AUDIT) ===
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 700;">
            <span>เงินสดในระบบ (System Cash):</span>
            <span>฿${formatBaht(report.cashTotal)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 12px; margin-top: 6px;">
            <span>ยอดนับจริง (Actual Cash):</span>
            <span>${
              report.closure && report.closure.countedCash !== null
                ? `฿${formatBaht(report.closure.countedCash)}`
                : '......................... บาท'
            }</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 12px; margin-top: 6px;">
            <span>ผลต่าง (+เกิน / -ขาด):</span>
            <span>${
              report.closure && report.closure.cashDifference !== null
                ? describeCashDifference(report.closure.cashDifference)
                : '......................... บาท'
            }</span>
          </div>
        </div>

        <!-- Void Summary -->
        <div style="border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
          <div style="font-size: 12px; font-weight: 800; margin-bottom: 4px;">
            === รายการยกเลิก / ตัดยอด (VOIDS) ===
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 12px;">
            <span>จำนวนรายการยกเลิก:</span>
            <span style="font-weight: 700;">${report.totalVoidCount} รายการ</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 12px; color: #b91c1c; font-weight: 700;">
            <span>มูลค่าที่ตัดออก:</span>
            <span>-฿${formatBaht(report.totalVoidAmount)}</span>
          </div>
        </div>

        <!-- Top Selling Items (Top 5 for thermal slip) -->
        ${
          report.topItems.length > 0
            ? `
          <div style="border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
            <div style="font-size: 12px; font-weight: 800; margin-bottom: 4px;">
              === 5 อันดับเมนูขายดีประจำวัน ===
            </div>
            ${report.topItems
              .slice(0, 5)
              .map(
                (item, i) => `
              <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px;">
                <span>${i + 1}. ${item.itemName} (${item.quantity} จาน)</span>
                <span>฿${formatBaht(item.total)}</span>
              </div>
            `,
              )
              .join('')}
          </div>
        `
            : ''
        }

        <!-- Sign-off Section -->
        <div style="padding-top: 8px; font-size: 11px; text-align: center;">
          ${
            report.closure
              ? `<div style="margin-bottom: 10px; font-size: 11px; font-weight: 700;">
                  ปิดยอดโดย ${report.closure.closedByName}<br/>
                  เมื่อ ${formatThaiDateTime(report.closure.closedAt)}
                  ${report.closure.note ? `<br/>หมายเหตุ: ${report.closure.note}` : ''}
                </div>`
              : ''
          }
          <div style="margin-bottom: 16px;">
            <div>ลงชื่อแคชเชียร์ผู้ส่งมอบเงิน</div>
            <div style="margin-top: 24px;">(......................................................)</div>
          </div>
          <div>
            <div>ลงชื่อผู้จัดการสาขา / ผู้ตรวจรับเงิน</div>
            <div style="margin-top: 24px;">(......................................................)</div>
          </div>
          <div style="margin-top: 14px; font-size: 9px; color: #666;">
            *** ใบปิดกะนี้เป็นหลักฐานการเงิน กรุณาแนบพร้อมซองเงินสด ***
          </div>
        </div>
      </div>
    `;

    printHtml(html, {
      title: `Z-Report-${report.branchCode}-${report.businessDate}-${
        report.closure ? `Z${report.closure.zNumber}` : 'DRAFT'
      }`,
      pageStyle: '@page { margin: 2mm; size: 80mm auto; }',
    });
  }

  return (
    <div className="flex flex-col gap-5 pb-12">
      {/* Top Header & Date Navigation */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-rule bg-white p-5 shadow-xs">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 border border-emerald-200">
              <ChartIcon className="w-3.5 h-3.5" />
              <span>สรุปปิดยอดประจำวัน (Z-Report)</span>
            </span>
            {report?.branchName && (
              <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700">
                <BuildingIcon className="w-3 h-3 text-zinc-500" />
                {report.branchName}
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold text-slip">
            รายงานปิดกะและการเงินประจำวัน
          </h1>
          <p className="mt-0.5 text-xs text-slip-dim">
            สรุปยอดขายสุทธิ แยกตามช่องทางชำระ เงินสดในลิ้นชัก และรายการสูญเสียจากการยกเลิก
          </p>
        </div>

        {/* Date Selector & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Date Buttons */}
          <div className="inline-flex rounded-xl border border-rule bg-zinc-50 p-1 text-xs font-medium text-slip">
            <button
              type="button"
              onClick={() => setSelectedDate(getTodayDateString())}
              className={`rounded-lg px-2.5 py-1 transition-colors cursor-pointer ${
                selectedDate === getTodayDateString() ? 'bg-white font-bold text-slip shadow-xs' : 'text-slip-dim hover:text-slip'
              }`}
            >
              วันนี้
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(getYesterdayDateString())}
              className={`rounded-lg px-2.5 py-1 transition-colors cursor-pointer ${
                selectedDate === getYesterdayDateString() ? 'bg-white font-bold text-slip shadow-xs' : 'text-slip-dim hover:text-slip'
              }`}
            >
              เมื่อวาน
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-xl border border-rule bg-white px-3 py-1.5 text-xs font-medium text-slip focus:border-zinc-400 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => fetchSettlement(selectedDate, false)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1 rounded-xl border border-rule bg-white px-3 py-1.5 text-xs font-medium text-slip hover:bg-zinc-50 disabled:opacity-50 cursor-pointer"
            title="รีเฟรชข้อมูล"
          >
            <RefreshIcon className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden md:inline">รีเฟรช</span>
          </button>

          <button
            type="button"
            onClick={handlePrintZReport}
            disabled={!report || loading}
            className="inline-flex items-center gap-1.5 rounded-xl bg-char px-3.5 py-1.5 text-xs font-bold text-slip hover:bg-zinc-200 disabled:opacity-50 cursor-pointer"
          >
            <PrintIcon className="w-4 h-4" />
            <span>พิมพ์สลิป 80mm</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!report || loading}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
          >
            <DownloadIcon className="w-4 h-4" />
            <span>ส่งออก CSV</span>
          </button>

          <Link
            href="/admin/settlement/history"
            className="inline-flex items-center gap-1.5 rounded-xl border border-rule bg-white px-3.5 py-1.5 text-xs font-bold text-slip hover:bg-zinc-50"
          >
            <ChartIcon className="w-4 h-4" />
            <span>ประวัติการปิดยอด</span>
          </Link>

          {report && !report.closure && (
            <button
              type="button"
              onClick={() => {
                setCloseError('');
                setCloseModalOpen(true);
              }}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
            >
              <LockIcon className="w-4 h-4" />
              <span>ปิดยอดประจำวัน</span>
            </button>
          )}
        </div>
      </div>

      {loadError && (
        <ErrorState message={loadError} onRetry={() => fetchSettlement(selectedDate, true)} />
      )}

      {loading && !report && <TableSkeleton />}

      {report && (
        <>
          {/* Outstanding Unpaid Table Alert Banner */}
          {report.unpaidSessionsCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900 shadow-xs">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-200 text-amber-900">
                  <AlertTriangleIcon className="w-5 h-5" />
                </span>
                <div>
                  <h2 className="text-sm font-bold">
                    คำเตือน: ยังมีโต๊ะที่ยังไม่เช็คบิล {report.unpaidSessionsCount} โต๊ะในสาขานี้
                  </h2>
                  <p className="text-xs text-amber-800">
                    ยอดค้างชำระประเมิน ฿{formatBaht(report.unpaidEstimatedAmount)} หากต้องการปิดกะ กรุณาตรวจสอบหรือเช็คบิลให้เรียบร้อย
                  </p>
                </div>
              </div>
              <Link
                href="/admin/tables"
                className="rounded-xl bg-amber-800 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-amber-900 transition-colors"
              >
                ดูโต๊ะที่เปิดค้างอยู่ →
              </Link>
            </div>
          )}

          {/* Z-Report Closed Banner */}
          {report.closure && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900 shadow-xs">
              <div className="flex items-start gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-200 text-emerald-900">
                  <LockIcon className="w-5 h-5" />
                </span>
                <div>
                  <h2 className="text-sm font-bold">
                    ปิดยอดประจำวันแล้ว - ใบที่ Z-{report.closure.zNumber}
                  </h2>
                  <p className="text-xs text-emerald-800">
                    ปิดโดย {report.closure.closedByName} เมื่อ{' '}
                    {formatThaiDateTime(report.closure.closedAt)} ตัวเลขชุดนี้ถูกบันทึกถาวรแล้ว
                    จะไม่เปลี่ยนตามการแก้ข้อมูลภายหลัง และรับชำระเงินเพิ่มในวันทำการนี้ไม่ได้อีก
                  </p>
                  {report.closure.note && (
                    <p className="mt-1 text-xs text-emerald-800">
                      หมายเหตุ: {report.closure.note}
                    </p>
                  )}
                </div>
              </div>
              {report.closure.countedCash !== null && (
                <div className="rounded-xl border border-emerald-200 bg-white px-4 py-2 text-right">
                  <p className="text-xs font-semibold text-emerald-800">เงินสดที่นับได้จริง</p>
                  <p className="num text-base font-black text-emerald-900">
                    ฿{formatBaht(report.closure.countedCash)}
                  </p>
                  <p
                    className={`num text-xs font-bold ${
                      (report.closure.cashDifference ?? 0) === 0
                        ? 'text-emerald-700'
                        : 'text-red-700'
                    }`}
                  >
                    {describeCashDifference(report.closure.cashDifference ?? 0)}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Business Date & Cutoff Info Ribbon */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-zinc-100 px-4 py-2.5 text-xs text-slip-dim border border-zinc-200">
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-zinc-500" />
              <span>
                วันทำการ: <strong className="text-slip">{formatThaiDate(report.businessDate)}</strong>
              </span>
              <span className="text-zinc-300">|</span>
              <span>
                ช่วงเวลา: {formatThaiDateTime(report.startTime)} ถึง {formatThaiDateTime(report.endTime)}
              </span>
            </div>
            <div>
              เวลาตัดรอบวัน: <strong className="text-slip">{report.cutoffHour}:00 น.</strong>
            </div>
          </div>

          {/* Key Metrics Strip */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {/* Total Net Sales */}
            <div className="rounded-2xl border border-rule bg-white p-4 shadow-xs">
              <span className="text-xs font-semibold text-slip-dim">ยอดขายสุทธิ (Net Sales)</span>
              <p className="num mt-1 text-2xl font-black text-emerald-700">
                ฿{formatBaht(report.totalRevenue)}
              </p>
              <p className="mt-1 text-xs text-slip-dim">
                จาก {report.totalBills} บิล (เฉลี่ย ฿{formatBaht(report.avgBillAmount)}/บิล)
              </p>
            </div>

            {/* Cash in Drawer */}
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-900">เงินสดในลิ้นชัก</span>
                <MoneyIcon className="w-4 h-4 text-emerald-700" />
              </div>
              <p className="num mt-1 text-2xl font-black text-emerald-900">
                ฿{formatBaht(report.cashTotal)}
              </p>
              <p className="mt-1 text-xs text-emerald-700 font-medium">
                {report.paymentMethods.find((m) => m.method === 'CASH')?.count || 0} บิล (ต้องตรวจนับจริง)
              </p>
            </div>

            {/* Transfer / QR */}
            <div className="rounded-2xl border border-rule bg-white p-4 shadow-xs">
              <span className="text-xs font-semibold text-slip-dim">เงินโอน / พร้อมเพย์</span>
              <p className="num mt-1 text-2xl font-black text-slip">
                ฿{formatBaht(report.transferTotal)}
              </p>
              <p className="mt-1 text-xs text-slip-dim">
                {report.paymentMethods.find((m) => m.method === 'TRANSFER')?.count || 0} บิล
              </p>
            </div>

            {/* Credit / Debit Card */}
            <div className="rounded-2xl border border-rule bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slip-dim">บัตรเครดิต / เดบิต</span>
                <CreditCardIcon className="w-4 h-4 text-zinc-400" />
              </div>
              <p className="num mt-1 text-2xl font-black text-slip">
                ฿{formatBaht(report.cardTotal)}
              </p>
              <p className="mt-1 text-xs text-slip-dim">
                {report.paymentMethods.find((m) => m.method === 'CARD')?.count || 0} บิล
              </p>
            </div>

            {/* Void / Cancellation Loss */}
            <div className="rounded-2xl border border-red-200 bg-red-50/50 p-4 shadow-xs">
              <span className="text-xs font-bold text-red-900">ยอดการยกเลิก / สูญเสีย</span>
              <p className="num mt-1 text-2xl font-black text-red-700">
                -฿{formatBaht(report.totalVoidAmount)}
              </p>
              <p className="mt-1 text-xs text-red-600 font-medium">
                {report.totalVoidCount} รายการที่ถูกตัดออก
              </p>
            </div>
          </div>

          {/* องค์ประกอบของยอดขาย ต้องกระทบยอดจากค่าอาหารลงมาถึงยอดสุทธิได้ */}
          <div className="rounded-2xl border border-rule bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-rule pb-2">
              <h2 className="text-sm font-bold text-slip">องค์ประกอบของยอดขาย (Sales Reconciliation)</h2>
              {report.discountedBillCount > 0 && (
                <span className="rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-xs font-bold text-red-700">
                  มีส่วนลด {report.discountedBillCount} บิล
                </span>
              )}
            </div>
            <div className="mt-2.5 flex flex-col gap-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slip-dim">ยอดรวมค่าอาหารก่อนส่วนลด</span>
                <span className="num font-semibold text-slip">
                  ฿{formatBaht(report.grossSalesAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-red-700">หักส่วนลดที่อนุมัติ</span>
                <span className="num font-semibold text-red-700">
                  -฿{formatBaht(report.discountAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slip-dim">บวกค่าบริการ (Service Charge)</span>
                <span className="num font-semibold text-slip">
                  ฿{formatBaht(report.serviceChargeAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-rule pt-1.5">
                <span className="font-bold text-slip">ยอดขายสุทธิที่เก็บเงินได้</span>
                <span className="num font-black text-emerald-700">
                  ฿{formatBaht(report.totalRevenue)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slip-dim">ในยอดนี้เป็นภาษีมูลค่าเพิ่ม</span>
                <span className="num font-semibold text-slip-dim">
                  ฿{formatBaht(report.vatAmount)}
                </span>
              </div>
            </div>
          </div>

          {/* Grid Layout: Left Column (Payments & Cashiers) & Right Column (Categories & Top items) */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Left Column */}
            <div className="flex flex-col gap-5">
              {/* Payment Methods Breakdown */}
              <div className="rounded-2xl border border-rule bg-white p-5 shadow-xs">
                <h3 className="text-sm font-bold text-slip mb-3">
                  สัดส่วนช่องทางชำระเงิน (Payment Breakdown)
                </h3>

                {/* Graphical Proportion Bar */}
                {report.totalRevenue > 0 && (
                  <div className="mb-4 h-3 w-full overflow-hidden rounded-full bg-zinc-100 flex">
                    <div
                      style={{ width: `${(report.cashTotal / report.totalRevenue) * 100}%` }}
                      className="bg-emerald-500 h-full"
                      title={`เงินสด ฿${formatBaht(report.cashTotal)}`}
                    />
                    <div
                      style={{ width: `${(report.transferTotal / report.totalRevenue) * 100}%` }}
                      className="bg-blue-500 h-full"
                      title={`โอนเงิน ฿${formatBaht(report.transferTotal)}`}
                    />
                    <div
                      style={{ width: `${(report.cardTotal / report.totalRevenue) * 100}%` }}
                      className="bg-purple-500 h-full"
                      title={`บัตร ฿${formatBaht(report.cardTotal)}`}
                    />
                  </div>
                )}

                <div className="divide-y divide-rule border-t border-rule text-xs">
                  <div className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-emerald-500" />
                      <span className="font-medium text-slip">เงินสด (CASH)</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-slip num">฿{formatBaht(report.cashTotal)}</span>
                      <span className="ml-2 text-slip-dim">
                        ({report.totalRevenue > 0 ? ((report.cashTotal / report.totalRevenue) * 100).toFixed(1) : 0}%)
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-blue-500" />
                      <span className="font-medium text-slip">โอนเงิน / พร้อมเพย์ (TRANSFER)</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-slip num">฿{formatBaht(report.transferTotal)}</span>
                      <span className="ml-2 text-slip-dim">
                        ({report.totalRevenue > 0 ? ((report.transferTotal / report.totalRevenue) * 100).toFixed(1) : 0}%)
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-purple-500" />
                      <span className="font-medium text-slip">บัตรเครดิต / เดบิต (CARD)</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-slip num">฿{formatBaht(report.cardTotal)}</span>
                      <span className="ml-2 text-slip-dim">
                        ({report.totalRevenue > 0 ? ((report.cardTotal / report.totalRevenue) * 100).toFixed(1) : 0}%)
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Cash Drawer Handover Sheet */}
              <div className="rounded-2xl border border-emerald-300 bg-emerald-50/40 p-5 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-emerald-950">
                    แบบฟอร์มตรวจนับเงินสดลิ้นชัก (Cash Reconciliation)
                  </h3>
                  <CheckCircleIcon className="w-5 h-5 text-emerald-600" />
                </div>
                <p className="text-xs text-emerald-800 mb-4">
                  สำหรับพนักงานแคชเชียร์ตรวจนับเงินสดจริงในลิ้นชักก่อนเซ็นส่งมอบกะให้ผู้จัดการ
                </p>

                <div className="space-y-2 rounded-xl bg-white p-3.5 border border-emerald-200 text-xs">
                  <div className="flex items-center justify-between pb-2 border-b border-rule">
                    <span className="text-slip-dim">ยอดเงินสดในระบบ (System Cash):</span>
                    <span className="font-bold text-emerald-800 text-sm num">฿{formatBaht(report.cashTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-slip-dim">ยอดเงินสดที่นับได้จริง (Actual Cash):</span>
                    <span className="font-mono text-zinc-400">________________ บาท</span>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-slip-dim">ส่วนต่างขาด / เกิน:</span>
                    <span className="font-mono text-zinc-400">________________ บาท</span>
                  </div>
                </div>
              </div>

              {/* Cashiers Summary Table */}
              <div className="rounded-2xl border border-rule bg-white p-5 shadow-xs">
                <h3 className="text-sm font-bold text-slip mb-3">
                  ยอดรับเงินรายพนักงานแคชเชียร์ (Cashier Breakdown)
                </h3>
                {report.cashiers.length === 0 ? (
                  <p className="text-xs text-slip-dim py-4 text-center">ยังไม่มีข้อมูลการรับเงินในวันทำการนี้</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead className="bg-zinc-50 text-slip-dim font-bold border-b border-rule">
                        <tr>
                          <th className="px-3 py-2">พนักงานแคชเชียร์</th>
                          <th className="px-3 py-2">ช่องทาง</th>
                          <th className="px-3 py-2 text-right">จำนวนบิล</th>
                          <th className="px-3 py-2 text-right">ยอดเงิน</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rule">
                        {report.cashiers.map((c, i) => (
                          <tr key={`${c.cashierId}-${c.method}-${i}`} className="hover:bg-zinc-50/50">
                            <td className="px-3 py-2 font-medium text-slip">{c.cashierName}</td>
                            <td className="px-3 py-2">
                              <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-700">
                                {c.method}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right num text-slip-dim">{c.count}</td>
                            <td className="px-3 py-2 text-right font-bold text-slip num">฿{formatBaht(c.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column */}
            <div className="flex flex-col gap-5">
              {/* Category Sales Table */}
              <div className="rounded-2xl border border-rule bg-white p-5 shadow-xs">
                <h3 className="text-sm font-bold text-slip mb-3">
                  ยอดขายแยกตามหมวดหมู่ (Sales by Category)
                </h3>
                {report.categorySales.length === 0 ? (
                  <p className="text-xs text-slip-dim py-4 text-center">ยังไม่มีข้อมูลการขายตามหมวดหมู่</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead className="bg-zinc-50 text-slip-dim font-bold border-b border-rule">
                        <tr>
                          <th className="px-3 py-2">หมวดหมู่อาหาร</th>
                          <th className="px-3 py-2 text-right">จำนวนจาน</th>
                          <th className="px-3 py-2 text-right">ยอดเงิน</th>
                          <th className="px-3 py-2 text-right">สัดส่วน</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rule">
                        {report.categorySales.map((cat) => (
                          <tr key={cat.categoryId ?? 'none'} className="hover:bg-zinc-50/50">
                            <td className="px-3 py-2 font-medium text-slip">{cat.categoryName}</td>
                            <td className="px-3 py-2 text-right num text-slip-dim">{cat.quantity}</td>
                            <td className="px-3 py-2 text-right font-bold text-slip num">฿{formatBaht(cat.total)}</td>
                            <td className="px-3 py-2 text-right text-slip-dim num">
                              {report.totalRevenue > 0 ? ((cat.total / report.totalRevenue) * 100).toFixed(1) : 0}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Top 10 Selling Items */}
              <div className="rounded-2xl border border-rule bg-white p-5 shadow-xs">
                <h3 className="text-sm font-bold text-slip mb-3">
                  10 อันดับเมนูขายดีประจำวัน (Top Selling Items)
                </h3>
                {report.topItems.length === 0 ? (
                  <p className="text-xs text-slip-dim py-4 text-center">ยังไม่มีข้อมูลเมนูขายดีในวันทำการนี้</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead className="bg-zinc-50 text-slip-dim font-bold border-b border-rule">
                        <tr>
                          <th className="px-3 py-2 w-8">#</th>
                          <th className="px-3 py-2">เมนูอาหาร</th>
                          <th className="px-3 py-2 text-right">จำนวน</th>
                          <th className="px-3 py-2 text-right">ยอดรวม</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rule">
                        {report.topItems.map((item, idx) => (
                          <tr key={item.menuItemId} className="hover:bg-zinc-50/50">
                            <td className="px-3 py-2 text-slip-dim font-bold">{idx + 1}</td>
                            <td className="px-3 py-2 font-medium text-slip">{item.itemName}</td>
                            <td className="px-3 py-2 text-right num font-semibold text-emerald-700">{item.quantity}</td>
                            <td className="px-3 py-2 text-right font-bold text-slip num">฿{formatBaht(item.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Void & Cancellation Losses Analysis */}
              <div className="rounded-2xl border border-rule bg-white p-5 shadow-xs">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-slip">
                    รายการยกเลิกและมูลค่าสูญเสีย (Void Losses)
                  </h3>
                  <span className="rounded-md bg-red-50 border border-red-200 px-2 py-0.5 text-xs font-bold text-red-700">
                    รวม {report.totalVoidCount} รายการ
                  </span>
                </div>
                {report.voidReasons.length === 0 ? (
                  <div className="rounded-xl bg-zinc-50 p-4 text-center text-xs text-slip-dim">
                    ยอดเยี่ยม! ไม่มีรายการอาหารที่ถูกยกเลิกในวันทำการนี้
                  </div>
                ) : (
                  <div className="divide-y divide-rule border border-rule rounded-xl overflow-hidden text-xs">
                    {report.voidReasons.map((v) => (
                      <div key={v.reason} className="flex items-center justify-between p-3 hover:bg-zinc-50/60">
                        <div>
                          <span className="font-semibold text-slip">{v.reason}</span>
                          <p className="text-xs text-slip-dim mt-0.5">จำนวน {v.count} ครั้ง</p>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-red-600 num">-฿{formatBaht(v.total)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Close Business Day (Z-Report) Modal */}
      <Modal
        title="ปิดยอดประจำวัน (Z-Report)"
        open={closeModalOpen}
        onClose={() => setCloseModalOpen(false)}
        maxWidth="max-w-md"
      >
        {report && (
          <div className="flex flex-col gap-4 text-sm">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 leading-relaxed">
              เมื่อกดยืนยัน ตัวเลขของวันทำการ{' '}
              <strong>{formatThaiDate(report.businessDate)}</strong> จะถูกบันทึกถาวร
              แก้ไขภายหลังไม่ได้ และจะรับชำระเงินเพิ่มในวันทำการนี้ไม่ได้อีก
            </div>

            <div className="divide-y divide-rule rounded-xl border border-rule overflow-hidden">
              <div className="flex items-center justify-between p-3">
                <span className="text-xs text-slip-dim">ยอดขายสุทธิ</span>
                <span className="num font-bold text-slip">฿{formatBaht(report.totalRevenue)}</span>
              </div>
              <div className="flex items-center justify-between p-3">
                <span className="text-xs text-slip-dim">จำนวนบิลที่ปิดแล้ว</span>
                <span className="num font-bold text-slip">{report.totalBills} บิล</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-emerald-50/60">
                <span className="text-xs font-semibold text-emerald-900">
                  เงินสดตามระบบที่ต้องส่งมอบ
                </span>
                <span className="num font-black text-emerald-900">
                  ฿{formatBaht(report.cashTotal)}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="counted-cash" className="text-sm text-slip-dim">
                เงินสดที่นับได้จริงในลิ้นชัก (ไม่บังคับ)
              </label>
              <input
                id="counted-cash"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={countedCashInput}
                onChange={(e) => setCountedCashInput(e.target.value)}
                placeholder="เช่น 12450.00"
                className="num min-h-[44px] w-full rounded-lg bg-char px-3 text-slip placeholder:text-slip-dim"
              />
              {countedCashInput.trim() !== '' && Number.isFinite(Number(countedCashInput)) && (
                <p className="num text-xs font-bold text-slip">
                  ผลต่างเทียบระบบ:{' '}
                  {describeCashDifference(
                    Number((Number(countedCashInput) - report.cashTotal).toFixed(2)),
                  )}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="close-note" className="text-sm text-slip-dim">
                หมายเหตุการปิดกะ (ไม่บังคับ)
              </label>
              <textarea
                id="close-note"
                rows={2}
                maxLength={255}
                value={closeNote}
                onChange={(e) => setCloseNote(e.target.value)}
                placeholder="เช่น เงินขาดเพราะทอนผิดโต๊ะ B2"
                className="w-full rounded-lg bg-char px-3 py-2 text-slip placeholder:text-slip-dim"
              />
            </div>

            {closeError && (
              <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
                {closeError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-rule pt-4">
              <button
                type="button"
                onClick={() => setCloseModalOpen(false)}
                disabled={isClosing}
                className="rounded-xl border border-rule bg-white px-4 py-2.5 text-xs font-semibold text-slip-dim hover:bg-zinc-50 hover:text-slip disabled:opacity-50 cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleCloseSettlement}
                disabled={isClosing}
                className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
              >
                <LockIcon className="w-4 h-4" />
                <span>{isClosing ? 'กำลังปิดยอด...' : 'ยืนยันปิดยอดประจำวัน'}</span>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
