"use client";

import { useMemo, useState } from "react";
import {
  DEFAULT_SCHEDULE_COLOR,
  SCHEDULE_COLOR_PRESETS,
  getScheduleDotStyle,
  normalizeHexColor,
} from "@/lib/scheduleColors";

const colorInputClass =
  "rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-[var(--school-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--school-primary)_20%,transparent)] dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-white";

export function ScheduleColorField({
  name = "calendar_color",
  value,
  onChange,
  label = "Calendar color",
  description = "Used for calendar dots and schedule legends.",
  compact = false,
}: {
  name?: string;
  value?: string | null;
  onChange?: (value: string | null) => void;
  label?: string;
  description?: string;
  compact?: boolean;
}) {
  const initial = normalizeHexColor(value) || "";
  const [draftColor, setDraftColor] = useState(initial);
  const normalized = normalizeHexColor(draftColor);
  const previewColor = normalized || DEFAULT_SCHEDULE_COLOR;
  const previewStyle = useMemo(() => getScheduleDotStyle(previewColor), [previewColor]);
  const hasInvalidColor = draftColor.trim() !== "" && !normalized;

  function updateColor(nextValue: string) {
    setDraftColor(nextValue);
    onChange?.(normalizeHexColor(nextValue));
  }

  return (
    <div
      className={
        compact
          ? "rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-black/20"
          : "rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-[#3a3a3a] dark:bg-black/30"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <label className="text-sm font-bold text-slate-800 dark:text-slate-100" htmlFor={name}>
            {label}
          </label>
          {description && (
            <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
              {description}
            </p>
          )}
        </div>
        <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-300">
          <span
            className="h-4 w-4 rounded-full border"
            style={previewStyle}
            aria-hidden="true"
          />
          Preview
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[3rem_minmax(0,12rem)_1fr] sm:items-center">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={normalized || DEFAULT_SCHEDULE_COLOR}
          onChange={(event) => updateColor(event.target.value)}
          className="h-11 w-12 cursor-pointer rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-[#242424]"
        />
        <input
          id={name}
          name={name}
          value={draftColor}
          onChange={(event) => updateColor(event.target.value)}
          placeholder="#D4A017"
          pattern="#?[0-9A-Fa-f]{6}"
          className={colorInputClass}
          aria-invalid={hasInvalidColor}
        />
        <div className="flex flex-wrap gap-2">
          {SCHEDULE_COLOR_PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => updateColor(preset.value)}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-[#242424] dark:text-slate-200 dark:hover:bg-white/10"
            >
              <span
                className="h-3.5 w-3.5 rounded-full border"
                style={getScheduleDotStyle(preset.value)}
                aria-hidden="true"
              />
              {preset.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => updateColor("")}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-[#242424] dark:text-slate-300 dark:hover:bg-white/10"
          >
            Auto
          </button>
        </div>
      </div>

      {hasInvalidColor && (
        <p className="mt-2 text-xs font-bold text-red-600 dark:text-red-300">
          Enter a 6-digit hex color like #D4A017.
        </p>
      )}
    </div>
  );
}
