# POS Restaurant & Table QR Ordering System

ระบบบริหารจัดการร้านอาหาร Point of Sale (POS) พร้อมระบบสแกนสั่งอาหารผ่าน QR Code ที่โต๊ะ พัฒนาด้วย Next.js (App Router) และฐานข้อมูล MySQL

---

## สถาปัตยกรรมการรันระบบ (Dual-Runtime Architecture)

ระบบถูกออกแบบให้รองรับการรัน 2 รูปแบบอย่างสมบูรณ์:
1. **รูปแบบที่ 1: Standard Local Development** เหมาะสำหรับการพัฒนา ทดสอบฟังก์ชัน และแก้ไขโค้ดสด (Hot Reload) ผ่าน Node.js และ Local MySQL / XAMPP
2. **รูปแบบที่ 2: Docker Containerized Setup** เหมาะสำหรับการทดสอบสภาพแวดล้อม Production หรือ Deploy บน Cloud Server แบบ Isolated Container

---

## รูปแบบที่ 1: การรันแบบ Standard Local Development

### ความต้องการของระบบ (Prerequisites)
- Node.js 20 หรือใหม่กว่า
- MySQL Server 8.0+ หรือ XAMPP (พร้อมเปิดใช้งานโมดูล MySQL)
- Git

### ขั้นตอนการติดตั้งและรันระบบ

#### 1. การเตรียมฐานข้อมูล MySQL
เปิดโปรแกรมจัดการฐานข้อมูล (เช่น phpMyAdmin, MySQL Workbench, DBeaver หรือ MySQL CLI) จากนั้นนำเข้าสคริปต์ตามลำดับ:
1. นำเข้าไฟล์โครงสร้างตาราง: `db/schema.sql`
2. นำเข้าไฟล์ข้อมูลเริ่มต้น (Seed Data): `db/seed.sql`

หรือรันคำสั่งผ่าน Command Line:
```bash
mysql -u root -p < db/schema.sql
mysql -u root -p pos_qr < db/seed.sql
```

#### 2. ตั้งค่าตัวแปรสภาพแวดล้อม (Environment Variables)
คัดลอกไฟล์ตัวอย่าง `.env.example` ไปเป็น `.env`:
```bash
cp .env.example .env
```
ตรวจสอบและแก้ไขค่าการเชื่อมต่อใน `.env` ให้ตรงกับเครื่องของคุณ:
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=pos_qr
# สร้าง Secret ใหม่ด้วยคำสั่ง: openssl rand -hex 32
JWT_SECRET=your_generated_secret_key_here
NEXT_PUBLIC_BASE_URL=http://localhost:3000
APP_BASE_URL=http://localhost:3000
# เวลาตัดรอบวันทำการ (0-23 นาฬิกา, ค่าเริ่มต้น 4 คือ 04:00 น.)
BUSINESS_DAY_CUTOFF_HOUR=4
```

> [!NOTE]
> **รอบวันทำการ (Business Day)**: ระบบใช้เวลาตัดรอบวันทำการตาม `BUSINESS_DAY_CUTOFF_HOUR` (ค่าเริ่มต้น 04:00 น.) ดังนั้น ออเดอร์และสลิปที่สร้างหลังเที่ยงคืนแต่ยังไม่ถึงเวลาตัดรอบ (เช่น เวลา 01:00 น.) จะแสดงรหัสออเดอร์และสรุปยอดเป็นของวันทำการก่อนหน้า ซึ่งเป็นพฤติกรรมการทำงานที่ถูกต้องและตั้งใจของระบบร้านอาหาร เพื่อให้ยอดขายและลำดับบิลสอดคล้องกับรอบบัญชีเดียวกัน


#### 3. ติดตั้ง Dependencies และรัน Development Server
```bash
# ติดตั้งแพ็กเกจ
npm install

# เริ่มต้นเซิร์ฟเวอร์สำหรับพัฒนา
npm run dev
```
เปิดเบราว์เซอร์และเข้าใช้งานที่ `http://localhost:3000`

---

## รูปแบบที่ 2: การรันผ่าน Docker & Docker Compose

ระบบจะสร้าง Container แยก 2 ตัว (Next.js Application และ MySQL 8.0) พร้อมเชื่อมต่อ Network ภายในและนำเข้าฐานข้อมูลเริ่มต้นให้อัตโนมัติ

### ความต้องการของระบบ (Prerequisites)
- Docker Desktop หรือ Docker Engine (พร้อม Docker Compose v2+)

### ขั้นตอนการรันระบบ

#### 1. เตรียมไฟล์ Environment
สร้างไฟล์ `.env` จากตัวอย่าง:
```bash
cp .env.example .env
```
*(หมายเหตุ: ภายใต้ Docker Compose ตัวแปร `DB_HOST=db` จะถูกกำหนดให้อัตโนมัติผ่าน service name ใน `docker-compose.yml`)*

#### 2. สั่ง Build และรัน Container
รันคำสั่งเพื่อสร้าง Image และเริ่มทำงานในโหมด Background:
```bash
docker compose up -d --build
```
ระบบจะดำเนินการดังนี้โดยอัตโนมัติ:
- สร้าง Docker Image ของ Next.js ในโหมด Multi-stage standalone build
- เริ่มต้น MySQL Container และตรวจจับไฟล์ในโฟลเดอร์ `db/` เพื่อ Initialize Schema และ Seed Data เข้าสู่ Volume ทันที
- ตรวจสอบสถานะ Healthcheck ของ MySQL จนพร้อมใช้งาน ก่อนเริ่มต้นรัน Container ของ Next.js

#### 3. ตรวจสอบสถานะและการทำงาน
ตรวจสอบสถานะของ Container:
```bash
docker compose ps
```

ดู Log การทำงานของระบบ:
```bash
# ดู Log ทั้งหมดแบบ Real-time
docker compose logs -f

# ดูเฉพาะ Log ฝั่ง Application
docker compose logs -f app

# ดูเฉพาะ Log ฝั่ง Database
docker compose logs -f db
```

เข้าใช้งานระบบผ่านเบราว์เซอร์ที่:
`http://localhost:3000`

#### 4. การหยุดการทำงาน
```bash
# หยุดการทำงานแต่เก็บรักษาข้อมูลใน Volume ไว้
docker compose down

# หยุดการทำงานและล้างข้อมูลฐานข้อมูลใน Volume ทั้งหมด (เริ่มใหม่หมด)
docker compose down -v
```

---

## ข้อมูลบัญชีผู้ใช้เริ่มต้นสำหรับทดสอบ (Default Accounts)

ข้อมูลเหล่านี้ถูกสร้างขึ้นผ่าน `db/seed.sql`:

| บทบาท (Role) | Username | Password | หน้าที่และความรับผิดชอบ |
| :--- | :--- | :--- | :--- |
| เจ้าของร้าน (ADMIN) | `admin` | `admin123` | จัดการทุกฟังก์ชัน ดูยอดขาย บัญชีผู้ใช้ เมนู โต๊ะ |
| พนักงาน (STAFF) | `staff1` | `staff123` | รับออเดอร์ เสิร์ฟอาหาร ปิดบิล ตอบ Ticket |

---

## ตารางคำสั่งที่สำคัญ (Scripts & Commands)

| คำสั่ง | การทำงาน |
| :--- | :--- |
| `npm run dev` | รัน Next.js ในโหมด Local Development |
| `npm run build` | คอมไพล์โปรเจกต์สำหรับ Production (สร้าง Standalone bundle) |
| `npm run start` | รัน Production Server หลังการ build |
| `npx tsc --noEmit` | ตรวจสอบ Type Safety ของ TypeScript ทั่วทั้งโปรเจกต์ |
| `docker compose up -d` | สั่งเปิดระบบ Production Containers |
| `docker compose down` | สั่งปิดระบบ Production Containers |
