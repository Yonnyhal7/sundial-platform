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

const compactHexInputClass =
  "h-8 w-32 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold uppercase text-slate-950 outline-none transition focus:border-[var(--school-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--school-primary)_20%,transparent)] dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-white";

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

  if (compact) {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
          {label}
        </span>
        {description && <span className="sr-only">{description}</span>}
        <div className="flex flex-wrap items-center gap-1.5">
          {SCHEDULE_COLOR_PRESETS.map((preset) => {
            const selected = normalized === preset.value;

            return (
              <button
                key={preset.name}
                type="button"
                onClick={() => updateColor(preset.value)}
                className={[
                  "grid h-8 w-8 place-items-center rounded-full border border-slate-200 bg-white transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[#D4A017]/35 dark:border-slate-700 dark:bg-[#242424] dark:hover:bg-white/10",
                  selected ? "ring-2 ring-[#D4A017] ring-offset-2 ring-offset-white dark:ring-offset-[#242424]" : "",
                ].join(" ")}
                aria-label={`Select ${preset.name} calendar color`}
                aria-pressed={selected}
                title={preset.name}
              >
                <span
                  className="grid h-4 w-4 place-items-center rounded-full border"
                  style={getScheduleDotStyle(preset.value)}
                  aria-hidden="true"
                >
                  {selected && <span className="h-1.5 w-1.5 rounded-full bg-white shadow-sm" />}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => updateColor("")}
            className={[
              "grid h-8 w-8 place-items-center rounded-full border border-slate-200 bg-white transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[#D4A017]/35 dark:border-slate-700 dark:bg-[#242424] dark:hover:bg-white/10",
              !normalized ? "ring-2 ring-[#D4A017] ring-offset-2 ring-offset-white dark:ring-offset-[#242424]" : "",
            ].join(" ")}
            aria-label="Select Auto calendar color"
            aria-pressed={!normalized}
            title="Auto"
          >
            <span
              className="grid h-4 w-4 place-items-center rounded-full border border-dashed border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-800"
              aria-hidden="true"
            >
              {!normalized && <span className="h-1.5 w-1.5 rounded-full bg-slate-500 dark:bg-slate-200" />}
            </span>
          </button>
        </div>
        <input
          type="color"
          aria-label={`${label} picker`}
          value={normalized || DEFAULT_SCHEDULE_COLOR}
          onChange={(event) => updateColor(event.target.value)}
          className="h-8 w-9 cursor-pointer rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-[#242424]"
        />
        <input
          id={name}
          name={name}
          value={draftColor}
          onChange={(event) => updateColor(event.target.value)}
          placeholder="#D4A017"
          pattern="#?[0-9A-Fa-f]{6}"
          className={compactHexInputClass}
          aria-invalid={hasInvalidColor}
          aria-label={`${label} hex value`}
        />
        {hasInvalidColor && (
          <span className="basis-full text-xs font-bold text-red-600 dark:text-red-300">
            Enter a 6-digit hex color like #D4A017.
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={
        compact
          ? "rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-black/20"
          : "rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-[#3a3a3a] dark:bg-black/30"
      }
    >
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

      <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-[#242424]">
        <span className="text-xs font-bold text-slate-500 dark:text-slate-300">
          Current color
        </span>
        <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-200">
          <span
            className="h-5 w-5 rounded-full border"
            style={previewStyle}
            aria-hidden="true"
          />
          {normalized || "Auto"}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {SCHEDULE_COLOR_PRESETS.map((preset) => (
          <button
            key={preset.name}
            type="button"
            onClick={() => updateColor(preset.value)}
            className="inline-flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-[#242424] dark:text-slate-200 dark:hover:bg-white/10"
          >
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-full border"
              style={getScheduleDotStyle(preset.value)}
              aria-hidden="true"
            />
            <span className="truncate">{preset.name}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => updateColor("")}
          className="inline-flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-[#242424] dark:text-slate-300 dark:hover:bg-white/10"
        >
          <span
            className="h-3.5 w-3.5 shrink-0 rounded-full border border-dashed border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-800"
            aria-hidden="true"
          />
          <span className="truncate">Auto</span>
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[3rem_minmax(0,1fr)] sm:items-center">
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
      </div>

      {hasInvalidColor && (
        <p className="mt-2 text-xs font-bold text-red-600 dark:text-red-300">
          Enter a 6-digit hex color like #D4A017.
        </p>
      )}
    </div>
  );
}
