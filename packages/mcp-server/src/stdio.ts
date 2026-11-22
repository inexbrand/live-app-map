/**
 * Транспорт stdio: строки JSON-RPC из потока — ответы построчно.
 */
import { handleRpcText } from './rpc';
import type { ToolContext } from './tool-kit';

/**
 * Делит накопленный текст на полные строки и хвост без перевода строки.
 *
 * @param buffer - накопленный текст
 * @returns непустые строки без пробелов по краям и остаток
 */
export function splitLines(buffer: string): { readonly lines: string[]; readonly rest: string } {
  const parts = buffer.split('\n');
  const rest = parts.pop() ?? '';
  return { lines: parts.map((l) => l.trim()).filter((l) => l !== ''), rest };
}

/**
 * Читает поток до конца и отвечает на каждую строку (уведомления — без ответа).
 *
 * @param input - входной поток байтов
 * @param write - вывод строки ответа
 * @param ctx - окружение tools
 */
export async function serveLines(input: ReadableStream<Uint8Array>, write: (line: string) => void, ctx: ToolContext): Promise<void> {
  const decoder = new TextDecoder();
  const reader = input.getReader();
  let buffer = '';
  for (let r = await reader.read(); !r.done; r = await reader.read()) {
    const { lines, rest } = splitLines(buffer + decoder.decode(r.value, { stream: true }));
    buffer = rest;
    for (const response of lines.map((l) => handleRpcText(l, ctx))) {
      if (response !== null) {
        write(`${JSON.stringify(response)}\n`);
      }
    }
  }
}
