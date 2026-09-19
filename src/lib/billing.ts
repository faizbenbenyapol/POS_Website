/**
 * ตรรกะการคำนวณยอดบิลทั้งหมดของระบบ รวมไว้ที่ไฟล์เดียวและไม่แตะฐานข้อมูลเลย
 * ทั้งฝั่งเซิร์ฟเวอร์ (ตอนปิดบิลจริง) และฝั่งหน้าจอ (ตอนพรีวิวขณะพนักงานพิมพ์ส่วนลด)
 * เรียกใช้ฟังก์ชันชุดเดียวกัน ตัวเลขบนจอกับตัวเลขที่บันทึกลงฐานข้อมูลจึงตรงกันเสมอ
 */

/** วิธีคิดส่วนลดของบิล NONE คือไม่มีส่วนลด */
export type DiscountType = 'NONE' | 'AMOUNT' | 'PERCENT';

/** ช่องทางการชำระเงินที่ร้านรับ ตรงกับ ENUM ในตาราง payments */
export type PaymentMethod = 'CASH' | 'TRANSFER' | 'CARD';

/** ค่าตั้งเรื่องภาษีและค่าบริการของสาขา ใช้เป็นตัวตั้งต้นของทุกบิลในสาขานั้น */
export type BranchMoneySettings = {
  /** อัตราภาษีมูลค่าเพิ่มเป็นเปอร์เซ็นต์ เช่น 7 คือ 7% */
  vatRate: number;
  /** true = ราคาเมนูรวม VAT แล้ว (ถอดออกจากยอด), false = ต้องบวก VAT เพิ่มท้ายบิล */
  vatInclusive: boolean;
  /** อัตราค่าบริการเป็นเปอร์เซ็นต์ เช่น 10 คือ 10% ใส่ 0 เมื่อร้านไม่เก็บ */
  serviceChargeRate: number;
};

/** ส่วนลดที่พนักงานกรอกเข้ามา ก่อนระบบแปลงเป็นจำนวนเงินจริง */
export type DiscountInput = {
  type: DiscountType;
  /** จำนวนบาท (AMOUNT) หรือเปอร์เซ็นต์ (PERCENT) ไม่ใช้เมื่อ type เป็น NONE */
  value: number;
  reason?: string | null;
};

/** ยอดบิลที่คำนวณเสร็จแล้วครบทุกบรรทัด พร้อมบันทึกลงฐานข้อมูลหรือพิมพ์ใบเสร็จ */
export type BillTotals = {
  subtotal: number;
  discountType: DiscountType;
  discountValue: number;
  discountAmount: number;
  afterDiscount: number;
  serviceChargeRate: number;
  serviceChargeAmount: number;
  vatRate: number;
  vatInclusive: boolean;
  /** ฐานภาษีก่อนคิด VAT ใช้แสดงบรรทัด "มูลค่าก่อนภาษี" บนใบเสร็จ */
  vatBase: number;
  vatAmount: number;
  grandTotal: number;
};

/** รายการอาหารเท่าที่การคำนวณยอดต้องใช้ */
export type BillableItem = {
  unit_price: number | string;
  quantity: number;
  status?: string;
};

/** ค่าตั้งเรื่องเงินที่ใช้เมื่ออ่านค่าของสาขาไม่ได้ ตรงกับค่า DEFAULT ในตาราง branches */
export const DEFAULT_MONEY_SETTINGS: BranchMoneySettings = {
  vatRate: 7,
  vatInclusive: true,
  serviceChargeRate: 0,
};

/**
 * ปัดเศษเป็นทศนิยม 2 ตำแหน่งแบบครึ่งขึ้น ให้ตรงกับความละเอียดของคอลัมน์ DECIMAL(10,2)
 * บวก Number.EPSILON ก่อนปัดเพื่อกันกรณีเลขทศนิยมฐานสองคลาดไปนิดเดียวแล้วปัดผิดทาง
 * เช่น 1.005 ที่เก็บจริงเป็น 1.00499999... จะถูกปัดเป็น 1.00 แทนที่จะเป็น 1.01
 *
 * @param value - ตัวเลขที่ต้องการปัด หน่วยบาท
 * @returns ตัวเลขทศนิยม 2 ตำแหน่ง คืน 0 เมื่อค่าที่ส่งมาไม่ใช่ตัวเลข
 */
export function roundBaht(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * รวมราคาสินค้าทั้งบิลจากรายการอาหาร โดยไม่นับรายการที่ถูกยกเลิก
 * เป็นตัวเลขตั้งต้นของทุกบรรทัดที่เหลือในบิล
 *
 * @param items - รายการอาหารของรอบการนั่ง แต่ละตัวต้องมี unit_price และ quantity
 * @returns ยอดรวมก่อนส่วนลด หน่วยบาท คืน 0 เมื่อไม่มีรายการที่คิดเงินได้
 */
export function sumSubtotal(items: BillableItem[]): number {
  const total = items
    .filter((item) => item.status !== 'CANCELLED')
    .reduce((sum, item) => sum + Number(item.unit_price) * Number(item.quantity), 0);
  return roundBaht(total);
}

/**
 * แปลงส่วนลดที่พนักงานกรอกให้เป็นจำนวนเงินจริง
 * จำกัดไม่ให้เกินยอดก่อนส่วนลด เพื่อไม่ให้บิลติดลบจนยอดขายเพี้ยน
 *
 * @param subtotal - ยอดรวมก่อนส่วนลด หน่วยบาท
 * @param discount - ส่วนลดที่กรอก จะเป็นจำนวนบาทหรือเปอร์เซ็นต์ก็ได้
 * @returns จำนวนเงินส่วนลด หน่วยบาท คืน 0 เมื่อไม่มีส่วนลดหรือค่าที่กรอกไม่ถูกต้อง
 */
export function resolveDiscountAmount(subtotal: number, discount: DiscountInput): number {
  if (discount.type === 'NONE') return 0;
  const value = Number(discount.value);
  if (!Number.isFinite(value) || value <= 0) return 0;

  const raw = discount.type === 'PERCENT' ? (subtotal * value) / 100 : value;
  return roundBaht(Math.min(Math.max(raw, 0), subtotal));
}

/**
 * คำนวณยอดบิลทั้งใบตามลำดับมาตรฐานของร้านอาหาร
 * ยอดรวม -> หักส่วนลด -> บวกค่าบริการ -> คิดภาษีมูลค่าเพิ่ม
 *
 * ค่าบริการคิดจากยอดหลังหักส่วนลดแล้ว ไม่ใช่จากยอดเต็ม เพราะลูกค้าไม่ควรจ่าย
 * ค่าบริการของเงินส่วนที่ร้านลดให้
 *
 * กรณี vatInclusive เป็น true ราคาเมนูรวม VAT อยู่แล้ว จึงถอด VAT ออกจากยอดมาแสดง
 * ยอดที่ลูกค้าต้องจ่ายเท่าเดิม ส่วนกรณี false จะบวก VAT เพิ่มเข้าไปในยอดที่ต้องจ่าย
 *
 * @param items - รายการอาหารของรอบการนั่ง รายการที่ยกเลิกแล้วจะถูกข้ามให้เอง
 * @param settings - ค่าตั้ง VAT และค่าบริการของสาขาที่บิลนี้สังกัด
 * @param discount - ส่วนลดของบิล ไม่ส่งมาถือว่าไม่มีส่วนลด
 * @returns ยอดบิลครบทุกบรรทัด ทุกค่าปัดเป็นทศนิยม 2 ตำแหน่งแล้ว
 */
export function calculateBill(
  items: BillableItem[],
  settings: BranchMoneySettings,
  discount: DiscountInput = { type: 'NONE', value: 0 },
): BillTotals {
  const subtotal = sumSubtotal(items);
  const discountAmount = resolveDiscountAmount(subtotal, discount);
  const afterDiscount = roundBaht(subtotal - discountAmount);

  const serviceChargeRate = Math.max(0, Number(settings.serviceChargeRate) || 0);
  const serviceChargeAmount = roundBaht((afterDiscount * serviceChargeRate) / 100);

  const vatBaseWithTax = roundBaht(afterDiscount + serviceChargeAmount);
  const vatRate = Math.max(0, Number(settings.vatRate) || 0);

  let vatAmount: number;
  let grandTotal: number;
  let vatBase: number;

  if (settings.vatInclusive) {
    // ราคารวม VAT แล้ว ถอดภาษีออกมาแสดงโดยยอดที่ต้องจ่ายไม่เปลี่ยน
    vatAmount = roundBaht((vatBaseWithTax * vatRate) / (100 + vatRate));
    grandTotal = vatBaseWithTax;
    vatBase = roundBaht(vatBaseWithTax - vatAmount);
  } else {
    // ราคายังไม่รวม VAT บวกภาษีเพิ่มเข้าไปในยอดที่ต้องจ่าย
    vatAmount = roundBaht((vatBaseWithTax * vatRate) / 100);
    grandTotal = roundBaht(vatBaseWithTax + vatAmount);
    vatBase = vatBaseWithTax;
  }

  return {
    subtotal,
    discountType: discount.type,
    discountValue: discount.type === 'NONE' ? 0 : Number(discount.value) || 0,
    discountAmount,
    afterDiscount,
    serviceChargeRate,
    serviceChargeAmount,
    vatRate,
    vatInclusive: Boolean(settings.vatInclusive),
    vatBase,
    vatAmount,
    grandTotal,
  };
}

/** เงินที่รับมาหนึ่งช่องทาง ใช้ตอนลูกค้าจ่ายผสมหลายวิธีในบิลเดียว */
export type PaymentInput = {
  method: PaymentMethod;
  /** ยอดที่ตัดเข้าช่องทางนี้ หน่วยบาท */
  amount: number;
  /** เงินสดที่ลูกค้ายื่นมาจริง ใส่เฉพาะช่องทาง CASH ไม่ใส่ถือว่ารับมาพอดี */
  receivedAmount?: number | null;
  /** คำขอรับเงินโอนผ่าน QR ที่ยืนยันแล้ว ใส่เฉพาะช่องทาง TRANSFER (ไม่ใช้ในการคำนวณยอด) */
  paymentRequestId?: number | null;
};

/** ผลการตรวจยอดชำระเทียบกับยอดบิล */
export type PaymentValidation = {
  ok: boolean;
  /** ยอดรวมทุกช่องทางที่ตัดเข้าบิล หน่วยบาท */
  paidTotal: number;
  /** ยอดที่ยังขาดอยู่ 0 เมื่อจ่ายครบแล้ว */
  shortfall: number;
  /** เงินทอนที่ต้องคืนลูกค้า มาจากเงินสดที่ยื่นเกินยอดที่ตัดเข้าช่องทางเงินสด */
  changeDue: number;
  /** ข้อความไทยบอกสาเหตุเมื่อ ok เป็น false */
  message: string;
};

/**
 * ตรวจว่ายอดที่แบ่งจ่ายตามช่องทางต่าง ๆ ครบตามยอดบิลหรือไม่ และคำนวณเงินทอน
 *
 * ยอมให้เงินสดยื่นเกินได้ (ทอนกลับ) แต่ช่องทางโอนกับบัตรต้องตัดเป๊ะตามยอด
 * เพราะเงินสองแบบนั้นไม่มีการทอนในทางปฏิบัติ
 *
 * @param payments - รายการชำระเงินที่แคชเชียร์กรอก อย่างน้อย 1 ช่องทาง
 * @param grandTotal - ยอดสุทธิที่ต้องเก็บ หน่วยบาท
 * @returns ผลการตรวจพร้อมยอดรวม ยอดที่ขาด และเงินทอน
 */
export function validatePayments(
  payments: PaymentInput[],
  grandTotal: number,
): PaymentValidation {
  if (payments.length === 0) {
    return {
      ok: false,
      paidTotal: 0,
      shortfall: roundBaht(grandTotal),
      changeDue: 0,
      message: 'ยังไม่ได้ระบุช่องทางการชำระเงิน',
    };
  }

  const paidTotal = roundBaht(
    payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
  );
  const shortfall = roundBaht(Math.max(0, grandTotal - paidTotal));

  // เงินทอนมาจากเงินสดที่ยื่นเกินยอดที่ตัดเข้าช่องทางเงินสดเท่านั้น
  const changeDue = roundBaht(
    payments
      .filter((p) => p.method === 'CASH')
      .reduce((sum, p) => {
        const received = Number(p.receivedAmount ?? p.amount) || 0;
        return sum + Math.max(0, received - (Number(p.amount) || 0));
      }, 0),
  );

  if (shortfall > 0) {
    return {
      ok: false,
      paidTotal,
      shortfall,
      changeDue,
      message: `ยอดชำระยังไม่ครบ ขาดอีก ${shortfall.toFixed(2)} บาท`,
    };
  }

  if (paidTotal > grandTotal) {
    return {
      ok: false,
      paidTotal,
      shortfall: 0,
      changeDue,
      message: 'ยอดที่ตัดเข้าช่องทางชำระเงินรวมแล้วเกินยอดบิล กรุณาแก้ยอดให้ตรง',
    };
  }

  const cashShortReceive = payments.some(
    (p) =>
      p.method === 'CASH' &&
      p.receivedAmount !== null &&
      p.receivedAmount !== undefined &&
      Number(p.receivedAmount) < Number(p.amount),
  );
  if (cashShortReceive) {
    return {
      ok: false,
      paidTotal,
      shortfall: 0,
      changeDue,
      message: 'เงินสดที่รับมาน้อยกว่ายอดที่ตัดเข้าช่องทางเงินสด',
    };
  }

  return { ok: true, paidTotal, shortfall: 0, changeDue, message: '' };
}
