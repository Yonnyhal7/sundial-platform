const themeScript = `
(() => {
  try {
    const pathname = window.location.pathname;
    const scope = /\\/[^/]+\\/admin(?:\\/|$)/.test(pathname)
      ? "admin"
      : /\\/[^/]+\\/kiosk(?:\\/|$)/.test(pathname)
        ? "kiosk"
        : /\\/[^/]+\\/app(?:\\/|$)/.test(pathname)
          ? "app"
          : "site";
    const storageKey = "sundial-theme-" + scope;
    const savedTheme = localStorage.getItem(storageKey);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = savedTheme || (prefersDark ? "dark" : "light");

    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.dataset.themeScope = scope;
  } catch {
    document.documentElement.classList.remove("dark");
  }
})();
`;

export default function ThemeProvider() {
  return (
    <script
      id="theme-provider"
      dangerouslySetInnerHTML={{ __html: themeScript }}
    />
  );
}
