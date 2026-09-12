# plan.md — ระบบ POS ร้านอาหารสั่งอาหารด้วย QR Code

> ไฟล์นี้คือ **สเปกและพร้อมต์หลัก** ของโปรเจกต์ ใช้เป็นแหล่งความจริงเดียว (single source of truth)
> ทุกครั้งที่สั่งงาน AI ให้เขียนโค้ด ให้แนบไฟล์นี้ไปด้วย และสั่งว่า **"ทำตาม plan.md เท่านั้น ห้ามเพิ่มนอกเหนือจากนี้"**

---

## 0. วิธีใช้ไฟล์นี้

1. ทำงานทีละเฟสตามหัวข้อ 15 ห้ามข้ามเฟส ห้ามทำรวดเดียวจบ
2. จบแต่ละเฟสต้องผ่าน **เกณฑ์เสร็จ (Definition of Done)** ของเฟสนั้นก่อนไปต่อ
3. ถ้าเจอจุดที่สเปกไม่ครอบคลุม → **ห้ามเดาแล้วใส่ลงโค้ด** ให้ถามก่อน หรือทำตามการตีความตรงตัวที่สุดแล้วบอกไว้ท้ายคำตอบ
4. ทุกอย่างที่ไม่ได้เขียนไว้ในไฟล์นี้ ถือว่า **อยู่นอกขอบเขต**

---

## 1. ภาพรวมโปรเจกต์

ระบบขายหน้าร้าน (POS) สำหรับร้านอาหารนั่งทาน ที่ลูกค้า **สแกน QR Code ที่โต๊ะ → เปิดเมนู → สั่งอาหารเอง** โดยไม่ต้องติดตั้งแอปและไม่ต้องสมัครสมาชิก ออเดอร์วิ่งเข้าหน้าจอฝั่งร้านทันที พนักงานอัปเดตสถานะ ปิดบิล และดูสรุปยอดขายได้จาก Dashboard

**คนใช้จริง 3 กลุ่ม**

| กลุ่ม | ใช้ตอนไหน | อุปกรณ์ |
| --- | --- | --- |
| ลูกค้า | นั่งที่โต๊ะ มือถือแนวตั้ง แสงร้านสลัว มือถือถืออีกมือ | มือถือ |
| พนักงาน/ครัว | ยืนหน้าเคาน์เตอร์ มือเปียก กดเร็ว ๆ อ่านจากระยะ 1 เมตร | แท็บเล็ต / จอเคาน์เตอร์ |
| เจ้าของร้าน (แอดมิน) | ปิดร้านแล้วนั่งดูยอด แก้เมนู แก้ราคา | โน้ตบุ๊ก |

---

## 2. ข้อจำกัดจากโจทย์ (ห้ามฝ่าฝืน)

- **Frontend + Backend ต้องมีครบทั้งสองฝั่ง**
- **ต้องใช้ Next.js เท่านั้น** (App Router)
- **ต้องใช้ MySQL เป็นฐานข้อมูลเท่านั้น** ห้ามใช้ SQLite / Postgres / MongoDB / Supabase
- **CSS ใช้อะไรก็ได้**
- มีระบบ **CRUD** อย่างน้อย 2 ตาราง (โปรเจกต์นี้มีมากกว่านั้น และทุกตารางต้องสัมพันธ์กับการทำงานจริงของระบบ)
- มีระบบ **Authentication**
- มีหน้า **Dashboard** สรุปข้อมูลสำคัญ
- แยก **Frontend (ลูกค้า)** กับ **Backend/Admin (ผู้จัดการข้อมูล)** ชัดเจน
- **Responsive** รองรับมือถือ / แท็บเล็ต / เดสก์ท็อป
- ทีมไม่เกิน 3 คน (มีผลกับการแบ่งงานตามเฟส)

**ข้อกำหนดเพิ่มจากผู้ใช้**

- ต้องมี **ระบบ Ticket แจ้งปัญหา**
- โค้ดต้องคลีน มี **คอมเมนต์ภาษาไทยอธิบายทุกฟังก์ชัน**
- **ห้ามเพิ่มฟีเจอร์/ไฟล์นอกเหนือจากที่กำหนด**
- UX/UI สไตล์ **Modern Flat & Modular** (พื้นสว่าง สีล้วนไม่มีไล่เฉด จัดกลุ่มเนื้อหาเป็นการ์ด/โมดูล มีรูปอาหารประกอบเมนู)

---

## 3. ขอบเขตงาน

### 3.1 ทำ (In scope)

- สแกน QR ต่อโต๊ะ → เปิดรอบการนั่ง (session) → สั่งอาหาร → สั่งเพิ่มได้หลายรอบ → ปิดบิล
- จัดการเมนู หมวดหมู่ โต๊ะ ผู้ใช้ระบบ (CRUD ครบทั้ง 4 ตาราง)
- หน้าติดตามออเดอร์ฝั่งร้าน + เปลี่ยนสถานะรายการอาหาร
- ปิดบิล บันทึกการชำระเงิน (เงินสด / โอน / บัตร)
- Dashboard สรุปยอดขาย
- ระบบ Ticket แจ้งปัญหา (เปิดได้ทั้งลูกค้าและพนักงาน) + ตอบกลับ + ปิดเรื่อง

### 3.2 ไม่ทำ (Out of scope — ห้ามเขียน แม้จะคิดว่าดี)

- ตัดเงินจริง / payment gateway / QR PromptPay จริง
- แจ้งเตือน LINE, อีเมล, SMS, push notification
- ระบบสมาชิก สะสมแต้ม คูปอง ส่วนลด โปรโมชัน
- ระบบสต๊อกวัตถุดิบ ต้นทุน ครัวหลายสาขา
- หลายภาษา (i18n), โหมด Light
- ระบบเวอร์ชัน / การแสดงเลขเวอร์ชันบนหน้า Login (ถอดออกตามคำสั่งผู้ใช้)
- Docker, CI/CD, unit test, README, .env.example (ถ้าไม่ได้สั่งเพิ่ม)
- ตัวเลือกอาหารซับซ้อน (เผ็ดน้อย/พิเศษ/ท็อปปิ้ง) — เฟสนี้ใช้ช่อง `note` ต่อรายการแทน
- ปริ้นสลิปผ่านเครื่องพิมพ์ความร้อนจริง (ทำแค่หน้า "ใบเสร็จ" บนจอ)

---

## 4. บทบาทผู้ใช้และสิทธิ์

| บทบาท | ล็อกอิน | ทำอะไรได้ |
| --- | --- | --- |
| `CUSTOMER` | ไม่ต้อง (ใช้ token ในลิงก์ QR) | ดูเมนู สั่งอาหาร ดูสถานะออเดอร์ของโต๊ะตัวเอง เปิด ticket |
| `STAFF` | ต้อง | ดู/อัปเดตออเดอร์ ปิดบิล ดู Dashboard ดูและตอบ ticket |
| `ADMIN` | ต้อง | ทุกอย่างของ STAFF + CRUD เมนู หมวดหมู่ โต๊ะ ผู้ใช้ + ปิด ticket |

- ลูกค้าเข้าถึงได้เฉพาะข้อมูลของ session โต๊ะตัวเองเท่านั้น (ตรวจจาก token ทุกครั้งที่เรียก API)
- ทุก endpoint ใต้ `/api/admin/*` ต้องผ่านการตรวจสิทธิ์ ห้ามเช็คสิทธิ์แค่ที่หน้า UI

---

## 5. Tech Stack และ dependency ที่อนุญาต

ห้ามติดตั้งไลบรารีอื่นนอกเหนือจากรายการนี้ ถ้าจำเป็นต้องเพิ่ม ให้ถามก่อน

| ชื่อ | ใช้ทำอะไร |
| --- | --- |
| `next` (App Router) + `react` + `typescript` | โครงหลัก |
| `mysql2/promise` | เชื่อม MySQL ด้วย SQL ตรง ๆ (ไม่ใช้ ORM เพื่อให้อ่านโค้ดแล้วเห็น SQL จริง) |
| `bcryptjs` | เข้ารหัสรหัสผ่าน |
| `jose` | สร้าง/ตรวจ JWT เก็บใน httpOnly cookie |
| `zod` | ตรวจความถูกต้องของข้อมูลที่รับเข้า API |
| `qrcode` | สร้างภาพ QR ของแต่ละโต๊ะในหน้าแอดมิน |
| `tailwindcss` | จัดสไตล์ (ตั้ง token สีเองตามหัวข้อ 13 ห้ามใช้ palette ดิบของ Tailwind) |

**ค่าคอนฟิกใน `.env.local`**: `DATABASE_URL`, `JWT_SECRET`, `APP_BASE_URL`

---

## 6. โครงสร้างโฟลเดอร์ (ห้ามสร้างไฟล์นอกโครงนี้โดยไม่แจ้ง)

```
/db
  schema.sql                 -- DDL ทุกตาราง
  seed.sql                   -- ข้อมูลตั้งต้น
/src
  /app
    /(customer)/t/[token]/            -- หน้าเมนูลูกค้า (สแกน QR มาเจอหน้านี้)
    /(customer)/t/[token]/cart/       -- ตะกร้า + ยืนยันสั่ง
    /(customer)/t/[token]/status/     -- สถานะออเดอร์ของโต๊ะ
    /(customer)/t/[token]/ticket/     -- แจ้งปัญหา
    /login/                           -- ล็อกอินพนักงาน
    /admin/                           -- Dashboard
    /admin/orders/                    -- กระดานออเดอร์
    /admin/tables/                    -- จัดการโต๊ะ + QR
    /admin/categories/                -- จัดการหมวดหมู่
    /admin/menu/                      -- จัดการเมนู
    /admin/tickets/                   -- ระบบแจ้งปัญหา
    /admin/users/                     -- จัดการผู้ใช้ (ADMIN เท่านั้น)
    /api/...                          -- ตามหัวข้อ 8
  /components                         -- UI ที่ใช้ซ้ำจริง ๆ เท่านั้น
  /lib
    db.ts            -- connection pool + helper query
    auth.ts          -- hash, verify, สร้าง/อ่าน JWT, ดึง user ปัจจุบัน
    session.ts       -- ตรวจ token โต๊ะฝั่งลูกค้า
    validation.ts    -- zod schema รวม
    format.ts        -- จัดรูปแบบเงิน/วันเวลาไทย
  middleware.ts      -- กันเส้นทาง /admin ที่ยังไม่ล็อกอิน
```

---

## 7. โครงสร้างฐานข้อมูล (MySQL)

ทุกตารางใช้ `utf8mb4_unicode_ci` และมี `created_at` / `updated_at`

```sql
-- ผู้ใช้ระบบฝั่งร้าน (พนักงานและแอดมิน) ใช้สำหรับ Authentication
CREATE TABLE users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(100) NOT NULL,
  role          ENUM('ADMIN','STAFF') NOT NULL DEFAULT 'STAFF',
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- โต๊ะในร้าน แต่ละโต๊ะมี token สำหรับสร้าง QR (ลิงก์ /t/{token})
CREATE TABLE dining_tables (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  table_no   VARCHAR(10)  NOT NULL UNIQUE,
  seats      TINYINT      NOT NULL DEFAULT 4,
  qr_token   CHAR(32)     NOT NULL UNIQUE,
  is_active  TINYINT(1)   NOT NULL DEFAULT 1,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- หมวดหมู่เมนู เช่น ของทานเล่น จานเดียว เครื่องดื่ม
CREATE TABLE categories (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(60) NOT NULL,
  sort_order SMALLINT    NOT NULL DEFAULT 0,
  is_active  TINYINT(1)  NOT NULL DEFAULT 1,
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- รายการอาหารในเมนู
CREATE TABLE menu_items (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  category_id  INT            NOT NULL,
  name         VARCHAR(120)   NOT NULL,
  description  VARCHAR(255)   NULL,
  price        DECIMAL(10,2)  NOT NULL,
  image_url    VARCHAR(255)   NULL,
  is_available TINYINT(1)     NOT NULL DEFAULT 1,
  created_at   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- รอบการนั่งของโต๊ะ 1 รอบ = ลูกค้า 1 กลุ่ม (สั่งได้หลายออเดอร์ ปิดบิลครั้งเดียว)
CREATE TABLE table_sessions (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  table_id   INT      NOT NULL,
  status     ENUM('OPEN','CLOSED') NOT NULL DEFAULT 'OPEN',
  opened_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at  DATETIME NULL,
  closed_by  INT      NULL,
  FOREIGN KEY (table_id)  REFERENCES dining_tables(id),
  FOREIGN KEY (closed_by) REFERENCES users(id)
);

-- ออเดอร์ 1 ครั้งที่ลูกค้ากดยืนยันสั่ง
CREATE TABLE orders (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  session_id  INT           NOT NULL,
  order_code  VARCHAR(12)   NOT NULL UNIQUE,
  status      ENUM('PENDING','PREPARING','SERVED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES table_sessions(id)
);

-- รายการอาหารในออเดอร์ เก็บชื่อและราคา ณ เวลาที่สั่ง (กันราคาเปลี่ยนย้อนหลัง)
CREATE TABLE order_items (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  order_id     INT           NOT NULL,
  menu_item_id INT           NOT NULL,
  item_name    VARCHAR(120)  NOT NULL,
  unit_price   DECIMAL(10,2) NOT NULL,
  quantity     SMALLINT      NOT NULL,
  note         VARCHAR(255)  NULL,
  status       ENUM('PENDING','PREPARING','SERVED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  FOREIGN KEY (order_id)     REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
);

-- การชำระเงินเมื่อปิดบิล 1 session ต่อ 1 แถว
CREATE TABLE payments (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  session_id   INT           NOT NULL UNIQUE,
  method       ENUM('CASH','TRANSFER','CARD') NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  received_by  INT           NOT NULL,
  paid_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id)  REFERENCES table_sessions(id),
  FOREIGN KEY (received_by) REFERENCES users(id)
);

-- เรื่องแจ้งปัญหา เปิดได้ทั้งจากลูกค้า (ผูกโต๊ะ) และพนักงาน (ผูก user)
CREATE TABLE tickets (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  ticket_code  VARCHAR(12) NOT NULL UNIQUE,
  source       ENUM('CUSTOMER','STAFF') NOT NULL,
  table_id     INT         NULL,
  created_by   INT         NULL,
  category     ENUM('ORDER','FOOD','PAYMENT','SYSTEM','OTHER') NOT NULL,
  subject      VARCHAR(150) NOT NULL,
  detail       TEXT         NOT NULL,
  priority     ENUM('LOW','NORMAL','URGENT') NOT NULL DEFAULT 'NORMAL',
  status       ENUM('OPEN','IN_PROGRESS','RESOLVED','CLOSED') NOT NULL DEFAULT 'OPEN',
  assigned_to  INT         NULL,
  created_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (table_id)    REFERENCES dining_tables(id),
  FOREIGN KEY (created_by)  REFERENCES users(id),
  FOREIGN KEY (assigned_to) REFERENCES users(id)
);

-- ข้อความตอบกลับในแต่ละ ticket
CREATE TABLE ticket_replies (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id  INT      NOT NULL,
  user_id    INT      NULL,
  message    TEXT     NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)   REFERENCES users(id)
);
```

**ตารางที่ต้องมี CRUD ครบ 4 ท่า (สร้าง/อ่าน/แก้ไข/ลบ)**: `categories`, `menu_items`, `dining_tables`, `users`
> การลบเมนู/โต๊ะที่มีประวัติออเดอร์แล้ว ให้ใช้การปิดใช้งาน (`is_active = 0`) แทนการลบจริง เพื่อไม่ให้ประวัติพัง — ต้องแจ้งผู้ใช้บนหน้าจอด้วยข้อความชัดเจน

---

## 8. API Endpoints

### ฝั่งลูกค้า (ไม่ต้องล็อกอิน ตรวจสิทธิ์ด้วย `qr_token` เสมอ)

| Method | Path | หน้าที่ |
| --- | --- | --- |
| GET | `/api/public/tables/[token]` | ตรวจ token, คืนข้อมูลโต๊ะ + session ที่เปิดอยู่ (ถ้ายังไม่มีให้เปิดใหม่) |
| GET | `/api/public/menu` | คืนหมวดหมู่ + เมนูที่ `is_available = 1` |
| POST | `/api/public/orders` | สร้างออเดอร์จากตะกร้า (รับ token + รายการ) |
| GET | `/api/public/orders?token=` | คืนออเดอร์ทั้งหมดของ session ปัจจุบัน + ยอดรวม |
| POST | `/api/public/tickets` | ลูกค้าแจ้งปัญหา |

### ฝั่งร้าน (ต้องล็อกอิน)

| Method | Path | หน้าที่ |
| --- | --- | --- |
| POST | `/api/auth/login` | ตรวจรหัสผ่าน ออก JWT ใส่ httpOnly cookie |
| POST | `/api/auth/logout` | ล้าง cookie |
| GET | `/api/auth/me` | คืนข้อมูลผู้ใช้ปัจจุบัน |
| GET/POST | `/api/admin/categories` | อ่านทั้งหมด / สร้าง |
| PUT/DELETE | `/api/admin/categories/[id]` | แก้ไข / ลบ |
| GET/POST | `/api/admin/menu-items` | อ่าน (กรองหมวด/ค้นหา) / สร้าง |
| PUT/DELETE | `/api/admin/menu-items/[id]` | แก้ไข / ลบ |
| GET/POST | `/api/admin/tables` | อ่าน / สร้าง (สร้าง `qr_token` อัตโนมัติ) |
| PUT/DELETE | `/api/admin/tables/[id]` | แก้ไข / ลบ |
| GET/POST | `/api/admin/users` | อ่าน / สร้าง (ADMIN เท่านั้น) |
| PUT/DELETE | `/api/admin/users/[id]` | แก้ไข / ลบ (ADMIN เท่านั้น) |
| GET | `/api/admin/orders` | ออเดอร์ทั้งหมด กรองตามสถานะ/วันที่ |
| PATCH | `/api/admin/orders/[id]` | เปลี่ยนสถานะออเดอร์ |
| PATCH | `/api/admin/order-items/[id]` | เปลี่ยนสถานะรายการอาหารรายตัว |
| POST | `/api/admin/sessions/[id]/checkout` | ปิดบิล บันทึก `payments` และปิด session |
| GET | `/api/admin/dashboard` | ข้อมูลสรุปสำหรับ Dashboard |
| GET/POST | `/api/admin/tickets` | อ่าน / สร้าง ticket ฝั่งพนักงาน |
| PATCH | `/api/admin/tickets/[id]` | เปลี่ยนสถานะ/ผู้รับผิดชอบ |
| POST | `/api/admin/tickets/[id]/replies` | ตอบกลับ |

**รูปแบบผลลัพธ์มาตรฐาน** (ใช้เหมือนกันทุก endpoint)

```json
{ "ok": true,  "data": {} }
{ "ok": false, "error": { "code": "TABLE_NOT_FOUND", "message": "ไม่พบโต๊ะนี้ กรุณาสแกน QR ใหม่อีกครั้ง" } }
```

`message` เป็นภาษาไทย เขียนบอกวิธีแก้ ไม่ใช่คำขอโทษลอย ๆ

---

## 9. หน้าจอทั้งหมด

### ฝั่งลูกค้า (Frontend)

1. **`/t/[token]` เมนู** — ชื่อร้าน + เลขโต๊ะชัดที่สุดด้านบน, แถบหมวดหมู่เลื่อนแนวนอน, รายการเมนูเป็นแถวยาว (รูปเล็กซ้าย ชื่อ+ราคาขวา) ไม่ใช่กริดการ์ด, ปุ่มเพิ่มลงตะกร้าใหญ่กดด้วยนิ้วโป้งได้
2. **`/t/[token]/cart` ตะกร้า** — แก้จำนวน ใส่หมายเหตุต่อรายการ ยอดรวมตรึงล่างจอ ปุ่ม "ยืนยันสั่ง (฿xxx)"
3. **`/t/[token]/status` สถานะออเดอร์** — แสดงเป็น "ใบสั่ง" เรียงตามรอบที่สั่ง มีสถานะรายรายการ (รอครัวรับ / กำลังทำ / เสิร์ฟแล้ว) และยอดสะสมของโต๊ะ
4. **`/t/[token]/ticket` แจ้งปัญหา** — ฟอร์มสั้น: หมวดปัญหา + หัวข้อ + รายละเอียด → คืนรหัส ticket ให้ลูกค้าเก็บไว้

### ฝั่งร้าน (Backend/Admin)

5. **`/login`** — ฟอร์มล็อกอินของพนักงาน
6. **`/admin` Dashboard** — หัวข้อ 12
7. **`/admin/orders` กระดานออเดอร์** — คอลัมน์ตามสถานะ ออเดอร์ใหม่ขึ้นบนสุด กดเปลี่ยนสถานะได้ในคลิกเดียว มีปุ่มปิดบิลต่อโต๊ะ
8. **`/admin/menu`, `/admin/categories`, `/admin/tables`, `/admin/users`** — CRUD (ตารางข้อมูล + ฟอร์มใน modal), หน้าโต๊ะมีปุ่มดู/ดาวน์โหลด QR
9. **`/admin/tickets`** — รายการ ticket กรองตามสถานะ/ความเร่งด่วน + หน้ารายละเอียดพร้อมกล่องตอบกลับ

---

## 10. Flow หลักของระบบ

```
ลูกค้าสแกน QR ที่โต๊ะ  →  /t/{qr_token}
        ↓ ระบบตรวจ token
   มี session OPEN ของโต๊ะนี้ไหม? ── ไม่มี → เปิด session ใหม่
        ↓ มี
   เลือกเมนู → ตะกร้า → กดยืนยัน
        ↓
   POST /api/public/orders  → สร้าง orders + order_items (สถานะ PENDING)
        ↓
   กระดานออเดอร์ฝั่งร้านเห็นทันที (poll ทุก 10 วินาที)
        ↓
   พนักงานกด: PENDING → PREPARING → SERVED
        ↓
   ลูกค้าสั่งเพิ่มได้เรื่อย ๆ (ออเดอร์ใหม่ผูก session เดิม)
        ↓
   พนักงานกด "ปิดบิล" → เลือกวิธีชำระ → บันทึก payments
        ↓
   session = CLOSED, โต๊ะกลับมาว่าง, สแกนครั้งถัดไปเปิด session ใหม่
```

**กฎสำคัญ**
- ราคาใน `order_items` ต้องคัดลอกจาก `menu_items` ตอนสั่ง ห้าม join ราคาสดตอนแสดงบิล
- ปิดบิลแล้ว ห้ามแก้ออเดอร์ของ session นั้นอีก
- ยกเลิกรายการ (`CANCELLED`) ต้องไม่ถูกนับในยอดรวม
- อัปเดตสถานะฝั่งร้านใช้การ poll ธรรมดา ห้ามทำ WebSocket

---

## 11. ระบบ Ticket แจ้งปัญหา

- รหัส ticket รูปแบบ `TK-YYMMDD-XXX` (XXX คือลำดับของวัน) แสดงให้ผู้แจ้งเก็บไว้
- ลูกค้าเปิดจากหน้าโต๊ะ (ผูก `table_id`) พนักงานเปิดจากหลังบ้าน (ผูก `created_by`)
- สถานะ: `OPEN → IN_PROGRESS → RESOLVED → CLOSED` (ปิดได้เฉพาะ ADMIN)
- ทุกการเปลี่ยนสถานะและการตอบกลับต้องเห็นเป็นลำดับเวลาในหน้ารายละเอียด
- ticket ที่ `URGENT` และยัง `OPEN` ต้องขึ้นแถบเตือนบน Dashboard

---

## 12. Dashboard (ต้องตอบคำถามว่า "วันนี้ร้านเป็นยังไง")

**ตัวเลขเอกที่เด่นที่สุดตัวเดียว: ยอดขายวันนี้** พร้อมบริบทเทียบเมื่อวาน (ไม่ใช่ % ลอย ๆ)

รอง ๆ ลงมา (ขนาดเล็กกว่าชัดเจน):
- จำนวนออเดอร์วันนี้ / โต๊ะที่กำลังนั่งอยู่ / ยอดค้างชำระของ session ที่ยังเปิด
- ออเดอร์ที่ค้างสถานะ `PENDING` นานเกิน 10 นาที (ต้องเด้งเป็นแถบเตือน)
- 5 เมนูขายดีของวัน (แท่งแนวนอน ไม่ใช่โดนัทชาร์ต)
- ยอดขายรายวัน 7 วันล่าสุด (กราฟเส้นเรียบ ๆ ไม่มี gradient ใต้เส้น)
- ticket ที่ยังไม่ปิด

**ห้าม**: การ์ด KPI 4 ใบเรียงเท่ากันพร้อมลูกศรเขียว/แดง, โดนัทชาร์ต, กราฟที่ไม่ได้ช่วยตัดสินใจอะไร

---

## 13. Design System — Modern Flat & Modular

พื้นหลังสว่าง สีล้วนไม่มีไล่เฉด จัดกลุ่มเนื้อหาทุกหน้าจอเป็น **การ์ด/โมดูล** แยกกันชัดเจนด้วยสีพื้นต่างระดับและเงาบาง ๆ
เมนูอาหารมีรูปประกอบ (หรือไอคอนตัวอักษรแทนเมื่อยังไม่มีรูป) ให้เห็นเป็นภาพ ไม่ใช่แค่ตัวหนังสือ

### 13.1 สี (ตั้งเป็น CSS variable ห้ามใช้ palette ดิบของ Tailwind)

| ตัวแปร | ค่า | ใช้กับ |
| --- | --- | --- |
| `--char` | `#FAF9F7` | พื้นหลังหน้า, พื้น input, ตัวอักษรบนปุ่ม accent |
| `--griddle` | `#FFFFFF` | พื้นผิวการ์ด/โมดูล — modal, แถบนำทาง, ตาราง, แจ้งเตือน |
| `--rule` | `#E6E3DC` | เส้นคั่น ขอบบาง |
| `--slip` | `#201D1A` | ตัวอักษรหลัก |
| `--slip-dim` | `#7A746A` | ตัวอักษรรอง |
| `--flame` | `#F0662B` | accent เดียวของระบบ |
| `--served` | `#1F9D55` | สถานะเสิร์ฟแล้ว |
| `--waiting` | `#D68A1A` | สถานะกำลังทำ |
| `--void` | `#D64545` | ยกเลิก/ผิดพลาด |

กติกา: `--flame` ใช้ได้เฉพาะ "สิ่งที่ต้องกดต่อ" อันเดียวต่อหน้าจอ เท่านั้น
**ห้าม**: gradient ม่วง-น้ำเงิน, gradient บนตัวอักษร, glassmorphism, blob เรืองแสง

### 13.2 ตัวอักษร

- **IBM Plex Sans Thai** สำหรับข้อความทั้งหมด (มีคู่ละตินในตระกูลเดียวกัน ไทย-อังกฤษจึงไม่เพี้ยน)
- **IBM Plex Mono** เฉพาะตัวเลขเงิน เวลา รหัสออเดอร์ รหัส ticket
- `line-height` เนื้อความ **1.7** หัวข้อไม่ต่ำกว่า **1.35** (สระไทยชนกันถ้าต่ำกว่านี้)
- **ห้าม `letter-spacing` ติดลบ** และห้าม `tracking-tight` กับข้อความไทย
- **ห้าม ALL CAPS** และห้าม eyebrow ตัวเล็กพิมพ์ใหญ่เหนือหัวข้อ (ภาษาไทยไม่มีตัวพิมพ์ใหญ่)
- ตัวเลขเงินใช้ `font-variant-numeric: tabular-nums` จัดชิดขวาเสมอ ทศนิยม 2 ตำแหน่งเท่ากันทั้งคอลัมน์
- เผื่อความยาวปุ่ม เพราะข้อความไทยยาวกว่าอังกฤษ 15–30%

### 13.3 Layout

- มุมโค้งแบบโมดูล: ปุ่ม/ช่องกรอก/ชิป **10px**, การ์ดมาตรฐาน **14px**, การ์ดใหญ่ **18px**, โมดูลเด่น **22px**
- แบ่งพื้นที่ด้วย**สีพื้นต่างระดับ** (`--char` พื้นหน้า / `--griddle` พื้นการ์ด) ประกอบเงาบาง (`shadow-sm`) แทนเส้นขอบล้วน
- กระดานออเดอร์จัดแบบ "กองใบสั่ง" เรียงบนลงล่าง แต่ละใบเป็นการ์ดของตัวเอง: เลขโต๊ะตัวใหญ่ซ้าย / เวลาที่สั่ง / รายการ / ชิปสถานะ / ปุ่มเปลี่ยนสถานะ
- เมนูอาหารแสดงเป็นการ์ดพร้อมรูปสี่เหลี่ยมมุมโค้ง (หรือไอคอนตัวอักษรพื้น accent เมื่อไม่มีรูป)
- ฝั่งลูกค้า: ปุ่มสำคัญอยู่ครึ่งล่างของจอ ลอยเป็นแถบมุมโค้งเหนือแถบนำทาง เป้ากดอย่างน้อย **44×44px**

### 13.4 Motion

มีได้เฉพาะที่ตอบการกระทำของผู้ใช้: กดปุ่ม, เปิด modal, รายการใหม่เข้ากระดาน (เน้นแค่ 200ms)
**ห้าม** fade-up ทุก section ตอน scroll, เคารพ `prefers-reduced-motion`

### 13.5 สถานะหน้าจอที่ต้องทำครบ (ไม่ทำ = ยังไม่เสร็จ)

| สถานะ | ต้องเป็นอย่างไร |
| --- | --- |
| Empty | บอกว่าทำอะไรต่อได้ + มีปุ่มให้ทำเลย เช่น "ยังไม่มีออเดอร์ในกะนี้ — เปิดหน้าโต๊ะเพื่อทดสอบ" |
| Loading | โครงร่าง (skeleton) ของสิ่งที่กำลังจะมา ห้าม spinner กลางจอ |
| Error | บอกว่าเกิดอะไรและแก้ยังไง + ปุ่มลองใหม่ |
| ข้อมูลผิดปกติ | ชื่อเมนูยาว 60 ตัวอักษร, ยอด 8 หลัก, ออเดอร์ 200 แถว ต้องไม่พัง |
| เข้าถึงได้ | focus ring มองเห็น, contrast ผ่าน, ไม่สื่อความหมายด้วยสีอย่างเดียว (มีข้อความกำกับสถานะด้วย) |

---

## 14. กฎการเขียนโค้ด (บังคับทุกไฟล์)

### 14.1 คอมเมนต์ภาษาไทย

ทุก **ฟังก์ชัน / React component / hook / route handler / helper / คลาส** ต้องมีคอมเมนต์ภาษาไทยเหนือตัวมัน รูปแบบ JSDoc ระบุ: หน้าที่ (ทำอะไร + ทำไม), พารามิเตอร์, ค่าที่คืน, ผลข้างเคียง/ข้อควรระวัง

```ts
/**
 * สร้างออเดอร์ใหม่จากตะกร้าของลูกค้า และคัดลอกราคา ณ ปัจจุบันลง order_items
 * เพื่อไม่ให้บิลเปลี่ยนตามราคาที่แอดมินแก้ภายหลัง
 *
 * @param sessionId - รหัสรอบการนั่งของโต๊ะที่กำลังเปิดอยู่
 * @param items - รายการที่ลูกค้าสั่ง แต่ละตัวมี menuItemId, quantity, note
 * @returns ข้อมูลออเดอร์ที่สร้างพร้อม order_code
 * @throws โยน error เมื่อเมนูถูกปิดขายไปแล้ว หรือ session ถูกปิดบิลไปแล้ว
 */
export async function createOrder(sessionId: number, items: CartItem[]): Promise<OrderSummary> {
```

- **ชื่อฟังก์ชัน ตัวแปร คลาส ไฟล์ คอลัมน์ฐานข้อมูล API path ยังเป็นภาษาอังกฤษเสมอ** คอมเมนต์เท่านั้นที่เป็นไทย
- ข้อความที่ผู้ใช้เห็นบนหน้าจอเป็นภาษาไทย
- คอมเมนต์ต้องเพิ่มข้อมูล ไม่ใช่แปลชื่อฟังก์ชัน เช่น `// ฟังก์ชัน createOrder` ถือว่าไม่ผ่าน

### 14.2 คลีนโค้ด

- 1 ฟังก์ชัน = 1 หน้าที่ ยาวไม่ควรเกิน ~40 บรรทัด
- Query SQL อยู่ในชั้น `lib/` หรือ route handler เท่านั้น ห้ามเขียน SQL ใน component
- ใช้ **prepared statement** ทุกครั้ง ห้ามต่อสตริง SQL เอง
- ห้าม magic number/string ลอย ๆ — ค่าคงที่ให้ประกาศไว้ที่เดียว
- ห้าม `any` ยกเว้นอธิบายเหตุผลไว้ในคอมเมนต์
- ห้ามทิ้งโค้ดที่คอมเมนต์ปิดไว้, ห้าม `console.log` ค้างในโค้ดที่ส่ง

### 14.3 ห้ามทำเกินสเปก

ห้ามเพิ่มโดยไม่ได้สั่ง: ฟีเจอร์ "เผื่อไว้", ไฟล์เพิ่ม (README, Dockerfile, test), ไลบรารีใหม่, endpoint ที่ไม่มีในหัวข้อ 8, ปุ่ม/หน้าจอที่ไม่มีในหัวข้อ 9, การรีแฟกเตอร์ไฟล์ที่ไม่เกี่ยวกับงานรอบนั้น
ถ้าคิดว่าควรเพิ่ม → **เขียนเป็นข้อเสนอท้ายคำตอบ ห้ามใส่ลงโค้ด**

---

## 15. แผนงานเป็นเฟส (ทำทีละเฟส ห้ามข้าม)

| เฟส | งาน | เกณฑ์เสร็จ (Definition of Done) |
| --- | --- | --- |
| **1. ฐานราก** | ตั้งโปรเจกต์ Next.js + Tailwind, `lib/db.ts`, `db/schema.sql`, `db/seed.sql`, ตั้ง design token ตามหัวข้อ 13 | `npm run build` ผ่าน, รัน schema+seed บน MySQL ได้ไม่ error, หน้าเปล่าแสดงสีและฟอนต์ตาม token |
| **2. Auth** | ล็อกอิน/ล็อกเอาต์ JWT, middleware กัน `/admin` | ล็อกอินผิดขึ้นข้อความไทยชัดเจน, เข้า `/admin` โดยไม่ล็อกอินถูกเด้งกลับ |
| **3. CRUD หลังบ้าน** | หมวดหมู่ → เมนู → โต๊ะ (+QR) → ผู้ใช้ | ทุกตารางเพิ่ม/แก้/ลบ/ค้นหาได้จริง, ลบของที่มีประวัติแล้วเปลี่ยนเป็นปิดใช้งานพร้อมข้อความอธิบาย, ดาวน์โหลด QR ของโต๊ะได้ |
| **4. ฝั่งลูกค้า** | สแกน token → เมนู → ตะกร้า → ยืนยันสั่ง → หน้าสถานะ | สแกน QR จริงจากมือถือแล้วสั่งได้ครบรอบ, token ผิดขึ้นหน้าแจ้งเตือนที่บอกวิธีแก้, ราคาถูกล็อกไว้ใน order_items |
| **5. กระดานออเดอร์ + ปิดบิล** | หน้า `/admin/orders`, เปลี่ยนสถานะ, checkout บันทึก payments | ออเดอร์ใหม่ขึ้นภายใน 10 วินาที, ปิดบิลแล้ว session ปิดและโต๊ะว่าง, บิลที่ปิดแล้วแก้ไม่ได้ |
| **6. Dashboard** | ตัวเลขและกราฟตามหัวข้อ 12 | ตัวเลขตรงกับข้อมูลจริงใน DB (ตรวจด้วย SQL เทียบ), ยกเลิกแล้วไม่ถูกนับ |
| **7. Ticket** | เปิด/ตอบ/เปลี่ยนสถานะ ทั้งฝั่งลูกค้าและร้าน | ลูกค้าแจ้งแล้วได้รหัส, พนักงานเห็นและตอบได้, URGENT+OPEN ขึ้นเตือนบน Dashboard |
| **8. เก็บงาน** | ตรวจ responsive, สถานะ empty/loading/error ครบทุกหน้า | ผ่าน checklist หัวข้อ 16 ทุกข้อ |

**ทุกเฟส**: ก่อนบอกว่าเสร็จ ต้องสรุปให้ดูว่าแก้ไฟล์อะไรบ้าง

---

## 16. Checklist ตรวจรับก่อนส่งงาน

**ตรงโจทย์**
- [x] ใช้ Next.js + MySQL เท่านั้น ไม่มีฐานข้อมูลอื่นแอบอยู่
- [x] มี Frontend (ลูกค้า) และ Backend/Admin แยกกันชัด
- [x] CRUD ครบทั้ง 4 ท่าอย่างน้อย 4 ตาราง และทุกตารางสัมพันธ์กับการทำงานจริง
- [x] Authentication ใช้งานได้ และกันการเข้าถึงที่ระดับ API ไม่ใช่แค่ซ่อนปุ่ม
- [x] Dashboard สรุปข้อมูลสำคัญได้จริง
- [x] ใช้งานได้ตั้งแต่มือถือ 360px ถึงเดสก์ท็อป

**ข้อกำหนดเพิ่ม**
- [x] ระบบ ticket เปิด/ตอบ/ปิดได้ครบวงจร
- [x] ทุกฟังก์ชันมีคอมเมนต์ภาษาไทยที่บอกหน้าที่ พารามิเตอร์ และค่าที่คืน
- [x] ไม่มีไฟล์/ฟีเจอร์/endpoint ที่ไม่ได้อยู่ใน plan.md นี้

**คุณภาพ UI**
- [x] ไม่มี gradient ม่วง-น้ำเงิน, ไม่มีการ์ดมนเงาเดียวกันทั้งหน้า, ไม่มี ALL CAPS กับข้อความไทย
- [x] `line-height` ไทยไม่ต่ำกว่า 1.6 ในเนื้อความ และไม่มี letter-spacing ติดลบ
- [x] ตัวเลขเงินชิดขวา ทศนิยมเท่ากัน ใช้ tabular-nums
- [x] ทุกหน้ามี empty / loading / error state
- [x] ถ้าลบสี `--flame` ออกแล้ว หน้าจอยังใช้งานได้ (ไม่สื่อความหมายด้วยสีอย่างเดียว)

**ความปลอดภัยพื้นฐาน**
- [x] รหัสผ่านเก็บเป็น bcrypt hash เท่านั้น
- [x] ใช้ prepared statement ทุก query
- [x] ลูกค้าเข้าถึงได้เฉพาะ session ของโต๊ะตัวเอง
- [x] JWT เก็บใน httpOnly cookie ไม่ใช่ localStorage

---

## 17. ข้อมูลตั้งต้น (seed.sql)

- ผู้ใช้: `admin` (ADMIN) และ `staff01` (STAFF) — รหัสผ่านตั้งเองแล้ว hash ก่อนใส่
- โต๊ะ 8 โต๊ะ (`A1`–`A4`, `B1`–`B4`) พร้อม `qr_token` แบบสุ่ม
- หมวดหมู่ 4 หมวด: ของทานเล่น, จานเดียว, กับข้าว, เครื่องดื่ม
- เมนูอย่างน้อย 16 รายการ **ใช้ชื่อและราคาจริงที่ร้านไทยใช้จริง** (เช่น กะเพราหมูสับไข่ดาว 65, ต้มยำกุ้งน้ำข้น 180, ชาไทยเย็น 45) — ห้ามใช้ "เมนู 1", "Item A", Lorem ipsum

---

## 18. การปรับปรุงความปลอดภัยและประสิทธิภาพระดับสูง (Hardening & Concurrency: v0.5.0 – v0.6.0)

เพื่อรองรับการใช้งานระดับพาณิชย์จริง ระบบได้รับการปรับปรุงเชิงลึก (ข้อ 2.1 – 2.12) ครบถ้วนดังนี้:
1. **Secret & Environment Protection (2.1)**: บังคับระบุ `JWT_SECRET` ปราศจาก fallback string และลบไฟล์ `.env` ออกจาก Git tracking ถาวร
2. **Error Message Sanitization (2.2)**: ซ่อน Database Internal Errors ทั้งหมด ส่งเฉพาะ Correlation ID และข้อความภาษาไทยที่เข้าใจง่าย
3. **Timezone & Business Day Range (2.3)**: ตั้งค่าเวลา `Asia/Bangkok` (+07:00) และคำนวณช่วงเวลาวันทำการผ่าน `getBusinessDayRange()` โดยไม่ใช้ฟังก์ชันครอบคอลัมน์ใน SQL เพื่อให้ใช้ Index ได้ 100%
4. **Atomic Order Counter (2.4)**: รันรหัสออเดอร์ลำดับวันผ่าน `order_code_sequences` ด้วย `INSERT ... ON DUPLICATE KEY UPDATE` ขจัดปัญหา Table Lock
5. **Session Concurrency Guard (2.5)**: ป้องกันการแย่งเปิดบิลซ้อนด้วย Row Lock Mutex บน `dining_tables`
6. **Permanent QR Lifecycle (2.6)**: ป้าย QR Code ประจำโต๊ะเป็นแบบถาวร โดยแยกสิทธิ์การสั่งอาหารให้ผูกกับ Session สถานะ `OPEN`
7. **Single Source of Truth for Totals (2.7)**: คำนวณยอดเงินรวมจาก `order_items` (สถานะไม่ใช่ `CANCELLED`) แบบเรียลไทม์ ป้องกันปัญหาตัวเลขปัดเศษเพี้ยน
8. **Batch Pricing Query (2.8)**: รวบคำสั่งตรวจราคาและสถานะอาหารเหลือคำสั่งเดียว `WHERE id IN (...)` ขจัดปัญหา N+1 Query
9. **Composite Database Indexes (2.9)**: เพิ่ม Index บน `orders(created_at)`, `orders(status, created_at)`, `table_sessions(table_id, status)`, `order_items(order_id, status)`, `payments(paid_at)`, `tickets(status, priority)`
10. **Sliding-Window Rate Limiter (2.10)**: จำกัดอัตราการเรียก API Login (5/min/user, 20/min/IP) และ Public Orders (10/min/token)
11. **Upload Security & Magic Bytes (2.11)**: ตรวจสอบ Magic Bytes ไบนารีแท้จริงของรูปภาพ (JPEG, PNG, GIF, WebP, AVIF) ป้องกันสคริปต์แฝง, ตั้งชื่อไฟล์ด้วย `randomUUID()`, ป้องกัน Path Traversal และ Mount Volume ถาวรใน Docker
12. **Strict Admin Permission Matrix (2.12)**: บังคับสิทธิ์ `ADMIN` บนการสร้าง QR Code ประจำโต๊ะใหม่ (`regenerate-qr`) ทั้งฝั่ง Backend และ Frontend

---

## 19. ระบบ Audit Log ป้องกันการทุจริตการยกเลิกบิล/อาหาร (Phase 2)

การตัดเงินหรือยกเลิกรายการอาหารออกจากบิลเป็นช่องทางทุจริตคลาสสิกของระบบ POS ร้านอาหาร ระบบจึงกำหนดมาตรการดังนี้:
1. **ตาราง `cancellation_audit_logs`**: บันทึกประเภทเอนทิตี (`ORDER_ITEM` หรือ `ORDER`), รหัสออเดอร์, เลขโต๊ะ, ชื่อรายการ, จำนวน, ยอดเงินที่ถูกตัดออก, เหตุผล, วันเวลา และผู้ที่ทำรายการ (`cancelled_by`)
2. **Cancellation Reason Modal**: เมื่อพนักงานหรือแอดมินกดยกเลิกรายการอาหาร จะมีหน้าต่างบังคับระบุเหตุผล (ลูกค้าเปลี่ยนใจ, คีย์ซ้ำ, วัตถุดิบหมด, คีย์ผิดโต๊ะ, รอนาน หรือระบุเอง)
3. **Void Order Restriction**: การกดยกเลิกทั้งบิล (Void Order) สงวนสิทธิ์เฉพาะเจ้าของร้าน (ADMIN) เท่านั้น
4. **Cancellation Audit Report**: หน้ารายงานประวัติการยกเลิกสำหรับเจ้าของร้าน เพื่อตรวจสอบยอดเงินที่ถูกตัดออกและเหตุผลย้อนหลังได้ทุกกะ

---

## 20. แผนงานระบบจัดการหลายสาขา (Phase 3: Multi-Branch Architecture)

> **กลยุทธ์การพัฒนา**: ระบบจัดการสาขาเป็นฟีเจอร์โครงสร้างขนาดใหญ่ จะทำการ **แยก Git Branch ใหม่ (`feat/multi-branch`) ออกมาจาก `main`** หลังจาก commit และ push เวอร์ชัน `v0.6.0` เสร็จสิ้น เพื่อรักษาความเสถียรของ Core Branch

### 20.1 สถาปัตยกรรมระดับองค์กร (Enterprise Multi-Branch Design)
1. **ตาราง `branches` (ข้อมูลสาขา)**:
   - `id`, `code` (เช่น `BKK-SIAM`, `BKK-ARI`), `name`, `address`, `phone`, `business_day_cutoff_hour`, `is_active`, `created_at`, `updated_at`
2. **การ Partition ข้อมูลด้วย `branch_id`**:
   - `dining_tables (branch_id, table_no UNIQUE)`: เลขโต๊ะอ้างอิงรายสาขา
   - `table_sessions (branch_id)`
   - `orders (branch_id)`
   - `order_code_sequences (business_date, branch_id)`: เลขออเดอร์รันแยกตามสาขา
   - `payments (branch_id)`
   - `tickets (branch_id)`
   - `cancellation_audit_logs (branch_id)`
   - `users (branch_id NULL)`: `SUPER_ADMIN` เข้าถึงทุกสาขา, `BRANCH_MANAGER` / `STAFF` กำหนดสิทธิ์เฉพาะสาขาของตนเอง
3. **Master Catalog & Branch Price Overrides**:
   - ตารางกลาง `menu_items` เป็นเมนูหลักของแบรนด์
   - ตาราง `branch_menu_availability (branch_id, menu_item_id, price, is_available)` สำหรับตั้งราคาและเปิด/ปิดของหมดแยกรายสาขา
4. **Zero-Friction Customer QR Experience**:
   - ลูกค้ายังคงสแกน QR ลิงก์ `/t/[qr_token]` เช่นเดิม โดยระบบสืบค้น `branch_id` จากโต๊ะอัตโนมัติ ไม่ต้องให้ลูกค้ากดเลือกสาขาเอง
5. **HQ Dashboard & Branch Context Switching**:
   - เจ้าของร้านสามารถดูยอดขายรวมทุกสาขา หรือเลือกดูเจาะจงรายสาขาได้ผ่านตัวสลับสาขา (Branch Switcher) บนแถบนำทาง

### 20.2 สถานะการพัฒนาและการส่งมอบ Phase 3 (Implemented & Verified on `feat/multi-branch`)
- **Database & Migration**: สร้าง `db/migrations/004_branches.sql` และอัปเดต `db/schema.sql` รองรับตาราง `branches` (Default Branch 1: `HQ-SIAM`), `branch_menu_availability` และ Foreign Keys `branch_id` ในทุกตารางสำคัญ
- **Tenant Isolation & Security Core (`src/lib/branch.ts`)**:
  - ฟังก์ชัน `getEffectiveBranchId()` ตรวจสอบผู้ใช้: หากเป็นพนักงานสาขา (`user.branchId !== null`) ระบบจะบังคับล็อกสิทธิ์สาขานั้นอย่างเข้มงวด ละเลย cookie/param ใดๆ ทั้งสิ้น
  - สำหรับ HQ Admin (`user.branchId === null`) รองรับการสลับมุมมองสาขาผ่าน cookie `pos_active_branch` หรือเลือกดูภาพรวมทุกสาขา
- **Admin APIs**:
  - `/api/admin/branches`: จัดการรายการสาขาและสร้างสาขาใหม่
  - `/api/admin/branches/[id]`: ดูข้อมูลและแก้ไขรายละเอียดสาขา
  - `/api/admin/branches/[id]/menu`: ปรับราคาเฉพาะสาขา (Custom Price) และเปิด/ปิดการจำหน่าย (Stock Toggle)
  - `/api/admin/branches/switch`: สลับบริบทการทำงานของสาขาสำหรับ HQ Admin
  - ปรับปรุง `/api/admin/tables`, `/api/admin/orders`, `/api/admin/cancellations`, `/api/admin/tickets`, `/api/admin/dashboard` ให้กรองข้อมูลตามสาขาอัตโนมัติ
- **Customer Experience**:
  - ลูกค้าสแกน QR โต๊ะเดิมที่ `/t/[token]` ระบบจะเชื่อมโยงสาขาจากโต๊ะไปยังออเดอร์ บิล และตั๋วแจ้งปัญหาโดยตรง
  - ดึงข้อมูลราคาและสถานะอาหารเฉพาะสาขาอัตโนมัติผ่าน `/api/public/menu?token=...`
- **UI Components & Pages**:
  - `BranchSwitcher`: Dropdown สลับสาขาสำหรับผู้ดูแลระบบ HQ และป้ายกำกับสาขาสำหรับพนักงาน
  - `/admin/branches`: หน้าบริหารจัดการสาขาทั้งหมด แสดงจำนวนโต๊ะและออเดอร์
  - `/admin/branches/[id]/menu`: หน้าปรับราคาและจัดการของหมดรายสาขา
  - Dashboard: การ์ดเปรียบเทียบยอดขายรายสาขาแบบเรียลไทม์ และป้ายกำกับสาขาในหน้าต่าง ๆ
- **Quality & Verification**:
  - ผ่าน `npx tsc --noEmit` ไร้ข้อผิดพลาด (0 errors)
  - ผ่าน `npm run build` Next.js Production Build ครบทั้ง 29 เส้นทางอย่างสมบูรณ์
  - ยืนยัน Tenant Isolation 100%: พนักงานสาขาไม่สามารถข้ามเขตสาขาได้ แม้จะพยายามส่ง cookie ปลอม
  - ระบบซิงก์สถานะ Client Components สมบูรณ์เมื่อมีการสลับสาขา

### 20.3 บันทึกประวัติเวอร์ชัน (Changelog: v0.7.0)
- **Multi-Branch Architecture**: สถาปัตยกรรมรองรับหลายสาขาเต็มรูปแบบ พร้อมตาราง `branches` และ Foreign Keys ทั่วระบบ
- **Branch Context & Tenant Isolation**: ป้องกันการข้ามเขตข้อมูลระหว่างสาขาสำหรับพนักงาน และระบบสลับสาขาสำหรับผู้ดูแลส่วนกลาง (HQ Admin)
- **Branch Menu & Price Overrides**: ปรับราคาพิเศษและเปิด/ปิดสต๊อกแยกสาขา พร้อมระบบบันทึกแบบกลุ่ม (Batch Save)
- **Branch Table & QR Management**: ป้ายชื่อสาขาบน QR Tent Card, Thermal Slip 80mm และตัวเลือกสาขาในการเพิ่ม/ย้ายโต๊ะ
- **Multi-Branch Analytics & Reporting**: รายงานเปรียบเทียบยอดขายรายวัน/รายเดือน และส่งออก CSV แยกตามสาขา
- **Cancellation Audit with Branch Context**: ป้ายชื่อสาขาในรายงานประวัติการยกเลิกอาหารและบิลเพื่อความโปร่งใสสูงสุด

### 20.4 การยกระดับความปลอดภัยและระบบปฏิบัติการสาขาระดับลึก (Branch Hardening & Integrity: v0.7.1)
- **Master Catalog Precedence**: เมนูที่ปิดจำหน่ายจากสำนักงานใหญ่ (`is_available = 0`) จะระงับการขายในทุกสาขาทันที พร้อมป้ายกำกับ "ปิดขายจากส่วนกลาง (HQ)" บนหน้าจัดการเมนูสาขา
- **Strict Mutation Tenant Isolation**: ตรวจสอบสิทธิ์สาขา 100% ในทุก Endpoint การเปลี่ยนสถานะและชำระเงิน (`orders/[id]`, `order-items/[id]`, `sessions/[id]/checkout`, `tables/[id]/open`, `tables/[id]/regenerate-qr`)
- **Privilege Escalation Defense**: ป้องกันแอดมินประจำสาขายกระดับบัญชีเป็น HQ Admin, สร้างบัญชี หรือแก้ไขข้อมูลผู้ใช้ของสาขาอื่น
- **Foreign Key Referential Integrity**: ตรวจสอบความมีอยู่จริงของสาขาก่อนบันทึกโต๊ะ (`dining_tables`), บัญชีผู้ใช้ (`users`) และการสลับบริบทสาขา (`branches/switch`)
- **Cross-Branch Ticket Defense**: ตรวจสอบความเป็นเจ้าของของโต๊ะอาหาร และป้องกันการมอบหมายงานให้พนักงานต่างสาขา
- **End-to-End Branch Branding**: แสดงชื่อสาขาบนหัวเว็บฝั่งลูกค้า, ตั๋วห้องครัว, ใบเสร็จรับเงิน และแถบแจ้งเตือนออเดอร์ค้างบนแดชบอร์ด
- **Seamless Branch Context Actions**: ปุ่มเข้าสู่สาขาโดยตรงบนตารางจัดการสาขาสำหรับผู้ดูแลระบบ HQ

---

## 21. ระบบสรุปปิดยอดประจำวันและปิดกะ (Phase 4: End-of-Day Settlement & Z-Report: v0.8.0)

### 21.1 วัตถุประสงค์และฟังก์ชันหลัก
1. **End-of-Day Settlement API (`/api/admin/settlement`)**:
   - ประมวลผลยอดขายสุทธิประจำวันทำการ (Business Day) คำนวณตัดรอบตาม `business_day_cutoff_hour` ของแต่ละสาขาโดยพลวัต
   - สรุปแยกตามช่องทางชำระเงิน: เงินสด (CASH), โอนเงิน/QR PromptPay (TRANSFER), บัตรเครดิต/เดบิต (CARD)
   - สรุปยอดรับเงินรายพนักงานแคชเชียร์ (`received_by`)
   - สรุปยอดขายแยกตามหมวดหมู่อาหาร และ 10 อันดับเมนูขายดีประจำวัน
   - สรุปมูลค่าความเสียหายและจำนวนรายการที่ถูกยกเลิก (Void Loss) ตามสาเหตุ
   - ตรวจจับและแจ้งเตือนโต๊ะที่ยังไม่เช็คบิลค้างอยู่ ณ ปัจจุบันในสาขา
2. **หน้าจอจัดการปิดกะ (`/admin/settlement`)**:
   - แดชบอร์ดตัวชี้วัดทางการเงิน (KPI Strip) ยอดขายสุทธิ, เงินสดในลิ้นชัก, เงินโอน, บัตรเครดิต, จำนวนบิล, ยอดเฉลี่ยต่อบิล
   - ตัวเลือกวันที่ทำการ (วันนี้, เมื่อวาน, หรือเลือกวันที่ย้อนหลัง)
   - แถบแจ้งเตือนโต๊ะค้างชำระ (Unpaid Tables Banner) พร้อมทางลัดไปหน้าจัดการโต๊ะ
   - แบบฟอร์มตรวจนับเงินสดในลิ้นชัก (Cash Drawer Reconciliation Sheet)
3. **การพิมพ์สลิปความร้อน 80mm Z-Report (Thermal Print)**:
   - พิมพ์ใบสรุปปิดกะ/ปิดวันขนาด 80mm ผ่าน Print Engine อิสระ (`printHtml`)
   - มีหัวบิลระบุสาขา วันที่ทำการ ช่วงเวลาตัดรอบ เวลาพิมพ์ และพนักงาน
   - สรุปยอดขายสุทธิ ช่องทางชำระ ยอดเงินสดในลิ้นชักที่ต้องส่งมอบ
   - ช่องตรวจนับเงินสดจริงและส่วนต่าง (ขาด/เกิน)
   - ช่องลงลายมือชื่อแคชเชียร์ผู้ส่งมอบและผู้จัดการผู้ตรวจรับเงิน
4. **การส่งออกรายงาน CSV (Export CSV)**:
   - ส่งออกข้อมูลสรุปปิดยอดประจำวันเป็นไฟล์ `settlement-[branch]-[date].csv` สำหรับส่งฝ่ายบัญชี
5. **การยกระดับบันทึกประวัติการยกเลิก (Cancellation Audit Hardening)**:
   - กรองตามวันทำการ (คำนวณตาม cutoffHour) และกรองตามสาเหตุการยกเลิก
   - ปุ่มส่งออกประวัติการยกเลิกเป็นไฟล์ CSV ในหน้า `CancellationAuditModal`
6. **การเข้าถึงสะดวกรวดเร็ว (Seamless Access)**:
   - เพิ่มเมนู "สรุปปิดยอด" ในแถบนำทางหลัก (`AdminNav`)
   - เพิ่มทางลัดบน Dashboard ทั้งสำหรับ HQ Admin (`DashboardQuickNav`) และ Staff (`StaffOperationalView`)

### 21.2 ระบบปฏิบัติการโต๊ะอาหารขั้นสูงและการย้ายโต๊ะ (Table Operations & Transfer: v0.8.1)
- **Table Transfer Engine (`/api/admin/tables/[id]/transfer`)**:
  - ย้ายรอบการนั่ง (Session) และออเดอร์ทั้งหมดไปยังโต๊ะใหม่เมื่อลูกค้าขอย้ายโต๊ะ (เช่น ย้ายโต๊ะใหญ่ขึ้น หรือเปลี่ยนตำแหน่ง)
  - ย้ายตั๋วแจ้งปัญหา (`tickets`) ที่ค้างอยู่ไปยังโต๊ะใหม่โดยอัตโนมัติ
  - ตรวจสอบความปลอดภัยเข้มงวด: โต๊ะปลายทางต้องอยู่ในสาขาเดียวกัน (Tenant Isolation), เปิดใช้งานอยู่ และไม่มีลูกค้านั่งซ้อนอยู่
  - ทำงานผ่าน Database Transaction รับประกันความถูกต้องระดับ Atomic (สอดคล้องกับ UNIQUE KEY `uq_open_table`)
- **1-Tap Table Session Activation**:
  - ปุ่ม "เปิดโต๊ะ" บนการ์ดโต๊ะว่างในหน้าจัดการโต๊ะ (`TableManager`) ให้พนักงานกดเปิดรับลูกค้านั่งได้ทันทีในคลิกเดียว
- **Table Filter & Deep Linking on Orders Board**:
  - รองรับการกรองตามเลขโต๊ะ `tableNo` บน API `/api/admin/orders`
  - ช่องกรองค้นหาเลขโต๊ะบนกระดานออเดอร์ พร้อมปุ่มล้างตัวกรอง
  - รองรับการเปิดกระดานผ่าน URL Query Param (`/admin/orders?tableNo=...`) โดยห่อด้วย `<Suspense>`
  - ปุ่ม "ดูออเดอร์" บนโต๊ะที่มีลูกค้านั่ง ลิงก์ตรงสู่กระดานออเดอร์ของโต๊ะนั้นทันที
- **Table KPI Strip & Status Filtering**:
  - แถบสรุปตัวชี้วัดสถานะโต๊ะ: จำนวนโต๊ะทั้งหมด, กำลังให้บริการ, โต๊ะว่างพร้อมรับ, ปิดปรับปรุง และอัตราการครองโต๊ะ (%)
  - ตัวกรองสถานะโต๊ะแบบแท็บ ("ทั้งหมด", "โต๊ะว่าง", "มีลูกค้านั่ง", "ปิดใช้งาน") และช่องค้นหาเลขโต๊ะ

### 21.3 ระบบปฏิบัติการห้องครัวขั้นสูงและกระดานจัดการออเดอร์ (Kitchen Display System & Operations: v0.8.2)
- **Kitchen Display System (KDS Kanban Mode)**:
  - สลับมุมมองได้ทันทีระหว่าง "มุมมองรายการ (Card List)" และ "มุมมองกระดานครัว (KDS Columns)"
  - กระดาน 3 คอลัมน์ Kanban มาตรฐานสำหรับแท็บเล็ต/จอทัชสกรีนในห้องครัว:
    1. รอครัวรับ (`PENDING`)
    2. กำลังปรุง (`PREPARING`)
    3. เสิร์ฟแล้ว / รอเช็คบิล (`SERVED`)
  - ปุ่ม Action ขนาดใหญ่สำหรับคนครัว: รับออเดอร์ (เริ่มทำ) ด้วยคลิกเดียว และเสิร์ฟครบทั้งใบ
- **Order Aging & Urgency Timer (ระบบเตือนออเดอร์รอนาน)**:
  - คำนวณระยะเวลารอของแต่ละออเดอร์แบบเรียลไทม์จาก `created_at`
  - ป้ายกำกับสถานะเวลาและระดับความเร่งด่วน:
    - ปกติ (< 10 นาที): แสดงระยะเวลาสั่ง เช่น `รอ 4 นาที`
    - เตือนรอนาน (10–20 นาที): แถบสีอำพัน `⚠️ รอนาน 14 น.`
    - วิกฤต/เร่งด่วน (> 20 นาที): แถบสีแดงพร้อมเอฟเฟกต์กะพริบ `🔥 เร่งด่วน! 22 น.` ป้องกันอาหารตกหล่น
  - นาฬิกานับเวลาอัปเดตทุกวินาทีในตัว
- **Kitchen Batch Prep Summary (สรุปคิวที่ต้องปรุงสำหรับครัว)**:
  - แถบสรุปยอดรวมรายการอาหารที่ค้างปรุง (`PENDING` และ `PREPARING`) จากทุกโต๊ะ
  - จัดกลุ่มตามชื่อเมนู แสดงจำนวนจานรวม และรายชื่อโต๊ะที่รอ (เช่น `กะเพราหมูสับ × 5 | โต๊ะ 1, 3, 7`)
  - ช่วยให้พ่อครัววางแผนตั้งกระทะหรือปรุงพร้อมกันเป็นชุด (Batch Cooking) ได้อย่างมีประสิทธิภาพ
- **Auto-Refresh Interval Controls & Live Countdown**:
  - ตัวนับเวลาถอยหลังการซิงก์รอบถัดไป (`รีเฟรชใน Xs`) พร้อมวันเวลาที่ซิงก์สำเร็จล่าสุด
  - ตัวเลือกรอบเวลาอัตโนมัติ: 5 วินาที, 10 วินาที, 30 วินาที หรือหยุดชั่วคราว (Pause)
  - ปุ่มกดดึงข้อมูลทันที (Instant Refresh) พร้อมแอนิเมชันหมุนขณะโหลด
- **Branch Receipt & Tax Invoice Hardening (ใบเสร็จรับเงิน 80mm)**:
  - ดึงข้อมูล `branch_address` และ `branch_phone` จากฐานข้อมูลสาขาจริง
  - คำนวณแจกแจงภาษีมูลค่าเพิ่ม (VAT 7% Inclusive): มูลค่าก่อนภาษี (Pre-VAT) และภาษีมูลค่าเพิ่ม (VAT 7%)
  - แสดงผลครบถ้วนทั้งในหน้าตัวอย่าง (Modal Preview) และสลิปความร้อน 80mm สำหรับลูกค้า

### 21.4 ยกระดับประสบการณ์สั่งอาหารฝั่งลูกค้า (Customer Experience & Order Tracking: v0.8.3)
- **Order Timeline Progression Stepper**:
  - แถบแสดงความคืบหน้าของใบสั่งอาหาร 3 ขั้นตอนบนการ์ดออเดอร์ของลูกค้า (`/t/[token]/status`):
    1. สั่งแล้ว (Sent)
    2. ครัวกำลังปรุง (Cooking - แอนิเมชัน Pulse แสดงว่าพ่อครัวกำลังทำ)
    3. เสิร์ฟครบแล้ว (Served - ติ๊กถูกสีเขียว)
  - ให้ลูกค้ารับรู้สถานะความคืบหน้าของอาหารได้แบบเรียลไทม์ ลดความกังวลและการเรียกสอบถามพนักงาน
- **Quick Order More & Bill Request (แถบลอยสั่งเพิ่มและเช็คบิล)**:
  - เพิ่มปุ่ม "➕ สั่งเพิ่ม" บนแถบลอยด้านล่างของหน้าสถานะ ช่วยให้ลูกค้ากลับไปเลือกเมนูเพิ่มได้ทันที
  - ทำงานควบคู่กับปุ่ม "ขอเช็คบิล / ชำระเงิน" (`QuickTicketButton`) และยอดสะสมสุทธิของโต๊ะอย่างลงตัว

### 21.5 ระบบแยกสเตชันครัว/บาร์ สตูดิโอแจ้งเตือนเสียง และโปรไฟล์พนักงาน (Station Routing, Chime Studio & Profile: v0.8.4)
- **Kitchen & Bar Station Routing (ระบบแยกสเตชันครัวและบาร์อัจฉริยะ)**:
  - จำแนกสเตชันปรุงรายการอาหารระหว่าง **🍳 ครัว (Kitchen)** และ **🍹 บาร์/ของหวาน (Bar & Desserts)** โดยวิเคราะห์จากชื่อหมวดหมู่และชื่อเมนูภาษาไทย/อังกฤษแบบอัตโนมัติ (Zero-Schema-Migration)
  - แท็บตัวกรองสเตชันบนกระดานจัดการออเดอร์ (`ทั้งหมด`, `🍳 ครัว`, `🍹 บาร์`) พร้อม Badge แสดงจำนวนรายการที่ค้างปรุงแยกสเตชันแบบเรียลไทม์
  - สรุปคิวปรุงรวม (Kitchen Batch Prep Summary) แยกตามสเตชัน ช่วยให้แผนกเครื่องดื่มและห้องครัวไม่สับสนกับคิวของกันและกัน
  - ป้ายกำกับสเตชันบนรายการอาหาร (`🍳 ครัว` / `🍹 บาร์`) บนการ์ดออเดอร์ทุกใบ
  - การพิมพ์ตั๋วความร้อน 80mm แยกสเตชัน: สามารถเลือกพิมพ์ **ตั๋วครัว**, **ตั๋วบาร์**, หรือ **ตั๋วรวม** พร้อมปุ่มทางลัดบนการ์ดออเดอร์ในคลิกเดียว
- **Interactive Audio Chime Studio (ระบบสตูดิโอเสียงแจ้งเตือนออเดอร์เข้า)**:
  - สังเคราะห์คลื่นเสียงความถี่สูงผ่าน Web Audio API โดยตรง ไม่ต้องพึ่งพาไฟล์เสียงภายนอก โหลดเร็วและเสถียร 100%
  - รูปแบบเสียงมาตรฐานร้านอาหาร 3 รูปแบบ:
    1. `CHIME`: สองโทนความถี่ 587Hz -> 880Hz ไพเราะ นุ่มนวล เหมาะกับร้านคาเฟ่และร้านอาหาร Fine Dining
    2. `BELL`: เสียงเคาะกระดิ่งกังวาน 1046Hz สไตล์ Bistro / Casual Dining
    3. `ALERT`: เสียงเตือนเร็ว 3 จังหวะ 784Hz -> 1046Hz สำหรับครัวที่เสียงดังหรือช่วง Rush Hour
  - แถบปรับระดับความดัง (Volume Slider 0–100%) พร้อมปุ่มเปิด/ปิดเสียง และระบบบันทึกค่าลงใน `localStorage`
  - ปุ่ม "🔊 ทดสอบเสียง" บนแถบเครื่องมือ ช่วยให้พนักงานทดสอบระดับเสียงและปลดล็อก Browser Autoplay Policy ได้ในทันที
- **Staff Self-Service Profile & Security Management (`/admin/profile` & API `/api/admin/users/profile`)**:
  - หน้าจอจัดการโปรไฟล์ส่วนตัวของพนักงานและผู้จัดการทุกคน แสดงการ์ดประจำตัวและสถิติผลงาน (ยอดบิลที่ปิด, ยอดเงินที่รับชำระ, จำนวนตั๋วบริการที่ดูแล)
  - แบบฟอร์มแก้ไขชื่อ-นามสกุลที่แสดง พร้อมออก JWT Session Cookie ใบใหม่อัตโนมัติ ส่งผลให้ชื่อบน Header และ AdminNav อัปเดตทันทีโดยไม่ต้องเข้าสู่ระบบใหม่
  - แบบฟอร์มเปลี่ยนรหัสผ่านส่วนตัวอย่างปลอดภัย ตรวจสอบรหัสผ่านเดิมด้วย `bcrypt.compare` และเข้ารหัสรหัสผ่านใหม่ด้วย Bcrypt (Salt rounds 10)
  - เมนู "ข้อมูลส่วนตัว" บนแถบนำทางหลัก (`AdminNav`) และทำให้การ์ดชื่อพนักงานที่ส่วนหัวสามารถคลิกเพื่อเข้าสู่หน้าโปรไฟล์ได้ทันที

---

