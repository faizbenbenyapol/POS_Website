-- =============================================================
-- schema.sql — DDL ทุกตารางของระบบ POS สั่งอาหารด้วย QR Code
-- ใช้กับ MySQL 8 ขึ้นไป ทุกตารางเป็น utf8mb4_unicode_ci
-- วิธีรัน: mysql -u root -p < db/schema.sql
-- =============================================================

CREATE DATABASE IF NOT EXISTS pos_qr
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE pos_qr;

-- ลบตารางเดิมก่อน เรียงจากตารางลูกไปตารางแม่ เพื่อไม่ให้ติด foreign key
DROP TABLE IF EXISTS ticket_replies;
DROP TABLE IF EXISTS order_counters;
DROP TABLE IF EXISTS tickets;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS table_sessions;
DROP TABLE IF EXISTS menu_items;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS dining_tables;
DROP TABLE IF EXISTS users;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- โต๊ะในร้าน แต่ละโต๊ะมี token สำหรับสร้าง QR (ลิงก์ /t/{token})
CREATE TABLE dining_tables (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  table_no   VARCHAR(10)  NOT NULL UNIQUE,
  seats      TINYINT      NOT NULL DEFAULT 4,
  qr_token   CHAR(32)     NOT NULL UNIQUE,
  is_active  TINYINT(1)   NOT NULL DEFAULT 1,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- หมวดหมู่เมนู เช่น ของทานเล่น จานเดียว เครื่องดื่ม
CREATE TABLE categories (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(60) NOT NULL,
  sort_order SMALLINT    NOT NULL DEFAULT 0,
  is_active  TINYINT(1)  NOT NULL DEFAULT 1,
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- รอบการนั่งของโต๊ะ 1 รอบ = ลูกค้า 1 กลุ่ม (สั่งได้หลายออเดอร์ ปิดบิลครั้งเดียว)
-- open_table_id เป็น generated column กัน race condition: 1 โต๊ะเปิดได้แค่ 1 session
CREATE TABLE table_sessions (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  table_id      INT      NOT NULL,
  status        ENUM('OPEN','CLOSED') NOT NULL DEFAULT 'OPEN',
  opened_by     INT      NULL,
  opened_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at     DATETIME NULL,
  closed_by     INT      NULL,
  open_table_id INT GENERATED ALWAYS AS (IF(status = 'OPEN', table_id, NULL)) STORED,
  UNIQUE KEY uq_open_table (open_table_id),
  FOREIGN KEY (table_id)   REFERENCES dining_tables(id),
  FOREIGN KEY (opened_by)  REFERENCES users(id),
  FOREIGN KEY (closed_by)  REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ออเดอร์ 1 ครั้งที่ลูกค้ากดยืนยันสั่ง
CREATE TABLE orders (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  session_id   INT           NOT NULL,
  order_code   VARCHAR(12)   NOT NULL UNIQUE,
  status       ENUM('PENDING','PREPARING','SERVED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES table_sessions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ลำดับเลขออเดอร์ต่อวันทำการ ใช้ INSERT ... ON DUPLICATE KEY UPDATE แบบ atomic
CREATE TABLE order_counters (
  business_date DATE NOT NULL PRIMARY KEY,
  last_seq      INT  NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- เรื่องแจ้งปัญหา เปิดได้ทั้งจากลูกค้า (ผูกโต๊ะ) และพนักงาน (ผูก user)
CREATE TABLE tickets (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  -- ยาว 13 ตัวเพราะรหัสรูปแบบ TK-YYMMDD-XXX ที่หัวข้อ 12 กำหนดไว้ยาว 13 ตัวพอดี
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
  FOREIGN KEY (table_id)    REFERENCES dining_tables(id),
  FOREIGN KEY (created_by)  REFERENCES users(id),
  FOREIGN KEY (assigned_to) REFERENCES users(id)
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
