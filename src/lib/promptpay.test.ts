import { describe, expect, it } from 'vitest';
import {
  buildPromptPayPayload,
  crc16Ccitt,
  maskPromptPayId,
  normalizePromptPayId,
} from '@/lib/promptpay';

describe('crc16Ccitt', () => {
  it('ตรงกับค่าตรวจสอบมาตรฐานของ CRC-16/CCITT-FALSE', () => {
    expect(crc16Ccitt('123456789')).toBe('29B1');
  });
});

describe('normalizePromptPayId', () => {
  it('แยกประเภทจากจำนวนหลักและตัดขีดกับช่องว่างออก', () => {
    expect(normalizePromptPayId('081-234-5678')).toEqual({ ok: true, type: 'PHONE', value: '0812345678' });
    expect(normalizePromptPayId('1 2345 67890 12 3')).toEqual({
      ok: true,
      type: 'NATIONAL_ID',
      value: '1234567890123',
    });
    expect(normalizePromptPayId('123456789012345')).toMatchObject({ ok: true, type: 'EWALLET' });
  });

  it('ปฏิเสธเบอร์บ้าน ตัวอักษร และจำนวนหลักที่ไม่ตรงประเภทใด', () => {
    expect(normalizePromptPayId('02-123-4567').ok).toBe(false);
    expect(normalizePromptPayId('08l2345678').ok).toBe(false);
    expect(normalizePromptPayId('').ok).toBe(false);
  });
});

describe('buildPromptPayPayload', () => {
  it('เลขบัตรประชาชน ไม่ระบุยอด (ค่าอ้างอิงจากไลบรารี promptpay-qr)', () => {
    expect(buildPromptPayPayload('1111111111111')).toBe(
      '00020101021129370016A000000677010111021311111111111115802TH53037646304' + '7B5A',
    );
  });

  it('เบอร์มือถือ ระบุยอด แปลงเบอร์เป็นรูปแบบ 0066 และใช้ QR แบบครั้งเดียว (12)', () => {
    expect(buildPromptPayPayload('080-123-4567', 4.22)).toBe(
      '00020101021229370016A000000677010111011300668012345675802TH530376454044.226304' + '44FE',
    );
  });

  it('ยอดเป็น 0 ถือว่าไม่ระบุยอด ให้ลูกค้ากรอกเองในแอปธนาคาร', () => {
    expect(buildPromptPayPayload('0801234567', 0)).toBe(buildPromptPayPayload('0801234567'));
  });

  it('ต่อท้ายด้วย CRC ที่คำนวณจากข้อความทั้งหมดก่อนหน้า', () => {
    const payload = buildPromptPayPayload('0812345678', 176.55);
    expect(payload.slice(-4)).toBe(crc16Ccitt(payload.slice(0, -4)));
    expect(payload).toContain('5406176.55');
  });

  it('โยน error เมื่อเลขพร้อมเพย์หรือยอดเงินไม่ถูกต้อง', () => {
    expect(() => buildPromptPayPayload('021234567', 10)).toThrow();
    expect(() => buildPromptPayPayload('0812345678', -1)).toThrow();
  });
});

describe('maskPromptPayId', () => {
  it('ปิดบังเลขตรงกลาง เหลือให้เทียบกับแอปธนาคารได้', () => {
    expect(maskPromptPayId('0812345678')).toBe('081-xxx-5678');
    expect(maskPromptPayId('1234567890123')).toBe('x-xxxx-xxxxx-12-3');
  });
});
