'use client';

import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import Modal from '@/components/Modal';
import { PrintIcon, CheckIcon, UtensilsIcon } from '@/components/Icons';
import { printHtml } from '@/lib/print';
import type { TableQrData } from '@/components/TableQrPrintModal';

type BatchTableQrPrintModalProps = {
  open: boolean;
  onClose: () => void;
  tables: TableQrData[];
  baseUrl: string;
};

/**
 * คอมโพเนนต์ Modal สำหรับพิมพ์ป้าย QR Code ประจำโต๊ะแบบกลุ่ม (Batch Print)
 * รองรับการพิมพ์จัดหน้า A4 Grid (2x2) สำหรับป้ายตั้งโต๊ะ และ 80mm สำหรับเครื่องพิมพ์ความร้อน
 */
export default function BatchTableQrPrintModal({
  open,
  onClose,
  tables,
  baseUrl,
}: BatchTableQrPrintModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [layoutMode, setLayoutMode] = useState<'A4_GRID' | 'THERMAL_80MM'>('A4_GRID');
  const [qrMap, setQrMap] = useState<Record<number, string>>({});
  const [generating, setGenerating] = useState(false);
  const [printing, setPrinting] = useState(false);

  // เริ่มต้นเลือกโต๊ะทั้งหมดที่มี
  useEffect(() => {
    if (open && tables.length > 0) {
      setSelectedIds(new Set(tables.map((t) => t.id)));
    }
  }, [open, tables]);

  // สร้าง QR Code ล่วงหน้าสำหรับโต๊ะทั้งหมด
  useEffect(() => {
    if (!open || tables.length === 0) return;

    let isMounted = true;
    async function generateAllQrs() {
      setGenerating(true);
      const newMap: Record<number, string> = {};

      await Promise.all(
        tables.map(async (table) => {
          try {
            const host = baseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
            const tableUrl = `${host}/t/${table.qr_token}`;
            const dataUrl = await QRCode.toDataURL(tableUrl, {
              width: 320,
              margin: 1,
              color: { dark: '#000000', light: '#ffffff' },
            });
            newMap[table.id] = dataUrl;
          } catch {
            // ละเว้นข้อผิดพลาดเฉพาะโต๊ะ
          }
        }),
      );

      if (isMounted) {
        setQrMap(newMap);
        setGenerating(false);
      }
    }

    generateAllQrs();
    return () => {
      isMounted = false;
    };
  }, [open, tables, baseUrl]);

  if (!open) return null;

  const selectedTables = tables.filter((t) => selectedIds.has(t.id));
  const isAllSelected = selectedTables.length === tables.length && tables.length > 0;

  function toggleSelectAll() {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tables.map((t) => t.id)));
    }
  }

  function toggleTable(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  }

  /**
   * สั่งพิมพ์ผ่าน Print Engine อิสระ ป้องกันหัวกระดาษของเบราว์เซอร์
   */
  function handlePrint() {
    if (selectedTables.length === 0) return;
    setPrinting(true);

    if (layoutMode === 'A4_GRID') {
      // หน้า A4 แบ่ง Grid 2 คอลัมน์สำหรับป้ายพับตั้งโต๊ะ (Tent Cards)
      const html = `
        <style>
          @page {
            size: A4 portrait;
            margin: 12mm 10mm;
          }
          * {
            box-sizing: border-box;
          }
          body {
            margin: 0;
            padding: 0;
            font-family: 'IBM Plex Sans Thai', sans-serif;
            color: #0f172a;
            background: #ffffff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .batch-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12mm 10mm;
          }
          .tent-card {
            border: 2.5px solid #059669;
            border-radius: 18px;
            padding: 16px 14px;
            text-align: center;
            background: #ffffff;
            page-break-inside: avoid;
            break-inside: avoid;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: space-between;
          }
          .branch-badge {
            display: inline-block;
            background: #ecfdf5;
            color: #059669;
            font-weight: 700;
            font-size: 11px;
            padding: 3px 12px;
            border-radius: 9999px;
            margin-bottom: 6px;
          }
          .title {
            font-size: 20px;
            font-weight: 800;
            margin: 0;
            line-height: 1.2;
            color: #0f172a;
          }
          .subtitle {
            font-size: 11px;
            color: #64748b;
            margin: 2px 0 8px 0;
          }
          .table-pill {
            display: inline-block;
            background: #059669;
            color: #ffffff;
            padding: 4px 18px;
            border-radius: 10px;
            margin-bottom: 8px;
          }
          .table-label {
            font-size: 12px;
            font-weight: 600;
          }
          .table-num {
            font-size: 24px;
            font-weight: 900;
            margin-left: 6px;
            font-family: 'IBM Plex Sans Thai', monospace;
          }
          .qr-box {
            background: #f8fafc;
            border: 1.5px dashed #059669;
            border-radius: 14px;
            padding: 8px;
            width: 170px;
            height: 170px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 8px;
          }
          .qr-box img {
            width: 100%;
            height: 100%;
            object-fit: contain;
          }
          .steps-box {
            width: 100%;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 8px 10px;
            font-size: 10px;
            color: #334155;
            text-align: left;
            margin-top: 4px;
          }
          .step-row {
            display: flex;
            align-items: center;
            margin-bottom: 3px;
          }
          .step-num {
            display: inline-flex;
            width: 15px;
            height: 15px;
            background: #059669;
            color: #fff;
            border-radius: 9999px;
            font-size: 9px;
            font-weight: 700;
            align-items: center;
            justify-content: center;
            margin-right: 6px;
            flex-shrink: 0;
          }
          .footer-note {
            font-size: 9px;
            color: #94a3b8;
            margin-top: 6px;
          }
        </style>
        <div class="batch-grid">
          ${selectedTables
            .map((table) => {
              const qr = qrMap[table.id];
              return `
              <div class="tent-card">
                <div>
                  <div class="branch-badge">${table.branch_name ? table.branch_name : 'ครัวบ้านไร่'}</div>
                  <h2 class="title">สแกนสั่งอาหาร</h2>
                  <p class="subtitle">สั่งสะดวก รวดเร็ว ไม่ต้องรอเรียกพนักงาน</p>
                  
                  <div class="table-pill">
                    <span class="table-label">โต๊ะ</span>
                    <span class="table-num">${table.table_no}</span>
                  </div>
                </div>

                <div class="qr-box">
                  ${qr ? `<img src="${qr}" alt="QR โต๊ะ ${table.table_no}" />` : '<div>สร้าง QR...</div>'}
                </div>

                <div class="steps-box">
                  <div class="step-row">
                    <span class="step-num">1</span>
                    <span>เปิดกล้องมือถือหรือ LINE สแกน QR</span>
                  </div>
                  <div class="step-row">
                    <span class="step-num">2</span>
                    <span>เลือกเมนูอาหารและระบุหมายเหตุ</span>
                  </div>
                  <div class="step-row" style="margin-bottom: 0;">
                    <span class="step-num">3</span>
                    <span>กดยืนยันสั่ง ส่งตรงถึงห้องครัวทันที</span>
                  </div>
                </div>

                <div class="footer-note">
                  รองรับ ${table.seats} ที่นั่ง • เรียกพนักงานได้จากหน้าเว็บตลอดเวลา
                </div>
              </div>
            `;
            })
            .join('')}
        </div>
      `;

      printHtml(html, {
        title: `ป้าย QR โต๊ะทั้งหมด (${selectedTables.length} โต๊ะ) - A4`,
        pageStyle: '@page { size: A4 portrait; margin: 12mm 10mm; }',
      });
    } else {
      // สลิปความร้อน 80mm พิมพ์ต่อเนื่องรายโต๊ะ
      const html = `
        <style>
          @page {
            size: 80mm auto;
            margin: 2mm;
          }
          * {
            box-sizing: border-box;
          }
          body {
            margin: 0;
            padding: 0;
            font-family: 'IBM Plex Sans Thai', sans-serif;
            color: #000000;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .slip-item {
            width: 76mm;
            margin: 0 auto;
            padding: 6mm 2mm;
            text-align: center;
            page-break-after: always;
            break-after: page;
          }
          .slip-item:last-child {
            page-break-after: auto;
            break-after: auto;
          }
        </style>
        <div>
          ${selectedTables
            .map((table) => {
              const qr = qrMap[table.id];
              return `
              <div class="slip-item">
                <h2 style="font-size: 16px; font-weight: 800; margin: 0 0 2px 0;">ครัวบ้านไร่</h2>
                ${table.branch_name ? `<p style="font-size: 12px; font-weight: 700; color: #333; margin: 0 0 4px 0;">${table.branch_name}</p>` : ''}
                <p style="font-size: 11px; margin: 0 0 6px 0;">สแกนเพื่อสั่งอาหารที่โต๊ะ</p>
                <div style="border-top: 1.5px dashed #000; border-bottom: 1.5px dashed #000; padding: 6px 0; margin-bottom: 8px;">
                  <span style="font-size: 22px; font-weight: 900;">โต๊ะ ${table.table_no}</span>
                  <div style="font-size: 10px; color: #555;">(รองรับ ${table.seats} ที่นั่ง)</div>
                </div>
                <div style="margin: 6px auto; width: 180px; height: 180px;">
                  ${qr ? `<img src="${qr}" alt="QR โต๊ะ ${table.table_no}" style="width: 100%; height: 100%; object-fit: contain;" />` : ''}
                </div>
                <p style="font-size: 10px; margin: 6px 0 2px 0; font-weight: 600;">1. สแกน QR > 2. เลือกอาหาร > 3. ยืนยัน</p>
                <p style="font-size: 9px; color: #666; margin: 0;">ขอบคุณที่มาอุดหนุนครับ/ค่ะ</p>
              </div>
            `;
            })
            .join('')}
        </div>
      `;

      printHtml(html, {
        title: `สลิป QR โต๊ะทั้งหมด (${selectedTables.length} โต๊ะ) - 80mm`,
        pageStyle: '@page { size: 80mm auto; margin: 2mm; }',
      });
    }

    setPrinting(false);
  }

  return (
    <Modal
      title="พิมพ์ป้าย QR Code ทั้งหมด (Batch Print)"
      open={open}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        {/* เลือกลักษณะกระดาษ */}
        <div className="flex rounded-xl bg-zinc-100 p-1">
          <button
            type="button"
            onClick={() => setLayoutMode('A4_GRID')}
            className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${
              layoutMode === 'A4_GRID'
                ? 'bg-white text-zinc-900 shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            แผ่น A4 (Tent Cards 2x2 ต่อหน้า)
          </button>
          <button
            type="button"
            onClick={() => setLayoutMode('THERMAL_80MM')}
            className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${
              layoutMode === 'THERMAL_80MM'
                ? 'bg-white text-zinc-900 shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            ม้วนความร้อน 80mm (แยกใบต่อโต๊ะ)
          </button>
        </div>

        {/* แถบควบคุมการเลือกโต๊ะ */}
        <div className="flex items-center justify-between border-b border-rule pb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-800">เลือกโต๊ะที่ต้องการพิมพ์</span>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
              เลือก {selectedTables.length} จาก {tables.length} โต๊ะ
            </span>
          </div>
          <button
            type="button"
            onClick={toggleSelectAll}
            className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
          >
            {isAllSelected ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
          </button>
        </div>

        {/* รายการชิปโต๊ะให้คลิกเลือก */}
        <div className="max-h-48 overflow-y-auto rounded-xl border border-rule bg-slate-50/50 p-2.5">
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {tables.map((table) => {
              const isSelected = selectedIds.has(table.id);
              return (
                <button
                  key={table.id}
                  type="button"
                  onClick={() => toggleTable(table.id)}
                  className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-900 shadow-2xs'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-1">
                    <UtensilsIcon className="w-3 h-3 text-slate-400" />
                    <span>โต๊ะ {table.table_no}</span>
                  </span>
                  {isSelected && (
                    <span className="rounded-full bg-emerald-600 text-white p-0.5">
                      <CheckIcon className="w-2.5 h-2.5" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ข้อความช่วยเหลือและสถานะโหลด QR */}
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 flex items-center justify-between">
          <div>
            <p className="font-semibold text-slate-800">
              {layoutMode === 'A4_GRID'
                ? 'ป้ายตั้งโต๊ะ A4: พิมพ์ 4 โต๊ะต่อแผ่น (ตัดตามรอยแล้วพับหรือใส่กรอบอะคริลิก)'
                : 'สลิปความร้อน 80mm: เครื่องพิมพ์จะตัดหรือเว้นระยะกระดาษแยกแต่ละโต๊ะอย่างสวยงาม'}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              ระบบใช้ Print Engine อิสระ ไร้แถบ URL หรือหัวกระดาษของเบราว์เซอร์
            </p>
          </div>
          {generating && (
            <span className="text-[11px] text-amber-600 animate-pulse font-medium">
              กำลังสร้าง QR...
            </span>
          )}
        </div>

        {/* ปุ่มกดยกเลิกและสั่งพิมพ์ */}
        <div className="flex justify-end gap-2 border-t border-rule pt-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-xl bg-char px-4 text-xs font-bold text-slip hover:bg-zinc-200 transition-colors"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={selectedTables.length === 0 || generating || printing}
            onClick={handlePrint}
            className="flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-600 px-5 font-bold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <PrintIcon className="w-4 h-4" />
            <span>
              {printing
                ? 'กำลังส่งพิมพ์…'
                : `พิมพ์ QR ทั้ง ${selectedTables.length} โต๊ะ`}
            </span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
