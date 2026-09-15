import Database from "better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { D1Like, D1Prepared } from "@/lib/db/d1";

export function openTestDb(): D1Like {
  const sqlite = new Database(":memory:");
  const dir = path.resolve(import.meta.dirname, "../../migrations");
  for (const f of readdirSync(dir).sort()) sqlite.exec(readFileSync(path.join(dir, f), "utf8"));
  const prepare = (sql: string): D1Prepared => {
    let bound: unknown[] = [];
    const stmt = sqlite.prepare(sql);
    const p: D1Prepared = {
      bind(...values) { bound = values; return p; },
      async first() { return (stmt.get(...bound) as never) ?? null; },
      async all() { return { results: stmt.all(...bound) as never[] }; },
      async run() { const r = stmt.run(...bound); return { meta: { changes: r.changes } }; },
    };
    return p;
  };
  return {
    prepare,
    async batch(statements) { const out: unknown[] = []; for (const s of statements) out.push(await s.run()); return out; },
  };
}
