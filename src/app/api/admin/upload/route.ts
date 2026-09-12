import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { apiOk, apiError, serverError, ERROR_CODES, authFailureResponse } from '@/lib/api';
import { requireStaff } from '@/lib/auth';

/** ขนาดไฟล์สูงสุดที่อนุญาตให้อัปโหลด (5 MB) */
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * ตรวจสอบลายเซ็นไบนารี (Magic Bytes) ของไฟล์ เพื่อยืนยันว่าเป็นรูปภาพที่ปลอดภัยจริง
 * ป้องกันการปลอมแปลงนามสกุลไฟล์ เช่น ไฟล์ .exe หรือ .php ที่เปลี่ยนชื่อเป็น .jpg
 *
 * @param buffer - ข้อมูลไบนารีส่วนหัวของไฟล์ที่อัปโหลด
 * @returns นามสกุลไฟล์และ MIME type ที่ตรวจพบ หรือ null เมื่อไม่ใช่รูปภาพที่รองรับ
 */
function detectImageFormat(buffer: Buffer): { ext: string; mime: string } | null {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { ext: 'png', mime: 'image/png' };
  }

  // GIF: GIF87a หรือ GIF89a (47 49 46 38 37/39 61)
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    return { ext: 'gif', mime: 'image/gif' };
  }

  // WebP: RIFF....WEBP (52 49 46 46 .... 57 45 42 50)
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { ext: 'webp', mime: 'image/webp' };
  }

  // AVIF: ....ftypavif หรือ ....ftypavis
  if (
    buffer.subarray(4, 8).toString('ascii') === 'ftyp' &&
    (buffer.subarray(8, 12).toString('ascii') === 'avif' || buffer.subarray(8, 12).toString('ascii') === 'avis')
  ) {
    return { ext: 'avif', mime: 'image/avif' };
  }

  return null;
}

/**
 * อัปโหลดรูปภาพเมนูอาหาร บันทึกไฟล์ลงในโฟลเดอร์ public/uploads
 * ผ่านการตรวจสอบสิทธิ์ ADMIN, ตรวจสอบขนาด, ตรวจสอบ Magic Bytes จริง
 * และตั้งชื่อไฟล์ด้วย Cryptographic UUID เพื่อความปลอดภัยสูงสุด
 *
 * @param request - คำขอที่มีข้อมูล multipart/form-data พร้อมฟิลด์ 'file'
 * @returns พาธของรูปภาพที่อัปโหลดสำเร็จ เช่น /uploads/menu-1725984000000-uuid.jpg
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireStaff('ADMIN');
    if (!auth.ok) return authFailureResponse(auth.reason);

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return apiError(ERROR_CODES.VALIDATION_ERROR, 'กรุณาเลือกไฟล์รูปภาพที่ต้องการอัปโหลด');
    }

    if (file.size > MAX_FILE_SIZE) {
      return apiError(
        ERROR_CODES.VALIDATION_ERROR,
        'ขนาดไฟล์รูปภาพต้องไม่เกิน 5 MB',
      );
    }

    // แปลงไฟล์เป็น Buffer เพื่อตรวจสอบ Magic Bytes ไบนารีจริง
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const detected = detectImageFormat(buffer);
    if (!detected) {
      return apiError(
        ERROR_CODES.VALIDATION_ERROR,
        'ไฟล์ที่อัปโหลดไม่ใช่รูปภาพที่ถูกต้อง รองรับเฉพาะ JPG, PNG, WEBP, GIF หรือ AVIF เท่านั้น',
      );
    }

    // กำหนดพาธจัดเก็บ และป้องกัน Path Traversal
    const uploadDir = path.resolve(process.cwd(), 'public', 'uploads');
    await mkdir(uploadDir, { recursive: true });

    const filename = `menu-${Date.now()}-${randomUUID()}.${detected.ext}`;
    const filePath = path.resolve(uploadDir, filename);

    if (!filePath.startsWith(uploadDir)) {
      return apiError(ERROR_CODES.FORBIDDEN, 'พาธของไฟล์ไม่ถูกต้อง ไม่อนุญาตให้บันทึก');
    }

    await writeFile(filePath, buffer);

    const publicUrl = `/uploads/${filename}`;
    return apiOk({ url: publicUrl }, 201);
  } catch (err) {
    return serverError(err, 'POST /api/admin/upload');
  }
}
