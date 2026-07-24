"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { filterTimeZoneOptions, getTimeZoneLabel, getTimeZoneOptions } from "@/lib/timezones";

export default function TimezoneSelect({
  name,
  value,
  onChange,
  disabled = false,
}: {
  name: string;
  value: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const listId = `${id}-listbox`;
  const options = useMemo(
    () => getTimeZoneOptions(),
    []
  );
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(value);
  const [activeIndex, setActiveIndex] = useState(0);
  const blurTimer = useRef<number | null>(null);
  const filtered = useMemo(() => {
    return filterTimeZoneOptions(options, query);
  }, [options, query]);

  function choose(zone: string) {
    setSelected(zone);
    setQuery("");
    setOpen(false);
    setActiveIndex(0);
    onChange?.(zone);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) => Math.max(0, Math.min(filtered.length - 1, index + direction)));
    } else if (event.key === "Enter" && open && filtered[activeIndex]) {
      event.preventDefault();
      choose(filtered[activeIndex].zone);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div className="relative mt-2">
      <input type="hidden" name={name} value={selected} />
      <div className="rounded-xl border border-slate-300 bg-white p-2 shadow-sm focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-600/25 dark:border-slate-700 dark:bg-slate-950">
        <p className="px-2 pb-1 text-sm font-bold text-slate-950 dark:text-white">
          {getTimeZoneLabel(selected)}
        </p>
        <input
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          aria-activedescendant={open && filtered[activeIndex] ? `${id}-option-${activeIndex}` : undefined}
          disabled={disabled}
          value={query}
          placeholder="Search city, region, or timezone"
          autoComplete="off"
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onFocus={() => {
            if (blurTimer.current) window.clearTimeout(blurTimer.current);
            setOpen(true);
          }}
          onBlur={() => {
            blurTimer.current = window.setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={handleKeyDown}
          className="w-full rounded-lg bg-slate-50 px-3 py-2 text-base text-slate-950 outline-none placeholder:text-slate-500 dark:bg-slate-900 dark:text-white"
        />
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Supported timezones"
          className="absolute z-50 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-950"
        >
          {filtered.length ? filtered.map(({ zone, label }, index) => (
            <li
              id={`${id}-option-${index}`}
              key={zone}
              role="option"
              aria-selected={zone === selected}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(zone)}
              className={`cursor-pointer rounded-lg px-3 py-3 text-sm ${index === activeIndex ? "bg-blue-50 text-blue-950 dark:bg-blue-500/20 dark:text-blue-100" : "text-slate-700 dark:text-slate-200"}`}
            >
              <span className="block font-semibold">{label}</span>
              <span className="mt-0.5 block text-xs opacity-70">{zone}</span>
            </li>
          )) : (
            <li className="px-3 py-4 text-sm text-slate-500">No supported timezone matches that search.</li>
          )}
        </ul>
      )}
    </div>
  );
}
