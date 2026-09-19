import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * ตั้งค่า unit test ของระบบ
 * ทดสอบเฉพาะตรรกะล้วนใน src/lib ที่ไม่แตะฐานข้อมูล จึงรันบน node ได้เลยไม่ต้องมี MySQL
 * alias '@' ต้องตรงกับ paths ใน tsconfig.json ไม่อย่างนั้น import ในไฟล์ที่ถูกทดสอบจะหาไม่เจอ
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
