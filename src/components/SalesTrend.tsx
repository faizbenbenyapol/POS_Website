import { formatBaht } from '@/lib/format';

/** ยอดขาย 1 วันที่ได้จาก API */
type TrendPoint = { sale_date: string; total: string };

/** จำนวนวันที่กราฟแสดง */
const TREND_DAYS = 7;

/** ขนาดพื้นที่วาดกราฟในหน่วยพิกัดของ SVG (สเกลตามความกว้างจริงของจอ) */
const VIEW_WIDTH = 700;
const VIEW_HEIGHT = 160;
const PADDING_Y = 12;

/** ยอดขายรายวันหลังเติมวันที่ไม่มีบิลให้ครบ 7 วัน */
type FilledDay = { date: Date; label: string; total: number };

/**
 * เติมวันที่ไม่มีบิลปิดให้เป็นยอด 0 เพื่อให้กราฟกินพื้นที่ครบ 7 วันเสมอ
 * ถ้าไม่เติม วันที่ร้านปิดจะหายไปจากแกน ทำให้เส้นดูเหมือนขายได้ทุกวัน
 *
 * @param points - ยอดขายรายวันเท่าที่มีในฐานข้อมูล
 * @returns อาร์เรย์ 7 วันเรียงจากเก่าไปใหม่
 */
function fillMissingDays(points: TrendPoint[]): FilledDay[] {
  const byDate = new Map<string, number>();
  for (const point of points) {
    byDate.set(new Date(point.sale_date).toDateString(), Number(point.total));
  }

  const days: FilledDay[] = [];
  for (let offset = TREND_DAYS - 1; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    days.push({
      date,
      label: new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short' }).format(date),
      total: byDate.get(date.toDateString()) ?? 0,
    });
  }
  return days;
}

/**
 * กราฟเส้นยอดขายรายวัน 7 วันล่าสุด วาดด้วย SVG ตรง ๆ ไม่ใช้ไลบรารีกราฟ
 * เป็นเส้นเรียบไม่มี gradient ใต้เส้นตามข้อกำหนดหัวข้อ 13
 * มีตารางตัวเลขกำกับใต้กราฟ เพื่อให้อ่านค่าจริงได้และไม่สื่อความหมายด้วยภาพอย่างเดียว
 *
 * @param points - ยอดขายรายวันจาก API
 * @returns กราฟเส้นพร้อมตัวเลขกำกับรายวัน
 */
export default function SalesTrend({ points }: { points: TrendPoint[] }) {
  const days = fillMissingDays(points);
  const maxTotal = Math.max(1, ...days.map((day) => day.total));

  const coordinates = days.map((day, index) => {
    const x = (index / (TREND_DAYS - 1)) * VIEW_WIDTH;
    const y =
      VIEW_HEIGHT - PADDING_Y - (day.total / maxTotal) * (VIEW_HEIGHT - PADDING_Y * 2);
    return { x, y, day };
  });

  const linePath = coordinates
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');

  return (
    <div className="mt-3 flex flex-col gap-3">
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="h-40 w-full"
        role="img"
        aria-label={`กราฟยอดขาย ${TREND_DAYS} วันล่าสุด สูงสุด ${formatBaht(maxTotal)} บาท`}
      >
        <line
          x1="0"
          y1={VIEW_HEIGHT - PADDING_Y}
          x2={VIEW_WIDTH}
          y2={VIEW_HEIGHT - PADDING_Y}
          stroke="var(--color-rule)"
          strokeWidth="1"
        />
        <path d={linePath} fill="none" stroke="var(--color-slip)" strokeWidth="2" />
        {coordinates.map((point) => (
          <circle
            key={point.day.date.toISOString()}
            cx={point.x}
            cy={point.y}
            r="3"
            fill="var(--color-slip)"
          />
        ))}
      </svg>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[28rem] border-collapse">
          <caption className="sr-only">ยอดขายรายวัน {TREND_DAYS} วันล่าสุด</caption>
          <tbody>
            <tr className="border-b border-rule">
              {days.map((day) => (
                <th
                  key={`label-${day.date.toISOString()}`}
                  scope="col"
                  className="num px-1 py-1 text-right text-sm font-normal text-slip-dim"
                >
                  {day.label}
                </th>
              ))}
            </tr>
            <tr>
              {days.map((day) => (
                <td
                  key={`value-${day.date.toISOString()}`}
                  className="num px-1 py-1 text-right text-sm text-slip"
                >
                  {formatBaht(day.total)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
