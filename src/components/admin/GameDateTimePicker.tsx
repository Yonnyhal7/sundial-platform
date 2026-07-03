"use client";

import { useMemo, useState } from "react";

type GameDateTimePickerProps = {
  name: string;
  defaultValue?: string;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function todayDateValue() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function parseValue(value: string | undefined) {
  if (!value) {
    return { date: "", time: "" };
  }

  const [date, rawTime = ""] = value.split("T");
  const time = rawTime.slice(0, 5);

  return { date, time };
}

function formatDisplay(date: string, time: string) {
  if (!date && !time) return "Select date and time";
  if (!date) return time;

  const [year, month, day] = date.split("-");
  const dateLabel = month && day && year ? `${month}/${day}/${year}` : date;

  if (!time) return dateLabel;

  const [hours, minutes] = time.split(":").map(Number);
  const hour12 = hours % 12 || 12;
  const period = hours >= 12 ? "PM" : "AM";

  return `${dateLabel} ${hour12}:${pad(minutes || 0)} ${period}`;
}

export default function GameDateTimePicker({
  name,
  defaultValue,
}: GameDateTimePickerProps) {
  const initial = parseValue(defaultValue);
  const [selectedDate, setSelectedDate] = useState(initial.date);
  const [selectedTime, setSelectedTime] = useState(initial.time);
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    const baseDate = initial.date || todayDateValue();
    const [year, month] = baseDate.split("-").map(Number);

    return new Date(year, month - 1, 1);
  });

  const hiddenValue = selectedDate
    ? `${selectedDate}T${selectedTime || "00:00"}`
    : "";

  const days = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    return [
      ...Array.from({ length: firstWeekday }, () => null),
      ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
    ];
  }, [viewDate]);

  function selectDay(day: number) {
    const dateValue = `${viewDate.getFullYear()}-${pad(viewDate.getMonth() + 1)}-${pad(day)}`;
    setSelectedDate(dateValue);

    if (!selectedTime) {
      setSelectedTime("19:00");
    }
  }

  return (
    <div className="relative">
      <input type="hidden" name={name} value={hiddenValue} />
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-slate-300 bg-white px-4 py-3 text-left text-slate-950 outline-none transition hover:border-blue-500 focus:border-blue-500 dark:border-[#3a3a3a] dark:bg-[#181818] dark:text-white"
      >
        <span>{formatDisplay(selectedDate, selectedTime)}</span>
        <svg
          aria-hidden="true"
          className="h-5 w-5 text-slate-500 dark:text-[#a3a3a3]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="1.9"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 3v3M17 3v3M4.5 9h15M6 5h12a2 2 0 0 1 2 2v11.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-30 mt-2 w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15 dark:border-[#3a3a3a] dark:bg-[#242424] dark:shadow-black/40">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5 dark:border-[#3a3a3a]">
            <button
              type="button"
              onClick={() =>
                setViewDate(
                  new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1)
                )
              }
              className="cursor-pointer rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:text-[#d4d4d4] dark:hover:bg-[#303030]"
            >
              Previous
            </button>
            <p className="text-sm font-semibold text-slate-950 dark:text-white">
              {viewDate.toLocaleString("default", {
                month: "long",
                year: "numeric",
              })}
            </p>
            <button
              type="button"
              onClick={() =>
                setViewDate(
                  new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1)
                )
              }
              className="cursor-pointer rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:text-[#d4d4d4] dark:hover:bg-[#303030]"
            >
              Next
            </button>
          </div>

          <div className="p-3">
            <div className="grid grid-cols-7 gap-1 text-center text-[0.7rem] font-semibold text-slate-500 dark:text-[#a3a3a3]">
              {WEEKDAYS.map((day) => (
                <div key={day}>{day}</div>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-1">
              {days.map((day, index) => {
                if (!day) {
                  return <div key={`empty-${index}`} className="aspect-square" />;
                }

                const dateValue = `${viewDate.getFullYear()}-${pad(viewDate.getMonth() + 1)}-${pad(day)}`;
                const isSelected = selectedDate === dateValue;

                return (
                  <button
                    key={dateValue}
                    type="button"
                    onClick={() => selectDay(day)}
                    className={[
                      "aspect-square cursor-pointer rounded-lg text-xs font-semibold transition",
                      isSelected
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-[#303030] dark:text-white dark:hover:bg-[#3a3a3a]",
                    ].join(" ")}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-[#d4d4d4]">
                  Time
                </span>
                <input
                  type="time"
                  value={selectedTime}
                  onChange={(event) => setSelectedTime(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-950 outline-none focus:border-blue-500 dark:border-[#3a3a3a] dark:bg-[#181818] dark:text-white"
                />
              </label>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
