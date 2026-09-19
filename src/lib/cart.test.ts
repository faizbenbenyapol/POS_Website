import { describe, expect, it } from 'vitest';
import { addCustomizedToCart, cartTotal, type CartItem } from '@/lib/cart';

/** กะเพรา 65 บาท ใช้เป็นเมนูตั้งต้นของทุกกรณี */
const KAPRAO = { menuItemId: 5, name: 'กะเพราหมูสับไข่ดาว', price: 65 };

describe('addCustomizedToCart', () => {
  it('ตัวเลือกชุดเดียวกัน (กดคนละลำดับ) และหมายเหตุเดียวกัน บวกจำนวนเข้าแถวเดิม', () => {
    let cart: CartItem[] = [];
    cart = addCustomizedToCart(cart, { ...KAPRAO, price: 75, optionIds: [21, 12], note: 'ไม่ใส่ถั่ว' });
    cart = addCustomizedToCart(cart, { ...KAPRAO, price: 75, optionIds: [12, 21], note: ' ไม่ใส่ถั่ว ', quantity: 2 });
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(3);
    expect(cart[0].optionIds).toEqual([12, 21]);
  });

  it('เมนูเดียวกันแต่ตัวเลือกต่างกันต้องแยกแถว ไม่อย่างนั้นครัวทำผิดจาน', () => {
    let cart: CartItem[] = [];
    cart = addCustomizedToCart(cart, { ...KAPRAO, optionIds: [11] });
    cart = addCustomizedToCart(cart, { ...KAPRAO, optionIds: [12] });
    expect(cart).toHaveLength(2);
  });

  it('จำนวนต่ำสุดคือ 1 เสมอ', () => {
    const cart = addCustomizedToCart([], { ...KAPRAO, quantity: 0 });
    expect(cart[0].quantity).toBe(1);
  });

  it('ไม่แก้ตะกร้าเดิม เพื่อให้ React รู้ว่าค่าเปลี่ยน', () => {
    const original: CartItem[] = [];
    const next = addCustomizedToCart(original, KAPRAO);
    expect(original).toHaveLength(0);
    expect(next).not.toBe(original);
  });
});

describe('cartTotal', () => {
  it('คิดจากราคาต่อจานที่รวมตัวเลือกแล้วคูณจำนวน', () => {
    const cart = addCustomizedToCart(
      addCustomizedToCart([], { ...KAPRAO, price: 75, optionIds: [21], quantity: 2 }),
      { menuItemId: 17, name: 'ชาไทยเย็น', price: 45 },
    );
    expect(cartTotal(cart)).toBe(195);
  });
});
