/**
 * สิทธิ์การใช้งานตามบทบาท ประกาศไว้ที่เดียว ใช้ร่วมกันทั้งฝั่ง API (กันสิทธิ์จริง)
 * middleware (กันการเปิดหน้า) และแถบเมนู (ซ่อนเมนูที่ใช้ไม่ได้) ไม่แตะฐานข้อมูล
 *
 * บทบาท:
 *   ADMIN    เจ้าของร้าน / ผู้จัดการ ทำได้ทุกอย่าง
 *   STAFF    พนักงานทั่วไป ทำงานหน้าร้านได้ทุกอย่างเหมือนเดิม (ไม่เห็นยอดขาย ไม่แก้ราคา)
 *   CASHIER  แคชเชียร์: เปิดโต๊ะ ย้ายโต๊ะ ปิดบิล รับเงิน ปิดยอดประจำวัน ดูแลเรื่องแจ้งปัญหา
 *   KITCHEN  ครัว และ BAR บาร์: รับออเดอร์ ทำ เสิร์ฟ ยกเลิกจานที่ทำไม่ได้ ดูแลสต๊อกและวัตถุดิบ
 *            ปิดบิล รับเงิน หรือเปิดโต๊ะไม่ได้
 */

/** บทบาททั้งหมด ตรงกับ ENUM ของ users.role */
export const USER_ROLES = ['ADMIN', 'STAFF', 'CASHIER', 'KITCHEN', 'BAR'] as const;

export type Role = (typeof USER_ROLES)[number];

/** ชื่อบทบาทภาษาไทยที่แสดงบนหน้าจอ */
export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'ผู้ดูแลระบบ',
  STAFF: 'พนักงานทั่วไป',
  CASHIER: 'แคชเชียร์',
  KITCHEN: 'ครัว',
  BAR: 'บาร์เครื่องดื่ม',
};

/** คำอธิบายสั้น ๆ ของแต่ละบทบาท ใช้ในฟอร์มสร้างผู้ใช้ */
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ADMIN: 'ทำได้ทุกอย่าง ดูยอดขาย แก้ราคา ให้ส่วนลด คืนเงิน จัดการผู้ใช้',
  STAFF: 'งานหน้าร้านทุกอย่าง: ออเดอร์ ปิดบิล โต๊ะ สต๊อก แจ้งปัญหา',
  CASHIER: 'เปิดโต๊ะ ย้ายโต๊ะ ปิดบิล รับเงิน ปิดยอดประจำวัน',
  KITCHEN: 'รับออเดอร์อาหาร ทำ เสิร์ฟ ดูแลสต๊อกและวัตถุดิบ (ปิดบิลไม่ได้)',
  BAR: 'รับออเดอร์เครื่องดื่ม ทำ เสิร์ฟ ดูแลสต๊อกและวัตถุดิบ (ปิดบิลไม่ได้)',
};

/** สิ่งที่ทำได้ แยกเป็นเรื่อง ๆ แทนการเช็คชื่อบทบาทกระจายทั่วโค้ด */
export type Capability =
  | 'dashboard.view'
  | 'orders.view'
  | 'orders.progress'
  | 'orders.cancelItem'
  | 'checkout'
  | 'tables.operate'
  | 'settlement'
  | 'tickets'
  | 'stock.menu'
  | 'ingredients.stock';

/** ความสามารถของงานหน้าร้าน (บทบาท STAFF เดิม) */
const FLOOR: Capability[] = [
  'dashboard.view',
  'orders.view',
  'orders.progress',
  'orders.cancelItem',
  'checkout',
  'tables.operate',
  'settlement',
  'tickets',
  'stock.menu',
  'ingredients.stock',
];

/** ความสามารถของครัวและบาร์ */
const PREP: Capability[] = [
  'dashboard.view',
  'orders.view',
  'orders.progress',
  'orders.cancelItem',
  'tickets',
  'stock.menu',
  'ingredients.stock',
];

/** ตารางสิทธิ์ของแต่ละบทบาท ADMIN ไม่อยู่ในตารางเพราะทำได้ทุกอย่าง */
const ROLE_CAPABILITIES: Record<Exclude<Role, 'ADMIN'>, ReadonlySet<Capability>> = {
  STAFF: new Set(FLOOR),
  CASHIER: new Set<Capability>([
    'dashboard.view',
    'orders.view',
    'orders.progress',
    'orders.cancelItem',
    'checkout',
    'tables.operate',
    'settlement',
    'tickets',
  ]),
  KITCHEN: new Set(PREP),
  BAR: new Set(PREP),
};

/**
 * ตรวจว่าค่าที่อ่านมา (จาก JWT หรือฐานข้อมูล) เป็นบทบาทที่ระบบรู้จัก
 *
 * @param value - ค่าที่ต้องการตรวจ
 * @returns true เมื่อเป็นบทบาทที่รู้จัก
 */
export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

/**
 * ตรวจว่าบทบาทนี้ทำเรื่องนี้ได้หรือไม่
 *
 * @param role - บทบาทของผู้ใช้
 * @param capability - สิ่งที่ต้องการทำ
 * @returns true เมื่อทำได้
 */
export function can(role: Role, capability: Capability): boolean {
  if (role === 'ADMIN') return true;
  return ROLE_CAPABILITIES[role]?.has(capability) ?? false;
}

/**
 * หน้าหลังบ้านแต่ละหน้าต้องใช้สิทธิ์อะไร null คือเฉพาะ ADMIN
 * หน้าที่ไม่อยู่ในรายการ (เช่น /admin/profile) ทุกบทบาทเปิดได้
 * เรียงจากเส้นทางที่ยาวกว่าก่อน เพื่อให้ /admin/settlement/history จับก่อน /admin
 */
const PAGE_RULES: { prefix: string; capability: Capability | null }[] = [
  { prefix: '/admin/orders', capability: 'orders.view' },
  { prefix: '/admin/settlement', capability: 'settlement' },
  { prefix: '/admin/tables', capability: 'tables.operate' },
  { prefix: '/admin/tickets', capability: 'tickets' },
  { prefix: '/admin/stock', capability: 'stock.menu' },
  { prefix: '/admin/ingredients', capability: 'ingredients.stock' },
  { prefix: '/admin/menu', capability: 'stock.menu' },
  { prefix: '/admin/categories', capability: null },
  { prefix: '/admin/branches', capability: null },
  { prefix: '/admin/users', capability: null },
  { prefix: '/admin/logs', capability: null },
];

/**
 * ตรวจว่าบทบาทนี้เปิดหน้าหลังบ้านนี้ได้หรือไม่
 *
 * @param role - บทบาทของผู้ใช้
 * @param pathname - เส้นทางของหน้า เช่น /admin/stock
 * @returns true เมื่อเปิดได้
 */
export function canOpenPage(role: Role, pathname: string): boolean {
  if (role === 'ADMIN') return true;
  if (pathname === '/admin' || pathname === '/admin/') return can(role, 'dashboard.view');
  const rule = PAGE_RULES.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
  if (!rule) return true;
  return rule.capability !== null && can(role, rule.capability);
}

/**
 * หน้าแรกหลังล็อกอินของแต่ละบทบาท
 *
 * @param role - บทบาทของผู้ใช้
 * @returns เส้นทางหน้าแรก
 */
export function homePathFor(role: Role): string {
  return role === 'ADMIN' ? '/admin' : '/admin/orders';
}
