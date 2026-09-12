'use client';

import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import Modal from '@/components/Modal';
import ConfirmModal from '@/components/ConfirmModal';
import TableQrPrintModal from '@/components/TableQrPrintModal';
import { TableSkeleton, EmptyState, ErrorState, Notice } from '@/components/DataState';
import { TextField, NumberField, CheckboxField, FormActions } from '@/components/Field';
import { apiFetch, jsonBody } from '@/lib/client';
import { PlusIcon, RefreshIcon, PrintIcon } from '@/components/Icons';

/** โต๊ะ 1 แถวตามที่ GET /api/admin/tables คืนมา */
type DiningTable = {
  id: number;
  branch_id?: number;
  branch_name?: string;
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
 * ตัวจัดการโต๊ะทั้งหมด เพิ่ม แก้ไข ลบ ดู พิมพ์ และสร้าง QR ใหม่ของแต่ละโต๊ะ
 *
 * @param baseUrl - ที่อยู่หลักของระบบ ใช้ประกอบเป็นลิงก์ในภาพ QR
 * @returns หน้าจอตารางโต๊ะพร้อม modal ฟอร์มและ modal พิมพ์ QR
 */
export default function TableManager({ baseUrl }: { baseUrl: string }) {
  const [items, setItems] = useState<DiningTable[] | null>(null);
  const [currentUser, setCurrentUser] = useState<{ role: string; fullName: string } | null>(null);
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
  const [confirmConfig, setConfirmConfig] = useState<{
    open: boolean;
    title: string;
    message: string;
    tone: 'danger' | 'warning';
    onConfirm: () => void;
  } | null>(null);

  /**
   * ประกอบลิงก์ที่ลูกค้าจะไปถึงเมื่อสแกน QR ของโต๊ะนั้น
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
    apiFetch<{ role: string; fullName: string }>('/api/auth/me').then((res) => {
      if (res.ok) setCurrentUser(res.data);
    });
  }, [load]);

  useEffect(() => {
    if (!qrTable) {
      setQrImage('');
      return;
    }
    QRCode.toDataURL(buildTableUrl(qrTable.qr_token), {
      width: QR_SIZE,
      margin: 2,
      color: { dark: '#121110', light: '#FFFFFF' },
    })
      .then(setQrImage)
      .catch(() => setQrImage(''));
  }, [qrTable, buildTableUrl]);

  /**
   * เปิด modal ในโหมดเพิ่มใหม่หรือแก้ไข (เฉพาะ ADMIN)
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
   * บันทึกฟอร์มโต๊ะ
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
        : 'เพิ่มโต๊ะใหม่พร้อมสร้าง QR ให้แล้ว กดปุ่ม "ดู/พิมพ์ QR" เพื่อพิมพ์ป้ายตั้งโต๊ะ',
    });
    load();
  }

  function handleQuickRegenerate(table: DiningTable) {
    setConfirmConfig({
      open: true,
      title: 'ยืนยันสร้าง QR Code ใหม่',
      message: `ยืนยันสร้าง QR Code ใหม่สำหรับโต๊ะ ${table.table_no} ใช่หรือไม่?\n\n• QR เดิมจะถูกยกเลิกทันที รูปหรือลิงก์เดิมจะไม่สามารถสั่งอาหารได้อีก\n• แนะนำให้กดเมื่อลูกค้าเช็คบิลและเคลียร์โต๊ะเสร็จแล้ว`,
      tone: 'warning',
      onConfirm: async () => {
        setConfirmConfig(null);
        const result = await apiFetch<{ id: number; tableNo: string; qrToken: string; message: string }>(
          `/api/admin/tables/${table.id}/regenerate-qr`,
          { method: 'POST' },
        );

        if (result.ok) {
          setNotice({
            tone: 'success',
            message: result.data.message || `สร้าง QR Code ใหม่สำหรับโต๊ะ ${table.table_no} เรียบร้อยแล้ว`,
          });
          load();
        } else {
          setNotice({ tone: 'error', message: result.message });
        }
      },
    });
  }

  function handleDelete(table: DiningTable) {
    setConfirmConfig({
      open: true,
      title: 'ยืนยันการลบโต๊ะ',
      message: `ต้องการลบโต๊ะ ${table.table_no} ใช่หรือไม่?\nถ้าโต๊ะนี้เคยมีลูกค้านั่งแล้ว ระบบจะเปลี่ยนเป็นปิดใช้งานแทนการลบ เพื่อรักษาประวัติการทำงาน`,
      tone: 'danger',
      onConfirm: async () => {
        setConfirmConfig(null);
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
      },
    });
  }

  const isAdmin = currentUser?.role === 'ADMIN';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slip">โต๊ะและ QR Code</h1>
          <p className="text-xs text-slip-dim">
            พิมพ์ QR Code ไปตั้งหรือติดที่โต๊ะ เพื่อให้ลูกค้าสแกนสั่งอาหารผ่านมือถือได้ทันที
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isAdmin && currentUser && (
            <span className="rounded-full bg-zinc-100 border border-rule px-3 py-1 text-xs text-slip-dim font-medium">
              สิทธิ์พนักงาน: ตรวจสอบโต๊ะ และดู/พิมพ์ QR ได้ (การสร้าง QR ใหม่สงวนสิทธิ์ผู้ดูแลระบบ)
            </span>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={() => openForm()}
              className="min-h-[42px] rounded-xl bg-emerald-600 px-4 font-bold text-xs text-white shadow-xs transition-colors hover:bg-emerald-700 flex items-center gap-1.5 cursor-pointer"
            >
              <PlusIcon className="w-4 h-4" />
              <span>เพิ่มโต๊ะ</span>
            </button>
          )}
        </div>
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
            isAdmin ? (
              <button
                type="button"
                onClick={() => openForm()}
                className="min-h-[44px] rounded-xl bg-emerald-600 px-4 font-bold text-sm text-white shadow-xs transition-colors hover:bg-emerald-700 flex items-center gap-1.5 cursor-pointer"
              >
                <PlusIcon className="w-4 h-4" />
                <span>เพิ่มโต๊ะแรก</span>
              </button>
            ) : undefined
          }
        />
      )}

      {!loadError && items !== null && items.length > 0 && (
        <div className="overflow-x-auto rounded-xl bg-white border border-rule shadow-xs">
          <table className="w-full min-w-[44rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-rule bg-zinc-50/70 text-xs font-bold text-slip-dim">
                <th className="px-4 py-3">เลขโต๊ะ</th>
                <th className="px-4 py-3 text-center">จำนวนที่นั่ง</th>
                <th className="px-4 py-3">สถานะการเปิดรับ</th>
                <th className="px-4 py-3">การใช้งานปัจจุบัน</th>
                <th className="px-4 py-3 text-right">เครื่องมือและการจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule text-xs">
              {items.map((table) => (
                <tr key={table.id} className="hover:bg-zinc-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 font-bold text-sm text-slip">
                      <span className="rounded-md bg-zinc-100 border border-zinc-200 px-2 py-0.5 num">
                        {table.table_no}
                      </span>
                      {table.branch_name && (
                        <span className="text-[11px] font-medium text-zinc-500">
                          {table.branch_name}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="num px-4 py-3 text-center text-slip font-medium">
                    {table.seats} ที่นั่ง
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                        table.is_active === 1
                          ? 'bg-green-50 text-green-700 border border-green-200'
                          : 'bg-zinc-100 text-zinc-500 border border-zinc-200'
                      }`}
                    >
                      {table.is_active === 1 ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        table.has_open_session > 0
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          table.has_open_session > 0 ? 'bg-amber-500' : 'bg-slate-400'
                        }`}
                      />
                      <span>{table.has_open_session > 0 ? 'มีลูกค้านั่ง' : 'ว่าง'}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* ปุ่มดูและพิมพ์ QR Code — มีทั้งป้าย A4/A5 และสลิป 80mm */}
                      <button
                        type="button"
                        onClick={() => setQrTable(table)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 cursor-pointer shadow-xs"
                      >
                        <PrintIcon className="w-3.5 h-3.5 text-slate-500" />
                        <span>ดู / พิมพ์ QR</span>
                      </button>

                      {/* ปุ่มสร้าง QR ใหม่ประจำโต๊ะ (เฉพาะ ADMIN) */}
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleQuickRegenerate(table)}
                          title="สร้าง QR Token ใหม่ ตัดสิทธิ์รูปเดิม ป้องกันแอบสแกนจากนอกร้าน (เฉพาะแอดมิน)"
                          className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-800 transition-all hover:bg-amber-100 active:scale-95 flex items-center gap-1 cursor-pointer"
                        >
                          <RefreshIcon className="w-3.5 h-3.5" />
                          <span>สร้างใหม่</span>
                        </button>
                      )}

                      {/* ปุ่มแก้ไข & ลบ — เฉพาะเจ้าของร้าน (ADMIN) */}
                      {isAdmin && (
                        <>
                          <button
                            type="button"
                            onClick={() => openForm(table)}
                            className="rounded-lg border border-rule bg-white px-2.5 py-1.5 text-xs font-semibold text-slip transition-all hover:border-zinc-300 hover:bg-zinc-50 active:scale-95"
                          >
                            แก้ไข
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(table)}
                            className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition-all hover:bg-red-100 active:scale-95"
                          >
                            ลบ
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal เพิ่ม / แก้ไขโต๊ะ (เฉพาะ ADMIN) */}
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

      {/* Modal พิมพ์ป้าย QR Code ระดับมืออาชีพ (ไม่มีหลุดขอบ) พร้อมสร้าง QR ใหม่ */}
      <TableQrPrintModal
        table={qrTable}
        qrImage={qrImage}
        tableUrl={qrTable ? buildTableUrl(qrTable.qr_token) : ''}
        isAdmin={isAdmin}
        onClose={() => setQrTable(null)}
        onRegenerateSuccess={(updated) => {
          setQrTable((prev) => (prev ? { ...prev, qr_token: updated.qr_token } : null));
          load();
        }}
      />

      {confirmConfig && (
        <ConfirmModal
          open={confirmConfig.open}
          title={confirmConfig.title}
          message={confirmConfig.message}
          tone={confirmConfig.tone}
          onConfirm={confirmConfig.onConfirm}
          onClose={() => setConfirmConfig(null)}
        />
      )}
    </div>
  );
}
