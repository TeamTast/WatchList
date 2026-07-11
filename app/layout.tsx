import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WatchList — Market Operations Desk",
  description: "A shared market operations desk for US stocks, Japan stocks, FX, and custom indexes."
};

export const viewport: Viewport = {
  colorScheme: "dark light",
  themeColor: "#080a0b"
};

const themeScript = `
  (() => {
    try {
      const savedTheme = localStorage.getItem("watchlist.theme.v1");
      const theme = savedTheme === "light" ? "light" : "dark";
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#ece9e1" : "#080a0b");
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
