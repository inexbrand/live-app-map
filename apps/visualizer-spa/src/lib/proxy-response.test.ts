/**
 * Общая обработка ответа path-прокси.
 */
import { describe, expect, test } from 'bun:test';
import { finalizeProxiedBody, sanitizeProxiedHeaders } from './proxy-response';

describe('sanitizeProxiedHeaders', () => {
  test('убирает iframe-блокеры и длину/сжатие, остальное сохраняет', () => {
    expect(
      sanitizeProxiedHeaders({
        'content-type': 'text/html',
        'X-Frame-Options': 'DENY',
        'content-security-policy': "frame-ancestors 'none'",
        'content-length': '10',
        'transfer-encoding': 'chunked',
        'content-encoding': 'gzip',
        'set-cookie': ['a=1', 'b=2'],
        etag: undefined,
      }),
    ).toEqual({ 'content-type': 'text/html', 'set-cookie': ['a=1', 'b=2'] });
  });
});

describe('finalizeProxiedBody', () => {
  test('HTML: ассеты под префикс + shim same-origin /api', () => {
    const out = finalizeProxiedBody(Buffer.from('<head></head><script src="/main.js"></script>'), 'text/html; charset=utf-8', '/__lam_proxy/site').toString();
    expect(out).toContain('src="/__lam_proxy/site/main.js"');
    expect(out).toContain('__LAM_API_SHIM__');
  });

  test('бинарное тело не трогается', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    expect(finalizeProxiedBody(png, 'image/png', '/__lam_proxy/site')).toBe(png);
  });
});
