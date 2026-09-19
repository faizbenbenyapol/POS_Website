import { describe, expect, it } from 'vitest';
import { summarizeGrossProfit } from '@/lib/profit';

describe('summarizeGrossProfit', () => {
  it('รวมกำไรเฉพาะยอดขายที่รู้ต้นทุน และบอกสัดส่วนที่ครอบคลุม', () => {
    const summary = summarizeGrossProfit([
      // กะเพรา 10 จาน รู้ต้นทุนทุกจาน
      { item_name: 'กะเพรา', quantity: 10, sales: '650.00', costed_sales: '650.00', cost: '265.00' },
      // ชาไทย 4 แก้ว รู้ต้นทุนทุกแก้ว
      { item_name: 'ชาไทย', quantity: 4, sales: 180, costed_sales: 180, cost: 50.4 },
      // ปีกไก่ยังไม่มีสูตร
      { item_name: 'ปีกไก่', quantity: 2, sales: 258, costed_sales: 0, cost: 0 },
    ]);
    expect(summary.totalSales).toBe(1088);
    expect(summary.costedSales).toBe(830);
    expect(summary.totalCost).toBe(315.4);
    expect(summary.grossProfit).toBe(514.6);
    expect(summary.marginPct).toBe(62);
    expect(summary.coveragePct).toBe(76.3);
    expect(summary.uncostedMenuCount).toBe(1);
  });

  it('เรียงเมนูจากกำไรมากไปน้อย และเมนูที่ไม่รู้ต้นทุนไปท้ายสุดตามยอดขาย', () => {
    const summary = summarizeGrossProfit([
      { item_name: 'ไม่มีสูตร-น้อย', quantity: 1, sales: 50, costed_sales: 0, cost: 0 },
      { item_name: 'กำไรน้อย', quantity: 1, sales: 100, costed_sales: 100, cost: 90 },
      { item_name: 'ไม่มีสูตร-มาก', quantity: 5, sales: 500, costed_sales: 0, cost: 0 },
      { item_name: 'กำไรมาก', quantity: 1, sales: 100, costed_sales: 100, cost: 20 },
    ]);
    expect(summary.menus.map((m) => m.itemName)).toEqual([
      'กำไรมาก',
      'กำไรน้อย',
      'ไม่มีสูตร-มาก',
      'ไม่มีสูตร-น้อย',
    ]);
    expect(summary.menus[2]).toMatchObject({ cost: null, profit: null, marginPct: null });
  });

  it('เมนูที่เพิ่งใส่สูตรกลางช่วง คิดกำไรจากเฉพาะจานที่รู้ต้นทุน', () => {
    const [menu] = summarizeGrossProfit([
      { item_name: 'ข้าวผัด', quantity: 10, sales: 850, costed_sales: 340, cost: 120 },
    ]).menus;
    expect(menu).toMatchObject({ sales: 850, cost: 120, profit: 220, marginPct: 64.7 });
  });

  it('ไม่มียอดขายเลย ได้ศูนย์และเปอร์เซ็นต์เป็น null ไม่หารด้วยศูนย์', () => {
    expect(summarizeGrossProfit([])).toEqual({
      totalSales: 0,
      costedSales: 0,
      totalCost: 0,
      grossProfit: 0,
      marginPct: null,
      coveragePct: null,
      uncostedMenuCount: 0,
      menus: [],
    });
  });
});
