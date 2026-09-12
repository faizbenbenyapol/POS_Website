import { z } from 'zod';

/**
 * ข้อความ error ภาษาไทยที่ใช้ซ้ำหลายที่ ประกาศไว้ที่เดียวกันสะกดไม่ตรงกัน
 */
const MESSAGES = {
  required: 'กรอกข้อมูลช่องนี้ด้วย',
} as const;

/**
 * ตรวจข้อมูลฟอร์มล็อกอินของพนักงาน
 * ไม่บังคับความยาวรหัสผ่านขั้นต่ำที่นี่ เพราะบัญชีเก่าอาจตั้งรหัสสั้นกว่าเกณฑ์ใหม่
 * แล้วจะล็อกอินไม่ได้ทั้งที่รหัสถูก
 */
export const loginSchema = z.object({
  username: z.string().trim().min(1, MESSAGES.required).max(50),
  password: z.string().min(1, MESSAGES.required).max(200),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * รวบข้อความ error ตัวแรกจากผลตรวจของ zod มาเป็นประโยคเดียวให้ผู้ใช้อ่าน
 * เลือกตัวแรกเพราะผู้ใช้แก้ทีละช่องอยู่แล้ว การขึ้นทุกช่องพร้อมกันอ่านยากกว่า
 *
 * @param error - ZodError ที่ได้จาก schema.safeParse
 * @returns ข้อความภาษาไทยที่พร้อมแสดงบนหน้าจอ
 */
export function firstErrorMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'ข้อมูลที่ส่งมาไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง';
}

/**
 * ตรวจข้อมูลหมวดหมู่เมนู sort_order ใช้เรียงแถบหมวดหมู่บนหน้าลูกค้า
 */
export const categorySchema = z.object({
  name: z.string().trim().min(1, MESSAGES.required).max(60, 'ชื่อหมวดหมู่ยาวเกิน 60 ตัวอักษร'),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});

/**
 * ตรวจข้อมูลรายการอาหาร ราคาห้ามติดลบและจำกัด 8 หลักตามคอลัมน์ DECIMAL(10,2)
 */
export const menuItemSchema = z.object({
  categoryId: z.coerce.number().int().positive('เลือกหมวดหมู่ของเมนูด้วย'),
  name: z.string().trim().min(1, MESSAGES.required).max(120, 'ชื่อเมนูยาวเกิน 120 ตัวอักษร'),
  description: z.string().trim().max(255, 'คำอธิบายยาวเกิน 255 ตัวอักษร').optional().or(z.literal('')),
  price: z.coerce.number().min(0, 'ราคาต้องไม่ติดลบ').max(99999999, 'ราคาสูงเกินกว่าที่ระบบรองรับ'),
  imageUrl: z.string().trim().max(1000, 'ลิงก์รูปภาพยาวเกิน 1,000 ตัวอักษร').optional().or(z.literal('')),
  isAvailable: z.boolean().default(true),
});

/**
 * ตรวจข้อมูลสาขา
 */
export const branchSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, MESSAGES.required)
    .max(20, 'รหัสสาขายาวเกิน 20 ตัวอักษร')
    .regex(/^[A-Z0-9_-]+$/i, 'รหัสสาขาใช้ได้เฉพาะตัวอักษร ตัวเลข ขีดกลาง และขีดล่าง'),
  name: z.string().trim().min(1, MESSAGES.required).max(100, 'ชื่อสาขายาวเกิน 100 ตัวอักษร'),
  address: z.string().trim().max(255, 'ที่อยู่ยาวเกิน 255 ตัวอักษร').optional().or(z.literal('')),
  phone: z.string().trim().max(30, 'เบอร์โทรยาวเกิน 30 ตัวอักษร').optional().or(z.literal('')),
  businessDayCutoffHour: z.coerce.number().int().min(0).max(23).default(4),
  isActive: z.boolean().default(true),
});

export const updateBranchSchema = branchSchema.partial();

/**
 * ตรวจการตั้งราคาพิเศษและเปิด/ปิดของหมดเฉพาะสาขา
 */
export const branchMenuOverrideSchema = z.object({
  menuItemId: z.coerce.number().int().positive('ต้องระบุ menuItemId'),
  customPrice: z.coerce
    .number()
    .min(0, 'ราคาต้องไม่ติดลบ')
    .max(99999999, 'ราคาสูงเกินไป')
    .nullable()
    .optional(),
  isAvailable: z.boolean().default(true),
});

/**
 * ตรวจข้อมูลโต๊ะ table_no ต้องไม่ซ้ำในสาขาเดียวกัน (ตรวจซ้ำอีกชั้นด้วย UNIQUE ในฐานข้อมูล)
 */
export const tableSchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  tableNo: z.string().trim().min(1, MESSAGES.required).max(10, 'เลขโต๊ะยาวเกิน 10 ตัวอักษร'),
  seats: z.coerce.number().int().min(1, 'จำนวนที่นั่งต้องอย่างน้อย 1').max(127, 'จำนวนที่นั่งมากเกินไป'),
  isActive: z.boolean().default(true),
});

/**
 * ตรวจข้อมูลผู้ใช้ตอนสร้างใหม่ บังคับรหัสผ่านอย่างน้อย 8 ตัวสำหรับบัญชีที่ตั้งใหม่
 * branchId = null หมายถึง HQ Super Admin
 */
export const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'ชื่อผู้ใช้ต้องยาวอย่างน้อย 3 ตัวอักษร')
    .max(50, 'ชื่อผู้ใช้ยาวเกิน 50 ตัวอักษร')
    .regex(/^[a-zA-Z0-9_.]+$/, 'ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 จุด และขีดล่าง'),
  password: z.string().min(8, 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร').max(200),
  fullName: z.string().trim().min(1, MESSAGES.required).max(100, 'ชื่อ-สกุลยาวเกิน 100 ตัวอักษร'),
  role: z.enum(['ADMIN', 'STAFF']),
  branchId: z.coerce.number().int().positive().nullable().optional(),
  isActive: z.boolean().default(true),
});

/**
 * ตรวจข้อมูลผู้ใช้ตอนแก้ไข รหัสผ่านเว้นว่างได้ หมายถึง "ไม่เปลี่ยนรหัสผ่านเดิม"
 */
export const updateUserSchema = createUserSchema.extend({
  password: z
    .string()
    .max(200)
    .refine((value) => value === '' || value.length >= 8, 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร'),
});

/** จำนวนสูงสุดต่อรายการในตะกร้า กันลูกค้ากดค้างจนสั่ง 999 จาน */
const MAX_QUANTITY_PER_ITEM = 99;

/** จำนวนรายการสูงสุดต่อ 1 ออเดอร์ กันการยิงข้อมูลก้อนใหญ่เข้ามา */
const MAX_ITEMS_PER_ORDER = 50;

/**
 * ตรวจตะกร้าที่ลูกค้ากดยืนยันสั่ง
 * ตรวจ token ที่นี่ด้วยเพราะเป็นสิ่งเดียวที่ยืนยันว่าคนสั่งนั่งอยู่โต๊ะไหน
 */
export const createOrderSchema = z.object({
  token: z.string().trim().length(32, 'ลิงก์โต๊ะไม่ถูกต้อง กรุณาสแกน QR บนโต๊ะอีกครั้ง'),
  items: z
    .array(
      z.object({
        menuItemId: z.coerce.number().int().positive(),
        quantity: z.coerce
          .number()
          .int()
          .min(1, 'จำนวนต้องอย่างน้อย 1')
          .max(MAX_QUANTITY_PER_ITEM, `สั่งได้สูงสุด ${MAX_QUANTITY_PER_ITEM} ที่ต่อรายการ`),
        note: z.string().trim().max(255, 'หมายเหตุยาวเกิน 255 ตัวอักษร').optional(),
      }),
    )
    .min(1, 'ยังไม่ได้เลือกอาหาร กรุณาเลือกเมนูก่อนกดยืนยันสั่ง')
    .max(MAX_ITEMS_PER_ORDER, `สั่งได้สูงสุด ${MAX_ITEMS_PER_ORDER} รายการต่อครั้ง`),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

/** สถานะที่ออเดอร์และรายการอาหารเป็นได้ ตรงกับ ENUM ในฐานข้อมูล */
export const ORDER_STATUSES = ['PENDING', 'PREPARING', 'SERVED', 'CANCELLED'] as const;

/**
 * ตรวจคำสั่งเปลี่ยนสถานะออเดอร์หรือรายการอาหาร
 * รองรับการระบุเหตุผล (reason) เมื่อสถานะเปลี่ยนเป็น CANCELLED
 */
export const orderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  reason: z.string().trim().max(255, 'เหตุผลยาวเกิน 255 ตัวอักษร').optional(),
});

/**
 * ตรวจข้อมูลการปิดบิล วิธีชำระต้องเป็นหนึ่งใน 3 แบบที่ร้านรับ
 */
export const checkoutSchema = z.object({
  method: z.enum(['CASH', 'TRANSFER', 'CARD']),
});

/** หมวดปัญหาที่แจ้งได้ ตรงกับ ENUM ในตาราง tickets */
export const TICKET_CATEGORIES = ['ORDER', 'FOOD', 'PAYMENT', 'SYSTEM', 'OTHER'] as const;

/** สถานะของเรื่องแจ้งปัญหา เรียงตามลำดับที่ควรเดินไปข้างหน้า */
export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;

/** ระดับความเร่งด่วนของเรื่องแจ้งปัญหา */
export const TICKET_PRIORITIES = ['LOW', 'NORMAL', 'URGENT'] as const;

/**
 * ตรวจฟอร์มแจ้งปัญหาของลูกค้า มีแค่ 3 ช่องตามหัวข้อ 9 เพราะลูกค้ากรอกบนมือถือขณะนั่งกินข้าว
 * ความเร่งด่วนไม่ให้ลูกค้าเลือกเอง ให้พนักงานเป็นคนประเมินหลังอ่านเรื่อง
 */
export const customerTicketSchema = z.object({
  token: z.string().trim().length(32, 'ลิงก์โต๊ะไม่ถูกต้อง กรุณาสแกน QR บนโต๊ะอีกครั้ง'),
  category: z.enum(TICKET_CATEGORIES),
  subject: z.string().trim().min(1, MESSAGES.required).max(150, 'หัวข้อยาวเกิน 150 ตัวอักษร'),
  detail: z.string().trim().min(1, MESSAGES.required).max(5000, 'รายละเอียดยาวเกินไป'),
});

/**
 * ตรวจฟอร์มแจ้งปัญหาที่พนักงานเปิดจากหลังบ้าน เลือกความเร่งด่วนและระบุโต๊ะที่เกี่ยวข้องได้
 */
export const staffTicketSchema = z.object({
  category: z.enum(TICKET_CATEGORIES),
  subject: z.string().trim().min(1, MESSAGES.required).max(150, 'หัวข้อยาวเกิน 150 ตัวอักษร'),
  detail: z.string().trim().min(1, MESSAGES.required).max(5000, 'รายละเอียดยาวเกินไป'),
  priority: z.enum(TICKET_PRIORITIES),
  tableId: z.coerce.number().int().nonnegative().default(0),
});

/**
 * ตรวจคำสั่งเปลี่ยนสถานะหรือผู้รับผิดชอบของเรื่องแจ้งปัญหา
 * assignedTo เป็น 0 หมายถึง "ยังไม่มอบหมายให้ใคร"
 */
export const ticketUpdateSchema = z.object({
  status: z.enum(TICKET_STATUSES),
  assignedTo: z.coerce.number().int().nonnegative().default(0),
});

/**
 * ตรวจข้อความตอบกลับในเรื่องแจ้งปัญหา
 */
export const ticketReplySchema = z.object({
  message: z.string().trim().min(1, MESSAGES.required).max(5000, 'ข้อความยาวเกินไป'),
});
