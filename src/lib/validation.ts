import { z } from 'zod';
import { normalizePromptPayId } from '@/lib/promptpay';

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

/** จำนวนกลุ่มตัวเลือกสูงสุดต่อเมนู และจำนวนตัวเลือกสูงสุดต่อกลุ่ม */
const MAX_OPTION_GROUPS = 10;
const MAX_OPTIONS_PER_GROUP = 20;

/**
 * ตรวจชุดกลุ่มตัวเลือกของเมนูที่แอดมินบันทึกทั้งชุด (เผ็ดน้อย / พิเศษ / ท็อปปิ้ง)
 * id มีเมื่อแก้ของเดิม ไม่มีเมื่อเพิ่มใหม่ กลุ่มหรือตัวเลือกที่ไม่ถูกส่งมาจะถูกลบ
 * บังคับ min <= max และ max ไม่เกินจำนวนตัวเลือกที่เปิดใช้ ไม่อย่างนั้นลูกค้าจะเลือกให้ครบไม่ได้เลย
 */
export const menuOptionGroupsSchema = z.object({
  groups: z
    .array(
      z
        .object({
          id: z.coerce.number().int().positive().optional(),
          name: z.string().trim().min(1, 'ตั้งชื่อกลุ่มตัวเลือกด้วย เช่น ระดับความเผ็ด').max(60, 'ชื่อกลุ่มยาวเกิน 60 ตัวอักษร'),
          minSelect: z.coerce.number().int().min(0).max(MAX_OPTIONS_PER_GROUP),
          maxSelect: z.coerce.number().int().min(1, 'จำนวนที่เลือกได้สูงสุดต้องอย่างน้อย 1').max(MAX_OPTIONS_PER_GROUP),
          isActive: z.boolean().default(true),
          options: z
            .array(
              z.object({
                id: z.coerce.number().int().positive().optional(),
                name: z.string().trim().min(1, 'ตั้งชื่อตัวเลือกด้วย เช่น เผ็ดน้อย').max(60, 'ชื่อตัวเลือกยาวเกิน 60 ตัวอักษร'),
                priceDelta: z.coerce
                  .number()
                  .min(-99999, 'ราคาที่ลดต้องไม่เกิน 99,999 บาท')
                  .max(99999, 'ราคาที่บวกเพิ่มต้องไม่เกิน 99,999 บาท'),
                isActive: z.boolean().default(true),
              }),
            )
            .min(1, 'แต่ละกลุ่มต้องมีตัวเลือกอย่างน้อย 1 อย่าง')
            .max(MAX_OPTIONS_PER_GROUP, `แต่ละกลุ่มมีตัวเลือกได้สูงสุด ${MAX_OPTIONS_PER_GROUP} อย่าง`),
        })
        .refine((g) => g.minSelect <= g.maxSelect, {
          message: 'จำนวนที่บังคับเลือกต้องไม่มากกว่าจำนวนที่เลือกได้สูงสุด',
        })
        .refine((g) => g.maxSelect <= g.options.filter((o) => o.isActive).length, {
          message: 'จำนวนที่เลือกได้สูงสุดต้องไม่เกินจำนวนตัวเลือกที่เปิดใช้อยู่ในกลุ่ม',
        }),
    )
    .max(MAX_OPTION_GROUPS, `เมนูหนึ่งมีกลุ่มตัวเลือกได้สูงสุด ${MAX_OPTION_GROUPS} กลุ่ม`),
});

export type MenuOptionGroupsInput = z.infer<typeof menuOptionGroupsSchema>;

/**
 * ตรวจข้อมูลวัตถุดิบ ต้นทุนต่อหน่วยเก็บทศนิยม 4 ตำแหน่ง เพราะวัตถุดิบบางตัวถูกมากต่อหน่วย
 * เช่น ข้าวสารกรัมละ 0.04 บาท ถ้าปัดเหลือ 2 ตำแหน่งต้นทุนต่อจานจะเพี้ยน
 */
export const ingredientSchema = z.object({
  name: z.string().trim().min(1, MESSAGES.required).max(100, 'ชื่อวัตถุดิบยาวเกิน 100 ตัวอักษร'),
  unit: z.string().trim().min(1, 'ระบุหน่วยนับ เช่น กรัม หรือ ฟอง').max(20, 'หน่วยนับยาวเกิน 20 ตัวอักษร'),
  costPerUnit: z.coerce.number().min(0, 'ต้นทุนต้องไม่ติดลบ').max(99999999, 'ต้นทุนสูงเกินกว่าที่ระบบรองรับ'),
  lowStockThreshold: z.coerce
    .number()
    .min(0, 'เกณฑ์เตือนต้องไม่ติดลบ')
    .max(999999999, 'เกณฑ์เตือนสูงเกินกว่าที่ระบบรองรับ')
    .nullable()
    .optional(),
  isActive: z.boolean().default(true),
});

/** วิธีแก้ยอดวัตถุดิบของสาขา: รับของเข้า ปรับยอดตามที่นับได้จริง หรือตัดของเสีย */
export const INGREDIENT_STOCK_MODES = ['RECEIVE', 'ADJUST', 'WASTE'] as const;

/**
 * ตรวจคำสั่งแก้ยอดวัตถุดิบของสาขา
 * unitCost ส่งมาได้เฉพาะตอนรับของเข้า ใช้อัปเดตต้นทุนต่อหน่วยล่าสุดของวัตถุดิบ
 */
export const ingredientStockSchema = z
  .object({
    mode: z.enum(INGREDIENT_STOCK_MODES),
    quantity: z.coerce.number().min(0, 'จำนวนต้องไม่ติดลบ').max(999999999, 'จำนวนสูงเกินกว่าที่ระบบรองรับ'),
    unitCost: z.coerce.number().min(0, 'ต้นทุนต้องไม่ติดลบ').max(99999999).nullable().optional(),
    note: z.string().trim().max(255, 'หมายเหตุยาวเกิน 255 ตัวอักษร').optional(),
  })
  .refine((v) => v.mode === 'ADJUST' || v.quantity > 0, {
    message: 'จำนวนที่รับเข้าหรือตัดทิ้งต้องมากกว่า 0',
  });

/**
 * ตรวจสูตรของเมนูที่แอดมินบันทึกทั้งชุด ส่งอาเรย์ว่างเพื่อลบสูตรทิ้ง
 */
export const menuRecipeSchema = z.object({
  lines: z
    .array(
      z.object({
        ingredientId: z.coerce.number().int().positive('เลือกวัตถุดิบด้วย'),
        quantity: z.coerce
          .number()
          .positive('ปริมาณต่อจานต้องมากกว่า 0')
          .max(999999, 'ปริมาณต่อจานสูงเกินกว่าที่ระบบรองรับ'),
      }),
    )
    .max(50, 'สูตรหนึ่งมีวัตถุดิบได้สูงสุด 50 รายการ')
    .refine((lines) => new Set(lines.map((l) => l.ingredientId)).size === lines.length, {
      message: 'มีวัตถุดิบซ้ำกันในสูตร กรุณารวมเป็นบรรทัดเดียว',
    }),
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
  vatRate: z.coerce
    .number()
    .min(0, 'อัตราภาษีต้องไม่ติดลบ')
    .max(100, 'อัตราภาษีต้องไม่เกิน 100%')
    .default(7),
  vatInclusive: z.boolean().default(true),
  serviceChargeRate: z.coerce
    .number()
    .min(0, 'อัตราค่าบริการต้องไม่ติดลบ')
    .max(100, 'อัตราค่าบริการต้องไม่เกิน 100%')
    .default(0),
  // เว้นว่างได้ หมายถึงสาขานี้ยังไม่รับโอนผ่าน QR พร้อมเพย์
  promptpayId: z
    .string()
    .trim()
    .max(30, 'เลขพร้อมเพย์ยาวเกินไป')
    .refine((value) => value === '' || normalizePromptPayId(value).ok, {
      message: 'เลขพร้อมเพย์ต้องเป็นเบอร์มือถือ 10 หลัก เลขบัตรประชาชน/เลขผู้เสียภาษี 13 หลัก หรือ e-Wallet 15 หลัก',
    })
    .optional(),
  promptpayName: z.string().trim().max(100, 'ชื่อบัญชีพร้อมเพย์ยาวเกิน 100 ตัวอักษร').optional(),
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
  stockQty: z.coerce
    .number()
    .int('จำนวนคงเหลือต้องเป็นจำนวนเต็ม')
    .min(0, 'จำนวนคงเหลือต้องไม่ติดลบ')
    .max(999999, 'จำนวนคงเหลือสูงเกินกว่าที่ระบบรองรับ')
    .nullable()
    .optional(),
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
 * ตรวจข้อมูลการย้ายโต๊ะ (Table Transfer)
 */
export const transferTableSchema = z.object({
  targetTableId: z.coerce.number().int().positive('กรุณาเลือกโต๊ะปลายทางที่ต้องการย้าย'),
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

/** จำนวนตัวเลือกสูงสุดต่อรายการอาหาร กันการยิง id ก้อนใหญ่เข้ามา */
const MAX_OPTIONS_PER_ITEM = 20;

/** ประเภทออเดอร์ที่ลูกค้าเลือกได้ ตรงกับ ENUM order_type ในฐานข้อมูล */
export const ORDER_TYPES = ['DINE_IN', 'TAKEAWAY'] as const;

/**
 * ตรวจตะกร้าที่ลูกค้ากดยืนยันสั่ง
 * ตรวจ token ที่นี่ด้วยเพราะเป็นสิ่งเดียวที่ยืนยันว่าคนสั่งนั่งอยู่โต๊ะไหน
 */
export const createOrderSchema = z.object({
  token: z.string().trim().length(32, 'ลิงก์โต๊ะไม่ถูกต้อง กรุณาสแกน QR บนโต๊ะอีกครั้ง'),
  orderType: z.enum(ORDER_TYPES).default('DINE_IN'),
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
        optionIds: z
          .array(z.coerce.number().int().positive())
          .max(MAX_OPTIONS_PER_ITEM, `เลือกตัวเลือกได้สูงสุด ${MAX_OPTIONS_PER_ITEM} อย่างต่อรายการ`)
          .default([]),
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
 * ตรวจข้อมูลการปิดบิล
 * payments เป็นอาเรย์เพราะลูกค้าจ่ายผสมได้ เช่น เงินสดบางส่วนและโอนบางส่วนในบิลเดียว
 * discount ไม่บังคับ แต่ถ้าให้ส่วนลดต้องระบุเหตุผลเสมอเพื่อตรวจย้อนหลังได้
 * ยอดเงินทั้งหมดตรวจซ้ำอีกชั้นที่เซิร์ฟเวอร์ด้วย calculateBill และ validatePayments
 */
export const checkoutSchema = z.object({
  payments: z
    .array(
      z.object({
        method: z.enum(['CASH', 'TRANSFER', 'CARD']),
        amount: z.coerce
          .number()
          .positive('ยอดที่ตัดเข้าช่องทางชำระเงินต้องมากกว่า 0')
          .max(99999999, 'ยอดชำระสูงเกินกว่าที่ระบบรองรับ'),
        receivedAmount: z.coerce
          .number()
          .min(0, 'เงินที่รับมาต้องไม่ติดลบ')
          .max(99999999, 'เงินที่รับมาสูงเกินกว่าที่ระบบรองรับ')
          .nullable()
          .optional(),
        // คำขอรับเงินโอนที่ยืนยันแล้ว บังคับสำหรับช่องทาง TRANSFER (ตรวจที่ route ปิดบิล)
        paymentRequestId: z.coerce.number().int().positive().nullable().optional(),
      }),
    )
    .min(1, 'ต้องระบุช่องทางการชำระเงินอย่างน้อย 1 ช่องทาง')
    .max(3, 'แบ่งจ่ายได้สูงสุด 3 ช่องทางต่อหนึ่งบิล'),
  discount: z
    .object({
      type: z.enum(['NONE', 'AMOUNT', 'PERCENT']).default('NONE'),
      value: z.coerce.number().min(0, 'ส่วนลดต้องไม่ติดลบ').default(0),
      reason: z.string().trim().max(255, 'เหตุผลส่วนลดยาวเกิน 255 ตัวอักษร').optional(),
    })
    .optional(),
});

/** วิธีแก้จำนวนคงเหลือของเมนู: ตั้งจำนวนใหม่ เติมของเพิ่ม หรือเลิกจำกัดจำนวน */
export const STOCK_UPDATE_MODES = ['SET', 'ADD', 'UNLIMITED'] as const;

/**
 * ตรวจคำสั่งแก้จำนวนคงเหลือของเมนูรายสาขาจากหน้าสต๊อก
 * quantity ไม่ต้องส่งเมื่อ mode เป็น UNLIMITED เพราะเป็นการเลิกนับจำนวนไปเลย
 */
export const stockUpdateSchema = z.object({
  menuItemId: z.coerce.number().int().positive('ต้องระบุเมนูที่จะแก้จำนวนคงเหลือ'),
  mode: z.enum(STOCK_UPDATE_MODES),
  quantity: z.coerce
    .number()
    .int('จำนวนต้องเป็นจำนวนเต็ม')
    .min(0, 'จำนวนต้องไม่ติดลบ')
    .max(999999, 'จำนวนสูงเกินกว่าที่ระบบรองรับ')
    .optional(),
});

/**
 * ตรวจข้อมูลการคืนเงินบิลที่ปิดไปแล้ว
 * บังคับระบุเหตุผลเสมอ เพราะการทำบิลเป็นโมฆะหลังรับเงินแล้วเป็นช่องทางทุจริตโดยตรง
 * ต้องมีข้อความให้ตรวจย้อนหลังได้เหมือนการยกเลิกออเดอร์และการให้ส่วนลด
 */
export const refundSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, 'ต้องระบุเหตุผลการคืนเงินอย่างน้อย 3 ตัวอักษร')
    .max(255, 'เหตุผลยาวเกิน 255 ตัวอักษร'),
});

/**
 * ตรวจข้อมูลการปิดยอดประจำวัน (Z-Report)
 * countedCash คือเงินสดที่แคชเชียร์นับได้จริงในลิ้นชัก ไม่กรอกก็ปิดยอดได้แต่จะไม่มีตัวเลขขาด/เกิน
 */
export const closeSettlementSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD'),
  countedCash: z
    .number()
    .min(0, 'ยอดเงินสดที่นับได้ต้องไม่ติดลบ')
    .max(9999999.99, 'ยอดเงินสดที่นับได้สูงเกินกว่าที่ระบบรองรับ')
    .nullable()
    .optional(),
  note: z.string().trim().max(255, 'หมายเหตุยาวเกิน 255 ตัวอักษร').optional(),
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
