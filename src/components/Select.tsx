'use client';

import { useState, useRef, useEffect, ReactNode } from 'react';
import { ChevronDownIcon, CheckIcon } from '@/components/Icons';

export type SelectOption = {
  value: string;
  label: string;
  icon?: ReactNode;
};

export type CustomSelectProps = {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  icon?: ReactNode;
  className?: string;
  disabled?: boolean;
};

/**
 * Custom Dropdown สไตล์ Commercial Minimal
 * ควบคุมความสูง 42px มาตรฐาน มี Chevron SVG, Hover, Focus Ring และ Active State สม่ำเสมอทั้งระบบ
 */
export default function CustomSelect({
  id,
  label,
  value,
  onChange,
  options,
  placeholder = 'เลือกรายการ...',
  icon,
  className = '',
  disabled = false,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`flex flex-col gap-1.5 ${className}`} ref={containerRef}>
      {label && (
        <label htmlFor={id} className="text-xs font-semibold text-slate-600">
          {label}
        </label>
      )}
      <div className="relative">
        <button
          id={id}
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen((prev) => !prev)}
          className={`flex min-h-[42px] w-full items-center justify-between gap-2.5 rounded-xl border bg-white px-3.5 text-sm text-slate-900 transition-all hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 ${
            isOpen ? 'border-emerald-600 ring-2 ring-emerald-600/20' : 'border-slate-200'
          } ${disabled ? 'cursor-not-allowed opacity-50 bg-slate-50' : 'cursor-pointer'}`}
        >
          <div className="flex items-center gap-2.5 truncate">
            {icon && <span className="shrink-0 text-slate-400">{icon}</span>}
            <span className={`truncate text-sm ${selectedOption ? 'font-medium text-slate-900' : 'text-slate-400'}`}>
              {selectedOption ? selectedOption.label : placeholder}
            </span>
          </div>

          <ChevronDownIcon
            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-emerald-600' : ''
            }`}
          />
        </button>

        {/* Dropdown Menu — Slate Border & Crisp Shadow */}
        {isOpen && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl overscroll-contain animate-in fade-in zoom-in-95 duration-100">
            {options.length === 0 ? (
              <div className="px-4 py-3 text-center text-xs text-slate-400">ไม่มีตัวเลือก</div>
            ) : (
              options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                    className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm transition-colors cursor-pointer text-left ${
                      isSelected
                        ? 'bg-emerald-50 font-semibold text-emerald-800'
                        : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    {option.icon && <span className="shrink-0">{option.icon}</span>}
                    <span className="truncate flex-1">{option.label}</span>
                    {isSelected && (
                      <CheckIcon className="h-4 w-4 shrink-0 text-emerald-600 ml-auto" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
