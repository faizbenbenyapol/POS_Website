import { roundBaht } from '@/lib/billing';

/**
 * ตรรกะตัวเลือกอาหาร (เผ็ดน้อย / พิเศษ / ท็อปปิ้ง) รวมไว้ที่ไฟล์เดียวและไม่แตะฐานข้อมูล
 * หน้าเมนูของลูกค้าใช้ตรวจก่อนใส่ตะกร้า ส่วนเซิร์ฟเวอร์ใช้ตรวจซ้ำและคิดราคาจริงตอนสั่ง
 * กฎจึงตรงกันทั้งสองฝั่ง ลูกค้าไม่เจอกรณีหน้าจอบอกว่าผ่านแต่กดสั่งแล้วโดนปฏิเสธ
 */

/** ตัวเลือก 1 อย่างในกลุ่ม เช่น "ไข่ดาวเพิ่ม +10" */
export type MenuOption = {
  id: number;
  name: string;
  /** ราคาที่บวกเพิ่มต่อจาน หน่วยบาท ใส่ 0 เมื่อไม่คิดเงินเพิ่ม */
  priceDelta: number;
};

/** กลุ่มตัวเลือกของเมนู เช่น "ระดับความเผ็ด" หรือ "เพิ่มท็อปปิ้ง" */
export type MenuOptionGroup = {
  id: number;
  name: string;
  /** จำนวนที่ต้องเลือกอย่างน้อย 0 คือไม่บังคับ */
  minSelect: number;
  /** จำนวนที่เลือกได้มากที่สุด 1 คือเลือกได้อย่างเดียว */
  maxSelect: number;
  options: MenuOption[];
};

/** ตัวเลือกที่ผ่านการตรวจแล้ว พร้อมชื่อกลุ่ม ใช้คัดลอกลง order_item_options */
export type ChosenOption = {
  optionId: number;
  groupName: string;
  optionName: string;
  priceDelta: number;
};

/** ผลการตรวจตัวเลือกที่ลูกค้าเลือกมา */
export type OptionSelectionResult =
  | {
      ok: true;
      options: ChosenOption[];
      /** ผลรวมราคาที่บวกเพิ่มต่อจาน หน่วยบาท */
      priceDelta: number;
      /** ข้อความสรุปสำหรับครัวและใบเสร็จ เช่น "เผ็ดน้อย, ไข่ดาวเพิ่ม (+10)" ว่างเมื่อไม่ได้เลือก */
      text: string;
    }
  | { ok: false; message: string };

/**
 * แปลงราคาที่บวกเพิ่มเป็นข้อความสั้น ๆ ต่อท้ายชื่อตัวเลือก
 *
 * @param priceDelta - ราคาที่บวกเพิ่ม หน่วยบาท
 * @returns เช่น " (+10)" หรือ " (-5)" คืนสตริงว่างเมื่อราคาเท่าเดิม
 */
function formatDelta(priceDelta: number): string {
  if (priceDelta === 0) return '';
  const amount = Number.isInteger(priceDelta) ? String(Math.abs(priceDelta)) : Math.abs(priceDelta).toFixed(2);
  return ` (${priceDelta > 0 ? '+' : '-'}${amount})`;
}

/**
 * อธิบายกติกาการเลือกของกลุ่มเป็นภาษาไทย ใช้แสดงใต้ชื่อกลุ่มบนหน้าเมนู
 *
 * @param group - กลุ่มตัวเลือก
 * @returns เช่น "บังคับเลือก 1 อย่าง" หรือ "เลือกได้สูงสุด 2 อย่าง (ไม่บังคับ)"
 */
export function describeGroupRule(group: Pick<MenuOptionGroup, 'minSelect' | 'maxSelect'>): string {
  const { minSelect, maxSelect } = group;
  if (minSelect > 0 && minSelect === maxSelect) return `บังคับเลือก ${minSelect} อย่าง`;
  if (minSelect > 0) return `บังคับเลือก ${minSelect}-${maxSelect} อย่าง`;
  if (maxSelect === 1) return 'เลือกได้ 1 อย่าง (ไม่บังคับ)';
  return `เลือกได้สูงสุด ${maxSelect} อย่าง (ไม่บังคับ)`;
}

/**
 * ตรวจตัวเลือกที่ลูกค้าเลือกเทียบกับกติกาของแต่ละกลุ่ม แล้วคิดราคาที่บวกเพิ่ม
 *
 * ปฏิเสธเมื่อ: ส่ง id ที่ไม่ใช่ตัวเลือกของเมนูนี้ (หรือถูกปิดไปแล้ว), ส่ง id ซ้ำ,
 * กลุ่มที่บังคับยังเลือกไม่ครบ หรือเลือกเกินจำนวนที่กลุ่มนั้นอนุญาต
 * ข้อความสรุปเรียงตามลำดับกลุ่มและลำดับตัวเลือก ไม่ใช่ตามลำดับที่ลูกค้ากด
 * ครัวจึงอ่านจานเดียวกันได้หน้าตาเดียวกันเสมอ
 *
 * @param groups - กลุ่มตัวเลือกที่เปิดใช้อยู่ของเมนู (ส่งเฉพาะตัวเลือกที่เปิดใช้)
 * @param selectedIds - id ของตัวเลือกที่ลูกค้าเลือก
 * @returns ตัวเลือกที่ผ่านการตรวจพร้อมราคาและข้อความสรุป หรือข้อความไทยบอกว่าต้องแก้อะไร
 */
export function resolveOptionSelection(
  groups: MenuOptionGroup[],
  selectedIds: number[],
): OptionSelectionResult {
  const selected = new Set(selectedIds);
  if (selected.size !== selectedIds.length) {
    return { ok: false, message: 'เลือกตัวเลือกเดียวกันซ้ำ กรุณาเลือกใหม่อีกครั้ง' };
  }

  const known = new Set(groups.flatMap((g) => g.options.map((o) => o.id)));
  if (selectedIds.some((id) => !known.has(id))) {
    return {
      ok: false,
      message: 'มีตัวเลือกที่ร้านเพิ่งปิดไปหรือไม่ใช่ของเมนูนี้ กรุณาเปิดเมนูแล้วเลือกใหม่',
    };
  }

  const chosen: ChosenOption[] = [];
  for (const group of groups) {
    const picked = group.options.filter((o) => selected.has(o.id));
    if (picked.length < group.minSelect) {
      return { ok: false, message: `กรุณาเลือก "${group.name}" ให้ครบ (${describeGroupRule(group)})` };
    }
    if (picked.length > group.maxSelect) {
      return { ok: false, message: `"${group.name}" เลือกได้สูงสุด ${group.maxSelect} อย่าง` };
    }
    for (const option of picked) {
      chosen.push({
        optionId: option.id,
        groupName: group.name,
        optionName: option.name,
        priceDelta: roundBaht(Number(option.priceDelta) || 0),
      });
    }
  }

  const priceDelta = roundBaht(chosen.reduce((sum, o) => sum + o.priceDelta, 0));
  const text = chosen.map((o) => `${o.optionName}${formatDelta(o.priceDelta)}`).join(', ');
  return { ok: true, options: chosen, priceDelta, text };
}

/**
 * สร้างคีย์ของชุดตัวเลือกที่ไม่ขึ้นกับลำดับการกด ใช้ตัดสินว่าของในตะกร้าเป็นจานเดียวกันหรือไม่
 * เช่น เลือก [5, 2] กับ [2, 5] ต้องถือเป็นชุดเดียวกันแล้วบวกจำนวนเข้าแถวเดิม
 *
 * @param optionIds - id ของตัวเลือกที่เลือก
 * @returns ข้อความคีย์ เช่น "2,5" หรือสตริงว่างเมื่อไม่ได้เลือกอะไร
 */
export function optionSelectionKey(optionIds: readonly number[] | undefined): string {
  return [...(optionIds ?? [])].sort((a, b) => a - b).join(',');
}
