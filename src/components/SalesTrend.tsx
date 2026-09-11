'use client';

import { useId, useMemo, useState } from 'react';
import { formatBaht } from '@/lib/format';
import {
  TrendingUpIcon,
  TrendingDownIcon,
  StarIcon,
  CalendarIcon,
  ChartIcon,
  TrophyIcon,
} from '@/components/Icons';
import CustomSelect from '@/components/Select';

/** ยอดขาย 1 วันที่ได้จาก API */
export type TrendPoint = { sale_date: string; total: string };

type SalesTrendProps = {
  points: TrendPoint[];
  selectedMonth?: string;
};

/** ขนาดพิกัดเวกเตอร์ SVG */
const VIEW_WIDTH = 900;
const VIEW_HEIGHT = 280;
const PADDING_X = 32;
const PADDING_TOP = 32;
const PADDING_BOTTOM = 40;

/** วันในเดือนหลังเติมวันที่ไม่มีบิล */
export type FilledDay = {
  dateStr: string;
  dayNum: number;
  dayOfWeek: number; // 0 = อาทิตย์, 6 = เสาร์
  isWeekend: boolean;
  thaiDayName: string;
  label: string;
  fullDateLabel: string;
  total: number;
};

/** โหมดแสดงผลกราฟ */
type ChartViewMode = 'spline' | 'bar';

/** ตัวเลือกช่วงเวลาที่ต้องการดู */
type RangeFilter = 'ALL' | 'H1' | 'H2' | '7D';

/**
 * แปลงเดือน YYYY-MM และ array ของ points เป็นรายวันครบทั้งเดือนพร้อมข้อมูลวันในสัปดาห์
 *
 * @param points - ข้อมูลยอดขายรายวันจาก API
 * @param selectedMonth - เดือนที่เลือกในรูปแบบ YYYY-MM
 * @returns อาร์เรย์ของวันในเดือนครบทุกวัน
 */
function fillMonthDays(points: TrendPoint[], selectedMonth?: string): FilledDay[] {
  const byDate = new Map<string, number>();
  for (const point of points) {
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
  const thaiDayNames = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสฯ', 'ศุกร์', 'เสาร์'];

  for (let d = 1; d <= daysInMonth; d++) {
    const mStr = String(month).padStart(2, '0');
    const dStr = String(d).padStart(2, '0');
    const dateStr = `${year}-${mStr}-${dStr}`;
    const dateObj = new Date(year, month - 1, d);
    const dayOfWeek = dateObj.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const thaiDayName = thaiDayNames[dayOfWeek];

    const label = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short' }).format(dateObj);
    const fullDateLabel = `วัน${thaiDayName}ที่ ${d} ${new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(dateObj)}`;

    days.push({
      dateStr,
      dayNum: d,
      dayOfWeek,
      isWeekend,
      thaiDayName,
      label,
      fullDateLabel,
      total: byDate.get(dateStr) ?? 0,
    });
  }

  return days;
}

/**
 * คำนวณเส้นทาง Cubic Bezier Curve (Catmull-Rom to Cubic Bezier)
 * เพื่อให้เส้นกราฟโค้งมน นุ่มนวล ดูทันสมัย ไม่หักศอก
 *
 * @param coords - จุดพิกัด x, y ทั้งหมด
 * @returns SVG Path คำสั่ง d
 */
function getCurvedPath(coords: { x: number; y: number }[]): string {
  if (coords.length === 0) return '';
  if (coords.length === 1) return `M ${coords[0].x} ${coords[0].y}`;
  if (coords.length === 2) {
    return `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)} L ${coords[1].x.toFixed(1)} ${coords[1].y.toFixed(1)}`;
  }

  let path = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
  const tension = 0.2;

  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i === 0 ? 0 : i - 1];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2 >= coords.length ? i + 1 : i + 2];

    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }

  return path;
}

/**
 * คอมโพเนนต์กราฟยอดขายรายวันและตารางวิเคราะห์สถิติระดับพรีเมียม (Modern Data Visualization)
 */
export default function SalesTrend({ points, selectedMonth }: SalesTrendProps) {
  const gradientId = useId();
  const shadowFilterId = useId();

  // สถานะการแสดงผล
  const [viewMode, setViewMode] = useState<ChartViewMode>('spline');
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>('ALL');
  const [showAvgLine, setShowAvgLine] = useState(true);
  const [hoveredDay, setHoveredDay] = useState<FilledDay | null>(null);
  const [tableSort, setTableSort] = useState<'date-asc' | 'date-desc' | 'sales-desc'>('date-asc');
  const [onlyWithSales, setOnlyWithSales] = useState(false);

  // คำนวณข้อมูลทั้งเดือน
  const allDays = useMemo(() => fillMonthDays(points, selectedMonth), [points, selectedMonth]);

  // กรองตามช่วงวันที่เลือก
  const displayedDays = useMemo(() => {
    if (rangeFilter === 'H1') {
      return allDays.filter((d) => d.dayNum <= 15);
    }
    if (rangeFilter === 'H2') {
      return allDays.filter((d) => d.dayNum >= 16);
    }
    if (rangeFilter === '7D') {
      return allDays.slice(-7);
    }
    return allDays;
  }, [allDays, rangeFilter]);

  // คำนวณสถิติภาพรวม
  const totalMonthSales = useMemo(() => allDays.reduce((sum, d) => sum + d.total, 0), [allDays]);
  const activeDaysCount = useMemo(() => allDays.filter((d) => d.total > 0).length, [allDays]);
  const avgDaily = useMemo(
    () => (activeDaysCount > 0 ? totalMonthSales / activeDaysCount : 0),
    [totalMonthSales, activeDaysCount],
  );

  const peakDay = useMemo(
    () => allDays.reduce((max, d) => (d.total > max.total ? d : max), allDays[0]),
    [allDays],
  );

  // ยอดขายสูงสุดสำหรับกำหนด Scale แกน Y
  const maxDisplayedTotal = useMemo(
    () => Math.max(1, ...displayedDays.map((d) => d.total)),
    [displayedDays],
  );

  // คำนวณประมาณการสิ้นเดือน (Run-rate Projection)
  const projectedTotal = useMemo(() => {
    if (activeDaysCount === 0) return 0;
    const today = new Date().getDate();
    // ถ้าดูเดือนปัจจุบัน ใช้สัดส่วนวันที่ผ่านไป
    const isCurrentMonth =
      selectedMonth ===
      `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const daysPassed = isCurrentMonth ? Math.min(today, allDays.length) : allDays.length;
    if (daysPassed <= 0) return totalMonthSales;
    return (totalMonthSales / daysPassed) * allDays.length;
  }, [totalMonthSales, activeDaysCount, allDays.length, selectedMonth]);

  // พิกัดพล็อตบน SVG
  const usableWidth = VIEW_WIDTH - PADDING_X * 2;
  const usableHeight = VIEW_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

  const coordinates = useMemo(() => {
    const count = displayedDays.length;
    return displayedDays.map((day, index) => {
      const x = PADDING_X + (index / Math.max(1, count - 1)) * usableWidth;
      const y = VIEW_HEIGHT - PADDING_BOTTOM - (day.total / maxDisplayedTotal) * usableHeight;
      return { x, y, day };
    });
  }, [displayedDays, usableWidth, usableHeight, maxDisplayedTotal]);

  // เส้นโค้งและพื้นที่
  const curvedLinePath = useMemo(() => getCurvedPath(coordinates), [coordinates]);
  const areaPath = useMemo(() => {
    if (coordinates.length === 0) return '';
    return `${curvedLinePath} L ${coordinates[coordinates.length - 1].x.toFixed(1)} ${VIEW_HEIGHT - PADDING_BOTTOM} L ${coordinates[0].x.toFixed(1)} ${VIEW_HEIGHT - PADDING_BOTTOM} Z`;
  }, [curvedLinePath, coordinates]);

  // พิกัดของเส้นเฉลี่ย
  const avgY = useMemo(() => {
    if (maxDisplayedTotal <= 0) return VIEW_HEIGHT - PADDING_BOTTOM;
    const clampedAvg = Math.min(avgDaily, maxDisplayedTotal);
    return VIEW_HEIGHT - PADDING_BOTTOM - (clampedAvg / maxDisplayedTotal) * usableHeight;
  }, [avgDaily, maxDisplayedTotal, usableHeight]);

  // ข้อมูลสำหรับจุดที่กำลัง Hover
  const hoveredPoint = useMemo(() => {
    if (!hoveredDay) return null;
    return coordinates.find((c) => c.day.dateStr === hoveredDay.dateStr) ?? null;
  }, [hoveredDay, coordinates]);

  // ตารางข้อมูลรายวันหลัง Sort และ Filter
  const tableData = useMemo(() => {
    let result = [...allDays];
    if (onlyWithSales) {
      result = result.filter((d) => d.total > 0);
    }
    if (tableSort === 'date-desc') {
      result.sort((a, b) => b.dayNum - a.dayNum);
    } else if (tableSort === 'sales-desc') {
      result.sort((a, b) => b.total - a.total);
    } else {
      result.sort((a, b) => a.dayNum - b.dayNum);
    }
    return result;
  }, [allDays, onlyWithSales, tableSort]);

  return (
    <div className="flex flex-col gap-5">
      {/* 1. แถบสถิติสรุป 4 มิติระดับพรีเมียม */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* ยอดขายรวมทั้งเดือน */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4 transition-all hover:border-emerald-200 hover:shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              ยอดรวมทั้งเดือน
            </span>
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
              {activeDaysCount}/{allDays.length} วัน
            </span>
          </div>
          <p className="num mt-2 text-2xl font-bold tracking-tight text-zinc-900">
            {formatBaht(totalMonthSales)}
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            มีบิลขาย <span className="num font-semibold text-zinc-700">{activeDaysCount}</span> วันในเดือนนี้
          </p>
        </div>

        {/* เฉลี่ยต่อวันขาย */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4 transition-all hover:border-emerald-200 hover:shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              เฉลี่ยต่อวันขาย
            </span>
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
              วันเปิดขาย
            </span>
          </div>
          <p className="num mt-2 text-2xl font-bold tracking-tight text-zinc-900">
            {formatBaht(avgDaily)}
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            คำนวณจากเฉพาะวันที่มียอดเข้า
          </p>
        </div>

        {/* วันขายดีที่สุด (Peak Day) */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4 transition-all hover:border-amber-200 hover:shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              วันขายดีที่สุด
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
              <StarIcon className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
              Peak
            </span>
          </div>
          <p className="num mt-2 text-2xl font-bold tracking-tight text-zinc-900">
            {peakDay && peakDay.total > 0 ? formatBaht(peakDay.total) : '-'}
          </p>
          <p className="mt-1 text-[11px] font-medium text-amber-700 truncate">
            {peakDay && peakDay.total > 0 ? `${peakDay.fullDateLabel.split(' ')[0]} ${peakDay.label}` : 'ยังไม่มีข้อมูล'}
          </p>
        </div>

        {/* ประมาณการสิ้นเดือน (Run-rate Projection) */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4 transition-all hover:border-emerald-200 hover:shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              ประมาณการสิ้นเดือน
            </span>
            <span className="inline-flex items-center rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-700">
              แนวโน้ม
            </span>
          </div>
          <p className="num mt-2 text-2xl font-bold tracking-tight text-zinc-900">
            {formatBaht(projectedTotal)}
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            ตามอัตราเฉลี่ยการขายปัจจุบัน
          </p>
        </div>
      </div>

      {/* 2. คอนเทนเนอร์กราฟหลัก พร้อมแผงควบคุม Interactive */}
      <div className="relative rounded-xl border border-zinc-200 bg-white p-5 shadow-xs">
        {/* แถบควบคุมบนหัวกราฟ */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-3">
          {/* ตัวเลือกช่วงวัน (Range Filters) */}
          <div className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50/80 p-0.5">
            {[
              { id: 'ALL', label: 'ทั้งเดือน' },
              { id: 'H1', label: '1 - 15' },
              { id: 'H2', label: '16 - สิ้นเดือน' },
              { id: '7D', label: '7 วันล่าสุด' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRangeFilter(tab.id as RangeFilter)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                  rangeFilter === tab.id
                    ? 'bg-white text-zinc-900 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ปุ่มสลับโหมดกราฟ & เปิดปิดเส้นเฉลี่ย */}
          <div className="flex items-center gap-2">
            {/* สวิตช์เปิด/ปิดเส้นเฉลี่ย */}
            <button
              type="button"
              onClick={() => setShowAvgLine(!showAvgLine)}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all ${
                showAvgLine
                  ? 'border-amber-200 bg-amber-50/80 text-amber-800'
                  : 'border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50'
              }`}
              title="เปิด/ปิดเส้นประแสดงค่าเฉลี่ยรายวัน"
            >
              <span className={`h-1.5 w-1.5 rounded-full ${showAvgLine ? 'bg-amber-500' : 'bg-zinc-400'}`} />
              <span>เส้นเฉลี่ย</span>
            </button>

            {/* ปุ่มสลับโหมด Spline / Bar */}
            <div className="flex items-center rounded-lg border border-zinc-200 bg-zinc-50/80 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('spline')}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                  viewMode === 'spline'
                    ? 'bg-white text-emerald-700 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
                title="ดูกราฟพื้นที่เส้นโค้งมน"
              >
                เส้นโค้ง
              </button>
              <button
                type="button"
                onClick={() => setViewMode('bar')}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                  viewMode === 'bar'
                    ? 'bg-white text-emerald-700 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
                title="ดูกราฟแท่งเปรียบเทียบ"
              >
                แท่ง
              </button>
            </div>
          </div>
        </div>

        {/* กล่อง Floating Tooltip แบบไดนามิกติดตามจุด Hover */}
        {hoveredPoint && (
          <div
            className="pointer-events-none absolute z-20 transition-all duration-75 ease-out"
            style={{
              left: `${(hoveredPoint.x / VIEW_WIDTH) * 100}%`,
              top: `${Math.max(20, (hoveredPoint.y / VIEW_HEIGHT) * 100)}%`,
              transform: 'translate(-50%, -115%)',
            }}
          >
            <div className="w-52 rounded-xl border border-zinc-200 bg-white/95 p-3 text-xs shadow-xl backdrop-blur-md">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-1.5">
                <span className="font-semibold text-zinc-800">
                  {hoveredPoint.day.label} ({hoveredPoint.day.thaiDayName.slice(0, 3)})
                </span>
                {hoveredPoint.day.isWeekend && (
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                    สุดสัปดาห์
                  </span>
                )}
                {peakDay && peakDay.dateStr === hoveredPoint.day.dateStr && hoveredPoint.day.total > 0 && (
                  <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                    <TrophyIcon className="h-3 w-3" />
                    <span>สูงสุด</span>
                  </span>
                )}
              </div>

              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-[11px] text-zinc-500">ยอดขายสุทธิ</span>
                <span className="num text-sm font-bold text-zinc-900">
                  {formatBaht(hoveredPoint.day.total)}
                </span>
              </div>

              {/* เปรียบเทียบกับค่าเฉลี่ย */}
              {hoveredPoint.day.total > 0 && avgDaily > 0 && (
                <div className="mt-1.5 flex items-center justify-between text-[11px]">
                  <span className="text-zinc-400">เทียบค่าเฉลี่ย</span>
                  {hoveredPoint.day.total >= avgDaily ? (
                    <span className="font-medium text-emerald-600">
                      +{Math.round(((hoveredPoint.day.total - avgDaily) / avgDaily) * 100)}% สูงกว่า
                    </span>
                  ) : (
                    <span className="font-medium text-amber-600">
                      -{Math.round(((avgDaily - hoveredPoint.day.total) / avgDaily) * 100)}% ต่ำกว่า
                    </span>
                  )}
                </div>
              )}

              {/* สัดส่วนต่อยอดขายทั้งเดือน */}
              {totalMonthSales > 0 && hoveredPoint.day.total > 0 && (
                <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-400">
                  <span>สัดส่วนทั้งเดือน</span>
                  <span className="num font-semibold text-zinc-700">
                    {((hoveredPoint.day.total / totalMonthSales) * 100).toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
            {/* ลูกศรชี้ลงใต้ Tooltip */}
            <div className="mx-auto h-2 w-2 -translate-y-1 rotate-45 border-b border-r border-zinc-200 bg-white" />
          </div>
        )}

        {/* SVG Canvas แสดงผลกราฟ */}
        <div className="relative">
          <svg
            viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
            className="h-64 w-full overflow-visible select-none"
            role="img"
            aria-label={`กราฟสรุปยอดขายประจำเดือน สูงสุด ${formatBaht(maxDisplayedTotal)}`}
          >
            <defs>
              {/* Gradient เติมพื้นที่ใต้กราฟเส้น */}
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
                <stop offset="60%" stopColor="#10b981" stopOpacity="0.06" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
              </linearGradient>

              {/* Gradient สำหรับแท่งกราฟ Bar */}
              <linearGradient id={`${gradientId}-bar`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#059669" stopOpacity="0.75" />
              </linearGradient>

              {/* Soft Drop Shadow สำหรับเส้นกราฟ */}
              <filter id={shadowFilterId} x="-5%" y="-10%" width="110%" height="130%">
                <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#10b981" floodOpacity="0.22" />
              </filter>
            </defs>

            {/* เส้นกริดแนวนอน (Horizontal Gridlines) */}
            {[0, 0.33, 0.66, 1].map((ratio) => {
              const y = VIEW_HEIGHT - PADDING_BOTTOM - ratio * usableHeight;
              const val = Math.round(ratio * maxDisplayedTotal);
              return (
                <g key={ratio}>
                  <line
                    x1={PADDING_X}
                    y1={y}
                    x2={VIEW_WIDTH - PADDING_X}
                    y2={y}
                    stroke="#e4e4e7"
                    strokeWidth="1"
                    strokeDasharray={ratio === 0 ? undefined : '4 4'}
                    opacity={ratio === 0 ? 0.8 : 0.45}
                  />
                  {/* ตัวเลขกำกับแกน Y ทางซ้าย */}
                  <text
                    x={PADDING_X - 8}
                    y={y + 3.5}
                    textAnchor="end"
                    className="num"
                    fontSize="10"
                    fill="#a1a1aa"
                  >
                    {val >= 1000 ? `${Math.round(val / 1000)}k` : val}
                  </text>
                </g>
              );
            })}

            {/* แถบไฮไลต์วันหยุดสุดสัปดาห์ (Weekend Subtle Tint) */}
            {coordinates.map((pt, i) => {
              if (!pt.day.isWeekend) return null;
              const colWidth = usableWidth / Math.max(1, coordinates.length);
              return (
                <rect
                  key={`wk-${pt.day.dateStr}`}
                  x={pt.x - colWidth / 2}
                  y={PADDING_TOP}
                  width={colWidth}
                  height={usableHeight}
                  fill="#f4f4f5"
                  opacity="0.35"
                />
              );
            })}

            {/* เส้นประเปรียบเทียบค่าเฉลี่ย (Benchmark Average Line) */}
            {showAvgLine && avgDaily > 0 && (
              <g className="transition-opacity duration-200">
                <line
                  x1={PADDING_X}
                  y1={avgY}
                  x2={VIEW_WIDTH - PADDING_X}
                  y2={avgY}
                  stroke="#f59e0b"
                  strokeWidth="1.5"
                  strokeDasharray="5 5"
                  opacity="0.75"
                />
                <rect
                  x={VIEW_WIDTH - PADDING_X - 86}
                  y={avgY - 9}
                  width="86"
                  height="18"
                  rx="4"
                  fill="#fef3c7"
                  stroke="#fde68a"
                  strokeWidth="1"
                />
                <text
                  x={VIEW_WIDTH - PADDING_X - 43}
                  y={avgY + 3.5}
                  textAnchor="middle"
                  className="num font-semibold"
                  fontSize="10"
                  fill="#92400e"
                >
                  เฉลี่ย ฿{Math.round(avgDaily).toLocaleString('th-TH')}
                </text>
              </g>
            )}

            {/* โหมด 1: กราฟเส้นโค้งและพื้นที่ (Smooth Spline Area) */}
            {viewMode === 'spline' && (
              <>
                {/* พื้นที่ Gradient ใต้เส้น */}
                <path d={areaPath} fill={`url(#${gradientId})`} />

                {/* เส้นกราฟหลักโค้งมน พร้อมเงา */}
                <path
                  d={curvedLinePath}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter={`url(#${shadowFilterId})`}
                />
              </>
            )}

            {/* โหมด 2: กราฟแท่งโมเดิร์น (Rounded Modern Bar Chart) */}
            {viewMode === 'bar' &&
              coordinates.map((pt) => {
                const barWidth = Math.max(6, Math.min(26, (usableWidth / coordinates.length) * 0.65));
                const barHeight = Math.max(0, VIEW_HEIGHT - PADDING_BOTTOM - pt.y);
                const isHovered = hoveredDay?.dateStr === pt.day.dateStr;
                const isPeak = peakDay?.dateStr === pt.day.dateStr && pt.day.total > 0;

                return (
                  <g key={`bar-${pt.day.dateStr}`}>
                    {/* แท่งโครงพื้นหลังจางๆ */}
                    <rect
                      x={pt.x - barWidth / 2}
                      y={PADDING_TOP}
                      width={barWidth}
                      height={usableHeight}
                      rx="3"
                      fill="#f4f4f5"
                      opacity="0.4"
                    />

                    {/* แท่งยอดขายจริง */}
                    {barHeight > 0 && (
                      <rect
                        x={pt.x - barWidth / 2}
                        y={pt.y}
                        width={barWidth}
                        height={barHeight}
                        rx="4"
                        fill={isPeak ? '#f59e0b' : isHovered ? '#059669' : `url(#${gradientId}-bar)`}
                        className="transition-all duration-150"
                      />
                    )}
                  </g>
                );
              })}

            {/* เส้นแกนดิ่ง Crosshair แสดงตำแหน่งวันที่ Hover */}
            {hoveredPoint && (
              <line
                x1={hoveredPoint.x}
                y1={PADDING_TOP}
                x2={hoveredPoint.x}
                y2={VIEW_HEIGHT - PADDING_BOTTOM}
                stroke="#10b981"
                strokeWidth="1.5"
                strokeDasharray="3 3"
                opacity="0.6"
              />
            )}

            {/* จุดพิกัด Interactive Dots บนเส้นกราฟ */}
            {coordinates.map((pt) => {
              const isHovered = hoveredDay?.dateStr === pt.day.dateStr;
              const isPeak = peakDay?.dateStr === pt.day.dateStr && pt.day.total > 0;
              const hasSales = pt.day.total > 0;

              return (
                <g
                  key={pt.day.dateStr}
                  onMouseEnter={() => setHoveredDay(pt.day)}
                  onMouseLeave={() => setHoveredDay(null)}
                  className="cursor-pointer"
                >
                  {/* วงแหวนเรืองแสงของ Peak Day */}
                  {isPeak && (
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="9"
                      fill="#f59e0b"
                      opacity="0.2"
                      className="animate-pulse"
                    />
                  )}

                  {/* วงแหวนรอบจุดเมื่อ Hover */}
                  {isHovered && (
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="8"
                      fill="#10b981"
                      opacity="0.25"
                    />
                  )}

                  {/* จุด Data Point จริง (แสดงเฉพาะโหมดเส้น หรือเมื่อ hover) */}
                  {(viewMode === 'spline' || isHovered || isPeak) && (
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isHovered ? 5.5 : isPeak ? 4.5 : hasSales ? 3 : 2}
                      fill={isPeak ? '#f59e0b' : isHovered ? '#059669' : hasSales ? '#10b981' : '#d4d4d8'}
                      stroke="#ffffff"
                      strokeWidth={isHovered || isPeak ? 2 : 1.5}
                      className="transition-all duration-150"
                    />
                  )}

                  {/* จุดตรวจจับการสัมผัส/เมาส์ขนาดใหญ่ (Invisible touch target) */}
                  <rect
                    x={pt.x - usableWidth / coordinates.length / 2}
                    y={PADDING_TOP}
                    width={usableWidth / coordinates.length}
                    height={usableHeight + PADDING_BOTTOM}
                    fill="transparent"
                  />
                </g>
              );
            })}
          </svg>

          {/* ป้ายกำกับวันที่แกน X ด้านล่าง */}
          <div className="mt-2 flex justify-between px-3 text-[11px] font-medium text-zinc-400 select-none">
            <span>{displayedDays[0]?.label}</span>
            {displayedDays.length > 8 && (
              <span>{displayedDays[Math.floor(displayedDays.length / 2)]?.label}</span>
            )}
            <span>{displayedDays[displayedDays.length - 1]?.label}</span>
          </div>
        </div>
      </div>

      {/* 3. ตารางวิเคราะห์ข้อมูลรายวันแบบละเอียด (Interactive Synced Table) */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-zinc-50/70 px-4 py-3">
          <div>
            <h3 className="text-xs font-semibold text-zinc-800">
              รายละเอียดรายวัน ({tableData.length} วัน)
            </h3>
            <p className="text-[11px] text-zinc-400">
              ชี้เมาส์เพื่อไฮไลต์จุดบนกราฟ หรือกดเลือกเรียงลำดับ
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* ตัวกรองเฉพาะวันมียอด */}
            <label className="flex items-center gap-1.5 text-xs text-zinc-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyWithSales}
                onChange={(e) => setOnlyWithSales(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>เฉพาะวันมียอดขาย</span>
            </label>

            {/* ตัวเลือกการเรียงลำดับ */}
            <div className="w-48">
              <CustomSelect
                value={tableSort}
                onChange={(val) => setTableSort(val as any)}
                options={[
                  { value: 'date-asc', label: 'เรียงวันที่ (1 - สิ้นเดือน)' },
                  { value: 'date-desc', label: 'เรียงวันที่ (ล่าสุดก่อน)' },
                  { value: 'sales-desc', label: 'เรียงยอดขาย (มากไปน้อย)' },
                ]}
              />
            </div>
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-zinc-50/95 text-xs font-medium uppercase tracking-wider text-zinc-400 border-b border-zinc-200 backdrop-blur-xs">
              <tr>
                <th scope="col" className="px-4 py-2.5">วันที่</th>
                <th scope="col" className="px-4 py-2.5 text-center">ประเภทวัน</th>
                <th scope="col" className="px-4 py-2.5 text-right">ยอดขายสุทธิ</th>
                <th scope="col" className="px-4 py-2.5">สัดส่วนเทียบวันสูงสุด</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-zinc-800">
              {tableData.map((day) => {
                const isHovered = hoveredDay?.dateStr === day.dateStr;
                const isPeak = peakDay?.dateStr === day.dateStr && day.total > 0;
                const percentOfMax = peakDay && peakDay.total > 0 ? (day.total / peakDay.total) * 100 : 0;

                return (
                  <tr
                    key={day.dateStr}
                    onMouseEnter={() => setHoveredDay(day)}
                    onMouseLeave={() => setHoveredDay(null)}
                    className={`transition-colors cursor-pointer ${
                      isHovered ? 'bg-emerald-50/70 font-medium' : 'hover:bg-zinc-50/80'
                    }`}
                  >
                    <td className="px-4 py-2.5 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-zinc-800">{day.label}</span>
                        {isPeak && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.2 text-[10px] font-bold text-amber-800">
                            <StarIcon className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
                            สูงสุด
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-2.5 text-center text-xs">
                      {day.isWeekend ? (
                        <span className="rounded bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                          {day.thaiDayName}
                        </span>
                      ) : (
                        <span className="text-[11px] text-zinc-400">
                          {day.thaiDayName}
                        </span>
                      )}
                    </td>

                    <td className={`num px-4 py-2.5 text-right text-xs font-semibold ${
                      day.total > 0 ? 'text-zinc-900' : 'text-zinc-300'
                    }`}>
                      {day.total > 0 ? formatBaht(day.total) : '-'}
                    </td>

                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="h-2 w-full max-w-[120px] overflow-hidden rounded-full bg-zinc-100">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              isPeak ? 'bg-amber-500' : 'bg-emerald-600'
                            }`}
                            style={{ width: `${percentOfMax}%` }}
                          />
                        </div>
                        <span className="num text-[11px] text-zinc-400 w-8 text-right">
                          {percentOfMax > 0 ? `${Math.round(percentOfMax)}%` : ''}
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
