-- =============================================================
-- Migration 011: Menu Options — ตัวเลือกอาหาร (เผ็ดน้อย / พิเศษ / ท็อปปิ้ง)
-- เดิมลูกค้าพิมพ์ทุกอย่างลงช่องหมายเหตุ ครัวต้องอ่านข้อความอิสระเอง
-- และ "พิเศษ +10 บาท" คิดเงินไม่ได้เลยเพราะหมายเหตุไม่มีราคา
--
-- ตัวเลือกผูกกับเมนูรายจาน (ไม่ใช้ร่วมข้ามเมนู) แบ่งเป็นกลุ่ม เช่น "ระดับความเผ็ด" "ท็อปปิ้ง"
-- min_select = 0 คือไม่บังคับ, min_select >= 1 คือบังคับเลือก
-- max_select = 1 คือเลือกได้อย่างเดียว (แสดงเป็นปุ่มวิทยุ) มากกว่า 1 คือเลือกได้หลายอย่าง
--
-- ราคาที่ลูกค้าจ่ายต่อจาน = ราคาเมนู + ผลรวม price_delta ของตัวเลือกที่เลือก
-- คัดลอกชื่อและราคาของตัวเลือกลง order_item_options ตอนสั่ง เพื่อไม่ให้บิลเก่าเปลี่ยนตามที่แก้ทีหลัง
-- Run: node scripts/migrate.js
-- =============================================================

USE pos_qr;

CREATE TABLE IF NOT EXISTS menu_option_groups (
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

CREATE TABLE IF NOT EXISTS menu_options (
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

-- ข้อความสรุปตัวเลือกที่ลูกค้าเลือก เก็บไว้ในแถวรายการอาหารเลย
-- กระดานครัว ใบเสร็จ และหน้าสถานะของลูกค้าอ่านคอลัมน์เดียวนี้ ไม่ต้อง JOIN ทุกครั้ง
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS options_text VARCHAR(255) NULL AFTER note;

-- สำเนาตัวเลือกที่ลูกค้าเลือก ณ ตอนสั่ง ใช้ทำรายงานว่าตัวเลือกไหนขายดี
-- option_id เป็น SET NULL เมื่อตัวเลือกถูกลบ แต่ชื่อและราคาที่คัดลอกไว้ยังอยู่ครบ
CREATE TABLE IF NOT EXISTS order_item_options (
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
