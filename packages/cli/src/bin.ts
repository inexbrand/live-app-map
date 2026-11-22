#!/usr/bin/env bun
/**
 * CLI: live-app-map scan | diff | doctor | dev (команды — в commands.ts).
 */
import { runCli } from './commands';

runCli(process.argv.slice(2), {
  log: (text) => console.log(text),
  error: (text) => console.error(text),
  cwd: process.cwd(),
  now: () => new Date(),
})
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    process.exit(1);
  });
