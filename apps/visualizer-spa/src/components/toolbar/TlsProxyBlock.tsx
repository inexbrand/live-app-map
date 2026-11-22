/**
 * Блок настроек proxy для iframe dogfood: включение, проверка TLS origin, открыть origin.
 */
import { anyBody, errorText, requestJson } from '../../lib/dev-api';
import { useAppStore } from '../../store/app-store';
import { Button } from '../../ui';
import { tlsCheckMessage, tlsCheckOf } from './tls-check';

/** Origin мини-приложения, если базовый URL не задан. */
const DEFAULT_ORIGIN = 'https://vite.localhost:5175/';

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
    const msg = tlsCheckMessage(j);
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
