'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { SelectField, TextField } from '@/components/Field';
import { apiFetch, jsonBody } from '@/lib/client';
import { TICKET_CATEGORY_LABELS } from '@/lib/ticket';

/** ตัวเลือกหมวดปัญหาสำหรับลูกค้า สร้างจากป้ายกำกับกลางเพื่อให้คำเดียวกันทั้งระบบ */
const CATEGORY_OPTIONS = Object.entries(TICKET_CATEGORY_LABELS).map(([value, label]) => ({
  value,
  label,
}));

/**
 * หน้าแจ้งปัญหาของลูกค้า ฟอร์มสั้น 3 ช่องตามหัวข้อ 9
 * เมื่อส่งสำเร็จจะแสดงรหัส ticket ตัวใหญ่ให้ลูกค้าจดหรือถ่ายรูปเก็บไว้
 *
 * @param params - พารามิเตอร์เส้นทางที่มี token ของโต๊ะ
 * @returns ฟอร์มแจ้งปัญหา หรือหน้ายืนยันพร้อมรหัสเรื่อง
 */
export default function CustomerTicketPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [category, setCategory] = useState('ORDER');
  const [subject, setSubject] = useState('');
  const [detail, setDetail] = useState('');
  const [ticketCode, setTicketCode] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  /**
   * ส่งเรื่องแจ้งปัญหาไปที่ร้าน แล้วเก็บรหัสที่ได้กลับมาแสดงให้ลูกค้า
   *
   * @param event - เหตุการณ์ submit ใช้ยกเลิกการรีโหลดหน้า
   * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือสร้าง ticket และเปลี่ยนหน้าจอเป็นหน้ายืนยัน
   */
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage('');
    const result = await apiFetch<{ ticketCode: string }>('/api/public/tickets', {
      method: 'POST',
      body: jsonBody({ token, category, subject, detail }),
    });
    setSubmitting(false);

    if (!result.ok) {
      setErrorMessage(result.message);
      return;
    }
    setTicketCode(result.data.ticketCode);
  }

  if (ticketCode) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-slip">ส่งเรื่องให้ร้านแล้ว</h1>
        <div className="rounded-lg bg-griddle p-4 shadow-sm">
          <p className="text-slip-dim">รหัสเรื่องของคุณ</p>
          <p className="num text-3xl font-semibold text-flame">{ticketCode}</p>
          <p className="mt-2 text-slip-dim">
            เก็บรหัสนี้ไว้แจ้งพนักงานได้เลย พนักงานจะเห็นเรื่องนี้ที่หน้าจอหลังร้านทันที
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setTicketCode('');
              setSubject('');
              setDetail('');
            }}
            className="min-h-[44px] rounded-lg bg-griddle px-4 text-slip shadow-sm"
          >
            แจ้งเรื่องอื่นอีก
          </button>
          <Link
            href={`/t/${token}`}
            className="flex min-h-[44px] items-center rounded-lg bg-flame px-4 font-medium text-char"
          >
            กลับไปหน้าเมนู
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div>
        <h1 className="text-xl font-semibold text-slip">แจ้งปัญหา</h1>
        <p className="text-slip-dim">บอกเราสั้น ๆ ได้เลย พนักงานจะเห็นทันทีที่กดส่ง</p>
      </div>

      <SelectField
        id="ticket-category"
        label="เรื่องที่จะแจ้ง"
        value={category}
        onChange={setCategory}
        options={CATEGORY_OPTIONS}
      />

      <TextField
        id="ticket-subject"
        label="หัวข้อ"
        value={subject}
        onChange={setSubject}
        placeholder="เช่น อาหารยังไม่มา 30 นาทีแล้ว"
      />

      <div className="flex flex-col gap-2">
        <label htmlFor="ticket-detail" className="text-sm text-slip-dim">
          รายละเอียด
        </label>
        <textarea
          id="ticket-detail"
          value={detail}
          onChange={(event) => setDetail(event.target.value)}
          rows={5}
          placeholder="เล่าให้ฟังหน่อยว่าเกิดอะไรขึ้น"
          className="w-full rounded-lg bg-griddle px-3 py-2 text-slip shadow-sm placeholder:text-slip-dim"
        />
      </div>

      {errorMessage && (
        <p role="alert" className="rounded-lg border-l-4 border-void bg-griddle px-3 py-2 text-slip shadow-sm">
          {errorMessage}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="min-h-[52px] rounded-lg bg-flame px-4 font-medium text-char disabled:opacity-60"
      >
        {submitting ? 'กำลังส่ง…' : 'ส่งเรื่องให้ร้าน'}
      </button>
    </form>
  );
}
