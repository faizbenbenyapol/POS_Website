import { roundBaht } from '@/lib/billing';

/**
 * สรุปกำไรขั้นต้นจากยอดขายรายเมนู ไม่แตะฐานข้อมูล
 *
 * นิยามที่ใช้ (แสดงบนหน้าจอด้วย ไม่ให้คนอ่านตีความผิด):
 * - ยอดขายคิดจากราคาต่อจานที่คัดลอกไว้ตอนสั่ง (รวมราคาตัวเลือก) ของรายการที่ไม่ถูกยกเลิก
 *   ในบิลที่ปิดแล้วและไม่ถูกคืนเงิน ยังไม่หักส่วนลดท้ายบิล และถ้าสาขาตั้งราคารวม VAT ก็ยังรวม VAT อยู่
 * - ต้นทุนคิดจาก order_items.unit_cost ที่แช่แข็งไว้ตอนสั่ง จึงไม่เปลี่ยนตามต้นทุนที่แก้ทีหลัง
 * - เมนูที่ตอนสั่งยังไม่มีสูตร (unit_cost เป็น NULL) ไม่รู้ต้นทุน จึงไม่ถูกนับในกำไร
 *   แต่แสดงสัดส่วนยอดขายที่คิดกำไรได้ (coverage) ให้เห็นว่าตัวเลขครอบคลุมยอดขายแค่ไหน
 */

/** ยอดขายของเมนูหนึ่งในช่วงเวลาที่เลือก ตามที่ SQL รวมมาให้ */
export type MenuSalesRow = {
  item_name: string;
  quantity: number | string;
  /** ยอดขายทั้งหมดของเมนูนี้ */
  sales: number | string;
  /** ยอดขายเฉพาะจานที่รู้ต้นทุน (มีสูตรตอนสั่ง) */
  costed_sales: number | string;
  /** ต้นทุนรวมของจานที่รู้ต้นทุน */
  cost: number | string;
};

/** กำไรขั้นต้นของเมนูหนึ่ง */
export type MenuProfit = {
  itemName: string;
  quantity: number;
  sales: number;
  /** ยอดขายเฉพาะจานที่รู้ต้นทุน กำไรของเมนูคิดจากยอดนี้ ไม่ใช่จาก sales */
  costedSales: number;
  cost: number | null;
  profit: number | null;
  marginPct: number | null;
};

/** สรุปกำไรขั้นต้นของช่วงเวลาทั้งช่วง */
export type GrossProfitSummary = {
  totalSales: number;
  costedSales: number;
  totalCost: number;
  grossProfit: number;
  /** กำไรต่อยอดขายที่รู้ต้นทุน ทศนิยม 1 ตำแหน่ง null เมื่อยังไม่มียอดขายที่รู้ต้นทุน */
  marginPct: number | null;
  /** ยอดขายที่รู้ต้นทุนเป็นกี่เปอร์เซ็นต์ของยอดขายทั้งหมด ทศนิยม 1 ตำแหน่ง */
  coveragePct: number | null;
  /** จำนวนเมนูที่ขายได้แต่ยังไม่รู้ต้นทุนเลย */
  uncostedMenuCount: number;
  menus: MenuProfit[];
};

/**
 * คิดเปอร์เซ็นต์ทศนิยม 1 ตำแหน่ง
 *
 * @param part - ตัวตั้ง
 * @param whole - ตัวหาร
 * @returns เปอร์เซ็นต์ หรือ null เมื่อตัวหารเป็น 0
 */
function percent(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

/**
 * รวมยอดขายรายเมนูเป็นสรุปกำไรขั้นต้น และเรียงเมนูจากกำไรมากไปน้อย
 * เมนูที่ยังไม่รู้ต้นทุนเลยไปอยู่ท้ายสุด เรียงตามยอดขาย เพื่อบอกว่าควรใส่สูตรเมนูไหนก่อน
 *
 * เมนูที่รู้ต้นทุนบางจาน (เช่น เพิ่งใส่สูตรกลางเดือน) คิดกำไรจากเฉพาะจานที่รู้ต้นทุน
 *
 * @param rows - ยอดขายรายเมนูจากฐานข้อมูล
 * @returns สรุปกำไรขั้นต้นพร้อมรายละเอียดรายเมนู
 */
export function summarizeGrossProfit(rows: MenuSalesRow[]): GrossProfitSummary {
  const menus: MenuProfit[] = rows.map((row) => {
    const sales = roundBaht(Number(row.sales) || 0);
    const costedSales = roundBaht(Number(row.costed_sales) || 0);
    const hasCost = costedSales > 0;
    const cost = hasCost ? roundBaht(Number(row.cost) || 0) : null;
    const profit = cost === null ? null : roundBaht(costedSales - cost);
    return {
      itemName: row.item_name,
      quantity: Number(row.quantity) || 0,
      sales,
      costedSales,
      cost,
      profit,
      marginPct: profit === null ? null : percent(profit, costedSales),
    };
  });

  const totalSales = roundBaht(menus.reduce((sum, m) => sum + m.sales, 0));
  const costedSales = roundBaht(menus.reduce((sum, m) => sum + m.costedSales, 0));
  const totalCost = roundBaht(menus.reduce((sum, m) => sum + (m.cost ?? 0), 0));
  const grossProfit = roundBaht(costedSales - totalCost);

  menus.sort((a, b) => {
    if (a.profit === null && b.profit === null) return b.sales - a.sales;
    if (a.profit === null) return 1;
    if (b.profit === null) return -1;
    return b.profit - a.profit;
  });

  return {
    totalSales,
    costedSales,
    totalCost,
    grossProfit,
    marginPct: percent(grossProfit, costedSales),
    coveragePct: percent(costedSales, totalSales),
    uncostedMenuCount: menus.filter((m) => m.profit === null).length,
    menus,
  };
}
