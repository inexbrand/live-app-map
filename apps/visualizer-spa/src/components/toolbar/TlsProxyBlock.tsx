/**
 * Блок настроек proxy для iframe dogfood: включение, проверка TLS origin, открыть origin.
 */
import { anyBody, errorText, requestJson } from '../../lib/dev-api';
import { useAppStore } from '../../store/app-store';
import { Button } from '@/components/ui/button';
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
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
    <div className="flex flex-col gap-3">
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor="set-tls-proxy">Прокси для экранов</FieldLabel>
          <FieldDescription>
            Пропускает мини-приложение (свой сертификат), админку :16002 и сайт :16001 через визуализатор и снимает запрет
            на показ во фрейме. Без прокси экран часто пустой.
          </FieldDescription>
        </FieldContent>
        <Switch id="set-tls-proxy" checked={useTlsProxy} onCheckedChange={(checked) => setUseTlsProxy(checked)} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void checkTls().catch((err: unknown) => setToast(`TLS check: ${errorText(err)}`));
          }}
        >
          Проверить TLS origin
        </Button>
        <Button
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
    </div>
  );
}
