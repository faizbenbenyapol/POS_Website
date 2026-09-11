import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import type { NextRequest } from 'next/server';
import { apiOk, apiError, ERROR_CODES, authFailureResponse } from '@/lib/api';
import { requireStaff } from '@/lib/auth';

/** ขนาดไฟล์สูงสุดที่อนุญาตให้อัปโหลด (5 MB) */
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/** ชนิด MIME Type ของรูปภาพที่รองรับ */
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

/**
 * อัปโหลดรูปภาพเมนูอาหาร บันทึกไฟล์ลงในโฟลเดอร์ public/uploads
 * เพื่อให้สามารถเปิดใช้งานผ่าน /uploads/... ได้ทันที
 *
 * @param request - คำขอที่มีข้อมูล multipart/form-data พร้อมฟิลด์ 'file'
 * @returns พาธของรูปภาพที่อัปโหลดสำเร็จ เช่น /uploads/menu-1725984000000-abc123.jpg
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

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return apiError(
        ERROR_CODES.VALIDATION_ERROR,
        'รองรับเฉพาะไฟล์รูปภาพนามสกุล JPG, PNG, WEBP, GIF หรือ AVIF เท่านั้น',
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return apiError(
        ERROR_CODES.VALIDATION_ERROR,
        'ขนาดไฟล์รูปภาพต้องไม่เกิน 5 MB',
      );
    }

    // กำหนดนามสกุลไฟล์ที่ปลอดภัย
    const extMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/avif': 'avif',
    };
    const extension = extMap[file.type] || 'jpg';
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const filename = `menu-${Date.now()}-${randomSuffix}.${extension}`;

    // ตรวจสอบและสร้างโฟลเดอร์ public/uploads หากยังไม่มี
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    await mkdir(uploadDir, { recursive: true });

    const filePath = path.join(uploadDir, filename);
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    await writeFile(filePath, buffer);

    const publicUrl = `/uploads/${filename}`;
    return apiOk({ url: publicUrl }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'อัปโหลดรูปภาพไม่สำเร็จ';
    return apiError(ERROR_CODES.SERVER_ERROR, message, 500);
  }
}
