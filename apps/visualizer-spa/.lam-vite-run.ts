import { createServer } from 'vite';
import { execSync } from 'node:child_process';
const own = (): string => execSync('netstat -ano -p tcp').toString().split('\n').filter((l) => l.includes('LISTENING') && l.trim().endsWith(' ' + process.pid)).map((l) => l.trim().split(/\s+/)[1]).join(' ');
const port = Number(process.argv[2]);
const strict = process.argv[3] === 'strict';
const server = await createServer({ configFile: process.cwd() + '/vite.config.ts', server: { port, host: true, strictPort: strict }, logLevel: 'info' });
const t = (p: Promise<unknown>, ms: number) => Promise.race([p.then(() => 'ok', (e) => 'err ' + String(e).slice(0, 120)), new Promise((r) => setTimeout(() => r('ЗАВИС'), ms))]);
console.log('listen:', await t(server.listen(), 8000), '|', own());
for (let i = 1; i <= Number(process.argv[4] ?? 4); i++) {
  console.log('restart', i, ':', await t(server.restart(), 8000), '|', own());
}
process.exit(0);
