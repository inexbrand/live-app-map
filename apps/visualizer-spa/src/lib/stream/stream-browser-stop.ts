#!/usr/bin/env bun
/**
 * Погасить постоянный браузер трансляции: `bun run browser:stop`.
 * Порт — `LAM_STREAM_CDP_PORT`, иначе порт по умолчанию.
 */
import { stopStreamBrowser, streamCdpPort } from './stream-browser';

if (import.meta.main) {
  const port = streamCdpPort(process.env);
  const stopped = await stopStreamBrowser(port);
  console.log(stopped ? `Браузер трансляции на :${port} погашен` : `Браузера трансляции на :${port} нет`);
}
