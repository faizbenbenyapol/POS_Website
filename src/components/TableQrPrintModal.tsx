'use client';

import { useState } from 'react';
import Modal from '@/components/Modal';
import ConfirmModal from '@/components/ConfirmModal';
import { PrintIcon, DownloadIcon, RefreshIcon, CloseIcon } from '@/components/Icons';
import { printHtml } from '@/lib/print';
import { apiFetch } from '@/lib/client';

export type TableQrData = {
  id: number;
  table_no: string;
  seats: number;
  qr_token: string;
};

type TableQrPrintModalProps = {
  table: TableQrData | null;
  qrImage: string;
  tableUrl: string;
  isAdmin?: boolean;
  onClose: () => void;
  onRegenerateSuccess?: (newTable: TableQrData) => void;
};

/**
 * Modal พิมพ์และจัดการ QR Code ของโต๊ะ
 * รองรับทั้งการพิมพ์ป้ายตั้งโต๊ะ (A4/A5 Tent Card) และสลิปสติกเกอร์ (Thermal 80mm)
 * พร้อมปุ่มสร้าง QR ใหม่ (เฉพาะ Admin) และดาวน์โหลดไฟล์ภาพ
 */
export default function TableQrPrintModal({
  table,
  qrImage,
  tableUrl,
  isAdmin = false,
  onClose,
  onRegenerateSuccess,
}: TableQrPrintModalProps) {
  const [printType, setPrintType] = useState<'TENT_CARD' | 'THERMAL_SLIP'>('TENT_CARD');
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateNotice, setRegenerateNotice] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!table) return null;

  /**
   * ส่งคำขอสร้าง QR Token ใหม่หลังกดยืนยันใน ConfirmModal
   */
  async function executeRegenerate() {
    if (!table) return;
    setConfirmOpen(false);
    setRegenerating(true);
    setRegenerateNotice('');
    const result = await apiFetch<{ id: number; tableNo: string; qrToken: string; message: string }>(
      `/api/admin/tables/${table.id}/regenerate-qr`,
      { method: 'POST' },
    );
    setRegenerating(false);

    if (result.ok) {
      setRegenerateNotice('สร้าง QR Code ใหม่สำเร็จ (QR เดิมถูกยกเลิกแล้ว)');
      if (onRegenerateSuccess) {
        onRegenerateSuccess({
          ...table,
          qr_token: result.data.qrToken,
        });
      }
    } else {
      setRegenerateNotice(`เกิดข้อผิดพลาด: ${result.message}`);
    }
  }

  /**
   * สั่งพิมพ์ผ่าน Print Engine อิสระ ป้องกันปัญหาหลุดขอบ 100%
   */
  function handlePrint() {
    if (!table || !qrImage) return;

    if (printType === 'TENT_CARD') {
      const html = `
        <div style="max-width: 420px; margin: 20px auto; padding: 28px; border: 3px solid #059669; border-radius: 20px; text-align: center; background: #ffffff; box-shadow: 0 4px 20px rgba(0,0,0,0.06);">
          <!-- Header ร้าน -->
          <div style="margin-bottom: 16px;">
            <div style="display: inline-block; background: #ecfdf5; color: #059669; font-weight: 700; font-size: 13px; padding: 4px 14px; border-radius: 9999px; margin-bottom: 8px;">
              ครัวบ้านไร่ • Krua Baan Rai
            </div>
            <h1 style="font-size: 26px; font-weight: 800; color: #0f172a; margin: 0; line-height: 1.2;">สแกนสั่งอาหาร</h1>
            <p style="font-size: 13px; color: #64748b; margin-top: 4px;">ไม่ต้องรอเรียกพนักงาน • สั่งได้สะดวก รวดเร็ว</p>
          </div>

          <!-- ป้ายเลขโต๊ะเด่นชัด -->
          <div style="margin: 16px auto; display: inline-block; background: #059669; color: #ffffff; padding: 6px 24px; border-radius: 12px;">
            <span style="font-size: 14px; font-weight: 500;">โต๊ะ</span>
            <span class="num" style="font-size: 32px; font-weight: 900; margin-left: 6px; letter-spacing: -0.02em;">${table.table_no}</span>
          </div>

          <!-- กรอบ QR Code ขนาดใหญ่ -->
          <div style="margin: 12px auto; padding: 12px; background: #f4f4f5; border: 2px dashed #16a34a; border-radius: 16px; width: 260px; height: 260px; display: flex; align-items: center; justify-content: center;">
            <img src="${qrImage}" alt="QR โต๊ะ ${table.table_no}" style="width: 100%; height: 100%; object-fit: contain; border-radius: 8px;" />
          </div>

          <!-- 3 ขั้นตอนง่ายๆ -->
          <div style="margin-top: 20px; text-align: left; background: #fafafa; border: 1px solid #e4e4e7; border-radius: 12px; padding: 14px 16px; font-size: 12px; color: #3f3f46;">
            <div style="display: flex; align-items: center; margin-bottom: 6px;">
              <span style="display: inline-flex; width: 20px; height: 20px; background: #16a34a; color: #ffffff; border-radius: 9999px; font-size: 11px; font-weight: 700; align-items: center; justify-content: center; margin-right: 8px; shrink: 0;">1</span>
              <span>เปิดกล้องมือถือ หรือแอป LINE สแกน QR Code</span>
            </div>
            <div style="display: flex; align-items: center; margin-bottom: 6px;">
              <span style="display: inline-flex; width: 20px; height: 20px; background: #16a34a; color: #ffffff; border-radius: 9999px; font-size: 11px; font-weight: 700; align-items: center; justify-content: center; margin-right: 8px; shrink: 0;">2</span>
              <span>เลือกเมนูอาหารที่ต้องการ พร้อมระบุหมายเหตุ</span>
            </div>
            <div style="display: flex; align-items: center;">
              <span style="display: inline-flex; width: 20px; height: 20px; background: #16a34a; color: #ffffff; border-radius: 9999px; font-size: 11px; font-weight: 700; align-items: center; justify-content: center; margin-right: 8px; shrink: 0;">3</span>
              <span>กดยืนยัน ออเดอร์จะส่งตรงถึงห้องครัวทันที</span>
            </div>
          </div>

          <div style="margin-top: 14px; font-size: 11px; color: #a1a1aa;">
            มีปัญหาการใช้งานหรือต้องการความช่วยเหลือ กดปุ่ม "เรียกพนักงาน" ในหน้าเว็บได้ตลอดเวลา
          </div>
        </div>
      `;
      printHtml(html, { title: `ป้ายตั้งโต๊ะ QR - โต๊ะ ${table.table_no}` });
    } else {
      // Thermal Slip 80mm
      const html = `
        <div style="width: 76mm; margin: 0 auto; padding: 8px 4px; text-align: center; font-family: sans-serif; color: #000000;">
          <h2 style="font-size: 16px; font-weight: 800; margin-bottom: 2px;">ครัวบ้านไร่</h2>
          <p style="font-size: 11px; margin-bottom: 8px;">สแกนเพื่อสั่งอาหารที่โต๊ะ</p>
          <div style="border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 6px 0; margin-bottom: 8px;">
            <span style="font-size: 22px; font-weight: 900;">โต๊ะ ${table.table_no}</span>
          </div>
          <div style="margin: 8px auto; width: 180px; height: 180px;">
            <img src="${qrImage}" alt="QR โต๊ะ ${table.table_no}" style="width: 100%; height: 100%; object-fit: contain;" />
          </div>
          <p style="font-size: 10px; margin-top: 6px;">1. เปิดกล้องสแกน > 2. เลือกอาหาร > 3. ยืนยัน</p>
          <p style="font-size: 9px; color: #666; margin-top: 4px;">ขอบคุณที่มาอุดหนุนครับ/ค่ะ</p>
        </div>
      `;
      printHtml(html, {
        title: `สลิป QR โต๊ะ ${table.table_no}`,
        pageStyle: '@page { margin: 2mm; size: 80mm auto; }',
      });
    }
  }

  return (
    <Modal title={`QR Code ประจำโต๊ะ ${table.table_no}`} open={Boolean(table)} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {regenerateNotice && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-xs font-semibold text-green-700 animate-in fade-in">
            {regenerateNotice}
          </div>
        )}

        {/* ตัวเลือกรูปแบบการพิมพ์ */}
        <div className="flex rounded-xl bg-zinc-100 p-1">
          <button
            type="button"
            onClick={() => setPrintType('TENT_CARD')}
            className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${
              printType === 'TENT_CARD'
                ? 'bg-white text-slip shadow-xs'
                : 'text-slip-dim hover:text-slip'
            }`}
          >
            ป้ายตั้งโต๊ะ (A4/A5)
          </button>
          <button
            type="button"
            onClick={() => setPrintType('THERMAL_SLIP')}
            className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${
              printType === 'THERMAL_SLIP'
                ? 'bg-white text-slip shadow-xs'
                : 'text-slip-dim hover:text-slip'
            }`}
          >
            สลิปสติกเกอร์ (80mm)
          </button>
        </div>

        {/* ตัวอย่างป้ายพรีวิว */}
        <div className="rounded-2xl border border-rule bg-white p-4 shadow-xs">
          <div className="mx-auto flex max-w-[280px] flex-col items-center text-center">
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-800">
              ครัวบ้านไร่
            </span>
            <div className="my-2 rounded-xl bg-slate-900 px-4 py-1.5 text-white shadow-xs">
              <span className="text-xs font-semibold">โต๊ะ </span>
              <span className="num text-2xl font-black">{table.table_no}</span>
            </div>

            {qrImage ? (
              <div className="my-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5 shadow-xs">
                <img
                  src={qrImage}
                  alt={`QR โต๊ะ ${table.table_no}`}
                  className="h-48 w-48 object-contain"
                />
              </div>
            ) : (
              <div className="my-2 h-48 w-48 animate-pulse rounded-xl bg-zinc-100" />
            )}

            <p className="text-xs font-medium text-slip">สแกน QR เพื่อดูเมนูและสั่งอาหาร</p>
            <p className="num mt-1 max-w-full truncate text-[10px] text-zinc-400">{tableUrl}</p>
          </div>
        </div>

        {/* ปุ่มเครื่องมือและการกระทำ */}
        <div className="flex flex-col gap-2.5">
          {/* แถวเครื่องมือสร้างใหม่ & ดาวน์โหลด */}
          <div className="flex items-center justify-between gap-2">
            {isAdmin ? (
              <button
                type="button"
                disabled={regenerating}
                onClick={() => setConfirmOpen(true)}
                className="flex min-h-[40px] items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 text-xs font-bold text-amber-800 transition-all hover:bg-amber-100 disabled:opacity-50 active:scale-95 shadow-xs cursor-pointer"
                title="สร้าง QR Token ใหม่ ป้องกันลูกค้าเก่านำรูปไปแอบสแกนสั่งอาหาร (เฉพาะแอดมิน)"
              >
                <RefreshIcon className={`w-4 h-4 ${regenerating ? 'animate-spin' : ''}`} />
                <span>{regenerating ? 'กำลังสร้าง…' : 'สร้าง QR Code ใหม่'}</span>
              </button>
            ) : (
              <span className="text-[11px] text-slip-dim">
                * พนักงานสามารถดู/พิมพ์ QR ได้ (การสร้าง QR ใหม่สงวนสิทธิ์ผู้ดูแลระบบ)
              </span>
            )}

            <a
              href={qrImage || '#'}
              download={`table-${table.table_no}-qr.png`}
              className="flex min-h-[40px] items-center gap-1.5 rounded-xl border border-rule bg-white px-3.5 text-xs font-bold text-slip transition-all hover:bg-zinc-50 active:scale-95 shadow-xs"
            >
              <DownloadIcon className="w-4 h-4 text-zinc-600" />
              <span>ดาวน์โหลดรูปภาพ</span>
            </a>
          </div>

          {/* แถวปุ่มสั่งพิมพ์ & ปิด */}
          <div className="flex items-center justify-end gap-2 border-t border-rule pt-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] rounded-xl bg-char px-4 text-xs font-bold text-slip transition-all hover:bg-rule"
            >
              ปิด
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 font-bold text-sm text-white shadow-xs transition-colors hover:bg-emerald-700 active:scale-98 cursor-pointer"
            >
              <PrintIcon className="w-4 h-4" />
              <span>
                {printType === 'TENT_CARD' ? 'พิมพ์ป้ายตั้งโต๊ะ (A4/A5)' : 'พิมพ์สลิปติดโต๊ะ (80mm)'}
              </span>
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="ยืนยันสร้าง QR Code ใหม่"
        message={`ยืนยันสร้าง QR Code ใหม่สำหรับโต๊ะ ${table.table_no} ใช่หรือไม่?\n\nเมื่อสร้างใหม่แล้ว ป้ายหรือรูป QR เดิมจะไม่สามารถใช้สแกนสั่งอาหารได้อีก รอบการสั่งที่ค้างอยู่จะถูกปิดเพื่อเริ่มรอบใหม่ที่ปลอดภัย`}
        confirmText="ยืนยันสร้าง QR ใหม่"
        tone="warning"
        loading={regenerating}
        onConfirm={executeRegenerate}
        onClose={() => setConfirmOpen(false)}
      />
    </Modal>
  );
}
