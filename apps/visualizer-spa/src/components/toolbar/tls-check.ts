/**
 * Ответ проверки TLS origin (/__lam_tls_check): разбор и строка для toast.
 */

/** Ответ /__lam_tls_check. */
export type TlsCheck = { readonly ok?: boolean; readonly message?: string; readonly error?: string; readonly status?: number };

/**
 * Поля ответа, которые есть и нужного типа; остальное отбрасывается.
 *
 * @param body - тело ответа
 */
export function tlsCheckOf(body: unknown): TlsCheck {
  if (typeof body !== 'object' || body === null) {
    return {};
  }
  const field = (k: string): unknown => Object.entries(body).find(([key]) => key === k)?.[1];
  const ok = field('ok');
  const message = field('message');
  const error = field('error');
  const status = field('status');
  return {
    ...(typeof ok === 'boolean' ? { ok } : {}),
    ...(typeof message === 'string' ? { message } : {}),
    ...(typeof error === 'string' ? { error } : {}),
    ...(typeof status === 'number' ? { status } : {}),
  };
}

/**
 * Строка итога проверки.
 *
 * @param j - разобранный ответ
 */
export function tlsCheckMessage(j: TlsCheck): string {
  return j.ok ? `TLS OK · HTTP ${j.status ?? '—'} · ${j.message ?? ''}` : `TLS fail · ${j.error ?? 'unknown'}`;
}
