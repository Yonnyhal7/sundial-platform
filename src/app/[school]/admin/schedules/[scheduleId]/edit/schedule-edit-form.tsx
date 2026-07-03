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

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`rounded-xl border border-slate-800 bg-slate-950 p-4 ${
        isDragging ? "opacity-70 ring-2 ring-blue-500" : ""
      }`}
    >
      <div className="grid gap-4 sm:grid-cols-[40px_minmax(0,1fr)] xl:grid-cols-[40px_minmax(0,1fr)_minmax(8rem,10rem)_minmax(8rem,10rem)_auto]">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab rounded-lg border border-slate-700 px-3 py-2 text-slate-400 hover:bg-slate-800 active:cursor-grabbing"
        >
          ☰
        </button>

        <input
          type="hidden"
          name="period_id"
          value={period.id}
        />

        <input
          name="period_name"
          value={period.name}
          onChange={(e) => updatePeriod(index, "name", e.target.value)}
          placeholder="Period Name"
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
        />

        <input
          name="start_time"
          type="time"
          value={period.start_time}
          onChange={(e) => updatePeriod(index, "start_time", e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
        />

        <input
          name="end_time"
          type="time"
          value={period.end_time}
          onChange={(e) => updatePeriod(index, "end_time", e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
        />

        <button
          type="button"
          onClick={() => removePeriod(index)}
          className="rounded-lg border border-red-900/60 px-3 py-2 text-sm text-red-300 hover:bg-red-950/40"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

export default function ScheduleEditForm({
  school,
  schedule,
  initialPeriods,
  action,
}: {
  school: string;
  schedule: {
    schedule_name: string;
    schedule_type: string | null;
    active: boolean;
  };
  initialPeriods: Period[];
  action: (formData: FormData) => void;
}) {
  const [periods, setPeriods] = useState<Period[]>(
    initialPeriods.length > 0
      ? initialPeriods
      : [
          {
            id: crypto.randomUUID(),
            name: "Period 1",
            start_time: "",
            end_time: "",
          },
        ]
  );

  const sensors = useSensors(useSensor(PointerSensor));

  function addPeriod() {
    setPeriods([
      ...periods,
      {
        id: `new-${crypto.randomUUID()}`,
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
      className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6"
    >
      <div className="space-y-5">
        <input
          name="schedule_name"
          required
          defaultValue={schedule.schedule_name}
          placeholder="Schedule Name"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
        />

        <input
          name="schedule_type"
          defaultValue={schedule.schedule_type || ""}
          placeholder="Schedule Type"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
        />

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            name="active"
            defaultChecked={schedule.active}
          />
          Active
        </label>

        <div className="border-t border-slate-800 pt-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Periods</h2>

            <button
              type="button"
              onClick={addPeriod}
              className="rounded-lg bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
            >
              + Add Period
            </button>
          </div>

          <DndContext
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

      <div className="mt-8 flex justify-between border-t border-slate-800 pt-5">
        <Link href={`/${school}/admin/schedules`}>Cancel</Link>

        <button
          type="submit"
          className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 font-semibold"
        >
          Save Changes
        </button>
      </div>
    </form>
  );
}
