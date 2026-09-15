import type { ReactNode } from "react";

export const metadata = { title: "Zatto", description: "New buyers after Smart Money buys on Base" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "ui-sans-serif, system-ui", margin: 0, padding: "24px", maxWidth: 1100, marginInline: "auto" }}>
        {children}
        <footer style={{ marginTop: 48, fontSize: 12, opacity: 0.7 }}>
          <a href="https://nansen.ai">Powered by Nansen API</a>
        </footer>
      </body>
    </html>
  );
}
