/**
 * In-memory sliding window rate limiter
 * เก็บ timestamp ของแต่ละ request ใน Map และลบที่หมดอายุออกทุกครั้งที่ตรวจ
 * เหมาะสำหรับ single-process deployment (Next.js standalone)
 * ถ้าจะ scale หลาย process ต้องเปลี่ยนเป็น Redis-based
 */

/** จำนวนครั้งสูงสุดและหน้าต่างเวลาที่ใช้ตรวจ */
type RateLimitConfig = {
  maxRequests: number;
  windowMs: number;
};

/** ผลการตรวจ rate limit */
type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

/** เก็บ timestamp ของ request ที่ผ่านมาของแต่ละ key */
const stores = new Map<string, Map<string, number[]>>();

/** ล้าง key ที่ไม่มี request มานานกว่า window เพื่อไม่ให้ Map บวมไม่หยุด */
const CLEANUP_INTERVAL_MS = 60000;
const lastCleanup = new Map<string, number>();

/**
 * ล้างรายการที่หมดอายุออกจาก store ป้องกัน memory leak
 */
function cleanup(storeName: string, windowMs: number) {
  const now = Date.now();
  const last = lastCleanup.get(storeName) ?? 0;
  if (now - last < CLEANUP_INTERVAL_MS) return;
  lastCleanup.set(storeName, now);

  const store = stores.get(storeName);
  if (!store) return;

  const cutoff = now - windowMs;
  for (const [key, timestamps] of store) {
    const valid = timestamps.filter((t) => t > cutoff);
    if (valid.length === 0) {
      store.delete(key);
    } else {
      store.set(key, valid);
    }
  }
}

/**
 * สร้าง rate limiter สำหรับ endpoint หนึ่ง
 * ใช้ sliding window: นับ request ที่เกิดขึ้นภายใน windowMs ที่ผ่านมา
 *
 * @param name - ชื่อ store สำหรับแยก limiter แต่ละ endpoint
 * @param config - จำนวนครั้งสูงสุดและหน้าต่างเวลา
 * @returns ฟังก์ชัน check(key) สำหรับตรวจ rate limit
 */
export function createRateLimiter(name: string, config: RateLimitConfig) {
  if (!stores.has(name)) {
    stores.set(name, new Map());
  }

  return function check(key: string): RateLimitResult {
    const store = stores.get(name)!;
    const now = Date.now();
    const cutoff = now - config.windowMs;

    cleanup(name, config.windowMs);

    const timestamps = store.get(key) ?? [];
    const valid = timestamps.filter((t) => t > cutoff);

    if (valid.length >= config.maxRequests) {
      // คำนวณเวลาที่ต้องรอจนกว่า request ที่เก่าที่สุดจะหมดอายุ
      const oldest = valid[0]!;
      const retryAfterMs = oldest + config.windowMs - now;
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(retryAfterMs, 1000),
      };
    }

    valid.push(now);
    store.set(key, valid);

    return {
      allowed: true,
      remaining: config.maxRequests - valid.length,
      retryAfterMs: 0,
    };
  };
}

/**
 * ดึง IP จาก request headers ตามลำดับความน่าเชื่อถือ
 * ใน production ที่อยู่หลัง reverse proxy ต้องดู x-forwarded-for
 */
export function getClientIp(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    'unknown'
  );
}
