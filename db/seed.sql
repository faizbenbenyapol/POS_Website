-- =============================================================
-- seed.sql — ข้อมูลตั้งต้นสำหรับทดสอบระบบ
-- ต้องรัน db/schema.sql ก่อนเสมอ
-- วิธีรัน: mysql -u root -p < db/seed.sql
--
-- รหัสผ่านผู้ใช้ตั้งต้น (เก็บใน DB เป็น bcrypt hash เท่านั้น):
--   admin   / admin1234
--   staff01 / staff1234
-- =============================================================

-- บังคับ character set ของ connection เป็น utf8mb4 ก่อนนำเข้าข้อมูล
-- ป้องกันปัญหาข้อความไทยเพี้ยน (mojibake) เวลา docker entrypoint รันไฟล์นี้
-- ด้วย client charset เริ่มต้นที่ไม่ตรงกับไฟล์ (ซึ่งเป็น UTF-8)
SET NAMES utf8mb4;
USE pos_qr;

-- ล้างข้อมูลเดิมก่อน เรียงจากตารางลูกไปตารางแม่
DELETE FROM ticket_replies;
DELETE FROM tickets;
DELETE FROM payments;
DELETE FROM order_items;
DELETE FROM orders;
DELETE FROM table_sessions;
DELETE FROM menu_items;
DELETE FROM categories;
DELETE FROM dining_tables;
DELETE FROM users;

-- ผู้ใช้ระบบฝั่งร้าน
INSERT INTO users (username, password_hash, full_name, role) VALUES
  ('admin',   '$2b$10$1b.K/eL6x6APFfWwlLQZIukpxCbUuqBd2ZUMxpD/4c2NWKnX6l6xu', 'เจ้าของร้าน', 'ADMIN'),
  ('staff01', '$2b$10$RDSKDcaZcyDGZKsd0u8mAu4IGBJkcJTmSa1KaCIsdhTA7Nkc2MrrC', 'พนักงานหน้าร้าน', 'STAFF');

-- โต๊ะ 8 โต๊ะ พร้อม qr_token สุ่มไว้แล้ว (ลิงก์ QR คือ /t/{qr_token})
INSERT INTO dining_tables (table_no, seats, qr_token) VALUES
  ('A1', 2, '508146d7b4653bd6a4ee151228802674'),
  ('A2', 2, '8bda159b2ae11cb68821f3591317e70d'),
  ('A3', 4, '05a6bee89e9205198538f2da28a9db7f'),
  ('A4', 4, '13efc3c9da15866cc171405b7fb9a842'),
  ('B1', 4, 'b5c30e2cbd8d447745fe3b4ebd5b6a68'),
  ('B2', 6, 'b4c834f5661d4eeb92592d8ef57dd9c7'),
  ('B3', 6, 'b493bfb211b76f824da701797341590a'),
  ('B4', 8, 'fd3c3d77c829611fd31c4d2c9a472809');

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
