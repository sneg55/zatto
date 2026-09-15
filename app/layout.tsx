import type { ReactNode } from "react";
import "./globals.css";

export const metadata = { title: "Zatto", description: "New buyers after Smart Money buys on Base" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400..700&family=Instrument+Serif&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="shell">{children}</div>
        <footer className="site-footer">
          <div className="shell" style={{ justifyContent: "flex-end" }}>
            <a href="https://nansen.ai">Powered by Nansen API</a>
          </div>
        </footer>
      </body>
    </html>
  );
}
