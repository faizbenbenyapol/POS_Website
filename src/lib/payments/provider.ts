import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { buildPromptPayPayload } from '@/lib/promptpay';

/**
 * ชั้นกลางของช่องทางรับเงินโอนผ่าน QR ทุกผู้ให้บริการต้องทำตาม interface เดียวกัน
 * ส่วนอื่นของระบบ (หน้าปิดบิล route สร้างคำขอ webhook) เรียกผ่าน getPaymentProvider() เท่านั้น
 * การเปลี่ยนจากบัญชีตัวอย่างไปใช้ผู้ให้บริการจริงจึงแก้แค่ไฟล์นี้กับตัวแปร PAYMENT_PROVIDER
 *
 * ผู้ให้บริการที่มีตอนนี้:
 *   promptpay  QR พร้อมเพย์เข้าบัญชีร้านตรง ๆ ไม่มีใครแจ้งว่าเงินเข้า แคชเชียร์ต้องเช็คแอปธนาคารแล้วกดยืนยันเอง
 *   mock       ผู้ให้บริการจำลองสำหรับทดลองระบบ ทำงานเหมือน payment gateway จริงทุกขั้น
 *              (สร้าง QR -> รอ webhook ที่เซ็นลายเซ็น -> เปลี่ยนสถานะเป็นจ่ายแล้วเอง)
 *              มีปุ่ม "จำลองลูกค้าโอนแล้ว" ให้กดทดสอบ ใช้ไม่ได้บน production
 *
 * วิธีเพิ่มผู้ให้บริการจริง (เช่น ธนาคาร หรือ payment gateway ที่ออก QR ให้):
 *   1. เขียน object ที่ทำตาม PaymentProvider: createCharge เรียก API ของผู้ให้บริการเพื่อขอ QR
 *      และ parseWebhook ตรวจลายเซ็นตามเอกสารของผู้ให้บริการแล้วคืน providerRef กับยอดเงิน
 *   2. เพิ่มเข้า PROVIDERS ด้านล่าง แล้วตั้ง PAYMENT_PROVIDER=<id> และ secret ที่ผู้ให้บริการให้มา
 *   3. ตั้ง URL webhook ที่ผู้ให้บริการเป็น https://<โดเมนร้าน>/api/payments/webhook/<id>
 */

/** ข้อมูลที่ต้องใช้สร้าง QR รับเงิน 1 ครั้ง */
export type ChargeRequest = {
  /** ยอดเงินที่ต้องรับ หน่วยบาท */
  amount: number;
  /** เลขพร้อมเพย์ของสาขา */
  promptPayId: string;
  /** รหัสอ้างอิงของร้านที่ส่งให้ผู้ให้บริการ ใช้จับคู่ตอน webhook กลับมา */
  reference: string;
};

/** QR ที่สร้างเสร็จแล้ว */
export type Charge = {
  /** รหัสอ้างอิงของผู้ให้บริการ ไม่ซ้ำกันภายในผู้ให้บริการเดียวกัน */
  providerRef: string;
  /** ข้อความที่นำไปสร้างภาพ QR */
  qrPayload: string;
};

/** ผลการอ่าน webhook ที่ผ่านการตรวจลายเซ็นแล้ว */
export type WebhookEvent = {
  providerRef: string;
  status: 'PAID' | 'FAILED';
  /** ยอดที่ผู้ให้บริการยืนยันว่ารับได้จริง ใช้เทียบกับยอดในคำขอ */
  amount: number;
};

/** สัญญาที่ผู้ให้บริการรับเงินทุกเจ้าต้องทำตาม */
export type PaymentProvider = {
  /** รหัสสั้น ใช้ในฐานข้อมูลและใน URL ของ webhook */
  readonly id: string;
  /** ชื่อที่แสดงบนหน้าปิดบิล */
  readonly label: string;
  /** true เมื่อผู้ให้บริการแจ้งกลับเองว่าเงินเข้า false เมื่อแคชเชียร์ต้องยืนยันเอง */
  readonly autoConfirm: boolean;
  /** true เมื่อกดจำลองการจ่ายเงินได้ (ใช้ทดสอบเท่านั้น) */
  readonly canSimulate: boolean;
  /** อายุของ QR หน่วยนาที หมดแล้วต้องสร้างใหม่ */
  readonly expiresInMinutes: number;
  /** ขอ QR สำหรับยอดนี้ */
  createCharge(request: ChargeRequest): Promise<Charge>;
  /** ตรวจลายเซ็นและอ่าน webhook คืน null เมื่อลายเซ็นไม่ผ่านหรือไม่รองรับ webhook */
  parseWebhook(rawBody: string, headers: Headers): WebhookEvent | null;
};

/** ชื่อ header ที่ผู้ให้บริการจำลองใช้ส่งลายเซ็น HMAC-SHA256 ของ body */
export const MOCK_SIGNATURE_HEADER = 'x-pos-signature';

/**
 * สร้างรหัสอ้างอิงแบบสุ่ม เดาไม่ได้ ใช้เป็นรหัสคำขอรับเงินที่ส่งให้ผู้ให้บริการ
 *
 * @param prefix - คำนำหน้า เช่น "PP" หรือ "MOCK"
 * @returns เช่น "MOCK-1A2B3C4D5E6F7A8B"
 */
function randomRef(prefix: string): string {
  return `${prefix}-${randomBytes(8).toString('hex').toUpperCase()}`;
}

/**
 * คำนวณลายเซ็น HMAC-SHA256 ของ body ด้วย secret ของ webhook
 *
 * @param secret - ค่า PAYMENT_WEBHOOK_SECRET
 * @param rawBody - body ดิบตามที่ได้รับ (ห้าม parse แล้ว stringify ใหม่ ลายเซ็นจะไม่ตรง)
 * @returns ลายเซ็นเป็นเลขฐานสิบหก
 */
export function signWebhookBody(secret: string, rawBody: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

/**
 * เทียบลายเซ็นแบบใช้เวลาคงที่ กันการเดาลายเซ็นทีละตัวจากเวลาที่ตอบกลับ
 *
 * @param expected - ลายเซ็นที่คำนวณเอง
 * @param received - ลายเซ็นที่มากับคำขอ
 * @returns true เมื่อตรงกัน
 */
function signaturesMatch(expected: string, received: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** QR พร้อมเพย์เข้าบัญชีร้านตรง ไม่มีตัวกลาง จึงไม่มี webhook ต้องให้แคชเชียร์ยืนยันเอง */
const promptPayDirect: PaymentProvider = {
  id: 'promptpay',
  label: 'พร้อมเพย์ (เข้าบัญชีร้านตรง)',
  autoConfirm: false,
  canSimulate: false,
  expiresInMinutes: 15,
  async createCharge(request) {
    return {
      providerRef: randomRef('PP'),
      qrPayload: buildPromptPayPayload(request.promptPayId, request.amount),
    };
  },
  parseWebhook() {
    return null;
  },
};

/**
 * ผู้ให้บริการจำลอง ทำงานเหมือน payment gateway จริง ใช้ทดลองระบบก่อนมีสัญญากับผู้ให้บริการ
 * QR ที่ได้ยังเป็นพร้อมเพย์ของสาขา (บัญชีตัวอย่าง) แต่สถานะ "จ่ายแล้ว" มาจาก webhook ที่เซ็นลายเซ็น
 * หรือจากปุ่มจำลองบนหน้าปิดบิลเท่านั้น
 */
const mockGateway: PaymentProvider = {
  id: 'mock',
  label: 'ผู้ให้บริการจำลอง (ทดสอบ)',
  autoConfirm: true,
  get canSimulate() {
    return process.env.NODE_ENV !== 'production' || process.env.PAYMENT_ALLOW_SIMULATE === '1';
  },
  expiresInMinutes: 15,
  async createCharge(request) {
    return {
      providerRef: randomRef('MOCK'),
      qrPayload: buildPromptPayPayload(request.promptPayId, request.amount),
    };
  },
  parseWebhook(rawBody, headers) {
    const secret = process.env.PAYMENT_WEBHOOK_SECRET;
    const received = headers.get(MOCK_SIGNATURE_HEADER);
    // ไม่ได้ตั้ง secret = ไม่รับ webhook เลย ดีกว่าปล่อยให้ใครก็ยิงมาบอกว่าจ่ายแล้วได้
    if (!secret || !received) return null;
    if (!signaturesMatch(signWebhookBody(secret, rawBody), received)) return null;

    const body = JSON.parse(rawBody) as { reference?: unknown; status?: unknown; amount?: unknown };
    if (typeof body.reference !== 'string' || typeof body.amount !== 'number') return null;
    if (body.status !== 'PAID' && body.status !== 'FAILED') return null;
    return { providerRef: body.reference, status: body.status, amount: body.amount };
  },
};

/** ผู้ให้บริการทั้งหมดที่ระบบรู้จัก เพิ่มผู้ให้บริการจริงที่นี่ */
const PROVIDERS: Record<string, PaymentProvider> = {
  [promptPayDirect.id]: promptPayDirect,
  [mockGateway.id]: mockGateway,
};

/**
 * เลือกผู้ให้บริการตามตัวแปร PAYMENT_PROVIDER
 * ไม่ได้ตั้งค่า: เครื่องพัฒนาใช้ผู้ให้บริการจำลอง ส่วน production ใช้พร้อมเพย์เข้าบัญชีตรง
 * (production จะไม่มีวันเปิดปุ่มจำลองการจ่ายเงินขึ้นมาเองโดยไม่ได้ตั้งใจ)
 *
 * @returns ผู้ให้บริการที่ใช้อยู่
 * @throws Error เมื่อตั้ง PAYMENT_PROVIDER เป็นค่าที่ระบบไม่รู้จัก
 */
export function getPaymentProvider(): PaymentProvider {
  const fallback = process.env.NODE_ENV === 'production' ? promptPayDirect.id : mockGateway.id;
  const id = (process.env.PAYMENT_PROVIDER || fallback).trim();
  const provider = PROVIDERS[id];
  if (!provider) throw new Error(`PAYMENT_PROVIDER "${id}" is not a known payment provider`);
  return provider;
}

/**
 * หาผู้ให้บริการจากรหัส ใช้กับ webhook และคำขอที่สร้างไว้ก่อนเปลี่ยนผู้ให้บริการ
 *
 * @param id - รหัสผู้ให้บริการ
 * @returns ผู้ให้บริการ หรือ null เมื่อไม่รู้จัก
 */
export function findPaymentProvider(id: string): PaymentProvider | null {
  return PROVIDERS[id] ?? null;
}
