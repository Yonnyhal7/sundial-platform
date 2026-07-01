const themeScript = `
(() => {
  try {
    const savedTheme = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = savedTheme || (prefersDark ? "dark" : "light");

    document.documentElement.classList.toggle("dark", theme === "dark");
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
