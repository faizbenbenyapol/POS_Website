'use client';

import { useState } from 'react';
import { formatBaht } from '@/lib/format';

/** ยอดขาย 1 วันที่ได้จาก API */
type TrendPoint = { sale_date: string; total: string };

type SalesTrendProps = {
  points: TrendPoint[];
  selectedMonth?: string;
};

/** ขนาดพิกัดเวกเตอร์ SVG */
const VIEW_WIDTH = 800;
const VIEW_HEIGHT = 200;
const PADDING_X = 20;
const PADDING_Y = 24;

/** วันในเดือนหลังเติมวันที่ไม่มีบิล */
type FilledDay = {
  dateStr: string;
  dayNum: number;
  label: string;
  total: number;
};

/**
 * แปลงเดือน YYYY-MM และ array ของ points เป็นรายวันครบทั้งเดือน
 */
function fillMonthDays(points: TrendPoint[], selectedMonth?: string): FilledDay[] {
  const byDate = new Map<string, number>();
  for (const point of points) {
    // Standardize key to YYYY-MM-DD
    const key = point.sale_date.slice(0, 10);
    byDate.set(key, Number(point.total));
  }

  let year: number;
  let month: number;

  if (selectedMonth && /^\d{4}-\d{2}$/.test(selectedMonth)) {
    const [y, m] = selectedMonth.split('-').map(Number);
    year = y;
    month = m;
  } else {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth() + 1;
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const days: FilledDay[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const mStr = String(month).padStart(2, '0');
    const dStr = String(d).padStart(2, '0');
    const dateStr = `${year}-${mStr}-${dStr}`;
    const dateObj = new Date(year, month - 1, d);
    const label = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short' }).format(dateObj);

    days.push({
      dateStr,
      dayNum: d,
      label,
      total: byDate.get(dateStr) ?? 0,
    });
  }

  return days;
}

/**
 * กราฟเส้นและพื้นที่สรุปยอดขายประจำเดือน วาดด้วย SVG Pure Clean
 */
export default function SalesTrend({ points, selectedMonth }: SalesTrendProps) {
  const [hoveredDay, setHoveredDay] = useState<FilledDay | null>(null);
  const days = fillMonthDays(points, selectedMonth);
  const totalMonthSales = days.reduce((sum, d) => sum + d.total, 0);
  const maxTotal = Math.max(1, ...days.map((day) => day.total));
  const activeDays = days.filter((d) => d.total > 0).length;
  const avgDaily = activeDays > 0 ? totalMonthSales / activeDays : 0;
  const peakDay = days.reduce((max, d) => (d.total > max.total ? d : max), days[0]);

  // คำนวณพิกัดบน SVG
  const totalCount = days.length;
  const usableWidth = VIEW_WIDTH - PADDING_X * 2;
  const usableHeight = VIEW_HEIGHT - PADDING_Y * 2;

  const coordinates = days.map((day, index) => {
    const x = PADDING_X + (index / Math.max(1, totalCount - 1)) * usableWidth;
    const y = VIEW_HEIGHT - PADDING_Y - (day.total / maxTotal) * usableHeight;
    return { x, y, day };
  });

  const linePath = coordinates
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
    .join(' ');

  const areaPath = `${linePath} L ${coordinates[coordinates.length - 1].x.toFixed(1)} ${VIEW_HEIGHT - PADDING_Y} L ${coordinates[0].x.toFixed(1)} ${VIEW_HEIGHT - PADDING_Y} Z`;

  return (
    <div className="flex flex-col gap-5">
      {/* สรุปสถิติ 3 ช่องย่อย */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wide">วันขายดีที่สุด</p>
          <p className="num mt-1 text-base font-bold text-zinc-900">
            {peakDay && peakDay.total > 0 ? formatBaht(peakDay.total) : '-'}
          </p>
          <p className="text-[11px] text-zinc-400">
            {peakDay && peakDay.total > 0 ? peakDay.label : 'ยังไม่มีข้อมูล'}
          </p>
        </div>

        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wide">เฉลี่ยต่อวัน</p>
          <p className="num mt-1 text-base font-bold text-zinc-900">
            {formatBaht(avgDaily)}
          </p>
          <p className="text-[11px] text-zinc-400">
            ขายได้ <span className="num font-semibold text-zinc-700">{activeDays}</span> วัน
          </p>
        </div>

        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wide">ยอดรวมเดือน</p>
          <p className="num mt-1 text-base font-bold text-zinc-900">
            {formatBaht(totalMonthSales)}
          </p>
          <p className="text-[11px] text-zinc-400">
            <span className="num font-semibold text-zinc-700">{days.length}</span> วันในเดือนนี้
          </p>
        </div>
      </div>

      {/* Area / Line SVG Chart */}
      <div className="relative rounded-md border border-zinc-200 bg-white p-4">
        {hoveredDay && (
          <div className="absolute right-4 top-4 z-10 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-800 shadow-lg">
            <p className="text-[11px] font-medium text-zinc-500">{hoveredDay.label}</p>
            <p className="num text-sm font-bold text-zinc-900">
              {formatBaht(hoveredDay.total)}
            </p>
          </div>
        )}

        <svg
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          className="h-56 w-full overflow-visible"
          role="img"
          aria-label={`กราฟยอดขายประจำเดือน สูงสุด ${formatBaht(maxTotal)}`}
        >
          <defs>
            <linearGradient id="monthTrendGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#16a34a" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#16a34a" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line
            x1={PADDING_X}
            y1={VIEW_HEIGHT - PADDING_Y}
            x2={VIEW_WIDTH - PADDING_X}
            y2={VIEW_HEIGHT - PADDING_Y}
            stroke="var(--color-rule)"
            strokeWidth="1"
          />
          <line
            x1={PADDING_X}
            y1={PADDING_Y}
            x2={VIEW_WIDTH - PADDING_X}
            y2={PADDING_Y}
            stroke="var(--color-rule)"
            strokeWidth="1"
            strokeDasharray="4 4"
            opacity={0.4}
          />
          <line
            x1={PADDING_X}
            y1={(VIEW_HEIGHT - PADDING_Y + PADDING_Y) / 2}
            x2={VIEW_WIDTH - PADDING_X}
            y2={(VIEW_HEIGHT - PADDING_Y + PADDING_Y) / 2}
            stroke="var(--color-rule)"
            strokeWidth="1"
            strokeDasharray="4 4"
            opacity={0.2}
          />

          {/* Gradient area */}
          <path d={areaPath} fill="url(#monthTrendGradient)" />

          {/* Main trend line */}
          <path
            d={linePath}
            fill="none"
            stroke="#16a34a"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Interactive dots */}
          {coordinates.map((pt) => {
            const isHovered = hoveredDay?.dateStr === pt.day.dateStr;
            return (
              <g
                key={pt.day.dateStr}
                onMouseEnter={() => setHoveredDay(pt.day)}
                onMouseLeave={() => setHoveredDay(null)}
                className="cursor-pointer"
              >
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? '5' : pt.day.total > 0 ? '3' : '2'}
                  fill={isHovered ? '#16a34a' : pt.day.total > 0 ? '#16a34a' : '#e4e4e7'}
                  stroke={isHovered ? '#ffffff' : 'none'}
                  strokeWidth={isHovered ? 2 : 0}
                  className="transition-all duration-150"
                />
                {/* Bigger invisible trigger circle for easier touch/hover */}
                <circle cx={pt.x} cy={pt.y} r="12" fill="transparent" />
              </g>
            );
          })}
        </svg>

        {/* Dynamic X-Axis Date Labels */}
        <div className="mt-2 flex justify-between px-2 text-[11px] font-medium text-zinc-400">
          <span>1 {days[0]?.label.split(' ')[1] ?? ''}</span>
          {days.length >= 15 && <span>15 {days[14]?.label.split(' ')[1] ?? ''}</span>}
          <span>{days[days.length - 1]?.dayNum} {days[days.length - 1]?.label.split(' ')[1] ?? ''}</span>
        </div>
      </div>

      {/* Daily Detailed Table */}
      <div className="overflow-hidden rounded-md border border-zinc-200">
        <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-2.5">
          <h3 className="text-xs font-semibold text-zinc-700">รายละเอียดรายวัน ({days.length} วัน)</h3>
          <span className="text-[11px] text-zinc-400">ชี้บนกราฟเพื่อดูข้อมูลวันนั้น</span>
        </div>
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-zinc-50 text-xs font-medium uppercase tracking-wide text-zinc-400 border-b border-zinc-200">
              <tr>
                <th scope="col" className="px-4 py-2.5">วันที่</th>
                <th scope="col" className="px-4 py-2.5 text-right">ยอดขาย (บาท)</th>
                <th scope="col" className="px-4 py-2.5">สัดส่วนยอดขาย</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-zinc-800">
              {days.map((day) => {
                const percent = maxTotal > 0 ? (day.total / maxTotal) * 100 : 0;
                return (
                  <tr
                    key={day.dateStr}
                    onMouseEnter={() => setHoveredDay(day)}
                    onMouseLeave={() => setHoveredDay(null)}
                    className={`transition-colors hover:bg-zinc-50 ${
                      hoveredDay?.dateStr === day.dateStr ? 'bg-zinc-50' : ''
                    }`}
                  >
                    <td className="px-4 py-2 text-xs text-zinc-600">
                      {day.label}
                    </td>
                    <td className={`num px-4 py-2 text-right text-xs font-semibold ${
                      day.total > 0 ? 'text-zinc-900' : 'text-zinc-300'
                    }`}>
                      {day.total > 0 ? formatBaht(day.total) : '-'}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-full max-w-[100px] overflow-hidden rounded-full bg-zinc-100">
                          <div
                            className="h-full rounded-full bg-green-600"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <span className="num text-[11px] text-zinc-400 w-7 text-right">
                          {percent > 0 ? `${Math.round(percent)}%` : ''}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
