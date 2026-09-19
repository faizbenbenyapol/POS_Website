import { describe, expect, it } from 'vitest';
import {
  calculateBill,
  resolveDiscountAmount,
  roundBaht,
  sumSubtotal,
  validatePayments,
  type BranchMoneySettings,
} from '@/lib/billing';

/** ค่าตั้งแบบร้านทั่วไปในไทย: ราคารวม VAT 7% แล้ว ไม่เก็บค่าบริการ */
const INCLUSIVE: BranchMoneySettings = { vatRate: 7, vatInclusive: true, serviceChargeRate: 0 };

/** ค่าตั้งแบบโรงแรม: ค่าบริการ 10% และบวก VAT 7% ท้ายบิล */
const EXCLUSIVE_WITH_SC: BranchMoneySettings = {
  vatRate: 7,
  vatInclusive: false,
  serviceChargeRate: 10,
};

describe('roundBaht', () => {
  it('ปัดครึ่งขึ้นแม้ค่าที่เก็บจริงคลาดไปนิดเดียว', () => {
    expect(roundBaht(1.005)).toBe(1.01);
    expect(roundBaht(2.675)).toBe(2.68);
  });

  it('คืน 0 เมื่อค่าไม่ใช่ตัวเลข', () => {
    expect(roundBaht(Number.NaN)).toBe(0);
    expect(roundBaht(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('sumSubtotal', () => {
  it('ไม่นับรายการที่ยกเลิก และรับราคาที่มาเป็นสตริงจากฐานข้อมูลได้', () => {
    const items = [
      { unit_price: '65.00', quantity: 2 },
      { unit_price: 15, quantity: 1 },
      { unit_price: '99.00', quantity: 3, status: 'CANCELLED' },
    ];
    expect(sumSubtotal(items)).toBe(145);
  });
});

describe('resolveDiscountAmount', () => {
  it('คิดส่วนลดเปอร์เซ็นต์จากยอดก่อนลด', () => {
    expect(resolveDiscountAmount(200, { type: 'PERCENT', value: 10 })).toBe(20);
  });

  it('ไม่ให้ส่วนลดเกินยอดบิล', () => {
    expect(resolveDiscountAmount(100, { type: 'AMOUNT', value: 500 })).toBe(100);
  });

  it('คืน 0 เมื่อไม่มีส่วนลดหรือค่าติดลบ', () => {
    expect(resolveDiscountAmount(100, { type: 'NONE', value: 50 })).toBe(0);
    expect(resolveDiscountAmount(100, { type: 'AMOUNT', value: -5 })).toBe(0);
  });
});

describe('calculateBill', () => {
  it('ราคารวม VAT: ถอด VAT ออกมาแสดงโดยยอดที่ต้องจ่ายไม่เปลี่ยน', () => {
    const bill = calculateBill([{ unit_price: 107, quantity: 1 }], INCLUSIVE);
    expect(bill.grandTotal).toBe(107);
    expect(bill.vatAmount).toBe(7);
    expect(bill.vatBase).toBe(100);
  });

  it('ค่าบริการคิดหลังหักส่วนลด แล้วค่อยบวก VAT', () => {
    const bill = calculateBill([{ unit_price: 100, quantity: 2 }], EXCLUSIVE_WITH_SC, {
      type: 'AMOUNT',
      value: 50,
    });
    // 200 - 50 = 150 -> ค่าบริการ 15 -> ฐานภาษี 165 -> VAT 11.55 -> สุทธิ 176.55
    expect(bill.afterDiscount).toBe(150);
    expect(bill.serviceChargeAmount).toBe(15);
    expect(bill.vatAmount).toBe(11.55);
    expect(bill.grandTotal).toBe(176.55);
  });

  it('บิลที่ยกเลิกทุกรายการมียอดเป็นศูนย์', () => {
    const bill = calculateBill(
      [{ unit_price: 100, quantity: 1, status: 'CANCELLED' }],
      INCLUSIVE,
    );
    expect(bill.grandTotal).toBe(0);
  });
});

describe('validatePayments', () => {
  it('ผ่านเมื่อจ่ายเงินสดเกินแล้วคิดเงินทอนให้', () => {
    const result = validatePayments([{ method: 'CASH', amount: 176.55, receivedAmount: 200 }], 176.55);
    expect(result.ok).toBe(true);
    expect(result.changeDue).toBe(23.45);
  });

  it('ผ่านเมื่อแบ่งจ่ายเงินสดกับโอนรวมกันพอดี', () => {
    const result = validatePayments(
      [
        { method: 'CASH', amount: 100 },
        { method: 'TRANSFER', amount: 76.55 },
      ],
      176.55,
    );
    expect(result.ok).toBe(true);
  });

  it('ไม่ผ่านเมื่อยอดยังขาด และบอกยอดที่ขาด', () => {
    const result = validatePayments([{ method: 'TRANSFER', amount: 100 }], 176.55);
    expect(result.ok).toBe(false);
    expect(result.shortfall).toBe(76.55);
  });

  it('ไม่ผ่านเมื่อยอดที่ตัดเกินบิล เพราะโอนและบัตรไม่มีเงินทอน', () => {
    const result = validatePayments([{ method: 'CARD', amount: 200 }], 176.55);
    expect(result.ok).toBe(false);
  });

  it('ไม่ผ่านเมื่อรับเงินสดมาน้อยกว่ายอดที่ตัด', () => {
    const result = validatePayments([{ method: 'CASH', amount: 100, receivedAmount: 50 }], 100);
    expect(result.ok).toBe(false);
  });

  it('ไม่ผ่านเมื่อไม่มีช่องทางชำระเงินเลย', () => {
    expect(validatePayments([], 50).ok).toBe(false);
  });
});
