import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h1>Zatto</h1>
      <p>Point it at a Smart Money wallet and it tells you how many new buyers show up after it buys, how fast, and what buying after it would have returned.</p>
      <h2>What it measures</h2>
      <ul>
        <li>New buyers: distinct addresses that buy the same token within 10, 30 and 60 minutes after the wallet's buy, against the token's prior-hour rate.</li>
        <li>Fast arrivals: the share of those buyers arriving within 20 seconds.</li>
        <li>Returns: the token's price from the wallet's fill, and from a delayed entry one minute later, at 1 hour and 24 hours.</li>
      </ul>
      <h2>Verdicts</h2>
      <p>CROWDED when more than half of usable buys drew at least three times the prior-hour buyer rate. QUIET otherwise. THIN under five usable buys. The return note is stated only when both groups have at least three mature buys.</p>
      <p><Link href="/scan/base">Base leaderboard</Link></p>
    </main>
  );
}
