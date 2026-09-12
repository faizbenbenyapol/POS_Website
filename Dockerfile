# ==============================================================================
# Stage 1: Dependencies Installation
# ==============================================================================
FROM node:20-alpine AS deps
WORKDIR /app

# ติดตั้ง libc6-compat สำหรับ alpine compatibility
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./
RUN npm ci

# ==============================================================================
# Stage 2: Application Build
# ==============================================================================
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# ปิด Next.js Telemetry ในระหว่าง Build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# ==============================================================================
# Stage 3: Production Runner
# ==============================================================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# สร้าง User และ Group สำหรับรัน Process โดยไม่ใช้สิทธิ์ root
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# คัดลอกเฉพาะ Standalone Artifacts ที่จำเป็นสำหรับ Production
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/db ./db
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# สร้างและกำหนดสิทธิ์ไดเรกทอรี uploads สำหรับ persistent storage
RUN mkdir -p ./public/uploads && chown -R nextjs:nodejs ./public

USER nextjs

EXPOSE 3000

CMD ["sh", "-c", "node scripts/migrate.js && node server.js"]
