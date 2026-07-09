import {
  getCompletedSetupStepCount,
  SETUP_STEPS,
  type SetupStepSlug,
} from "@/lib/setupSteps";

type SetupProgressProps = {
  savedStep: SetupStepSlug;
  setupComplete?: boolean | null;
  className?: string;
};

export default function SetupProgress({
  savedStep,
  setupComplete = false,
  className = "",
}: SetupProgressProps) {
  const completedCount = getCompletedSetupStepCount(savedStep, Boolean(setupComplete));
  const percentComplete = Math.round((completedCount / SETUP_STEPS.length) * 100);

  return (
    <div
      className={[
        "rounded-2xl border border-white/10 bg-white/5 px-4 py-4",
        className,
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">
          Setup Progress
        </p>
        <p className="text-sm font-bold text-white">{percentComplete}%</p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15">
        <div
          className="h-full rounded-full bg-[var(--school-accent-visible-primary)] transition-all"
          style={{ width: `${percentComplete}%` }}
        />
      </div>
      <p className="mt-2 text-xs font-medium text-white/65">
        {completedCount} of {SETUP_STEPS.length} complete
      </p>
    </div>
  );
}
