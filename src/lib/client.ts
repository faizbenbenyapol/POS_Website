/**
 * ผลลัพธ์ที่ฝั่งหน้าจอได้รับหลังเรียก API — แปลงจากรูปแบบมาตรฐานของหัวข้อ 8
 * ให้อยู่ในรูปที่ React ใช้ตัดสินใจแสดงผลได้ง่าย
 */
export type ClientResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

/**
 * เรียก API ของระบบจากฝั่งเบราว์เซอร์ แล้วแปลงทั้งกรณีสำเร็จ กรณี error จากเซิร์ฟเวอร์
 * และกรณีเน็ตหลุด ให้เป็นรูปเดียวกัน หน้าจอจึงเขียน if เดียวจบไม่ต้อง try/catch ซ้ำทุกที่
 *
 * @param path - เส้นทาง API เช่น '/api/admin/categories'
 * @param init - ตัวเลือกของ fetch เช่น method และ body
 * @returns ข้อมูลเมื่อสำเร็จ หรือข้อความภาษาไทยบอกสาเหตุเมื่อไม่สำเร็จ
 */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<ClientResult<T>> {
  try {
    const response = await fetch(path, {
      ...init,
      headers: init?.body
        ? { 'Content-Type': 'application/json', ...init?.headers }
        : init?.headers,
    });

    // เซิร์ฟเวอร์ที่พังกลางทางจะตอบเป็นหน้า HTML ไม่ใช่ JSON แยกกรณีนี้ออกมา
    // เพื่อไม่ให้ผู้ใช้เห็นข้อความว่า "เน็ตหลุด" ทั้งที่ปัญหาอยู่ที่ฝั่งระบบ
    const body = await response.json().catch(() => null);
    if (body === null) {
      return {
        ok: false,
        message: `ระบบขัดข้องระหว่างประมวลผล (รหัส ${response.status}) กรุณาลองใหม่ ถ้ายังไม่ได้ให้แจ้งผู้ดูแลระบบ`,
      };
    }
    if (body.ok) return { ok: true, data: body.data as T };
    return {
      ok: false,
      message: body?.error?.message ?? 'ระบบตอบกลับผิดรูปแบบ กรุณาลองใหม่อีกครั้ง',
    };
  } catch {
    return {
      ok: false,
      message: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง',
    };
  }
}

/**
 * แปลงค่าจากฟอร์มให้เป็น body JSON สำหรับส่งไป API
 * แยกไว้เพื่อไม่ให้ทุกหน้าเขียน JSON.stringify ซ้ำจนพลาดตกหล่น
 *
 * @param payload - ออบเจกต์ข้อมูลที่จะส่ง
 * @returns ข้อความ JSON พร้อมใส่ใน body ของ fetch
 */
export function jsonBody(payload: unknown): string {
  return JSON.stringify(payload);
}
