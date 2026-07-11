"use client";

import Link from "next/link";
import { useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Period = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
};

const inputClass =
  "rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-[var(--school-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--school-primary)_20%,transparent)] dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-white";

function createInitialPeriod(index: number): Period {
  return {
    id: `new-period-${index + 1}`,
    name: `Period ${index + 1}`,
    start_time: "",
    end_time: "",
  };
}

function SortablePeriodRow({
  period,
  index,
  updatePeriod,
  removePeriod,
}: {
  period: Period;
  index: number;
  updatePeriod: (index: number, field: keyof Omit<Period, "id">, value: string) => void;
  removePeriod: (index: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: period.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-[#3a3a3a] dark:bg-black/30 ${
        isDragging ? "opacity-70 ring-2 ring-[var(--school-primary)]" : ""
      }`}
    >
      <div className="grid gap-4 sm:grid-cols-[40px_minmax(0,1fr)] xl:grid-cols-[40px_minmax(0,1fr)_minmax(8rem,10rem)_minmax(8rem,10rem)_auto]">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab rounded-lg border border-slate-300 px-3 py-2 text-slate-500 hover:bg-slate-100 active:cursor-grabbing dark:border-slate-700 dark:text-slate-400 dark:hover:bg-white/10"
          aria-label="Drag period"
        >
          ☰
        </button>

        <input type="hidden" name="period_id" value={period.id} />

        <input
          name="period_name"
          value={period.name}
          onChange={(e) => updatePeriod(index, "name", e.target.value)}
          placeholder="Period Name"
          className={inputClass}
        />

        <input
          name="start_time"
          type="time"
          value={period.start_time}
          onChange={(e) => updatePeriod(index, "start_time", e.target.value)}
          className={inputClass}
        />

        <input
          name="end_time"
          type="time"
          value={period.end_time}
          onChange={(e) => updatePeriod(index, "end_time", e.target.value)}
          className={inputClass}
        />

        <button
          type="button"
          onClick={() => removePeriod(index)}
          className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

export default function ScheduleForm({
  school,
  action,
  submitLabel,
  initialScheduleName = "",
  initialScheduleType = "",
  initialActive = true,
  initialPeriods = [],
  hiddenFields = {},
}: {
  school: string;
  action: (formData: FormData) => void;
  submitLabel: string;
  initialScheduleName?: string;
  initialScheduleType?: string;
  initialActive?: boolean;
  initialPeriods?: Period[];
  hiddenFields?: Record<string, string>;
}) {
  const [periods, setPeriods] = useState<Period[]>(
    initialPeriods.length > 0 ? initialPeriods : [createInitialPeriod(0)]
  );

  const sensors = useSensors(useSensor(PointerSensor));

  function addPeriod() {
    setPeriods([
      ...periods,
      {
        id: `new-period-${periods.length + 1}`,
        name: `Period ${periods.length + 1}`,
        start_time: "",
        end_time: "",
      },
    ]);
  }

  function removePeriod(index: number) {
    setPeriods(periods.filter((_, i) => i !== index));
  }

  function updatePeriod(
    index: number,
    field: keyof Omit<Period, "id">,
    value: string
  ) {
    const updated = [...periods];
    updated[index][field] = value;
    setPeriods(updated);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const oldIndex = periods.findIndex((period) => period.id === active.id);
    const newIndex = periods.findIndex((period) => period.id === over.id);

    setPeriods(arrayMove(periods, oldIndex, newIndex));
  }

  return (
    <form
      action={action}
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]"
    >
      <div className="space-y-5">
        {Object.entries(hiddenFields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}

        <input
          name="schedule_name"
          required
          defaultValue={initialScheduleName}
          placeholder="Schedule Name, example: Rally Day"
          className={`w-full ${inputClass}`}
        />

        <input
          name="schedule_type"
          defaultValue={initialScheduleType}
          placeholder="Schedule Type, example: Rally, Regular, Early Out"
          className={`w-full ${inputClass}`}
        />

        <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-[#3a3a3a] dark:bg-black/30">
          <input
            type="checkbox"
            name="active"
            defaultChecked={initialActive}
            className="h-4 w-4 rounded border-slate-300 dark:border-slate-600"
          />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Active
          </span>
        </label>

        <div className="border-t border-slate-200 pt-5 dark:border-[#3a3a3a]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold">Periods</h2>

            <button
              type="button"
              onClick={addPeriod}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/10"
            >
              + Add Period
            </button>
          </div>

          <DndContext
            id="schedule-periods-dnd"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={periods.map((period) => period.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-4">
                {periods.map((period, index) => (
                  <SortablePeriodRow
                    key={period.id}
                    period={period}
                    index={index}
                    updatePeriod={updatePeriod}
                    removePeriod={removePeriod}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-5 dark:border-[#3a3a3a]">
        <Link
          href={`/${school}/admin/schedules`}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/10"
        >
          Cancel
        </Link>

        <button
          type="submit"
          className="cursor-pointer rounded-lg bg-[var(--school-primary)] px-5 py-2 text-sm font-semibold text-[var(--school-primary-text)] transition hover:opacity-90"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
