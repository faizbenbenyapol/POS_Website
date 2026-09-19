-- =============================================================
-- seed.sql — ข้อมูลตั้งต้นสำหรับทดสอบระบบ
-- ต้องรัน db/schema.sql ก่อนเสมอ
-- วิธีรัน: mysql -u root -p < db/seed.sql
--
-- รหัสผ่านผู้ใช้ตั้งต้น (เก็บใน DB เป็น bcrypt hash เท่านั้น):
--   admin   / admin1234
--   staff01 / staff1234
--   cashier01 / kitchen01 / bar01 ใช้รหัส staff1234 เหมือนกัน (บทบาทแคชเชียร์ ครัว บาร์ ของสาขาสยาม)
-- =============================================================

-- บังคับ character set ของ connection เป็น utf8mb4 ก่อนนำเข้าข้อมูล
-- ป้องกันปัญหาข้อความไทยเพี้ยน (mojibake) เวลา docker entrypoint รันไฟล์นี้
-- ด้วย client charset เริ่มต้นที่ไม่ตรงกับไฟล์ (ซึ่งเป็น UTF-8)
SET NAMES utf8mb4;
USE pos_qr;

-- ล้างข้อมูลเดิมก่อน เรียงจากตารางลูกไปตารางแม่
DELETE FROM payment_requests;
DELETE FROM ingredient_stock_logs;
DELETE FROM branch_ingredient_stock;
DELETE FROM menu_recipes;
DELETE FROM ingredients;
DELETE FROM menu_option_groups;
DELETE FROM ticket_replies;
DELETE FROM tickets;
DELETE FROM payments;
DELETE FROM cancellation_audit_logs;
DELETE FROM order_items;
DELETE FROM orders;
DELETE FROM order_counters;
DELETE FROM table_sessions;
DELETE FROM branch_menu_availability;
DELETE FROM menu_items;
DELETE FROM categories;
DELETE FROM dining_tables;
DELETE FROM users;
DELETE FROM branches;

-- ข้อมูลสาขา (เริ่มต้น 2 สาขา)
-- พร้อมเพย์เป็นบัญชีตัวอย่าง ต้องเปลี่ยนเป็นบัญชีจริงของร้านที่หน้า "จัดการสาขา" ก่อนใช้งานจริง
INSERT INTO branches (id, code, name, address, phone, business_day_cutoff_hour, promptpay_id, promptpay_name, is_active) VALUES
  (1, 'HQ-SIAM', 'สาขาสยาม (สำนักงานใหญ่)', '999/9 ถ.พระราม 1 ปทุมวัน กทม.', '02-123-4567', 4, '0812345678', 'สาขาสยาม (บัญชีตัวอย่าง)', 1),
  (2, 'BKK-ARI', 'สาขาอารีย์', '12 ซอยอารีย์ พญาไท กทม.', '02-987-6543', 4, '0812345678', 'สาขาอารีย์ (บัญชีตัวอย่าง)', 1);

-- ผู้ใช้ระบบฝั่งร้าน (admin เป็น HQ เข้าถึงทุกสาขา, staff01 ประจำสยาม, staff02 ประจำอารีย์)
INSERT INTO users (username, password_hash, full_name, role, branch_id) VALUES
  ('admin',   '$2b$10$1b.K/eL6x6APFfWwlLQZIukpxCbUuqBd2ZUMxpD/4c2NWKnX6l6xu', 'เจ้าของร้าน (HQ)', 'ADMIN', NULL),
  ('staff01', '$2b$10$RDSKDcaZcyDGZKsd0u8mAu4IGBJkcJTmSa1KaCIsdhTA7Nkc2MrrC', 'พนักงานสาขาสยาม', 'STAFF', 1),
  ('staff02', '$2b$10$RDSKDcaZcyDGZKsd0u8mAu4IGBJkcJTmSa1KaCIsdhTA7Nkc2MrrC', 'พนักงานสาขาอารีย์', 'STAFF', 2),
  ('cashier01', '$2b$10$RDSKDcaZcyDGZKsd0u8mAu4IGBJkcJTmSa1KaCIsdhTA7Nkc2MrrC', 'แคชเชียร์สาขาสยาม', 'CASHIER', 1),
  ('kitchen01', '$2b$10$RDSKDcaZcyDGZKsd0u8mAu4IGBJkcJTmSa1KaCIsdhTA7Nkc2MrrC', 'ครัวสาขาสยาม', 'KITCHEN', 1),
  ('bar01', '$2b$10$RDSKDcaZcyDGZKsd0u8mAu4IGBJkcJTmSa1KaCIsdhTA7Nkc2MrrC', 'บาร์สาขาสยาม', 'BAR', 1);

-- โต๊ะประจำแต่ละสาขา พร้อม qr_token ประจำโต๊ะ
-- สาขาที่ 1 (HQ-SIAM): 8 โต๊ะ
INSERT INTO dining_tables (branch_id, table_no, seats, qr_token) VALUES
  (1, 'A1', 2, '508146d7b4653bd6a4ee151228802674'),
  (1, 'A2', 2, '8bda159b2ae11cb68821f3591317e70d'),
  (1, 'A3', 4, '05a6bee89e9205198538f2da28a9db7f'),
  (1, 'A4', 4, '13efc3c9da15866cc171405b7fb9a842'),
  (1, 'B1', 4, 'b5c30e2cbd8d447745fe3b4ebd5b6a68'),
  (1, 'B2', 6, 'b4c834f5661d4eeb92592d8ef57dd9c7'),
  (1, 'B3', 6, 'b493bfb211b76f824da701797341590a'),
  (1, 'B4', 8, 'fd3c3d77c829611fd31c4d2c9a472809');

-- สาขาที่ 2 (BKK-ARI): 4 โต๊ะ
INSERT INTO dining_tables (branch_id, table_no, seats, qr_token) VALUES
  (2, 'A1', 2, 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1'),
  (2, 'A2', 2, 'a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2'),
  (2, 'B1', 4, 'b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1'),
  (2, 'B2', 6, 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2');

-- หมวดหมู่เมนู เรียงตามลำดับที่อยากให้ลูกค้าเห็นบนแถบหมวดหมู่
INSERT INTO categories (name, sort_order) VALUES
  ('ของทานเล่น', 1),
  ('จานเดียว',   2),
  ('กับข้าว',    3),
  ('เครื่องดื่ม', 4);

-- เมนู 20 รายการ ใช้ชื่อและราคาแบบร้านอาหารตามสั่งจริง
-- รูปภาพ 11 รายการใช้ลิงก์จาก Unsplash (ตรวจแล้วว่าเปิดได้จริงก่อนใส่) ที่เหลือปล่อย NULL
-- ไว้โชว์ว่าเมนูที่ยังไม่มีรูปจะขึ้นเป็นไอคอนตัวอักษรแทนบนหน้าจอ ไม่ใช่รูปหักหรือจอว่าง
INSERT INTO menu_items (category_id, name, description, price, image_url) VALUES
  ((SELECT id FROM categories WHERE name='ของทานเล่น'), 'ปีกไก่ทอดน้ำปลา',      'ปีกไก่กลางทอดกรอบ โรยกระเทียมเจียว',        129.00, 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=480&h=360&fit=crop&q=70&auto=format'),
  ((SELECT id FROM categories WHERE name='ของทานเล่น'), 'หมูสะเต๊ะ 6 ไม้',       'เสิร์ฟพร้อมน้ำจิ้มถั่วและอาจาด',             99.00, 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=480&h=360&fit=crop&q=70&auto=format'),
  ((SELECT id FROM categories WHERE name='ของทานเล่น'), 'เฟรนช์ฟรายส์',          'ทอดกรอบ โรยผงปาปริก้า',                     69.00, 'https://images.unsplash.com/photo-1622597467836-f3285f2131b8?w=480&h=360&fit=crop&q=70&auto=format'),
  ((SELECT id FROM categories WHERE name='ของทานเล่น'), 'ยำวุ้นเส้นทะเล',        'กุ้งสด ปลาหมึก รสจัดจ้าน',                  149.00, 'https://images.unsplash.com/photo-1553163147-622ab57be1c7?w=480&h=360&fit=crop&q=70&auto=format'),
  ((SELECT id FROM categories WHERE name='จานเดียว'),   'กะเพราหมูสับไข่ดาว',    'เผ็ดกลาง ไข่ดาวไข่แดงเยิ้ม',                 65.00, NULL),
  ((SELECT id FROM categories WHERE name='จานเดียว'),   'ข้าวผัดกุ้ง',           'กุ้งสด 5 ตัว หอมกระทะ',                      85.00, 'https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?w=480&h=360&fit=crop&q=70&auto=format'),
  ((SELECT id FROM categories WHERE name='จานเดียว'),   'ผัดซีอิ๊วหมู',          'เส้นใหญ่ผัดไฟแรง',                           65.00, 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=480&h=360&fit=crop&q=70&auto=format'),
  ((SELECT id FROM categories WHERE name='จานเดียว'),   'ผัดไทยกุ้งสด',          'เส้นจันท์ ใส่ไข่ เสิร์ฟพร้อมถั่วงอก',        90.00, NULL),
  ((SELECT id FROM categories WHERE name='จานเดียว'),   'ข้าวหมูกรอบราดซอส',     'หมูสามชั้นทอดกรอบ',                          75.00, NULL),
  ((SELECT id FROM categories WHERE name='จานเดียว'),   'ข้าวไข่เจียวหมูสับ',    'ไข่เจียวฟูใส่หมูสับ',                        60.00, NULL),
  ((SELECT id FROM categories WHERE name='กับข้าว'),    'ต้มยำกุ้งน้ำข้น',       'กุ้งแม่น้ำ เห็ดฟาง รสเปรี้ยวนำ',            180.00, 'https://images.unsplash.com/photo-1541518763669-27fef04b14ea?w=480&h=360&fit=crop&q=70&auto=format'),
  ((SELECT id FROM categories WHERE name='กับข้าว'),    'แกงเขียวหวานไก่',       'กะทิสด เสิร์ฟพร้อมโรตีหรือข้าวสวย',         120.00, 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=480&h=360&fit=crop&q=70&auto=format'),
  ((SELECT id FROM categories WHERE name='กับข้าว'),    'ผัดผักบุ้งไฟแดง',       'ผักบุ้งกรอบ ผัดเต้าเจี้ยว',                  80.00, NULL),
  ((SELECT id FROM categories WHERE name='กับข้าว'),    'ปลาทับทิมนึ่งมะนาว',    'ปลาสด ๆ ทั้งตัว น้ำจิ้มซีฟู้ด',             320.00, NULL),
  ((SELECT id FROM categories WHERE name='กับข้าว'),    'ไข่พะโล้หมูสามชั้น',    'ตุ๋นนาน หมูเปื่อย',                         110.00, 'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=480&h=360&fit=crop&q=70&auto=format'),
  ((SELECT id FROM categories WHERE name='กับข้าว'),    'ข้าวสวย',               'ข้าวหอมมะลิ 1 ถ้วย',                         15.00, NULL),
  ((SELECT id FROM categories WHERE name='เครื่องดื่ม'), 'ชาไทยเย็น',            'ชาไทยแท้ นมข้นหวาน',                          45.00, 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=480&h=360&fit=crop&q=70&auto=format'),
  ((SELECT id FROM categories WHERE name='เครื่องดื่ม'), 'น้ำมะนาวโซดา',         'สดชื่น ไม่หวานมาก',                           50.00, 'https://images.unsplash.com/photo-1580217593608-61931cefc821?w=480&h=360&fit=crop&q=70&auto=format'),
  ((SELECT id FROM categories WHERE name='เครื่องดื่ม'), 'น้ำเปล่า',             'ขวด 600 มล.',                                 15.00, NULL),
  ((SELECT id FROM categories WHERE name='เครื่องดื่ม'), 'โซดา',                 'ขวดแก้ว',                                     25.00, NULL);

-- ข้อมูลตั้งค่าราคาและสถานะสินค้าเฉพาะสาขา (Demo Branch Overrides)
-- ตัวอย่าง: สาขาที่ 2 (อารีย์) ขายกะเพราหมูสับไข่ดาวราคาพิเศษ 75 บาท (ราคาปกติ 65) และหมูสะเต๊ะของหมดชั่วคราว
INSERT INTO branch_menu_availability (branch_id, menu_item_id, custom_price, is_available) VALUES
  (2, (SELECT id FROM menu_items WHERE name='กะเพราหมูสับไข่ดาว' LIMIT 1), 75.00, 1),
  (2, (SELECT id FROM menu_items WHERE name='หมูสะเต๊ะ 6 ไม้' LIMIT 1), NULL, 0);

-- ตัวเลือกอาหารตัวอย่าง (migration 011)
-- กะเพรา: บังคับเลือกระดับความเผ็ด 1 อย่าง และเลือกท็อปปิ้งเพิ่มได้สูงสุด 2 อย่าง
INSERT INTO menu_option_groups (menu_item_id, name, min_select, max_select, sort_order) VALUES
  ((SELECT id FROM menu_items WHERE name='กะเพราหมูสับไข่ดาว' LIMIT 1), 'ระดับความเผ็ด', 1, 1, 1),
  ((SELECT id FROM menu_items WHERE name='กะเพราหมูสับไข่ดาว' LIMIT 1), 'เพิ่มท็อปปิ้ง', 0, 2, 2),
  ((SELECT id FROM menu_items WHERE name='ข้าวผัดกุ้ง' LIMIT 1), 'ขนาด', 1, 1, 1),
  ((SELECT id FROM menu_items WHERE name='ชาไทยเย็น' LIMIT 1), 'ความหวาน', 1, 1, 1);

INSERT INTO menu_options (group_id, name, price_delta, sort_order)
SELECT g.id, o.name, o.price_delta, o.sort_order
  FROM menu_option_groups g
  JOIN menu_items m ON m.id = g.menu_item_id
  JOIN (
    SELECT 'กะเพราหมูสับไข่ดาว' AS menu, 'ระดับความเผ็ด' AS grp, 'ไม่เผ็ด' AS name, 0 AS price_delta, 1 AS sort_order
    UNION ALL SELECT 'กะเพราหมูสับไข่ดาว', 'ระดับความเผ็ด', 'เผ็ดน้อย', 0, 2
    UNION ALL SELECT 'กะเพราหมูสับไข่ดาว', 'ระดับความเผ็ด', 'เผ็ดกลาง', 0, 3
    UNION ALL SELECT 'กะเพราหมูสับไข่ดาว', 'ระดับความเผ็ด', 'เผ็ดมาก', 0, 4
    UNION ALL SELECT 'กะเพราหมูสับไข่ดาว', 'เพิ่มท็อปปิ้ง', 'ไข่ดาวเพิ่ม', 10, 1
    UNION ALL SELECT 'กะเพราหมูสับไข่ดาว', 'เพิ่มท็อปปิ้ง', 'ไข่เจียว', 15, 2
    UNION ALL SELECT 'กะเพราหมูสับไข่ดาว', 'เพิ่มท็อปปิ้ง', 'หมูสับพิเศษ', 20, 3
    UNION ALL SELECT 'ข้าวผัดกุ้ง', 'ขนาด', 'ธรรมดา', 0, 1
    UNION ALL SELECT 'ข้าวผัดกุ้ง', 'ขนาด', 'พิเศษ', 20, 2
    UNION ALL SELECT 'ชาไทยเย็น', 'ความหวาน', 'หวานปกติ', 0, 1
    UNION ALL SELECT 'ชาไทยเย็น', 'ความหวาน', 'หวานน้อย', 0, 2
    UNION ALL SELECT 'ชาไทยเย็น', 'ความหวาน', 'ไม่หวาน', 0, 3
  ) o ON o.menu = m.name AND o.grp = g.name;

-- วัตถุดิบตัวอย่างและสูตรต่อจาน (migration 012) ต้นทุนต่อหน่วยเป็นราคาตลาดโดยประมาณ
INSERT INTO ingredients (name, unit, cost_per_unit, low_stock_threshold) VALUES
  ('หมูสับ',          'กรัม', 0.1600, 1000),
  ('ไข่ไก่',          'ฟอง',  4.5000, 30),
  ('ข้าวสาร',         'กรัม', 0.0400, 3000),
  ('ใบกะเพรา',        'กรัม', 0.1200, 200),
  ('กุ้งสด',          'กรัม', 0.3500, 1000),
  ('ใบชาไทย',         'กรัม', 0.6000, 200),
  ('นมข้นหวาน',       'มล.',  0.0900, 500);

INSERT INTO menu_recipes (menu_item_id, ingredient_id, quantity)
SELECT m.id, i.id, r.qty
  FROM (
    SELECT 'กะเพราหมูสับไข่ดาว' AS menu, 'หมูสับ' AS ing, 100 AS qty
    UNION ALL SELECT 'กะเพราหมูสับไข่ดาว', 'ไข่ไก่', 1
    UNION ALL SELECT 'กะเพราหมูสับไข่ดาว', 'ข้าวสาร', 120
    UNION ALL SELECT 'กะเพราหมูสับไข่ดาว', 'ใบกะเพรา', 10
    UNION ALL SELECT 'ข้าวผัดกุ้ง', 'กุ้งสด', 60
    UNION ALL SELECT 'ข้าวผัดกุ้ง', 'ไข่ไก่', 1
    UNION ALL SELECT 'ข้าวผัดกุ้ง', 'ข้าวสาร', 150
    UNION ALL SELECT 'ข้าวไข่เจียวหมูสับ', 'หมูสับ', 50
    UNION ALL SELECT 'ข้าวไข่เจียวหมูสับ', 'ไข่ไก่', 2
    UNION ALL SELECT 'ข้าวไข่เจียวหมูสับ', 'ข้าวสาร', 120
    UNION ALL SELECT 'ชาไทยเย็น', 'ใบชาไทย', 15
    UNION ALL SELECT 'ชาไทยเย็น', 'นมข้นหวาน', 40
  ) r
  JOIN menu_items m ON m.name = r.menu
  JOIN ingredients i ON i.name = r.ing;

-- ยอดวัตถุดิบตั้งต้นของสาขาสยาม (สาขาอารีย์ยังไม่นับวัตถุดิบ ใช้โชว์ว่าสาขาที่ไม่นับจะไม่ถูกตัดยอด)
INSERT INTO branch_ingredient_stock (branch_id, ingredient_id, quantity)
SELECT 1, id, CASE name
    WHEN 'หมูสับ' THEN 5000
    WHEN 'ไข่ไก่' THEN 120
    WHEN 'ข้าวสาร' THEN 20000
    WHEN 'ใบกะเพรา' THEN 150
    WHEN 'กุ้งสด' THEN 3000
    WHEN 'ใบชาไทย' THEN 800
    ELSE 2000 END
  FROM ingredients;
