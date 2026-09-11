-- =============================================================
-- Migration 002: Composite Indexes for Query Performance
-- =============================================================
-- Run: mysql -u root -p pos_qr < db/migrations/002_indexes.sql
-- =============================================================

USE pos_qr;

-- orders: กรองตามวันทำการ (range query บน created_at)
CREATE INDEX idx_orders_created_at ON orders (created_at);

-- orders: กระดานออเดอร์กรอง status + เรียงตาม created_at
CREATE INDEX idx_orders_status_created ON orders (status, created_at);

-- table_sessions: ค้นหา session ที่เปิดอยู่ของโต๊ะ
CREATE INDEX idx_sessions_table_status ON table_sessions (table_id, status);

-- order_items: รวมยอดและคำนวณสถานะของใบสั่ง
CREATE INDEX idx_order_items_order_status ON order_items (order_id, status);

-- payments: รายงานยอดขายตามช่วงเวลา
CREATE INDEX idx_payments_paid_at ON payments (paid_at);

-- tickets: กระดาน ticket กรองสถานะ + ความเร่งด่วน
CREATE INDEX idx_tickets_status_priority ON tickets (status, priority);
