"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createSchoolAction, type CreateSchoolState } from "../actions";
import { sundialPrimaryButtonClass } from "@/lib/ui/buttonStyles";

type CreateSchoolFormProps = {
  schoolsHref: string;
};

const initialState: CreateSchoolState = {};

export default function CreateSchoolForm({ schoolsHref }: CreateSchoolFormProps) {
  const [state, formAction, pending] = useActionState(createSchoolAction, initialState);

  return (
    <form action={formAction} className="mt-8 max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div>
        <label htmlFor="name" className="text-sm font-semibold text-slate-900 dark:text-white">
          School Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          placeholder="Del Oro High School"
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
        />
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Sundial will generate the school subdomain automatically.
        </p>
      </div>

      <div className="mt-5">
        <label htmlFor="adminEmail" className="text-sm font-semibold text-slate-900 dark:text-white">
          Temporary School Admin Email
        </label>
        <input
          id="adminEmail"
          name="adminEmail"
          type="email"
          required
          placeholder="principal@school.edu"
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
        />
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          This creates a pending setup invite record for the first school admin.
        </p>
      </div>

      {state.error && (
        <p className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-200">
          {state.error}
        </p>
      )}

      <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-200 pt-5 dark:border-slate-700">
        <Link
          href={schoolsHref}
          className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={pending}
          className={sundialPrimaryButtonClass()}
        >
          {pending ? "Creating..." : "Create School"}
        </button>
      </div>
    </form>
  );
}
