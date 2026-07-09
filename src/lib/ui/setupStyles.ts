export const setupAccent = {
  activeNav:
    "bg-[#D4A017] text-slate-950 shadow-lg shadow-black/15 hover:bg-[#D4A017]",
  activeIndicator: "bg-[#D4A017] text-slate-950",
  progressBar: "bg-[#D4A017]",
  focus:
    "focus:border-[#D4A017] focus:ring-2 focus:ring-[#D4A017]/25 dark:focus:ring-[#D4A017]/35",
  selectedCard:
    "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/20",
  selectedIcon: "text-[#B8860B] dark:text-[#F6C64A]",
  link: "text-[#9A7209] hover:text-[#7A5A07] dark:text-[#F6C64A] dark:hover:text-[#FFD76A]",
};

export const setupPrimaryButtonBase =
  "inline-flex items-center justify-center rounded-lg border border-transparent bg-[#D4A017] px-4 py-2.5 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-[#B8860B] active:bg-[#9A7209] focus:outline-none focus:ring-2 focus:ring-[#D4A017]/35 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus:ring-offset-black";

export function setupPrimaryButtonClass(className = "") {
  return [setupPrimaryButtonBase, className].filter(Boolean).join(" ");
}
