/**
 * Блок настроек proxy для iframe dogfood: включение, проверка TLS origin, открыть origin.
 */
import { anyBody, errorText, requestJson } from '../../lib/dev-api';
import { useAppStore } from '../../store/app-store';
import { Button } from '../../ui';

/** Origin мини-приложения, если базовый URL не задан. */
const DEFAULT_ORIGIN = 'https://vite.localhost:5175/';

/** Ответ /__lam_tls_check. */
type TlsCheck = { readonly ok?: boolean; readonly message?: string; readonly error?: string; readonly status?: number };

function tlsCheckOf(body: unknown): TlsCheck {
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

/** Proxy iframe: переключатель, проверка TLS и доверие сертификату. */
export function TlsProxyBlock() {
  const useTlsProxy = useAppStore((s) => s.useTlsProxy);
  const setUseTlsProxy = useAppStore((s) => s.setUseTlsProxy);
  const baseUrl = useAppStore((s) => s.baseUrlOverride);
  const setToast = useAppStore((s) => s.setToast);
  const pushLog = useAppStore((s) => s.pushLog);
  const origin = (): string => baseUrl.trim() || DEFAULT_ORIGIN;

  const checkTls = async (): Promise<void> => {
    const r = await requestJson(`/__lam_tls_check?url=${encodeURIComponent(origin())}`);
    if (!r.ok && r.status === null) {
      setToast(`TLS check: ${r.error}`);
      return;
    }
    const j = tlsCheckOf(anyBody(r));
    const msg = j.ok ? `TLS OK · HTTP ${j.status ?? '—'} · ${j.message ?? ''}` : `TLS fail · ${j.error ?? 'unknown'}`;
    setToast(msg);
    pushLog({ level: j.ok ? 'info' : 'warn', source: 'system', message: msg });
  };

  return (
    <div className="sheet-block">
      <div className="ui-field__label">Iframe proxy (dogfood)</div>
      <p className="drawer__hint">
        Same-origin proxy: miniapp (TLS self-signed), admin :16002 и site
        :16001 (снимает X-Frame-Options / CSP). Без proxy iframe часто
        пустой или «отказ во фрейме».
      </p>
      <label className="ui-chip" style={{ cursor: 'pointer', width: 'fit-content' }}>
        <input type="checkbox" checked={useTlsProxy} onChange={(e) => setUseTlsProxy(e.target.checked)} style={{ marginRight: 8 }} />
        Proxy iframe (miniapp + admin + site)
      </label>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          void checkTls().catch((err: unknown) => setToast(`TLS check: ${errorText(err)}`));
        }}
      >
        Проверить TLS origin
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          window.open(origin(), '_blank', 'noopener,noreferrer');
          setToast('Откройте origin и примите сертификат в браузере (если proxy выкл)');
        }}
      >
        Открыть origin (доверие cert)
      </Button>
    </div>
  );
}
