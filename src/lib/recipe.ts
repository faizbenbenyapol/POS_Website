import { roundBaht } from '@/lib/billing';

/**
 * ตรรกะต้นทุนต่อจานและการตัดวัตถุดิบตามสูตร ไม่แตะฐานข้อมูล
 * ใช้ทั้งตอนลูกค้าสั่ง (แช่แข็งต้นทุนลง order_items และคิดยอดที่ต้องตัด)
 * และบนหน้าเมนูของแอดมิน (โชว์ต้นทุนกับกำไรขั้นต้นของแต่ละจาน)
 */

/** หน่วยนับวัตถุดิบที่พบบ่อย ใช้เป็นตัวเลือกในฟอร์ม (พิมพ์หน่วยอื่นเองได้) */
export const COMMON_INGREDIENT_UNITS = ['กรัม', 'กิโลกรัม', 'มล.', 'ลิตร', 'ฟอง', 'ชิ้น', 'ขวด', 'แพ็ค'] as const;

/** วัตถุดิบ 1 บรรทัดในสูตร พร้อมต้นทุนต่อหน่วยปัจจุบัน */
export type RecipeCostLine = {
  /** ปริมาณที่ใช้ต่อ 1 จาน ในหน่วยของวัตถุดิบนั้น เช่น 100 (กรัม) */
  quantity: number | string;
  /** ต้นทุนต่อ 1 หน่วยของวัตถุดิบ หน่วยบาท */
  costPerUnit: number | string;
};

/** วัตถุดิบ 1 บรรทัดในสูตร เท่าที่การตัดสต๊อกต้องใช้ */
export type RecipeUsageLine = {
  ingredientId: number;
  quantity: number | string;
};

/**
 * ปัดปริมาณวัตถุดิบเป็นทศนิยม 3 ตำแหน่ง ให้ตรงกับคอลัมน์ DECIMAL(12,3)
 *
 * @param value - ปริมาณที่ต้องการปัด
 * @returns ปริมาณทศนิยม 3 ตำแหน่ง คืน 0 เมื่อไม่ใช่ตัวเลข
 */
export function roundQty(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

/**
 * คิดต้นทุนวัตถุดิบของเมนู 1 จานจากสูตร
 *
 * @param lines - วัตถุดิบในสูตรพร้อมปริมาณต่อจานและต้นทุนต่อหน่วย
 * @returns ต้นทุนต่อจาน หน่วยบาท ทศนิยม 2 ตำแหน่ง หรือ null เมื่อเมนูนี้ยังไม่มีสูตร
 */
export function recipeUnitCost(lines: RecipeCostLine[]): number | null {
  if (lines.length === 0) return null;
  const total = lines.reduce(
    (sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.costPerUnit) || 0),
    0,
  );
  return roundBaht(total);
}

/** กำไรขั้นต้นของเมนู 1 จาน */
export type GrossMargin = {
  /** ราคาขายลบต้นทุนวัตถุดิบ หน่วยบาท */
  profit: number;
  /** กำไรคิดเป็นเปอร์เซ็นต์ของราคาขาย ทศนิยม 1 ตำแหน่ง null เมื่อราคาขายเป็น 0 */
  marginPct: number | null;
};

/**
 * คิดกำไรขั้นต้นต่อจาน (ยังไม่หักค่าแรง ค่าเช่า ค่าน้ำไฟ)
 *
 * @param price - ราคาขายต่อจาน หน่วยบาท
 * @param cost - ต้นทุนวัตถุดิบต่อจาน หน่วยบาท
 * @returns กำไรเป็นบาทและเปอร์เซ็นต์ของราคาขาย
 */
export function grossMargin(price: number, cost: number): GrossMargin {
  const profit = roundBaht(price - cost);
  if (price <= 0) return { profit, marginPct: null };
  return { profit, marginPct: Math.round((profit / price) * 1000) / 10 };
}

/**
 * คิดปริมาณวัตถุดิบที่ต้องตัดสำหรับเมนูที่สั่ง รวมบรรทัดวัตถุดิบเดียวกันไว้ด้วยกัน
 *
 * @param recipe - สูตรของเมนู ปริมาณต่อ 1 จาน
 * @param servings - จำนวนจานที่สั่ง
 * @returns วัตถุดิบและปริมาณที่ต้องตัด เรียงตาม ingredientId เสมอ
 *          (ล็อกแถวตามลำดับเดียวกันทุกครั้ง กัน deadlock เวลาสองโต๊ะสั่งพร้อมกัน)
 */
export function ingredientUsage(
  recipe: RecipeUsageLine[],
  servings: number,
): { ingredientId: number; quantity: number }[] {
  const totals = new Map<number, number>();
  for (const line of recipe) {
    const used = (Number(line.quantity) || 0) * servings;
    if (used <= 0) continue;
    totals.set(line.ingredientId, (totals.get(line.ingredientId) ?? 0) + used);
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a - b)
    .map(([ingredientId, quantity]) => ({ ingredientId, quantity: roundQty(quantity) }));
}

/**
 * ตัดสินว่าวัตถุดิบใกล้หมดหรือไม่
 *
 * @param quantity - ยอดคงเหลือปัจจุบัน
 * @param threshold - เกณฑ์เตือนของวัตถุดิบ null คือไม่ได้ตั้งเกณฑ์ไว้
 * @returns true เมื่อยอดคงเหลือต่ำกว่าหรือเท่ากับเกณฑ์ หรือติดลบ (ยอดในระบบไม่ตรงของจริง)
 */
export function isIngredientLow(quantity: number, threshold: number | null): boolean {
  if (quantity <= 0) return true;
  return threshold !== null && quantity <= threshold;
}
