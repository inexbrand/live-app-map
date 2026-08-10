#!/usr/bin/env bun
/**
 * Runtime smoke: visualizer + Korbor surfaces + role URLs.
 * Exit 0 if critical paths OK; site hang = warning only.
 */
const checks: Array<{ url: string; critical: boolean }> = [
  { url: 'http://localhost:4310/', critical: true },
  { url: 'http://localhost:4310/maps/korbor-miniapp.liveappmap.json', critical: true },
  { url: 'http://localhost:4310/maps/korbor-admin.liveappmap.json', critical: true },
  { url: 'http://localhost:4310/maps/korbor-site.liveappmap.json', critical: true },
  { url: 'http://localhost:16002/', critical: true },
  { url: 'http://localhost:16002/vacancies', critical: false },
  { url: 'https://vite.localhost:5175/', critical: true },
  { url: 'https://vite.localhost:5175/feed?lam_role=recruiter', critical: true },
  { url: 'https://vite.localhost:5175/employer/create?lam_role=employer', critical: true },
  { url: 'http://localhost:16001/', critical: false },
];

let failedCritical = 0;
let warnings = 0;

for (const c of checks) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), c.critical ? 8000 : 4000);
  try {
    const res = await fetch(c.url, {
      signal: ac.signal,
      // @ts-expect-error bun tls option
      tls: { rejectUnauthorized: false },
    });
    const ok = res.status >= 200 && res.status < 500;
    console.log(ok ? 'OK' : 'BAD', res.status, c.url);
    if (!ok && c.critical) {
      failedCritical++;
    }
    if (!ok && !c.critical) {
      warnings++;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(c.critical ? 'FAIL' : 'WARN', c.url, msg.slice(0, 80));
    if (c.critical) {
      failedCritical++;
    } else {
      warnings++;
    }
  } finally {
    clearTimeout(timer);
  }
}

console.log(JSON.stringify({ failedCritical, warnings, ok: failedCritical === 0 }));
process.exit(failedCritical === 0 ? 0 : 1);
