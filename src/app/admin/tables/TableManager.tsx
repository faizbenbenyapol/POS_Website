'use client';

import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import Modal from '@/components/Modal';
import { TableSkeleton, EmptyState, ErrorState, Notice } from '@/components/DataState';
import { TextField, NumberField, CheckboxField, FormActions } from '@/components/Field';
import { apiFetch, jsonBody } from '@/lib/client';
import { PlusIcon, DownloadIcon, PrintIcon } from '@/components/Icons';

/** โต๊ะ 1 แถวตามที่ GET /api/admin/tables คืนมา */
type DiningTable = {
  id: number;
  table_no: string;
  seats: number;
  qr_token: string;
  is_active: number;
  session_count: number;
  has_open_session: number;
};

/** ค่าตั้งต้นของฟอร์มตอนกดเพิ่มโต๊ะใหม่ */
const EMPTY_FORM = { tableNo: '', seats: '4', isActive: true };

/** ขนาดภาพ QR เป็นพิกเซล ใหญ่พอให้ปริ้นติดโต๊ะแล้วสแกนติด */
const QR_SIZE = 512;

/**
 * ตัวจัดการโต๊ะทั้งหมด เพิ่ม แก้ไข ลบ และดู/ดาวน์โหลด QR ของแต่ละโต๊ะ
 * สร้างภาพ QR ในเบราว์เซอร์เพื่อไม่ต้องเพิ่ม endpoint นอกเหนือจากที่แผนกำหนด
 *
 * @param baseUrl - ที่อยู่หลักของระบบ ใช้ประกอบเป็นลิงก์ในภาพ QR
 * @returns หน้าจอตารางโต๊ะพร้อม modal ฟอร์มและ modal แสดง QR
 */
export default function TableManager({ baseUrl }: { baseUrl: string }) {
  const [items, setItems] = useState<DiningTable[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string }>({
    tone: 'success',
    message: '',
  });
  const [editing, setEditing] = useState<DiningTable | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [qrTable, setQrTable] = useState<DiningTable | null>(null);
  const [qrImage, setQrImage] = useState('');

  /**
   * ประกอบลิงก์ที่ลูกค้าจะไปถึงเมื่อสแกน QR ของโต๊ะนั้น
   * ถ้ายังไม่ได้ตั้ง APP_BASE_URL จะถอยไปใช้ที่อยู่ของหน้าปัจจุบันแทน
   *
   * @param token - qr_token ประจำโต๊ะ
   * @returns ลิงก์เต็มรูปแบบ เช่น https://ร้าน.example/t/abc123
   */
  const buildTableUrl = useCallback(
    (token: string) => {
      const origin = baseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
      return `${origin}/t/${token}`;
    },
    [baseUrl],
  );

  /**
   * โหลดรายการโต๊ะทั้งหมดใหม่
   *
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือปรับ state ของรายการโต๊ะ
   */
  const load = useCallback(async () => {
    setItems(null);
    setLoadError('');
    const result = await apiFetch<DiningTable[]>('/api/admin/tables');
    if (result.ok) setItems(result.data);
    else setLoadError(result.message);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!qrTable) {
      setQrImage('');
      return;
    }
    // สร้างภาพ QR เป็น data URL เพื่อให้ทั้งแสดงบนจอและกดดาวน์โหลดได้จากภาพเดียวกัน
    QRCode.toDataURL(buildTableUrl(qrTable.qr_token), {
      width: QR_SIZE,
      margin: 2,
      color: { dark: '#121110', light: '#EDE7DC' },
    })
      .then(setQrImage)
      .catch(() => setQrImage(''));
  }, [qrTable, buildTableUrl]);

  /**
   * เปิด modal ในโหมดเพิ่มใหม่หรือแก้ไข
   *
   * @param table - โต๊ะที่จะแก้ไข ถ้าไม่ส่งมาแปลว่าเพิ่มใหม่
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือเปิด modal พร้อมค่าตั้งต้นของฟอร์ม
   */
  function openForm(table?: DiningTable) {
    setEditing(table ?? null);
    setForm(
      table
        ? { tableNo: table.table_no, seats: String(table.seats), isActive: table.is_active === 1 }
        : EMPTY_FORM,
    );
    setFormError('');
    setModalOpen(true);
  }

  /**
   * บันทึกฟอร์มโต๊ะ ตอนสร้างใหม่ระบบจะสร้าง qr_token ให้เองที่ฝั่งเซิร์ฟเวอร์
   *
   * @param event - เหตุการณ์ submit ใช้ยกเลิกการรีโหลดหน้า
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือเขียนข้อมูลลงฐานข้อมูลและรีโหลดตาราง
   */
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    const payload = {
      tableNo: form.tableNo,
      seats: Number(form.seats || 0),
      isActive: form.isActive,
    };
    const result = editing
      ? await apiFetch(`/api/admin/tables/${editing.id}`, { method: 'PUT', body: jsonBody(payload) })
      : await apiFetch('/api/admin/tables', { method: 'POST', body: jsonBody(payload) });
    setSaving(false);

    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    setModalOpen(false);
    setNotice({
      tone: 'success',
      message: editing
        ? 'แก้ไขข้อมูลโต๊ะเรียบร้อยแล้ว'
        : 'เพิ่มโต๊ะใหม่พร้อมสร้าง QR ให้แล้ว กดปุ่ม "ดู QR" เพื่อบันทึกภาพไปติดที่โต๊ะ',
    });
    load();
  }

  /**
   * ลบโต๊ะ ถามยืนยันก่อน และแสดงเหตุผลเมื่อระบบเปลี่ยนเป็นปิดใช้งานแทน
   *
   * @param table - โต๊ะที่จะลบ
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือลบหรือปิดใช้งานแล้วรีโหลดตาราง
   */
  async function handleDelete(table: DiningTable) {
    const confirmed = window.confirm(
      `ต้องการลบโต๊ะ ${table.table_no} ใช่หรือไม่\nถ้าโต๊ะนี้เคยมีลูกค้านั่งแล้ว ระบบจะเปลี่ยนเป็นปิดใช้งานแทนการลบ`,
    );
    if (!confirmed) return;

    const result = await apiFetch<{ mode: string; message: string }>(
      `/api/admin/tables/${table.id}`,
      { method: 'DELETE' },
    );
    setNotice(
      result.ok
        ? { tone: 'success', message: result.data.message }
        : { tone: 'error', message: result.message },
    );
    if (result.ok) load();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slip">โต๊ะและ QR</h1>
          <p className="text-slip-dim">พิมพ์ QR ของแต่ละโต๊ะไปติดไว้ ลูกค้าสแกนแล้วสั่งได้ทันที</p>
        </div>
        <button
          type="button"
          onClick={() => openForm()}
          className="min-h-[44px] rounded-xl bg-[#06C755] px-4 font-bold text-sm text-white shadow-md shadow-[#06C755]/20 transition-all hover:bg-[#00A040] flex items-center gap-1.5"
        >
          <PlusIcon className="w-4 h-4" />
          <span>เพิ่มโต๊ะ</span>
        </button>
      </div>

      <Notice
        tone={notice.tone}
        message={notice.message}
        onDismiss={() => setNotice({ tone: 'success', message: '' })}
      />

      {loadError && <ErrorState message={loadError} onRetry={load} />}
      {!loadError && items === null && <TableSkeleton rows={6} />}
      {!loadError && items !== null && items.length === 0 && (
        <EmptyState
          message="ยังไม่มีโต๊ะในระบบ — เพิ่มโต๊ะแรกเพื่อสร้าง QR ให้ลูกค้าสแกน"
          action={
            <button
              type="button"
              onClick={() => openForm()}
              className="min-h-[44px] rounded-xl bg-[#06C755] px-4 font-bold text-sm text-white shadow-md shadow-[#06C755]/20 transition-all hover:bg-[#00A040] flex items-center gap-1.5"
            >
              <PlusIcon className="w-4 h-4" />
              <span>เพิ่มโต๊ะแรก</span>
            </button>
          }
        />
      )}

      {!loadError && items !== null && items.length > 0 && (
        <div className="overflow-x-auto rounded-lg bg-griddle shadow-sm">
          <table className="w-full min-w-[42rem] border-collapse">
            <thead>
              <tr className="bg-char text-left text-slip-dim">
                <th className="px-3 py-2 font-medium">เลขโต๊ะ</th>
                <th className="px-3 py-2 text-right font-medium">ที่นั่ง</th>
                <th className="px-3 py-2 font-medium">สถานะโต๊ะ</th>
                <th className="px-3 py-2 font-medium">การใช้งาน</th>
                <th className="px-3 py-2 font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {items.map((table) => (
                <tr key={table.id} className="border-b border-rule last:border-b-0">
                  <td className="num px-3 py-2 text-lg text-slip">{table.table_no}</td>
                  <td className="num px-3 py-2 text-right text-slip">{table.seats}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-sm ${
                        table.is_active === 1 ? 'bg-served/10 text-served' : 'bg-char text-slip-dim'
                      }`}
                    >
                      {table.is_active === 1 ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-sm ${
                        table.has_open_session > 0 ? 'bg-waiting/10 text-waiting' : 'bg-char text-slip-dim'
                      }`}
                    >
                      {table.has_open_session > 0 ? 'มีลูกค้านั่งอยู่' : 'ว่าง'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setQrTable(table)}
                        className="rounded-lg border border-rule bg-paper px-3 py-1 text-xs font-semibold text-slip transition-all hover:border-[#06C755] hover:text-[#06C755]"
                      >
                        ดู QR
                      </button>
                      <button
                        type="button"
                        onClick={() => openForm(table)}
                        className="rounded-lg border border-rule bg-paper px-3 py-1 text-xs font-semibold text-slip transition-all hover:border-[#06C755] hover:text-[#06C755]"
                      >
                        แก้ไข
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(table)}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 transition-all hover:bg-red-100"
                      >
                        ลบ
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        title={editing ? `แก้ไขโต๊ะ ${editing.table_no}` : 'เพิ่มโต๊ะใหม่'}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <TextField
            id="table-no"
            label="เลขโต๊ะ"
            value={form.tableNo}
            onChange={(value) => setForm({ ...form, tableNo: value })}
            placeholder="เช่น A1"
            hint={editing ? 'แก้เลขโต๊ะได้ แต่ QR เดิมยังใช้ได้ตามปกติ' : undefined}
          />
          <NumberField
            id="table-seats"
            label="จำนวนที่นั่ง"
            value={form.seats}
            onChange={(value) => setForm({ ...form, seats: value })}
            min={1}
          />
          <CheckboxField
            label="เปิดใช้งาน (ลูกค้าสแกน QR แล้วสั่งได้)"
            checked={form.isActive}
            onChange={(checked) => setForm({ ...form, isActive: checked })}
          />
          <FormActions error={formError} saving={saving} onCancel={() => setModalOpen(false)} />
        </form>
      </Modal>

      <Modal
        title={qrTable ? `QR ของโต๊ะ ${qrTable.table_no}` : 'QR ของโต๊ะ'}
        open={qrTable !== null}
        onClose={() => setQrTable(null)}
      >
        {qrTable && (
          <div className="flex flex-col gap-4">
            <div className="printable-receipt hidden print:block text-center p-6 bg-white border border-gray-300 rounded-xl shadow-lg">
              <h2 className="text-2xl font-black text-gray-900">ยินดีต้อนรับ</h2>
              <p className="text-lg font-bold text-[#06C755] mt-1">โต๊ะ {qrTable.table_no}</p>
              {qrImage && (
                <img
                  src={qrImage}
                  alt={`QR สำหรับโต๊ะ ${qrTable.table_no}`}
                  className="mx-auto my-4 w-64 h-64 border border-gray-200 rounded-xl p-3"
                />
              )}
              <p className="text-sm font-semibold text-gray-700">สแกน QR Code เพื่อดูเมนูและสั่งอาหารได้ทันที</p>
              <p className="text-xs text-gray-500 mt-1">ขอบคุณที่มาอุดหนุนครับ/ค่ะ</p>
            </div>

            {qrImage ? (
              <img
                src={qrImage}
                alt={`QR สำหรับโต๊ะ ${qrTable.table_no}`}
                className="mx-auto w-full max-w-[16rem] rounded-lg bg-char p-2 no-print"
              />
            ) : (
              <div className="mx-auto h-64 w-64 animate-pulse rounded-lg bg-char no-print" />
            )}

            <div className="no-print">
              <p className="text-sm text-slip-dim">ลิงก์ที่อยู่ใน QR</p>
              <p className="num text-sm break-all text-slip">{buildTableUrl(qrTable.qr_token)}</p>
            </div>

            <div className="flex flex-wrap justify-end gap-2 no-print">
              <button
                type="button"
                onClick={() => setQrTable(null)}
                className="min-h-[44px] rounded-lg bg-char px-4 text-slip"
              >
                ปิด
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-rule bg-white px-4 font-bold text-sm text-slip shadow-sm hover:bg-char transition-colors"
              >
                <PrintIcon className="w-4 h-4" />
                <span>พิมพ์ป้ายตั้งโต๊ะ</span>
              </button>
              <a
                href={qrImage || '#'}
                download={`qr-table-${qrTable.table_no}.png`}
                className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#06C755] px-4 font-bold text-sm text-white shadow-md shadow-[#06C755]/20 hover:bg-[#00A040] transition-colors"
              >
                <DownloadIcon className="w-4 h-4" />
                <span>ดาวน์โหลด QR</span>
              </a>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
