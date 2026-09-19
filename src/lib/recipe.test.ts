import { describe, expect, it } from 'vitest';
import { grossMargin, ingredientUsage, isIngredientLow, recipeUnitCost } from '@/lib/recipe';

describe('recipeUnitCost', () => {
  it('รวมต้นทุนวัตถุดิบทุกบรรทัดของสูตร (กะเพราในข้อมูลตัวอย่าง)', () => {
    const cost = recipeUnitCost([
      { quantity: 100, costPerUnit: '0.1600' }, // หมูสับ 100 กรัม
      { quantity: '1.000', costPerUnit: 4.5 }, // ไข่ 1 ฟอง
      { quantity: 120, costPerUnit: 0.04 }, // ข้าว 120 กรัม
      { quantity: 10, costPerUnit: 0.12 }, // กะเพรา 10 กรัม
    ]);
    expect(cost).toBe(26.5);
  });

  it('คืน null เมื่อเมนูยังไม่มีสูตร เพื่อแยกจากเมนูที่ต้นทุนเป็นศูนย์จริง', () => {
    expect(recipeUnitCost([])).toBeNull();
  });
});

describe('grossMargin', () => {
  it('คิดกำไรเป็นบาทและเปอร์เซ็นต์ของราคาขาย', () => {
    expect(grossMargin(65, 26.5)).toEqual({ profit: 38.5, marginPct: 59.2 });
  });

  it('ไม่หารด้วยศูนย์เมื่อราคาขายเป็น 0', () => {
    expect(grossMargin(0, 5)).toEqual({ profit: -5, marginPct: null });
  });
});

describe('ingredientUsage', () => {
  it('คูณตามจำนวนจาน รวมวัตถุดิบซ้ำ และเรียงตาม id เพื่อล็อกแถวตามลำดับเดิมเสมอ', () => {
    const usage = ingredientUsage(
      [
        { ingredientId: 7, quantity: '0.333' },
        { ingredientId: 2, quantity: 1 },
        { ingredientId: 7, quantity: 0.1 },
      ],
      3,
    );
    expect(usage).toEqual([
      { ingredientId: 2, quantity: 3 },
      { ingredientId: 7, quantity: 1.299 },
    ]);
  });

  it('ข้ามบรรทัดที่ปริมาณเป็นศูนย์', () => {
    expect(ingredientUsage([{ ingredientId: 1, quantity: 0 }], 5)).toEqual([]);
  });
});

describe('isIngredientLow', () => {
  it('เตือนเมื่อถึงเกณฑ์ หรือยอดติดลบแม้ไม่ได้ตั้งเกณฑ์', () => {
    expect(isIngredientLow(100, 100)).toBe(true);
    expect(isIngredientLow(101, 100)).toBe(false);
    expect(isIngredientLow(-3, null)).toBe(true);
    expect(isIngredientLow(50, null)).toBe(false);
  });
});
