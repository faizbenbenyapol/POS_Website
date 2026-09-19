import { describe, expect, it } from 'vitest';
import { isBarItem } from '@/lib/kitchenRouting';

describe('isBarItem', () => {
  it('อาหารที่ชื่อมีคำว่า น้ำ หรือ ชา ต้องไปครัว เมื่อหมวดเป็นอาหาร', () => {
    expect(isBarItem({ itemName: 'ปีกไก่ทอดน้ำปลา', categoryName: 'ของทานเล่น' })).toBe(false);
    expect(isBarItem({ itemName: 'ต้มยำกุ้งน้ำข้น', categoryName: 'กับข้าว' })).toBe(false);
    expect(isBarItem({ itemName: 'ข้าวผัดกุ้ง', categoryName: 'จานเดียว' })).toBe(false);
  });

  it('หมวดเครื่องดื่มและของหวานไปบาร์ ไม่ว่าชื่อจะเป็นอะไร', () => {
    expect(isBarItem({ itemName: 'โซดา', categoryName: 'เครื่องดื่ม' })).toBe(true);
    expect(isBarItem({ itemName: 'บัวลอย', categoryName: 'ของหวาน' })).toBe(true);
  });

  it('ไม่รู้หมวด เดาจากคำขึ้นต้นชื่อเท่านั้น', () => {
    expect(isBarItem({ itemName: 'น้ำมะนาวโซดา' })).toBe(true);
    expect(isBarItem({ itemName: 'ชาไทยเย็น', categoryName: null })).toBe(true);
    expect(isBarItem({ itemName: 'Iced Latte' })).toBe(true);
    expect(isBarItem({ itemName: 'ปีกไก่ทอดน้ำปลา' })).toBe(false);
    expect(isBarItem({ itemName: 'แกงส้มชะอม' })).toBe(false);
  });
});
