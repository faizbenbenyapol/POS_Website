'use client';

import { VolumeIcon } from '@/components/Icons';
import { playNewOrderSound, type SoundTone } from './orderSound';

/** ตัวเลือกโทนเสียงที่ให้พนักงานเลือกได้ พร้อมสีตอนถูกเลือก */
const TONE_OPTIONS: { value: SoundTone; label: string; activeClass: string }[] = [
  { value: 'CHIME', label: 'ละมุน (Chime)', activeClass: 'bg-white text-zinc-900 shadow-xs font-bold' },
  { value: 'BELL', label: 'กริ่งครัว (Bell)', activeClass: 'bg-white text-amber-900 shadow-xs font-bold' },
  { value: 'ALERT', label: 'เตือนด่วน (Alert)', activeClass: 'bg-white text-red-700 shadow-xs font-bold' },
];

/**
 * แผงตั้งค่าเสียงแจ้งเตือนออเดอร์ใหม่ (โทนเสียงและระดับความดัง)
 * ปกติถูกซ่อนไว้ เปิดจากเมนูคำสั่งเพิ่มเติมบนแถบเครื่องมือ เพราะเป็นค่าที่ตั้งครั้งเดียวจบ
 *
 * @param tone - โทนเสียงที่เลือกอยู่
 * @param volume - ระดับความดังปัจจุบัน (0.0 ถึง 1.0)
 * @param onChangeTone - เรียกเมื่อเลือกโทนเสียงใหม่
 * @param onChangeVolume - เรียกเมื่อเลื่อนปรับระดับความดัง
 * @returns แผงตั้งค่าเสียงพร้อมปุ่มทดสอบฟังเสียงจริง
 */
export default function SoundSettings({
  tone,
  volume,
  onChangeTone,
  onChangeVolume,
}: {
  tone: SoundTone;
  volume: number;
  onChangeTone: (tone: SoundTone) => void;
  onChangeVolume: (volume: number) => void;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3.5 shadow-xs flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-800">โทนเสียง:</span>
          <div className="flex rounded-lg bg-zinc-100 p-0.5 border border-zinc-200">
            {TONE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onChangeTone(option.value)}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-all cursor-pointer ${
                  tone === option.value ? option.activeClass : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <VolumeIcon className="w-4 h-4 text-zinc-500" />
          <span className="text-sm font-medium text-zinc-600">
            ระดับเสียง: {Math.round(volume * 100)}%
          </span>
          <input
            type="range"
            min={0.1}
            max={1.0}
            step={0.05}
            value={volume}
            onChange={(e) => onChangeVolume(Number(e.target.value))}
            className="w-24 accent-emerald-600 cursor-pointer"
            aria-label="ระดับความดังของเสียงแจ้งเตือน"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => playNewOrderSound(tone, volume)}
        className="flex min-h-[40px] items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 transition-colors shadow-2xs cursor-pointer"
      >
        <VolumeIcon className="w-4 h-4" />
        <span>ทดสอบเสียง ({tone})</span>
      </button>
    </div>
  );
}
