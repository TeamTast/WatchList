import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./command.css";

export const metadata: Metadata = {
  title: "WatchList — Market Operations",
  description: "米国株、日本株、FX、自作指数をひとつの盤面で監視・共有するマーケットオペレーションデスク。",
  applicationName: "WatchList"
};

export const viewport: Viewport = {
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0c0d" },
    { media: "(prefers-color-scheme: light)", color: "#d7d8d4" }
  ]
};

const themeScript = `
  (() => {
    try {
      const savedTheme = localStorage.getItem("watchlist.theme.v1");
      const theme = savedTheme === "light" ? "light" : "dark";
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#d7d8d4" : "#0a0c0d");
    } catch {
      document.documentElement.dataset.theme = "dark";
      document.documentElement.style.colorScheme = "dark";
    }
  })();
`;

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
