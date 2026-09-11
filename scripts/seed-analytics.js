/**
 * สคริปต์จำลองข้อมูลยอดขายย้อนหลังสำหรับวิเคราะห์ผล Dashboard & Sales Trend
 * สร้าง sessions, orders, order_items และ payments ย้อนหลังของเดือน ส.ค. และ ก.ย. 2569
 */
const mysql = require('mysql2/promise');

async function seedAnalytics() {
  const dbUrl = process.env.DATABASE_URL || 'mysql://root@127.0.0.1:3306/pos_qr';
  const conn = await mysql.createConnection(dbUrl);

  console.log('Connected to MySQL database.');

  // ดึงข้อมูลเมนูและโต๊ะที่มีอยู่จริง
  const [menus] = await conn.query('SELECT id, name, price FROM menu_items WHERE is_available = 1');
  const [tables] = await conn.query('SELECT id, table_no FROM dining_tables');
  const [users] = await conn.query('SELECT id, role FROM users');

  if (menus.length === 0 || tables.length === 0) {
    console.error('Missing menu_items or dining_tables in database.');
    await conn.end();
    return;
  }

  const staffId = users.find((u) => u.role === 'STAFF')?.id || users[0].id;

  // ล้างข้อมูลบิลเดิมของเดือน ส.ค. และ ก.ย. เพื่อให้สามารถรันซ้ำได้ปลอดภัย
  await conn.query("DELETE FROM payments WHERE DATE_FORMAT(paid_at, '%Y-%m') IN ('2026-08', '2026-09')");
  await conn.query("DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE DATE_FORMAT(created_at, '%Y-%m') IN ('2026-08', '2026-09'))");
  await conn.query("DELETE FROM orders WHERE DATE_FORMAT(created_at, '%Y-%m') IN ('2026-08', '2026-09')");
  await conn.query("DELETE FROM table_sessions WHERE DATE_FORMAT(opened_at, '%Y-%m') IN ('2026-08', '2026-09')");

  // เมนูยอดนิยมเพื่อจำลองให้ติด Top 5 Menus
  const popularNames = [
    'กะเพราหมูสับไข่ดาว',
    'ชาไทยเย็น',
    'ต้มยำกุ้งน้ำข้น',
    'ข้าวผัดกุ้ง',
    'หมูสะเต๊ะ 6 ไม้',
    'ปีกไก่ทอดน้ำปลา',
  ];
  const popularMenus = menus.filter((m) => popularNames.includes(m.name));
  const otherMenus = menus.filter((m) => !popularNames.includes(m.name));

  let orderCodeSeq = 100;

  // ฟังก์ชันสุ่มสร้างออเดอร์สำหรับ 1 วัน
  async function generateDaySales(dateStr, sessionCountMultiplier = 1) {
    // กำหนดจำนวนบิลของวันนั้น (3 - 9 บิล)
    const baseBills = Math.floor(Math.random() * 4) + 3;
    const billCount = Math.round(baseBills * sessionCountMultiplier);

    for (let b = 0; b < billCount; b++) {
      const table = tables[Math.floor(Math.random() * tables.length)];
      const hour = Math.floor(Math.random() * 11) + 11; // 11:00 - 21:00
      const minute = Math.floor(Math.random() * 60);
      const openTime = `${dateStr} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;

      // 1. สร้าง table_sessions
      const [sessRes] = await conn.query(
        `INSERT INTO table_sessions (table_id, status, opened_at, closed_at, closed_by)
         VALUES (?, 'CLOSED', ?, DATE_ADD(?, INTERVAL 45 MINUTE), ?)`,
        [table.id, openTime, openTime, staffId]
      );
      const sessionId = sessRes.insertId;

      // 2. สร้าง orders (OD + YYMMDD + 4 หลัก รวม 12 ตัวอักษรพอดีกับคอลัมน์)
      orderCodeSeq++;
      const [y, m, d] = dateStr.split('-');
      const orderCode = `OD${y.slice(2)}${m}${d}${String(orderCodeSeq).padStart(4, '0')}`;

      const [ordRes] = await conn.query(
        `INSERT INTO orders (session_id, order_code, status, total_amount, created_at)
         VALUES (?, ?, 'SERVED', 0, ?)`,
        [sessionId, orderCode, openTime]
      );
      const orderId = ordRes.insertId;

      // 3. สร้าง order_items (สุ่มสั่ง 2 - 5 อย่าง)
      let totalAmount = 0;
      const itemCount = Math.floor(Math.random() * 4) + 2;

      for (let i = 0; i < itemCount; i++) {
        // 70% เลือกเมนูยอดนิยม, 30% เมนูทั่วไป
        const pool = Math.random() < 0.7 && popularMenus.length > 0 ? popularMenus : otherMenus;
        const item = pool[Math.floor(Math.random() * pool.length)];
        const qty = Math.floor(Math.random() * 2) + 1;
        const price = Number(item.price);
        const subtotal = price * qty;
        totalAmount += subtotal;

        await conn.query(
          `INSERT INTO order_items (order_id, menu_item_id, item_name, unit_price, quantity, status)
           VALUES (?, ?, ?, ?, ?, 'SERVED')`,
          [orderId, item.id, item.name, price, qty]
        );
      }

      // อัปเดตยอด orders
      await conn.query('UPDATE orders SET total_amount = ? WHERE id = ?', [totalAmount, orderId]);

      // 4. บันทึก payments
      const methods = ['CASH', 'TRANSFER', 'CARD'];
      const method = methods[Math.floor(Math.random() * methods.length)];
      const paidAt = `${dateStr} ${String(hour).padStart(2, '0')}:${String(Math.min(59, minute + 40)).padStart(2, '0')}:00`;

      await conn.query(
        `INSERT INTO payments (session_id, method, total_amount, received_by, paid_at)
         VALUES (?, ?, ?, ?, ?)`,
        [sessionId, method, totalAmount, staffId, paidAt]
      );
    }
  }

  console.log('Seeding sales for August 2026 (for Month-over-Month growth baseline)...');
  // เดือนสิงหาคม: สุ่มสร้างวันเว้นวัน ให้ได้ยอดประมาณ 35,000 - 45,000
  for (let d = 1; d <= 31; d += 2) {
    const dStr = String(d).padStart(2, '0');
    await generateDaySales(`2026-08-${dStr}`, 0.9);
  }

  console.log('Seeding sales for September 2026 (Current month days 1 - 10)...');
  // เดือนกันยายน: 1 ถึง 10
  for (let d = 1; d <= 10; d++) {
    const dStr = String(d).padStart(2, '0');
    const dateObj = new Date(2026, 8, d);
    const dayOfWeek = dateObj.getDay(); // 0 = Sun, 5 = Fri, 6 = Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6;
    // วันสุดสัปดาห์หรือวันศุกร์ให้ยอดเยอะขึ้น (Peak)
    const multiplier = isWeekend ? 1.7 : 1.0;

    await generateDaySales(`2026-09-${dStr}`, multiplier);
  }

  console.log('Seeding completed successfully!');
  await conn.end();
}

seedAnalytics().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
