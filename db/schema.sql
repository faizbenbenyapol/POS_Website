-- =============================================================
-- schema.sql — DDL ทุกตารางของระบบ POS สั่งอาหารด้วย QR Code (Multi-Branch Ready)
-- ใช้กับ MySQL 8 ขึ้นไป ทุกตารางเป็น utf8mb4_unicode_ci
-- วิธีรัน: mysql -u root -p < db/schema.sql
-- =============================================================

-- บังคับ character set ของ connection เป็น utf8mb4 ก่อนนำเข้าข้อมูล
-- ป้องกันปัญหาข้อความไทยเพี้ยน (mojibake) เวลา docker entrypoint รันไฟล์นี้
-- ด้วย client charset เริ่มต้นที่ไม่ตรงกับไฟล์ (ซึ่งเป็น UTF-8)
SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS pos_qr
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE pos_qr;

-- ลบตารางเดิมก่อน เรียงจากตารางลูกไปตารางแม่ เพื่อไม่ให้ติด foreign key
DROP TABLE IF EXISTS schema_migrations;
DROP TABLE IF EXISTS payment_requests;
DROP TABLE IF EXISTS ingredient_stock_logs;
DROP TABLE IF EXISTS menu_recipes;
DROP TABLE IF EXISTS branch_ingredient_stock;
DROP TABLE IF EXISTS ingredients;
DROP TABLE IF EXISTS order_item_options;
DROP TABLE IF EXISTS menu_options;
DROP TABLE IF EXISTS menu_option_groups;
DROP TABLE IF EXISTS menu_stock_logs;
DROP TABLE IF EXISTS settlements;
DROP TABLE IF EXISTS ticket_replies;
DROP TABLE IF EXISTS tickets;
DROP TABLE IF EXISTS cancellation_audit_logs;
DROP TABLE IF EXISTS order_status_logs;
DROP TABLE IF EXISTS branch_menu_availability;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS order_counters;
DROP TABLE IF EXISTS table_sessions;
DROP TABLE IF EXISTS menu_items;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS dining_tables;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS branches;

-- สาขาในเครือข่ายของร้าน
CREATE TABLE branches (
  id                       INT AUTO_INCREMENT PRIMARY KEY,
  code                     VARCHAR(20)  NOT NULL UNIQUE,
  name                     VARCHAR(100) NOT NULL,
  address                  VARCHAR(255) NULL,
  phone                    VARCHAR(30)  NULL,
  business_day_cutoff_hour TINYINT      NOT NULL DEFAULT 4,
  vat_rate                 DECIMAL(5,2) NOT NULL DEFAULT 7.00,
  vat_inclusive            TINYINT(1)   NOT NULL DEFAULT 1,
  service_charge_rate      DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  -- บัญชีพร้อมเพย์ของสาขา ใช้สร้าง QR รับเงินโอนตอนปิดบิล
  promptpay_id             VARCHAR(20)  NULL,
  promptpay_name           VARCHAR(100) NULL,
  is_active                TINYINT(1)   NOT NULL DEFAULT 1,
  created_at               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- สาขาเริ่มต้น
-- พร้อมเพย์เป็นบัญชีตัวอย่าง ต้องเปลี่ยนเป็นบัญชีจริงของร้านที่หน้า "จัดการสาขา" ก่อนใช้งานจริง
INSERT INTO branches (id, code, name, address, phone, business_day_cutoff_hour, promptpay_id, promptpay_name, is_active)
VALUES (1, 'HQ-SIAM', 'สาขาสยาม (สำนักงานใหญ่)', 'สยามสแควร์ กรุงเทพมหานคร', '02-123-4567', 4,
        '0812345678', 'สาขาสยาม (บัญชีตัวอย่าง)', 1);

-- ผู้ใช้ระบบฝั่งร้าน (พนักงานและแอดมิน) ใช้สำหรับ Authentication
-- branch_id = NULL คือ เจ้าของร้าน/HQ Admin (เข้าถึงได้ทุกสาขา)
CREATE TABLE users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(100) NOT NULL,
  role          ENUM('ADMIN','STAFF') NOT NULL DEFAULT 'STAFF',
  branch_id     INT          NULL,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- โต๊ะในร้าน แต่ละโต๊ะมี token สำหรับสร้าง QR (ลิงก์ /t/{token})
-- table_no ไม่ซ้ำกันในสาขาเดียวกัน แต่ข้ามสาขาซ้ำกันได้
CREATE TABLE dining_tables (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  branch_id  INT          NOT NULL DEFAULT 1,
  table_no   VARCHAR(10)  NOT NULL,
  seats      TINYINT      NOT NULL DEFAULT 4,
  qr_token   CHAR(32)     NOT NULL UNIQUE,
  is_active  TINYINT(1)   NOT NULL DEFAULT 1,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_branch_table (branch_id, table_no),
  FOREIGN KEY (branch_id) REFERENCES branches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- หมวดหมู่เมนู เช่น ของทานเล่น จานเดียว เครื่องดื่ม (ใช้ร่วมกันทุกสาขา)
CREATE TABLE categories (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(60) NOT NULL,
  sort_order SMALLINT    NOT NULL DEFAULT 0,
  is_active  TINYINT(1)  NOT NULL DEFAULT 1,
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- รายการอาหารในเมนู (Master Catalog ของแบรนด์)
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- การตั้งราคาพิเศษและการเปิด/ปิดขายเมนูเฉพาะสาขา
CREATE TABLE branch_menu_availability (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  branch_id    INT            NOT NULL,
  menu_item_id INT            NOT NULL,
  custom_price DECIMAL(10,2)  NULL,
  is_available TINYINT(1)     NOT NULL DEFAULT 1,
  stock_qty    INT            NULL,
  updated_at   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_branch_menu (branch_id, menu_item_id),
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- รอบการนั่งของโต๊ะ 1 รอบ = ลูกค้า 1 กลุ่ม
CREATE TABLE table_sessions (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  branch_id     INT      NOT NULL DEFAULT 1,
  table_id      INT      NOT NULL,
  status        ENUM('OPEN','CLOSED') NOT NULL DEFAULT 'OPEN',
  opened_by     INT      NULL,
  opened_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at     DATETIME NULL,
  closed_by     INT      NULL,
  -- ยอดบิลที่แช่แข็งไว้ตอนปิดบิล ไม่คำนวณใหม่ตอนเปิดดูย้อนหลัง
  subtotal_amount       DECIMAL(10,2) NOT NULL DEFAULT 0,
  discount_type         ENUM('NONE','AMOUNT','PERCENT') NOT NULL DEFAULT 'NONE',
  discount_value        DECIMAL(10,2) NOT NULL DEFAULT 0,
  discount_amount       DECIMAL(10,2) NOT NULL DEFAULT 0,
  discount_reason       VARCHAR(255)  NULL,
  discount_by           INT           NULL,
  service_charge_rate   DECIMAL(5,2)  NOT NULL DEFAULT 0,
  service_charge_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  vat_rate              DECIMAL(5,2)  NOT NULL DEFAULT 0,
  vat_inclusive         TINYINT(1)    NOT NULL DEFAULT 1,
  vat_amount            DECIMAL(10,2) NOT NULL DEFAULT 0,
  grand_total           DECIMAL(10,2) NOT NULL DEFAULT 0,
  -- การคืนเงินทั้งบิล บิลเดิมยังอยู่ครบ แต่ถูกทำเครื่องหมายว่าเป็นโมฆะแล้ว
  refunded_at   DATETIME      NULL,
  refunded_by   INT           NULL,
  refund_reason VARCHAR(255)  NULL,
  refund_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  open_table_id INT GENERATED ALWAYS AS (IF(status = 'OPEN', table_id, NULL)) STORED,
  UNIQUE KEY uq_open_table (open_table_id),
  FOREIGN KEY (branch_id)  REFERENCES branches(id),
  FOREIGN KEY (table_id)   REFERENCES dining_tables(id),
  FOREIGN KEY (opened_by)  REFERENCES users(id),
  FOREIGN KEY (closed_by)  REFERENCES users(id),
  FOREIGN KEY (discount_by) REFERENCES users(id),
  FOREIGN KEY (refunded_by) REFERENCES users(id),
  INDEX idx_sessions_branch_status (branch_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ลำดับเลขออเดอร์ต่อวันทำการ แยกรายสาขา
CREATE TABLE order_counters (
  branch_id     INT  NOT NULL DEFAULT 1,
  business_date DATE NOT NULL,
  last_seq      INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (branch_id, business_date),
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ออเดอร์ 1 ครั้งที่ลูกค้ากดยืนยันสั่ง
CREATE TABLE orders (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  branch_id    INT           NOT NULL DEFAULT 1,
  session_id   INT           NOT NULL,
  order_type   ENUM('DINE_IN','TAKEAWAY') NOT NULL DEFAULT 'DINE_IN',
  order_code   VARCHAR(12)   NOT NULL UNIQUE,
  status       ENUM('PENDING','PREPARING','SERVED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id)  REFERENCES branches(id),
  FOREIGN KEY (session_id) REFERENCES table_sessions(id),
  INDEX idx_orders_branch_status_created (branch_id, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- รายการอาหารในออเดอร์
CREATE TABLE order_items (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  order_id     INT           NOT NULL,
  menu_item_id INT           NOT NULL,
  item_name    VARCHAR(120)  NOT NULL,
  unit_price   DECIMAL(10,2) NOT NULL,
  -- ต้นทุนต่อจาน ณ ตอนสั่ง คิดจากสูตร (menu_recipes) NULL คือเมนูที่ยังไม่ได้ใส่สูตร
  unit_cost    DECIMAL(10,2) NULL,
  quantity     SMALLINT      NOT NULL,
  note         VARCHAR(255)  NULL,
  -- ข้อความสรุปตัวเลือกที่ลูกค้าเลือก เช่น "เผ็ดน้อย, ไข่ดาว (+10)"
  options_text VARCHAR(255)  NULL,
  status       ENUM('PENDING','PREPARING','SERVED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  FOREIGN KEY (order_id)     REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- บันทึกการเปลี่ยนสถานะออเดอร์ ใช้ตรวจว่าใครรับออเดอร์และใครกดเสิร์ฟ
CREATE TABLE order_status_logs (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  branch_id   INT NOT NULL DEFAULT 1,
  order_id    INT NOT NULL,
  order_code  VARCHAR(12) NOT NULL,
  table_no    VARCHAR(10) NOT NULL,
  from_status ENUM('PENDING','PREPARING','SERVED','CANCELLED') NULL,
  to_status   ENUM('PENDING','PREPARING','SERVED','CANCELLED') NOT NULL,
  changed_by  INT NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_order_logs_branch_created (branch_id, created_at),
  INDEX idx_order_logs_user (changed_by),
  FOREIGN KEY (order_id)   REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- การชำระเงินเมื่อปิดบิล
CREATE TABLE payments (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  branch_id    INT           NOT NULL DEFAULT 1,
  -- หนึ่งบิลมีได้หลายแถว เพราะลูกค้าจ่ายผสมหลายช่องทางในบิลเดียวได้
  session_id      INT           NOT NULL,
  method          ENUM('CASH','TRANSFER','CARD') NOT NULL,
  total_amount    DECIMAL(10,2) NOT NULL,
  received_amount DECIMAL(10,2) NULL,
  change_amount   DECIMAL(10,2) NOT NULL DEFAULT 0,
  -- คำขอรับเงินโอนที่ยืนยันแล้ว (payment_requests) หนึ่งคำขอใช้ปิดบิลได้ครั้งเดียว
  payment_request_id INT        NULL,
  received_by     INT           NOT NULL,
  paid_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id)   REFERENCES branches(id),
  FOREIGN KEY (session_id)  REFERENCES table_sessions(id),
  FOREIGN KEY (received_by) REFERENCES users(id),
  UNIQUE KEY uq_payments_request (payment_request_id),
  INDEX idx_payments_session (session_id),
  INDEX idx_payments_branch_paid (branch_id, paid_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- เรื่องแจ้งปัญหา
CREATE TABLE tickets (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  branch_id    INT         NOT NULL DEFAULT 1,
  ticket_code  VARCHAR(13) NOT NULL UNIQUE,
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
  FOREIGN KEY (branch_id)   REFERENCES branches(id),
  FOREIGN KEY (table_id)    REFERENCES dining_tables(id),
  FOREIGN KEY (created_by)  REFERENCES users(id),
  FOREIGN KEY (assigned_to) REFERENCES users(id),
  INDEX idx_tickets_branch_status (branch_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ข้อความตอบกลับในแต่ละ ticket
CREATE TABLE ticket_replies (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id  INT      NOT NULL,
  user_id    INT      NULL,
  message    TEXT     NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)   REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ประวัติการยกเลิกรายการอาหารหรือออเดอร์ เพื่อป้องกันการทุจริต
CREATE TABLE cancellation_audit_logs (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  branch_id    INT NOT NULL DEFAULT 1,
  entity_type  ENUM('ORDER_ITEM', 'ORDER', 'SESSION') NOT NULL,
  entity_id    INT NOT NULL,
  order_code   VARCHAR(12) NULL,
  table_no     VARCHAR(10) NOT NULL,
  item_name    VARCHAR(120) NULL,
  quantity     SMALLINT NULL,
  amount       DECIMAL(10,2) NOT NULL,
  reason       VARCHAR(255) NOT NULL,
  cancelled_by INT NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_created (created_at),
  INDEX idx_audit_branch_created (branch_id, created_at),
  INDEX idx_audit_table (table_no),
  INDEX idx_audit_user (cancelled_by),
  FOREIGN KEY (branch_id) REFERENCES branches(id),
  FOREIGN KEY (cancelled_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ผลปิดยอดประจำวัน (Z-Report) ที่ถูกแช่แข็งไว้แล้ว หนึ่งแถวต่อหนึ่งวันทำการของสาขา
CREATE TABLE settlements (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  branch_id       INT           NOT NULL,
  business_date   DATE          NOT NULL,
  z_number        INT           NOT NULL,
  cutoff_hour     TINYINT       NOT NULL,
  period_start    DATETIME      NOT NULL,
  period_end      DATETIME      NOT NULL,
  total_revenue   DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_bills     INT           NOT NULL DEFAULT 0,
  cash_total      DECIMAL(12,2) NOT NULL DEFAULT 0,
  transfer_total  DECIMAL(12,2) NOT NULL DEFAULT 0,
  card_total      DECIMAL(12,2) NOT NULL DEFAULT 0,
  void_count      INT           NOT NULL DEFAULT 0,
  void_amount     DECIMAL(12,2) NOT NULL DEFAULT 0,
  counted_cash    DECIMAL(12,2) NULL,
  cash_difference DECIMAL(12,2) NULL,
  note            VARCHAR(255)  NULL,
  report_json     LONGTEXT      NOT NULL,
  closed_by       INT           NOT NULL,
  closed_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_settlement_branch_date (branch_id, business_date),
  UNIQUE KEY uq_settlement_branch_z (branch_id, z_number),
  INDEX idx_settlement_closed_by (closed_by),
  FOREIGN KEY (branch_id) REFERENCES branches(id),
  FOREIGN KEY (closed_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ประวัติการตัดและเติมสต๊อกเมนูรายสาขา ใช้ตรวจว่าของหายไปกับออเดอร์ไหน
CREATE TABLE menu_stock_logs (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  branch_id     INT NOT NULL,
  menu_item_id  INT NOT NULL,
  change_type   ENUM('SET','DEDUCT','RESTOCK','RESTORE') NOT NULL,
  quantity      INT NOT NULL,
  stock_before  INT NULL,
  stock_after   INT NULL,
  order_id      INT NULL,
  changed_by    INT NULL,
  note          VARCHAR(255) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_stock_logs_branch_created (branch_id, created_at),
  INDEX idx_stock_logs_menu (menu_item_id),
  FOREIGN KEY (branch_id)    REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by)   REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE menu_option_groups (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  menu_item_id INT          NOT NULL,
  name         VARCHAR(60)  NOT NULL,
  min_select   TINYINT      NOT NULL DEFAULT 0,
  max_select   TINYINT      NOT NULL DEFAULT 1,
  sort_order   SMALLINT     NOT NULL DEFAULT 0,
  is_active    TINYINT(1)   NOT NULL DEFAULT 1,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_option_groups_menu (menu_item_id, sort_order),
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE menu_options (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  group_id    INT           NOT NULL,
  name        VARCHAR(60)   NOT NULL,
  price_delta DECIMAL(10,2) NOT NULL DEFAULT 0,
  sort_order  SMALLINT      NOT NULL DEFAULT 0,
  is_active   TINYINT(1)    NOT NULL DEFAULT 1,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_options_group (group_id, sort_order),
  FOREIGN KEY (group_id) REFERENCES menu_option_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- สำเนาตัวเลือกที่ลูกค้าเลือก ณ ตอนสั่ง ใช้ทำรายงานว่าตัวเลือกไหนขายดี
-- option_id เป็น SET NULL เมื่อตัวเลือกถูกลบ แต่ชื่อและราคาที่คัดลอกไว้ยังอยู่ครบ
CREATE TABLE order_item_options (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  order_item_id INT           NOT NULL,
  option_id     INT           NULL,
  group_name    VARCHAR(60)   NOT NULL,
  option_name   VARCHAR(60)   NOT NULL,
  price_delta   DECIMAL(10,2) NOT NULL DEFAULT 0,
  INDEX idx_item_options_item (order_item_id),
  INDEX idx_item_options_option (option_id),
  FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
  FOREIGN KEY (option_id)     REFERENCES menu_options(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ingredients (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  name                VARCHAR(100)   NOT NULL,
  unit                VARCHAR(20)    NOT NULL,
  cost_per_unit       DECIMAL(12,4)  NOT NULL DEFAULT 0,
  low_stock_threshold DECIMAL(12,3)  NULL,
  is_active           TINYINT(1)     NOT NULL DEFAULT 1,
  created_at          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ingredient_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE branch_ingredient_stock (
  branch_id     INT            NOT NULL,
  ingredient_id INT            NOT NULL,
  quantity      DECIMAL(12,3)  NOT NULL DEFAULT 0,
  updated_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (branch_id, ingredient_id),
  FOREIGN KEY (branch_id)     REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE menu_recipes (
  menu_item_id  INT            NOT NULL,
  ingredient_id INT            NOT NULL,
  quantity      DECIMAL(12,3)  NOT NULL,
  PRIMARY KEY (menu_item_id, ingredient_id),
  INDEX idx_recipes_ingredient (ingredient_id),
  FOREIGN KEY (menu_item_id)  REFERENCES menu_items(id) ON DELETE CASCADE,
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ingredient_stock_logs (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  branch_id     INT            NOT NULL,
  ingredient_id INT            NOT NULL,
  change_type   ENUM('RECEIVE','ADJUST','WASTE','DEDUCT','RESTORE') NOT NULL,
  quantity      DECIMAL(12,3)  NOT NULL,
  qty_before    DECIMAL(12,3)  NOT NULL,
  qty_after     DECIMAL(12,3)  NOT NULL,
  unit_cost     DECIMAL(12,4)  NULL,
  order_id      INT            NULL,
  order_item_id INT            NULL,
  changed_by    INT            NULL,
  note          VARCHAR(255)   NULL,
  created_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ing_logs_branch_created (branch_id, created_at),
  INDEX idx_ing_logs_ingredient (ingredient_id, created_at),
  INDEX idx_ing_logs_order_item (order_item_id),
  FOREIGN KEY (branch_id)     REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by)    REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payment_requests (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  branch_id    INT           NOT NULL,
  session_id   INT           NOT NULL,
  provider     VARCHAR(20)   NOT NULL,
  provider_ref VARCHAR(64)   NOT NULL,
  amount       DECIMAL(10,2) NOT NULL,
  qr_payload   VARCHAR(512)  NOT NULL,
  status       ENUM('PENDING','PAID','EXPIRED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  expires_at   DATETIME      NOT NULL,
  paid_at      DATETIME      NULL,
  confirmed_by INT           NULL,
  created_by   INT           NOT NULL,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payment_provider_ref (provider, provider_ref),
  INDEX idx_payment_requests_session (session_id, status),
  FOREIGN KEY (branch_id)    REFERENCES branches(id),
  FOREIGN KEY (session_id)   REFERENCES table_sessions(id),
  FOREIGN KEY (confirmed_by) REFERENCES users(id),
  FOREIGN KEY (created_by)   REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- migration ที่รวมอยู่ใน schema นี้แล้ว scripts/migrate.js จะไม่รันไฟล์เหล่านี้ซ้ำกับฐานข้อมูลที่สร้างจากไฟล์นี้
-- เพิ่ม migration ใหม่เมื่อไร ต้องรวมผลของมันเข้า schema นี้ และเพิ่มชื่อไฟล์ลงรายการด้านล่างด้วย
CREATE TABLE schema_migrations (
  filename   VARCHAR(255) NOT NULL PRIMARY KEY,
  mode       ENUM('RUN','BASELINE') NOT NULL DEFAULT 'RUN',
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (filename, mode) VALUES
  ('001_phase1_concurrency_and_counters.sql', 'BASELINE'),
  ('002_indexes.sql', 'BASELINE'),
  ('003_cancellation_audit_logs.sql', 'BASELINE'),
  ('004_branches.sql', 'BASELINE'),
  ('005_order_type.sql', 'BASELINE'),
  ('006_order_status_logs.sql', 'BASELINE'),
  ('007_settlements.sql', 'BASELINE'),
  ('008_money_layer.sql', 'BASELINE'),
  ('009_menu_stock.sql', 'BASELINE'),
  ('010_bill_refund.sql', 'BASELINE'),
  ('011_menu_options.sql', 'BASELINE'),
  ('012_ingredients.sql', 'BASELINE'),
  ('013_payment_requests.sql', 'BASELINE');
