import { describe, expect, it } from 'vitest';
import {
  describeGroupRule,
  optionSelectionKey,
  resolveOptionSelection,
  type MenuOptionGroup,
} from '@/lib/menuOptions';

/** กลุ่มตัวเลือกแบบกะเพราในข้อมูลตัวอย่าง: เผ็ดบังคับเลือก 1 อย่าง ท็อปปิ้งเลือกเพิ่มได้ 2 อย่าง */
const GROUPS: MenuOptionGroup[] = [
  {
    id: 1,
    name: 'ระดับความเผ็ด',
    minSelect: 1,
    maxSelect: 1,
    options: [
      { id: 11, name: 'ไม่เผ็ด', priceDelta: 0 },
      { id: 12, name: 'เผ็ดน้อย', priceDelta: 0 },
    ],
  },
  {
    id: 2,
    name: 'เพิ่มท็อปปิ้ง',
    minSelect: 0,
    maxSelect: 2,
    options: [
      { id: 21, name: 'ไข่ดาวเพิ่ม', priceDelta: 10 },
      { id: 22, name: 'ไข่เจียว', priceDelta: 15 },
      { id: 23, name: 'หมูสับพิเศษ', priceDelta: 20 },
    ],
  },
];

describe('resolveOptionSelection', () => {
  it('คิดราคาเพิ่มและเรียงข้อความตามลำดับกลุ่ม ไม่ใช่ตามลำดับที่กด', () => {
    const result = resolveOptionSelection(GROUPS, [21, 12]);
    expect(result).toEqual({
      ok: true,
      priceDelta: 10,
      text: 'เผ็ดน้อย, ไข่ดาวเพิ่ม (+10)',
      options: [
        { optionId: 12, groupName: 'ระดับความเผ็ด', optionName: 'เผ็ดน้อย', priceDelta: 0 },
        { optionId: 21, groupName: 'เพิ่มท็อปปิ้ง', optionName: 'ไข่ดาวเพิ่ม', priceDelta: 10 },
      ],
    });
  });

  it('เมนูที่ไม่มีกลุ่มตัวเลือกผ่านได้โดยไม่เลือกอะไร', () => {
    expect(resolveOptionSelection([], [])).toEqual({ ok: true, options: [], priceDelta: 0, text: '' });
  });

  it('ปฏิเสธเมื่อกลุ่มที่บังคับยังไม่ได้เลือก', () => {
    const result = resolveOptionSelection(GROUPS, [21]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('ระดับความเผ็ด');
  });

  it('ปฏิเสธเมื่อเลือกเกินจำนวนที่กลุ่มอนุญาต', () => {
    expect(resolveOptionSelection(GROUPS, [11, 12]).ok).toBe(false);
    expect(resolveOptionSelection(GROUPS, [11, 21, 22, 23]).ok).toBe(false);
  });

  it('ปฏิเสธ id ที่ไม่ใช่ตัวเลือกของเมนูนี้ และ id ซ้ำ', () => {
    expect(resolveOptionSelection(GROUPS, [11, 999]).ok).toBe(false);
    expect(resolveOptionSelection(GROUPS, [11, 21, 21]).ok).toBe(false);
  });

  it('รองรับตัวเลือกที่ลดราคาและราคาทศนิยม', () => {
    const groups: MenuOptionGroup[] = [
      {
        id: 3,
        name: 'ขนาด',
        minSelect: 1,
        maxSelect: 1,
        options: [{ id: 31, name: 'เล็ก', priceDelta: -5.5 }],
      },
    ];
    const result = resolveOptionSelection(groups, [31]);
    expect(result.ok && result.priceDelta).toBe(-5.5);
    expect(result.ok && result.text).toBe('เล็ก (-5.50)');
  });
});

describe('describeGroupRule', () => {
  it('อธิบายกติกาเป็นภาษาไทยตามค่า min และ max', () => {
    expect(describeGroupRule({ minSelect: 1, maxSelect: 1 })).toBe('บังคับเลือก 1 อย่าง');
    expect(describeGroupRule({ minSelect: 1, maxSelect: 3 })).toBe('บังคับเลือก 1-3 อย่าง');
    expect(describeGroupRule({ minSelect: 0, maxSelect: 1 })).toBe('เลือกได้ 1 อย่าง (ไม่บังคับ)');
    expect(describeGroupRule({ minSelect: 0, maxSelect: 2 })).toBe('เลือกได้สูงสุด 2 อย่าง (ไม่บังคับ)');
  });
});

describe('optionSelectionKey', () => {
  it('ได้คีย์เดียวกันไม่ว่าจะกดตัวเลือกลำดับไหน', () => {
    expect(optionSelectionKey([21, 12])).toBe(optionSelectionKey([12, 21]));
    expect(optionSelectionKey(undefined)).toBe('');
  });
});
