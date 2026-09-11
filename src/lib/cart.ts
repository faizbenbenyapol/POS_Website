/** รายการ 1 ชิ้นในตะกร้าของลูกค้า เก็บเท่าที่จำเป็นต่อการสั่ง ราคาจริงดึงใหม่ที่เซิร์ฟเวอร์ */
export type CartItem = {
  menuItemId: number;
  name: string;
  price: number;
  quantity: number;
  note: string;
};

/** คำนำหน้าคีย์ใน localStorage แยกตะกร้าตามโต๊ะ ไม่ให้ปนกันเวลาเปิดหลายแท็บ */
const CART_KEY_PREFIX = 'pos-cart-';

/**
 * เก็บตะกร้าไว้ใน localStorage ของเบราว์เซอร์ลูกค้า ไม่เก็บบนเซิร์ฟเวอร์
 * เพราะลูกค้าไม่มีบัญชี และตะกร้าที่ยังไม่กดยืนยันยังไม่ใช่ข้อมูลของร้าน
 *
 * @param token - qr_token ของโต๊ะ ใช้แยกตะกร้าของแต่ละโต๊ะ
 * @returns คีย์เต็มสำหรับ localStorage
 */
function cartKey(token: string): string {
  return `${CART_KEY_PREFIX}${token}`;
}

/**
 * อ่านตะกร้าของโต๊ะนั้นจาก localStorage
 * ครอบ try/catch เพราะเบราว์เซอร์บางโหมด (เช่นโหมดส่วนตัว) อ่านไม่ได้และจะโยน error
 *
 * @param token - qr_token ของโต๊ะ
 * @returns รายการในตะกร้า หรืออาร์เรย์ว่างเมื่ออ่านไม่ได้หรือยังไม่มีตะกร้า
 */
export function readCart(token: string): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(cartKey(token));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CartItem[]) : [];
  } catch {
    return [];
  }
}

/**
 * บันทึกตะกร้าลง localStorage ถ้าตะกร้าว่างจะลบคีย์ทิ้งเพื่อไม่ให้มีขยะค้าง
 *
 * @param token - qr_token ของโต๊ะ
 * @param items - รายการในตะกร้าที่จะบันทึก
 * @returns ไม่คืนค่า แต่มีผลข้างเคียงคือเขียนลง localStorage
 */
export function writeCart(token: string, items: CartItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    if (items.length === 0) window.localStorage.removeItem(cartKey(token));
    else window.localStorage.setItem(cartKey(token), JSON.stringify(items));
  } catch {
    // เขียนไม่ได้ก็ปล่อยผ่าน ลูกค้ายังสั่งต่อได้จากตะกร้าที่อยู่ในหน่วยความจำของหน้านั้น
  }
}

/**
 * คำนวณยอดรวมของตะกร้า ใช้แสดงบนปุ่มยืนยันสั่งและแถบยอดรวมล่างจอ
 * ยอดนี้เป็นเพียงตัวเลขให้ลูกค้าเห็น ยอดจริงคำนวณใหม่ที่เซิร์ฟเวอร์เสมอ
 *
 * @param items - รายการในตะกร้า
 * @returns ยอดรวมเป็นตัวเลขบาท
 */
export function cartTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

/**
 * เพิ่มเมนูลงตะกร้า ถ้ามีเมนูเดิมอยู่แล้วให้บวกจำนวนแทนการเพิ่มแถวใหม่
 * เพื่อไม่ให้ตะกร้ายาวเป็นหางว่าวเวลาลูกค้ากดปุ่มเดิมซ้ำ ๆ
 *
 * @param items - ตะกร้าปัจจุบัน
 * @param addition - เมนูที่จะเพิ่ม พร้อมชื่อและราคาที่แสดงอยู่บนหน้าจอ
 * @returns ตะกร้าชุดใหม่ (ไม่แก้ของเดิมเพื่อให้ React รู้ว่าค่าเปลี่ยน)
 */
export function addToCart(
  items: CartItem[],
  addition: { menuItemId: number; name: string; price: number },
): CartItem[] {
  const existing = items.find((item) => item.menuItemId === addition.menuItemId);
  if (existing) {
    return items.map((item) =>
      item.menuItemId === addition.menuItemId
        ? { ...item, quantity: item.quantity + 1 }
        : item,
    );
  }
  return [...items, { ...addition, quantity: 1, note: '' }];
}

/**
 * เพิ่มเมนูลงตะกร้าพร้อมระบุจำนวนและข้อความหมายเหตุพิเศษ (สไตล์ LINE MAN)
 * หากมีเมนูเดียวกันและหมายเหตุเดียวกันเป๊ะ ให้บวกจำนวนเพิ่ม
 *
 * @param items - ตะกร้าปัจจุบัน
 * @param addition - รายละเอียดเมนู พร้อมจำนวนและข้อความหมายเหตุ
 * @returns ตะกร้าชุดใหม่
 */
export function addCustomizedToCart(
  items: CartItem[],
  addition: {
    menuItemId: number;
    name: string;
    price: number;
    quantity?: number;
    note?: string;
  },
): CartItem[] {
  const qty = Math.max(1, addition.quantity ?? 1);
  const note = (addition.note ?? '').trim();

  const existing = items.find(
    (item) => item.menuItemId === addition.menuItemId && item.note.trim() === note,
  );

  if (existing) {
    return items.map((item) =>
      item === existing ? { ...item, quantity: item.quantity + qty } : item,
    );
  }

  return [...items, { ...addition, quantity: qty, note }];
}

