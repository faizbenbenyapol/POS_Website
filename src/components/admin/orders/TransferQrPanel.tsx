'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import PromptPayQR from '@/components/PromptPayQR';
import { apiFetch, jsonBody } from '@/lib/client';
import { formatBaht } from '@/lib/format';
import { roundBaht } from '@/lib/billing';
import type { ClientPaymentRequest } from '@/lib/payments/requests';

/** ความถี่ในการถามสถานะระหว่างรอลูกค้าโอน หน่วยมิลลิวินาที */
const POLL_INTERVAL_MS = 3000;

/**
 * แผงรับเงินโอนผ่าน QR ของแถวชำระเงิน 1 แถวในหน้าปิดบิล
 *
 * ขั้นตอน: สร้าง QR ตามยอด -> ลูกค้าสแกนโอน -> รอสถานะ "ได้รับเงินแล้ว" -> ผูก QR เข้ากับแถวชำระเงิน
 * สถานะได้รับเงินมาจากผู้ให้บริการแจ้งกลับเอง หรือจากแคชเชียร์ที่เช็คแอปธนาคารแล้วกดยืนยัน
 * (แล้วแต่ผู้ให้บริการที่ตั้งไว้ใน PAYMENT_PROVIDER) ปิดบิลได้เมื่อทุกแถวโอนเงินได้รับเงินแล้วเท่านั้น
 *
 * ถ้าแคชเชียร์แก้ยอดหลังสร้าง QR แล้ว QR เดิมใช้ไม่ได้อีก ต้องสร้างใหม่ตามยอดใหม่
 *
 * @param sessionId - รอบการนั่งที่กำลังปิดบิล
 * @param amount - ยอดที่ตัดเข้าช่องทางโอนเงินของแถวนี้
 * @param onConfirmedChange - แจ้งหน้าแม่ว่าแถวนี้ผูกกับคำขอรับเงินที่จ่ายแล้วหรือยัง (id หรือ null)
 * @returns แผงสร้าง QR และติดตามสถานะการโอน
 */
export default function TransferQrPanel({
  sessionId,
  amount,
  onConfirmedChange,
}: {
  sessionId: number;
  amount: number;
  onConfirmedChange: (paymentRequestId: number | null) => void;
}) {
  const [request, setRequest] = useState<ClientPaymentRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const notifyRef = useRef(onConfirmedChange);
  notifyRef.current = onConfirmedChange;

  const stale = request !== null && roundBaht(request.amount) !== roundBaht(amount);
  const paid = request !== null && !stale && request.status === 'PAID' && !request.used;

  // แจ้งหน้าแม่ทุกครั้งที่สถานะการยืนยันเปลี่ยน ยอดเปลี่ยนหลังจ่ายแล้วถือว่ายังไม่ได้รับเงินตามยอดใหม่
  useEffect(() => {
    notifyRef.current(paid ? request!.id : null);
  }, [paid, request]);

  // ถามสถานะซ้ำระหว่างรอลูกค้าโอน หยุดเมื่อจ่ายแล้ว หมดอายุ หรือยอดเปลี่ยน
  useEffect(() => {
    if (!request || stale || request.status !== 'PENDING') return;
    const timer = window.setInterval(async () => {
      const res = await apiFetch<ClientPaymentRequest>(`/api/admin/payment-requests/${request.id}`);
      if (res.ok) setRequest(res.data);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [request, stale]);

  /**
   * ขอ QR ใหม่ตามยอดปัจจุบันของแถวนี้
   *
   * @returns ไม่คืนค่า มีผลข้างเคียงคือสร้างคำขอรับเงินในฐานข้อมูลและแสดง QR
   */
  const createRequest = useCallback(async () => {
    setBusy(true);
    setError('');
    const res = await apiFetch<ClientPaymentRequest>(`/api/admin/sessions/${sessionId}/payment-requests`, {
      method: 'POST',
      body: jsonBody({ amount }),
    });
    setBusy(false);
    if (res.ok) setRequest(res.data);
    else setError(res.message);
  }, [sessionId, amount]);

  /**
   * ยืนยันว่าได้รับเงินแล้ว หรือจำลองว่าลูกค้าโอนแล้ว (ใช้ทดสอบ)
   *
   * @param action - CONFIRM เมื่อแคชเชียร์เห็นเงินเข้าในแอปธนาคาร SIMULATE เมื่อทดสอบระบบ
   * @returns ไม่คืนค่า มีผลข้างเคียงคือเปลี่ยนสถานะคำขอรับเงิน
   */
  async function act(action: 'CONFIRM' | 'SIMULATE') {
    if (!request) return;
    setBusy(true);
    setError('');
    const res = await apiFetch<ClientPaymentRequest>(`/api/admin/payment-requests/${request.id}`, {
      method: 'POST',
      body: jsonBody({ action }),
    });
    setBusy(false);
    if (res.ok) setRequest(res.data);
    else setError(res.message);
  }

  if (amount <= 0) {
    return <p className="text-xs text-slip-dim">กรอกยอดที่ลูกค้าจะโอนก่อน แล้วกดสร้าง QR</p>;
  }

  const buttonClass =
    'min-h-[44px] rounded-lg px-4 text-sm font-bold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-sky-200 bg-sky-50/40 p-2.5">
      {(!request || stale || request.status === 'EXPIRED' || request.status === 'CANCELLED') && (
        <div className="flex flex-col gap-2">
          {stale && (
            <p className="text-sm font-semibold text-amber-800">
              ยอดเปลี่ยนจาก ฿{formatBaht(request!.amount)} เป็น ฿{formatBaht(amount)} QR เดิมใช้ไม่ได้แล้ว
            </p>
          )}
          {!stale && request?.status === 'EXPIRED' && (
            <p className="text-sm font-semibold text-amber-800">QR หมดอายุแล้ว กรุณาสร้างใหม่ให้ลูกค้าสแกน</p>
          )}
          <button
            type="button"
            onClick={createRequest}
            disabled={busy}
            className={`${buttonClass} bg-sky-700 text-white hover:bg-sky-800`}
          >
            {busy ? 'กำลังสร้าง QR…' : `สร้าง QR รับเงิน ฿${formatBaht(amount)}`}
          </button>
        </div>
      )}

      {request && !stale && request.status !== 'EXPIRED' && request.status !== 'CANCELLED' && (
        <>
          <PromptPayQR
            payload={request.qrPayload}
            amount={request.amount}
            accountName={request.accountName}
            maskedPromptPayId={request.maskedPromptPayId}
          />

          {request.status === 'PAID' ? (
            <div
              role="status"
              className="rounded-lg border border-emerald-300 bg-emerald-50 p-2.5 text-sm font-bold text-emerald-800"
            >
              {request.used
                ? 'QR นี้ถูกใช้ปิดบิลไปแล้ว'
                : `ได้รับเงินแล้ว ฿${formatBaht(request.amount)}${
                    request.confirmedByName ? ` (ยืนยันโดย ${request.confirmedByName})` : ' (ยืนยันโดยผู้ให้บริการ)'
                  }`}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-slip-dim">
                {request.autoConfirm
                  ? 'รอลูกค้าโอน สถานะจะเปลี่ยนเป็น "ได้รับเงินแล้ว" เองเมื่อเงินเข้า'
                  : 'ให้ลูกค้าสแกนโอน แล้วเปิดแอปธนาคารของร้านเช็คว่าเงินเข้าก่อนกดยืนยัน'}
              </p>
              <div className="flex flex-wrap gap-2">
                {!request.autoConfirm && (
                  <button
                    type="button"
                    onClick={() => act('CONFIRM')}
                    disabled={busy}
                    className={`${buttonClass} bg-emerald-600 text-white hover:bg-emerald-700`}
                  >
                    เงินเข้าแล้ว ยืนยันรับเงิน
                  </button>
                )}
                {request.canSimulate && (
                  <button
                    type="button"
                    onClick={() => act('SIMULATE')}
                    disabled={busy}
                    className={`${buttonClass} border border-dashed border-slate-400 bg-white text-slate-700 hover:bg-slate-100`}
                  >
                    จำลองว่าลูกค้าโอนแล้ว (ทดสอบ)
                  </button>
                )}
              </div>
              <p className="text-xs text-slip-dim">ช่องทาง: {request.providerLabel}</p>
            </div>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm font-semibold text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
