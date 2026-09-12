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
DROP TABLE IF EXISTS ticket_replies;
DROP TABLE IF EXISTS tickets;
DROP TABLE IF EXISTS cancellation_audit_logs;
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
  is_active                TINYINT(1)   NOT NULL DEFAULT 1,
  created_at               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- สาขาเริ่มต้น
INSERT INTO branches (id, code, name, address, phone, business_day_cutoff_hour, is_active)
VALUES (1, 'HQ-SIAM', 'สาขาสยาม (สำนักงานใหญ่)', 'สยามสแควร์ กรุงเทพมหานคร', '02-123-4567', 4, 1);

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
  open_table_id INT GENERATED ALWAYS AS (IF(status = 'OPEN', table_id, NULL)) STORED,
  UNIQUE KEY uq_open_table (open_table_id),
  FOREIGN KEY (branch_id)  REFERENCES branches(id),
  FOREIGN KEY (table_id)   REFERENCES dining_tables(id),
  FOREIGN KEY (opened_by)  REFERENCES users(id),
  FOREIGN KEY (closed_by)  REFERENCES users(id),
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
  quantity     SMALLINT      NOT NULL,
  note         VARCHAR(255)  NULL,
  status       ENUM('PENDING','PREPARING','SERVED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  FOREIGN KEY (order_id)     REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- การชำระเงินเมื่อปิดบิล
CREATE TABLE payments (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  branch_id    INT           NOT NULL DEFAULT 1,
  session_id   INT           NOT NULL UNIQUE,
  method       ENUM('CASH','TRANSFER','CARD') NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  received_by  INT           NOT NULL,
  paid_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id)   REFERENCES branches(id),
  FOREIGN KEY (session_id)  REFERENCES table_sessions(id),
  FOREIGN KEY (received_by) REFERENCES users(id),
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
