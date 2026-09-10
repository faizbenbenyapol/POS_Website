'use client';

import { useCallback, useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import { TableSkeleton, EmptyState, ErrorState, Notice } from '@/components/DataState';
import { SelectField, TextField, CheckboxField, FormActions } from '@/components/Field';
import { apiFetch, jsonBody } from '@/lib/client';
import { formatThaiDateTime } from '@/lib/format';
import { PlusIcon } from '@/components/Icons';
import {
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
} from '@/lib/ticket';

/** เรื่องแจ้งปัญหา 1 เรื่องตามที่ GET /api/admin/tickets คืนมา */
type Ticket = {
  id: number;
  ticket_code: string;
  source: string;
  table_no: string | null;
  created_by_name: string | null;
  assigned_to: number | null;
  assigned_to_name: string | null;
  category: string;
  subject: string;
  detail: string;
  priority: string;
  status: string;
  created_at: string;
  updated_at: string;
};

/** ข้อความในไทม์ไลน์ของเรื่อง */
type TicketReply = {
  id: number;
  ticket_id: number;
  user_name: string | null;
  message: string;
  created_at: string;
};

/** ผู้ใช้ที่มอบหมายงานให้ได้ */
type Assignee = { id: number; full_name: string; is_active: number };

/** สีกำกับความเร่งด่วน มีข้อความกำกับเสมอ ไม่สื่อความหมายด้วยสีอย่างเดียว */
const PRIORITY_CLASS: Record<string, string> = {
  URGENT: 'bg-void/10 text-void',
  NORMAL: 'bg-char text-slip-dim',
  LOW: 'bg-char text-slip-dim',
};

/** ตัวเลือกกรองสถานะ */
const STATUS_FILTERS = [
  { value: '', label: 'ทุกสถานะ' },
  ...Object.entries(TICKET_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

/** ตัวเลือกกรองความเร่งด่วน */
const PRIORITY_FILTERS = [
  { value: '', label: 'ทุกระดับ' },
  ...Object.entries(TICKET_PRIORITY_LABELS).map(([value, label]) => ({ value, label })),
];

/** ตัวเลือกสถานะในหน้ารายละเอียด */
const STATUS_OPTIONS = Object.entries(TICKET_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}));

/** ตัวเลือกหมวดปัญหาและความเร่งด่วนสำหรับฟอร์มเปิดเรื่องของพนักงาน */
const CATEGORY_OPTIONS = Object.entries(TICKET_CATEGORY_LABELS).map(([value, label]) => ({
  value,
  label,
}));
const PRIORITY_OPTIONS = Object.entries(TICKET_PRIORITY_LABELS).map(([value, label]) => ({
  value,
  label,
}));

/** ค่าตั้งต้นของฟอร์มเปิดเรื่องใหม่จากฝั่งพนักงาน */
const EMPTY_FORM = {
  category: 'SYSTEM',
  subject: '',
  detail: '',
  priority: 'NORMAL',
};

/** ระยะเวลาระหว่างการดึงรายการใหม่ ให้ตรงกับกระดานออเดอร์เพื่อให้เห็นปุ่มเรียกพนักงาน/ขอเช็คบิลจากลูกค้าไว */
const POLL_INTERVAL_MS = 10000;

/**
 * หน้าจัดการเรื่องแจ้งปัญหา แสดงรายการพร้อมตัวกรอง และเปิดดูรายละเอียดพร้อมกล่องตอบกลับ
 * ไทม์ไลน์ในหน้ารายละเอียดรวมทั้งคำตอบของพนักงานและบันทึกการเปลี่ยนสถานะเรียงตามเวลา
 *
 * @returns หน้าจอรายการ ticket พร้อม modal รายละเอียดและ modal เปิดเรื่องใหม่
 */
export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [replies, setReplies] = useState<TicketReply[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string }>({
    tone: 'success',
    message: '',
  });
  const [detailId, setDetailId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState('');
  const [working, setWorking] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');

  /**
   * โหลดเรื่องแจ้งปัญหาตามตัวกรองปัจจุบัน
   *
   * @param showSkeleton - true ตอนเปิดหน้าหรือเปลี่ยนตัวกรอง ให้โชว์โครงร่าง
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือปรับ state ของรายการและไทม์ไลน์
   */
  const load = useCallback(
    async (showSkeleton: boolean) => {
      if (showSkeleton) {
        setTickets(null);
        setLoadError('');
      }
      const params = new URLSearchParams({ status: statusFilter, priority: priorityFilter });
      const result = await apiFetch<{ tickets: Ticket[]; replies: TicketReply[] }>(
        `/api/admin/tickets?${params.toString()}`,
      );
      if (!result.ok) {
        if (showSkeleton) setLoadError(result.message);
        return;
      }
      setTickets(result.data.tickets);
      setReplies(result.data.replies);
    },
    [statusFilter, priorityFilter],
  );

  useEffect(() => {
    load(true);
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => load(false), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    /**
     * โหลดรายชื่อผู้ใช้ไว้ให้เลือกเป็นผู้รับผิดชอบ
     * ถ้าบัญชีที่ใช้อยู่เป็นพนักงานจะเรียกไม่ได้ (endpoint นี้ให้เฉพาะแอดมิน)
     * กรณีนั้นช่องมอบหมายจะเหลือแค่ตัวเลือก "ยังไม่มอบหมาย"
     *
     * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือปรับ state ของรายชื่อผู้รับผิดชอบ
     */
    async function loadAssignees() {
      const result = await apiFetch<Assignee[]>('/api/admin/users');
      if (result.ok) setAssignees(result.data.filter((user) => user.is_active === 1));
    }
    loadAssignees();
  }, []);

  const detail = tickets?.find((ticket) => ticket.id === detailId) ?? null;
  const detailReplies = replies.filter((reply) => reply.ticket_id === detailId);

  /**
   * เปลี่ยนสถานะหรือผู้รับผิดชอบของเรื่องที่กำลังเปิดดูอยู่
   *
   * @param status - สถานะใหม่
   * @param assignedTo - id ผู้รับผิดชอบ ใส่ 0 เมื่อยังไม่มอบหมาย
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือบันทึกลงฐานข้อมูลและรีโหลดรายการ
   */
  async function updateTicket(status: string, assignedTo: number) {
    if (!detail) return;
    setWorking(true);
    const result = await apiFetch(`/api/admin/tickets/${detail.id}`, {
      method: 'PATCH',
      body: jsonBody({ status, assignedTo }),
    });
    setWorking(false);
    if (!result.ok) {
      setNotice({ tone: 'error', message: result.message });
      return;
    }
    load(false);
  }

  /**
   * ส่งข้อความตอบกลับในเรื่องที่กำลังเปิดดูอยู่
   *
   * @param event - เหตุการณ์ submit ใช้ยกเลิกการรีโหลดหน้า
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือบันทึกข้อความและรีโหลดไทม์ไลน์
   */
  async function handleReply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    setWorking(true);
    const result = await apiFetch(`/api/admin/tickets/${detail.id}/replies`, {
      method: 'POST',
      body: jsonBody({ message: replyText }),
    });
    setWorking(false);
    if (!result.ok) {
      setNotice({ tone: 'error', message: result.message });
      return;
    }
    setReplyText('');
    load(false);
  }

  /**
   * เปิดเรื่องแจ้งปัญหาใหม่จากฝั่งพนักงาน
   *
   * @param event - เหตุการณ์ submit ใช้ยกเลิกการรีโหลดหน้า
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือสร้าง ticket และรีโหลดรายการ
   */
  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setFormError('');
    const result = await apiFetch<{ ticketCode: string }>('/api/admin/tickets', {
      method: 'POST',
      body: jsonBody({ ...form, tableId: 0 }),
    });
    setWorking(false);
    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    setCreateOpen(false);
    setForm(EMPTY_FORM);
    setNotice({ tone: 'success', message: `เปิดเรื่องใหม่แล้ว รหัส ${result.data.ticketCode}` });
    load(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slip">เรื่องแจ้งปัญหา</h1>
          <p className="text-slip-dim">
            เรื่องเร่งด่วนถูกเรียงขึ้นบนสุดเสมอ · อัปเดตอัตโนมัติทุก 10 วินาที
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setForm(EMPTY_FORM);
            setFormError('');
            setCreateOpen(true);
          }}
          className="min-h-[44px] rounded-xl bg-[#06C755] px-4 font-bold text-sm text-white shadow-md shadow-[#06C755]/20 transition-all hover:bg-[#00A040] flex items-center gap-1.5"
        >
          <PlusIcon className="w-4 h-4" />
          <span>เปิดเรื่องใหม่</span>
        </button>
      </div>

      <div className="flex flex-wrap gap-3 rounded-lg bg-griddle px-3 py-3 shadow-sm">
        <div className="min-w-[12rem] flex-1">
          <SelectField
            id="ticket-status-filter"
            label="กรองตามสถานะ"
            value={statusFilter}
            onChange={setStatusFilter}
            options={STATUS_FILTERS}
          />
        </div>
        <div className="min-w-[12rem] flex-1">
          <SelectField
            id="ticket-priority-filter"
            label="กรองตามความเร่งด่วน"
            value={priorityFilter}
            onChange={setPriorityFilter}
            options={PRIORITY_FILTERS}
          />
        </div>
      </div>

      <Notice
        tone={notice.tone}
        message={notice.message}
        onDismiss={() => setNotice({ tone: 'success', message: '' })}
      />

      {loadError && <ErrorState message={loadError} onRetry={() => load(true)} />}
      {!loadError && tickets === null && <TableSkeleton rows={4} />}
      {!loadError && tickets !== null && tickets.length === 0 && (
        <EmptyState
          message={
            statusFilter || priorityFilter
              ? 'ไม่มีเรื่องที่ตรงกับตัวกรองนี้ — ลองล้างตัวกรองเพื่อดูทั้งหมด'
              : 'ยังไม่มีเรื่องแจ้งปัญหา — ถ้าพบปัญหาในระบบ กดปุ่มเปิดเรื่องใหม่เพื่อบันทึกไว้'
          }
        />
      )}

      {!loadError && tickets !== null && tickets.length > 0 && (
        <ul className="flex flex-col gap-3">
          {tickets.map((ticket) => (
            <li key={ticket.id} className="overflow-hidden rounded-lg bg-griddle shadow-sm">
              <button
                type="button"
                onClick={() => {
                  setDetailId(ticket.id);
                  setReplyText('');
                }}
                className="w-full p-3 text-left"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="num text-sm text-slip-dim">{ticket.ticket_code}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-sm ${
                      PRIORITY_CLASS[ticket.priority] ?? 'bg-char text-slip-dim'
                    }`}
                  >
                    {TICKET_PRIORITY_LABELS[ticket.priority]}
                  </span>
                  <span className="rounded-full bg-char px-2 py-0.5 text-sm text-slip-dim">
                    {TICKET_STATUS_LABELS[ticket.status]}
                  </span>
                  <span className="num ml-auto text-sm text-slip-dim">
                    {formatThaiDateTime(ticket.created_at)}
                  </span>
                </div>
                <p className="mt-1 text-slip">{ticket.subject}</p>
                <p className="text-sm text-slip-dim">
                  {TICKET_CATEGORY_LABELS[ticket.category]} ·{' '}
                  {ticket.source === 'CUSTOMER'
                    ? `ลูกค้าโต๊ะ ${ticket.table_no ?? '-'}`
                    : `พนักงาน ${ticket.created_by_name ?? '-'}`}
                  {ticket.assigned_to_name ? ` · รับผิดชอบ: ${ticket.assigned_to_name}` : ''}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal
        title={detail ? `${detail.ticket_code} · ${detail.subject}` : 'รายละเอียดเรื่อง'}
        open={detail !== null}
        onClose={() => setDetailId(null)}
      >
        {detail && (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg bg-char px-3 py-2">
              <p className="text-sm text-slip-dim">
                {TICKET_CATEGORY_LABELS[detail.category]} ·{' '}
                {TICKET_PRIORITY_LABELS[detail.priority]} ·{' '}
                {detail.source === 'CUSTOMER'
                  ? `ลูกค้าโต๊ะ ${detail.table_no ?? '-'}`
                  : `พนักงาน ${detail.created_by_name ?? '-'}`}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-slip">{detail.detail}</p>
              <p className="num mt-1 text-sm text-slip-dim">
                แจ้งเมื่อ {formatThaiDateTime(detail.created_at)}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="min-w-[10rem] flex-1">
                <SelectField
                  id="ticket-detail-status"
                  label="สถานะ"
                  value={detail.status}
                  onChange={(value) => updateTicket(value, detail.assigned_to ?? 0)}
                  options={STATUS_OPTIONS}
                />
              </div>
              <div className="min-w-[10rem] flex-1">
                <SelectField
                  id="ticket-detail-assignee"
                  label="ผู้รับผิดชอบ"
                  value={String(detail.assigned_to ?? 0)}
                  onChange={(value) => updateTicket(detail.status, Number(value))}
                  options={[
                    { value: '0', label: 'ยังไม่มอบหมาย' },
                    ...assignees.map((user) => ({
                      value: String(user.id),
                      label: user.full_name,
                    })),
                  ]}
                />
              </div>
            </div>

            <section>
              <h3 className="font-medium text-slip">ลำดับเหตุการณ์</h3>
              {detailReplies.length === 0 ? (
                <p className="text-slip-dim">ยังไม่มีความเคลื่อนไหว — ตอบกลับด้านล่างได้เลย</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {detailReplies.map((reply) => (
                    <li key={reply.id} className="rounded-lg bg-char p-3">
                      <p className="num text-sm text-slip-dim">
                        {formatThaiDateTime(reply.created_at)} · {reply.user_name ?? 'ลูกค้า'}
                      </p>
                      <p className="whitespace-pre-wrap text-slip">{reply.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {detail.status !== 'CLOSED' && (
              <form onSubmit={handleReply} className="flex flex-col gap-2">
                <label htmlFor="ticket-reply" className="text-sm text-slip-dim">
                  ตอบกลับ
                </label>
                <textarea
                  id="ticket-reply"
                  value={replyText}
                  onChange={(event) => setReplyText(event.target.value)}
                  rows={3}
                  placeholder="เช่น รับเรื่องแล้ว กำลังให้ครัวเร่งจานนี้ให้"
                  className="w-full rounded-lg bg-char px-3 py-2 text-slip placeholder:text-slip-dim"
                />
                <button
                  type="submit"
                  disabled={working}
                  className="min-h-[44px] self-end rounded-xl bg-[#06C755] px-5 font-bold text-sm text-white shadow-md shadow-[#06C755]/20 transition-all hover:bg-[#00A040] disabled:opacity-60"
                >
                  {working ? 'กำลังส่ง…' : 'ส่งคำตอบ'}
                </button>
              </form>
            )}
          </div>
        )}
      </Modal>

      <Modal title="เปิดเรื่องแจ้งปัญหาใหม่" open={createOpen} onClose={() => setCreateOpen(false)}>
        <form onSubmit={handleCreate} className="flex flex-col gap-4" noValidate>
          <SelectField
            id="new-ticket-category"
            label="หมวดปัญหา"
            value={form.category}
            onChange={(value) => setForm({ ...form, category: value })}
            options={CATEGORY_OPTIONS}
          />
          <SelectField
            id="new-ticket-priority"
            label="ความเร่งด่วน"
            value={form.priority}
            onChange={(value) => setForm({ ...form, priority: value })}
            options={PRIORITY_OPTIONS}
          />
          <TextField
            id="new-ticket-subject"
            label="หัวข้อ"
            value={form.subject}
            onChange={(value) => setForm({ ...form, subject: value })}
            placeholder="เช่น เครื่องพิมพ์ในครัวไม่ทำงาน"
          />
          <div className="flex flex-col gap-2">
            <label htmlFor="new-ticket-detail" className="text-sm text-slip-dim">
              รายละเอียด
            </label>
            <textarea
              id="new-ticket-detail"
              value={form.detail}
              onChange={(event) => setForm({ ...form, detail: event.target.value })}
              rows={4}
              className="w-full rounded-lg bg-char px-3 py-2 text-slip"
            />
          </div>
          <FormActions
            error={formError}
            saving={working}
            onCancel={() => setCreateOpen(false)}
            submitLabel="เปิดเรื่อง"
          />
        </form>
      </Modal>
    </div>
  );
}
