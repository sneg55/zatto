import type { ReactNode } from "react";
import Link from "next/link";
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
        <header className="site-header">
          <div className="shell site-header-inner">
            <Link href="/" className="wordmark">Zatto</Link>
            <nav className="site-nav">
              <Link href="/copied/base">Most copied</Link>
              <Link href="/scan/base">Base leaderboard</Link>
              <Link href="/#method">How it measures</Link>
            </nav>
          </div>
        </header>
        <div className="shell">{children}</div>
        <footer className="site-footer">
          <div className="shell site-footer-inner">
            <span className="footer-note">Zatto reads Base through the Nansen API. Nothing here is advice.</span>
            <span className="footer-links">
              <a href="https://github.com/sneg55/zatto" target="_blank" rel="noopener noreferrer">Source on GitHub</a>
              <a href="https://nansen.ai" target="_blank" rel="noopener noreferrer">Powered by Nansen API</a>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
