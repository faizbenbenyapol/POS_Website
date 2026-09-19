import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MOCK_SIGNATURE_HEADER,
  findPaymentProvider,
  getPaymentProvider,
  signWebhookBody,
} from '@/lib/payments/provider';

const SECRET = 'test-webhook-secret';

/**
 * สร้าง header ของ webhook พร้อมลายเซ็น
 *
 * @param signature - ลายเซ็นที่จะใส่ใน header
 * @returns Headers สำหรับส่งให้ parseWebhook
 */
function headersWith(signature: string): Headers {
  return new Headers({ [MOCK_SIGNATURE_HEADER]: signature });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('mock gateway webhook', () => {
  const mock = findPaymentProvider('mock')!;
  const body = JSON.stringify({ reference: 'MOCK-ABC', status: 'PAID', amount: 174 });

  it('รับ webhook ที่ลายเซ็นถูกต้อง', () => {
    vi.stubEnv('PAYMENT_WEBHOOK_SECRET', SECRET);
    expect(mock.parseWebhook(body, headersWith(signWebhookBody(SECRET, body)))).toEqual({
      providerRef: 'MOCK-ABC',
      status: 'PAID',
      amount: 174,
    });
  });

  it('ปฏิเสธลายเซ็นปลอม และ body ที่ถูกแก้หลังเซ็น', () => {
    vi.stubEnv('PAYMENT_WEBHOOK_SECRET', SECRET);
    expect(mock.parseWebhook(body, headersWith('deadbeef'))).toBeNull();
    const tampered = body.replace('174', '1');
    expect(mock.parseWebhook(tampered, headersWith(signWebhookBody(SECRET, body)))).toBeNull();
  });

  it('ไม่รับ webhook เลยเมื่อไม่ได้ตั้ง secret', () => {
    vi.stubEnv('PAYMENT_WEBHOOK_SECRET', '');
    expect(mock.parseWebhook(body, headersWith(signWebhookBody('', body)))).toBeNull();
  });

  it('ปฏิเสธ body ที่รูปแบบไม่ถูกต้องแม้ลายเซ็นผ่าน', () => {
    vi.stubEnv('PAYMENT_WEBHOOK_SECRET', SECRET);
    const bad = JSON.stringify({ reference: 'MOCK-ABC', status: 'DONE', amount: '174' });
    expect(mock.parseWebhook(bad, headersWith(signWebhookBody(SECRET, bad)))).toBeNull();
  });
});

describe('getPaymentProvider', () => {
  it('production ที่ไม่ได้ตั้งค่าใช้พร้อมเพย์เข้าบัญชีตรง และจำลองการจ่ายไม่ได้', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PAYMENT_PROVIDER', '');
    vi.stubEnv('PAYMENT_ALLOW_SIMULATE', '');
    const provider = getPaymentProvider();
    expect(provider.id).toBe('promptpay');
    expect(provider.autoConfirm).toBe(false);
    expect(findPaymentProvider('mock')!.canSimulate).toBe(false);
  });

  it('เครื่องพัฒนาที่ไม่ได้ตั้งค่าใช้ผู้ให้บริการจำลอง', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('PAYMENT_PROVIDER', '');
    expect(getPaymentProvider().id).toBe('mock');
  });

  it('โยน error เมื่อตั้งชื่อผู้ให้บริการที่ไม่รู้จัก', () => {
    vi.stubEnv('PAYMENT_PROVIDER', 'unknown-bank');
    expect(() => getPaymentProvider()).toThrow();
  });

  it('QR ที่สร้างผูกยอดและเลขพร้อมเพย์ของสาขา', async () => {
    const charge = await findPaymentProvider('promptpay')!.createCharge({
      amount: 174,
      promptPayId: '0812345678',
      reference: 'S1',
    });
    expect(charge.qrPayload).toContain('0066812345678');
    expect(charge.qrPayload).toContain('5406174.00');
    expect(charge.providerRef).toMatch(/^PP-[0-9A-F]{16}$/);
  });
});
