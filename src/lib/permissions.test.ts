import { describe, expect, it } from 'vitest';
import { can, canOpenPage, homePathFor, isRole, USER_ROLES } from '@/lib/permissions';

describe('can', () => {
  it('ADMIN ทำได้ทุกอย่าง', () => {
    expect(can('ADMIN', 'checkout')).toBe(true);
    expect(can('ADMIN', 'ingredients.stock')).toBe(true);
  });

  it('ครัวและบาร์ปิดบิล รับเงิน เปิดโต๊ะ และปิดยอดไม่ได้', () => {
    for (const role of ['KITCHEN', 'BAR'] as const) {
      expect(can(role, 'checkout')).toBe(false);
      expect(can(role, 'tables.operate')).toBe(false);
      expect(can(role, 'settlement')).toBe(false);
      expect(can(role, 'orders.progress')).toBe(true);
      expect(can(role, 'orders.cancelItem')).toBe(true);
      expect(can(role, 'stock.menu')).toBe(true);
    }
  });

  it('แคชเชียร์ปิดบิลได้ แต่แก้สต๊อกและวัตถุดิบไม่ได้', () => {
    expect(can('CASHIER', 'checkout')).toBe(true);
    expect(can('CASHIER', 'tables.operate')).toBe(true);
    expect(can('CASHIER', 'stock.menu')).toBe(false);
    expect(can('CASHIER', 'ingredients.stock')).toBe(false);
  });

  it('พนักงานทั่วไปทำงานหน้าร้านได้ครบเหมือนเดิม', () => {
    expect(can('STAFF', 'checkout')).toBe(true);
    expect(can('STAFF', 'stock.menu')).toBe(true);
    expect(can('STAFF', 'ingredients.stock')).toBe(true);
  });
});

describe('canOpenPage', () => {
  it('หน้าที่สงวนให้ ADMIN เปิดไม่ได้ทุกบทบาทอื่น', () => {
    for (const role of USER_ROLES.filter((r) => r !== 'ADMIN')) {
      expect(canOpenPage(role, '/admin/users')).toBe(false);
      expect(canOpenPage(role, '/admin/branches/1/menu')).toBe(false);
      expect(canOpenPage(role, '/admin/logs')).toBe(false);
    }
  });

  it('ตรวจตามเส้นทางย่อยด้วย และไม่สับสนเส้นทางที่ขึ้นต้นเหมือนกัน', () => {
    expect(canOpenPage('KITCHEN', '/admin/settlement/history')).toBe(false);
    expect(canOpenPage('CASHIER', '/admin/settlement/history')).toBe(true);
    expect(canOpenPage('KITCHEN', '/admin/stock')).toBe(true);
    expect(canOpenPage('CASHIER', '/admin/stock')).toBe(false);
  });

  it('หน้าที่ไม่มีกฎ เช่น ข้อมูลส่วนตัว เปิดได้ทุกบทบาท', () => {
    expect(canOpenPage('BAR', '/admin/profile')).toBe(true);
    expect(canOpenPage('KITCHEN', '/admin')).toBe(true);
  });
});

describe('isRole / homePathFor', () => {
  it('รู้จักเฉพาะบทบาทที่ประกาศไว้', () => {
    expect(isRole('KITCHEN')).toBe(true);
    expect(isRole('ROOT')).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });

  it('หน้าแรกของ ADMIN คือภาพรวมร้าน บทบาทอื่นคือกระดานออเดอร์', () => {
    expect(homePathFor('ADMIN')).toBe('/admin');
    expect(homePathFor('KITCHEN')).toBe('/admin/orders');
  });
});
