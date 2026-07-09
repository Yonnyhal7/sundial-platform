"use client";

import { useState } from "react";

type ColorFieldProps = {
  label: string;
  name: string;
  initialValue: string;
};

function normalizeColor(value: string, fallback: string) {
  const trimmed = value.trim();
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed.toUpperCase() : fallback;
}

export default function ColorField({
  label,
  name,
  initialValue,
}: ColorFieldProps) {
  const fallback = normalizeColor(initialValue, "#2563EB");
  const [color, setColor] = useState(fallback);

  function updateColor(value: string) {
    setColor(value.toUpperCase());
  }

  function commitTextValue(value: string) {
    const withHash = value.startsWith("#") ? value : `#${value}`;
    setColor(normalizeColor(withHash, color));
  }

  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
        {label}
      </span>
      <div className="mt-2 flex min-h-16 items-center gap-3 rounded-xl border border-slate-200 bg-white p-2 dark:border-[#3a3a3a] dark:bg-[#242424]">
        <span
          className="h-12 w-16 shrink-0 rounded-lg border border-slate-200 shadow-inner dark:border-[#3a3a3a]"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
        <input
          name={name}
          value={color}
          onChange={(event) => updateColor(event.target.value)}
          onBlur={(event) => commitTextValue(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-base font-black uppercase text-slate-950 outline-none dark:text-white"
          aria-label={`${label} hex value`}
        />
        <input
          type="color"
          value={color}
          onChange={(event) => updateColor(event.target.value)}
          className="h-12 w-12 shrink-0 cursor-pointer rounded-lg border border-slate-200 bg-transparent p-1 dark:border-[#3a3a3a]"
          aria-label={`${label} color picker`}
        />
      </div>
    </label>
  );
}
