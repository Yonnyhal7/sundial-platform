const sundialPrimaryButtonBase =
  "inline-flex items-center justify-center rounded-lg border border-transparent bg-[#D4A017] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#B8860B] active:bg-[#9A7209] focus:outline-none focus:ring-2 focus:ring-[#D4A017]/35 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus:ring-offset-black";

export function sundialPrimaryButtonClass(className = "") {
  return [sundialPrimaryButtonBase, className].filter(Boolean).join(" ");
}
