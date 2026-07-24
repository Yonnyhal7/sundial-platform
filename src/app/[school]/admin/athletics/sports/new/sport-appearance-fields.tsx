"use client";

import { useState } from "react";
import SportIcon from "@/components/SportIcon";
import {
  DEFAULT_SPORT_ICON_COLOR,
  formatSportIconName,
  SPORT_ICON_OPTIONS,
} from "@/lib/athletics";

export default function SportAppearanceFields() {
  const [icon, setIcon] = useState("generic");
  const [iconColor, setIconColor] = useState(DEFAULT_SPORT_ICON_COLOR);
  const iconName = formatSportIconName(icon);

  return (
    <>
      <div>
        <label
          htmlFor="sport-icon"
          className="mb-2 block text-sm font-medium text-slate-700 dark:text-[#d4d4d4]"
        >
          Icon
        </label>
        <select
          id="sport-icon"
          name="icon"
          value={icon}
          onChange={(event) => setIcon(event.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none focus:border-[var(--school-primary)] dark:border-[#3a3a3a] dark:bg-[#181818] dark:text-white"
        >
          {SPORT_ICON_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {formatSportIconName(option)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="sport-icon-color"
          className="mb-2 block text-sm font-medium text-slate-700 dark:text-[#d4d4d4]"
        >
          Icon Color
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <input
            id="sport-icon-color"
            name="icon_color"
            type="color"
            value={iconColor}
            onChange={(event) => setIconColor(event.target.value)}
            className="h-12 w-16 cursor-pointer rounded-lg border border-slate-300 bg-white p-1 dark:border-[#3a3a3a] dark:bg-[#181818]"
          />

          <div className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-[#3a3a3a] dark:bg-[#181818]">
            <span
              role="img"
              aria-label={`${iconName} icon preview in ${iconColor}`}
              className="grid h-10 w-10 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-[#242424] dark:ring-white/10"
            >
              <SportIcon icon={icon} color={iconColor} className="h-6 w-6" />
            </span>
            <span aria-live="polite" className="text-sm text-slate-500 dark:text-[#a3a3a3]">
              {iconName} preview
            </span>
          </div>
        </div>
        <p className="mt-2 text-sm text-slate-500 dark:text-[#a3a3a3]">
          Pick the color used for this sport icon.
        </p>
      </div>
    </>
  );
}
