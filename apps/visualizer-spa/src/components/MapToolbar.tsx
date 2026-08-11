/**
 * Минимальная шапка: бренд, режим, иконки → модалки по краям.
 * Все подписи на русском.
 */
import {
  Eraser,
  FolderOpen,
  Search,
  Settings2,
  Layers,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  fetchDogfoodActors,
  formatDogfoodActorOption,
  isDogfoodClientEnabled,
  mapSessionToInject,
  mintDogfoodSession,
  type DogfoodActor,
} from '../lib/dogfood-api';
import { ensureDogfoodSessions as mintMissingDogfood } from '../lib/ensure-dogfood-sessions';
import { importMapFile } from '../lib/import-map';
import { loadMapPresetIntoStore } from '../lib/load-map-preset';
import type { MapCatalogEntry } from '../lib/map-catalog';
import { DEFAULT_MAX_PINNED, useAppStore } from '../store/app-store';
import { Button, Field, Input, Select, Textarea } from '../ui';
import { EdgeSheet } from './EdgeSheet';

type SheetId = 'sources' | 'settings' | 'search' | null;

/** Props шапки: каталог из App (fetch /maps/index.json). */
export type MapToolbarProps = {
  readonly catalog: readonly MapCatalogEntry[];
  readonly catalogLoading?: boolean;
};

/**
 * Главный chrome visualizer (минимализм + edge sheets).
 *
 * @param props - каталог карт и состояние загрузки
 */
export function MapToolbar(props: MapToolbarProps) {
  const { catalog, catalogLoading = false } = props;
  const setMode = useAppStore((s) => s.setMode);
  const iframeScale = useAppStore((s) => s.iframeScale);
  const setIframeScale = useAppStore((s) => s.setIframeScale);
  const maxLiveIframes = useAppStore((s) => s.maxLiveIframes);
  const setMaxLiveIframes = useAppStore((s) => s.setMaxLiveIframes);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const baseUrlOverride = useAppStore((s) => s.baseUrlOverride);
  const setBaseUrlOverride = useAppStore((s) => s.setBaseUrlOverride);
  const globalRole = useAppStore((s) => s.globalRole);
  const setGlobalRole = useAppStore((s) => s.setGlobalRole);
  const dogfoodMiniappInitData = useAppStore((s) => s.dogfoodMiniappInitData);
  const setDogfoodMiniappInitData = useAppStore((s) => s.setDogfoodMiniappInitData);
  const dogfoodAdminAccessToken = useAppStore((s) => s.dogfoodAdminAccessToken);
  const setDogfoodAdminAccessToken = useAppStore((s) => s.setDogfoodAdminAccessToken);
  const useTlsProxy = useAppStore((s) => s.useTlsProxy);
  const setUseTlsProxy = useAppStore((s) => s.setUseTlsProxy);
  const loadUnknownJson = useAppStore((s) => s.loadUnknownJson);
  const pushLog = useAppStore((s) => s.pushLog);
  const clearMap = useAppStore((s) => s.clearMap);
  const setToast = useAppStore((s) => s.setToast);
  const setLastLoadError = useAppStore((s) => s.setLastLoadError);
  const document = useAppStore((s) => s.document);
  const liveCount = useAppStore((s) => s.livePageIds.size);
  const pinCount = useAppStore((s) => s.pinnedPageIds.size);

  const [sheet, setSheet] = useState<SheetId>(null);
  const [loadingPresetId, setLoadingPresetId] = useState<string | null>(null);
  /** Выбранная карта в шапке (id каталога). */
  const [activeMapId, setActiveMapId] = useState('');
  const [dogfoodActors, setDogfoodActors] = useState<readonly DogfoodActor[]>(
    [],
  );
  const [dogfoodActorsError, setDogfoodActorsError] = useState<string | null>(
    null,
  );
  const [selectedActorKey, setSelectedActorKey] = useState('');
  const [dogfoodBusy, setDogfoodBusy] = useState(false);

  useEffect(() => {
    if (sheet !== 'settings') {
      return;
    }
    if (!isDogfoodClientEnabled(import.meta.env)) {
      setDogfoodActors([]);
      setDogfoodActorsError('Авто-вход отключён в production-сборке');
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await fetchDogfoodActors();
      if (cancelled) {
        return;
      }
      if (!res.ok) {
        setDogfoodActors([]);
        setDogfoodActorsError(res.error);
        return;
      }
      setDogfoodActors(res.data);
      setDogfoodActorsError(null);
      // auto-select first actor for one-click login
      if (res.data.length > 0 && selectedActorKey === '') {
        const first = res.data[0];
        if (first) {
          setSelectedActorKey(`${first.kind}:${first.id}`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sheet, selectedActorKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSheet(null);
        return;
      }
      if (
        e.key === '/' &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        setSheet('search');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (sheet !== 'search') {
      return;
    }
    const t = window.setTimeout(() => {
      window.document
        .querySelector<HTMLInputElement>('input[data-lam-search]')
        ?.focus();
    }, 40);
    return () => window.clearTimeout(t);
  }, [sheet]);

  const onFile = async (file: File | null) => {
    if (!file) {
      return;
    }
    const result = await importMapFile(file);
    if (!result.ok) {
      setLastLoadError(result.error);
      setToast(result.error);
      return;
    }
    loadUnknownJson(result.json);
    if (result.toast !== undefined) {
      setToast(result.toast);
    }
    setSheet(null);
  };

  /**
   * Если нет dogfood-сессии — mint первого admin + первого user с telegramId.
   * Без этого admin всегда login, miniapp «не открывается» (не Telegram).
   */
  const ensureDogfoodSessions = async (): Promise<void> => {
    setDogfoodBusy(true);
    try {
      await mintMissingDogfood({
        dogfoodAdminAccessToken,
        dogfoodMiniappInitData,
        setDogfoodAdminAccessToken,
        setDogfoodMiniappInitData,
        setGlobalRole,
        onActors: (actors) => {
          setDogfoodActors(actors);
          setDogfoodActorsError(null);
        },
        onError: (message) => setDogfoodActorsError(message),
        onToast: setToast,
      });
    } finally {
      setDogfoodBusy(false);
    }
  };

  const loadPreset = async (preset: MapCatalogEntry) => {
    setLoadingPresetId(preset.id);
    try {
      // iframe dogfood: proxy всегда нужен (frame-bypass + TLS)
      if (!useTlsProxy) {
        setUseTlsProxy(true);
      }
      const res = await loadMapPresetIntoStore(preset, {
        setBaseUrlOverride,
        loadUnknownJson,
        setMode,
      });
      if (!res.ok) {
        setLastLoadError(res.error);
        setToast(res.error);
        return;
      }
      setActiveMapId(preset.id);
      await ensureDogfoodSessions();
      const baseHint =
        preset.baseUrl.trim() !== '' ? ` · ${preset.baseUrl}` : '';
      setToast(`Загружено: ${preset.label}${baseHint}`);
      setSheet(null);
    } finally {
      setLoadingPresetId(null);
    }
  };

  /**
   * Селект в шапке: карты из каталога + действия в конце.
   *
   * @param value - id карты или __open_file__ / __clear__
   */
  const onHeaderMapAction = (value: string): void => {
    if (value === '' || value === activeMapId) {
      return;
    }
    if (value === '__open_file__') {
      window.document.getElementById('lam-file-input')?.click();
      return;
    }
    if (value === '__clear__') {
      clearMap();
      setActiveMapId('');
      setToast('Карта очищена');
      return;
    }
    const preset = catalog.find((c) => c.id === value);
    if (preset) {
      void loadPreset(preset);
    }
  };

  return (
    <>
      <header className="toolbar toolbar--slim">
        <label className="toolbar-map-select" title="Выбор карты / действия">
          <span className="sr-only">Карта</span>
          <Select
            aria-label="Карта"
            data-testid="map-select"
            value={activeMapId}
            disabled={catalogLoading || loadingPresetId !== null}
            onChange={(e) => onHeaderMapAction(e.target.value)}
          >
            <option value="">
              {catalogLoading ? 'Каталог…' : 'Выберите карту…'}
            </option>
            {catalog.map((c) => {
              const pagesHint =
                c.pageCount > 0 ? ` · ${c.pageCount} экр.` : '';
              return (
                <option key={c.id} value={c.id}>
                  {c.label}
                  {pagesHint}
                </option>
              );
            })}
            <option value="__open_file__">── Открыть JSON / .appmap ──</option>
            <option value="__clear__" disabled={!document}>
              ── Очистить карту ──
            </option>
          </Select>
        </label>

        <div className="toolbar__spacer" />

        <span className="budget-pill" title="Живые iframe (visible+pin); 9999 = без лимита">
          живых {liveCount}
          {maxLiveIframes >= 9999 ? '' : `/${maxLiveIframes}`}
          {' · '}
          pin {pinCount}
        </span>

        <div className="toolbar__group">
          <Button
            type="button"
            variant={sheet === 'sources' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setSheet(sheet === 'sources' ? null : 'sources')}
            aria-expanded={sheet === 'sources'}
          >
            <Layers size={16} strokeWidth={1.75} />
            Источники
          </Button>
          <Button
            type="button"
            variant={sheet === 'settings' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setSheet(sheet === 'settings' ? null : 'settings')}
            aria-expanded={sheet === 'settings'}
          >
            <Settings2 size={16} strokeWidth={1.75} />
            Настройки
          </Button>
          <Button
            type="button"
            variant={sheet === 'search' ? 'primary' : 'outline'}
            size="icon-sm"
            onClick={() => setSheet(sheet === 'search' ? null : 'search')}
            aria-label="Поиск экранов"
            title="Поиск (/ )"
          >
            <Search size={16} strokeWidth={1.75} />
          </Button>
        </div>
      </header>

      <EdgeSheet
        open={sheet === 'sources'}
        side="left"
        title="Источники карты"
        description="Файл, карта из каталога public/maps или очистка холста."
        onClose={() => setSheet(null)}
      >
        <label className="ui-btn ui-btn--primary source-file-btn">
          <FolderOpen size={16} strokeWidth={1.75} aria-hidden={true} />
          Открыть JSON / .appmap
          <input
            id="lam-file-input"
            type="file"
            accept=".json,.appmap,.zip,application/json"
            hidden
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <div className="sheet-block">
          <div className="ui-field__label">Каталог карт</div>
          <div className="sheet-stack">
            {catalogLoading ? (
              <p className="drawer__hint">Загрузка каталога…</p>
            ) : null}
            {!catalogLoading && catalog.length === 0 ? (
              <p className="drawer__hint">
                Каталог пуст. Положите *.liveappmap.json в public/maps.
              </p>
            ) : null}
            {catalog.map((p) => {
              const busy = loadingPresetId === p.id;
              const pagesHint =
                p.pageCount > 0 ? ` · ${p.pageCount} экр.` : '';
              return (
                <Button
                  key={p.id}
                  type="button"
                  variant="outline"
                  disabled={loadingPresetId !== null}
                  aria-busy={busy}
                  onClick={() => void loadPreset(p)}
                >
                  {busy ? 'Загрузка…' : `${p.label}${pagesHint}`}
                </Button>
              );
            })}
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          disabled={!document}
          onClick={() => {
            clearMap();
            setSheet(null);
            setToast('Карта очищена');
          }}
        >
          <Eraser size={16} strokeWidth={1.75} />
          Очистить карту
        </Button>
      </EdgeSheet>

      <EdgeSheet
        open={sheet === 'settings'}
        side="right"
        title="Настройки просмотра"
        description="Масштаб iframe, бюджет, роль и базовый URL."
        onClose={() => setSheet(null)}
      >
        <Field label="Масштаб превью" htmlFor="set-scale">
          <Select
            id="set-scale"
            value={iframeScale}
            onChange={(e) =>
              setIframeScale(
                Number(e.target.value) as 0.25 | 0.35 | 0.5 | 0.75 | 1,
              )
            }
          >
            <option value={0.25}>25% (карта)</option>
            <option value={0.35}>35%</option>
            <option value={0.5}>50%</option>
            <option value={0.75}>75%</option>
            <option value={1}>100%</option>
          </Select>
        </Field>

        <Field
          label="Макс. живых iframe"
          htmlFor="set-max"
          hint="Multi-iframe с бюджетом: pin + выбранный + видимые (по приоритету). Остальные — placeholder. «Без лимита» только для маленьких карт."
        >
          <Select
            id="set-max"
            value={maxLiveIframes >= 9999 ? 9999 : maxLiveIframes}
            onChange={(e) => setMaxLiveIframes(Number(e.target.value))}
          >
            {[4, 6, 8, 12, 16].map((n) => (
              <option key={n} value={n}>
                {n}
                {n === 8 ? ' (по умолчанию)' : ''}
              </option>
            ))}
            <option value={9999}>Без лимита (осторожно)</option>
          </Select>
        </Field>

        <Field
          label="Роль (miniapp)"
          htmlFor="set-role"
          hint="Добавляет ?lam_role=… к live URL."
        >
          <Select
            id="set-role"
            value={globalRole}
            onChange={(e) => setGlobalRole(e.target.value)}
          >
            <option value="">Без роли</option>
            <option value="recruiter">Рекрутер</option>
            <option value="employer">Клиент (работодатель)</option>
          </Select>
        </Field>

        <Field
          label="Базовый URL"
          htmlFor="set-base"
          hint="Куда смотрят live-iframe (dev-сервер приложения)."
        >
          <Input
            id="set-base"
            value={baseUrlOverride}
            placeholder="https://vite.localhost:5175"
            onChange={(e) => setBaseUrlOverride(e.target.value)}
            onBlur={(e) => setBaseUrlOverride(e.target.value)}
          />
        </Field>

        <div className="sheet-block">
          <div className="ui-field__label">Iframe proxy (dogfood)</div>
          <p className="drawer__hint">
            Same-origin proxy: miniapp (TLS self-signed), admin :16002 и site
            :16001 (снимает X-Frame-Options / CSP). Без proxy iframe часто
            пустой или «отказ во фрейме».
          </p>
          <label className="ui-chip" style={{ cursor: 'pointer', width: 'fit-content' }}>
            <input
              type="checkbox"
              checked={useTlsProxy}
              onChange={(e) => setUseTlsProxy(e.target.checked)}
              style={{ marginRight: 8 }}
            />
            Proxy iframe (miniapp + admin + site)
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void (async () => {
                const target =
                  baseUrlOverride.trim() || 'https://vite.localhost:5175/';
                try {
                  const r = await fetch(
                    `/__lam_tls_check?url=${encodeURIComponent(target)}`,
                  );
                  const j = (await r.json()) as {
                    ok?: boolean;
                    message?: string;
                    error?: string;
                    status?: number;
                  };
                  const msg = j.ok
                    ? `TLS OK · HTTP ${j.status ?? '—'} · ${j.message ?? ''}`
                    : `TLS fail · ${j.error ?? 'unknown'}`;
                  setToast(msg);
                  pushLog({
                    level: j.ok ? 'info' : 'warn',
                    source: 'system',
                    message: msg,
                  });
                } catch (err) {
                  const m = err instanceof Error ? err.message : String(err);
                  setToast(`TLS check: ${m}`);
                }
              })();
            }}
          >
            Проверить TLS origin
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              window.open(
                baseUrlOverride.trim() || 'https://vite.localhost:5175/',
                '_blank',
                'noopener,noreferrer',
              );
              setToast(
                'Откройте origin и примите сертификат в браузере (если proxy выкл)',
              );
            }}
          >
            Открыть origin (доверие cert)
          </Button>
        </div>

        <div className="sheet-block">
          <div className="ui-field__label">Авто-вход (dev)</div>
          <p className="drawer__hint">
            Выберите пользователя из БД Korbor — live-карта откроет экраны уже
            авторизованными. Нужен API :16000 (DOGFOOD_DEV).
          </p>
        </div>

        {dogfoodActorsError ? (
          <p className="drawer__hint" role="status">
            {dogfoodActorsError}
          </p>
        ) : null}

        <Field
          label="Пользователь из БД"
          htmlFor="dogfood-actor"
          hint="При выборе — сразу mint сессии для live-iframe."
        >
          <Select
            id="dogfood-actor"
            value={selectedActorKey}
            disabled={dogfoodActors.length === 0 || dogfoodBusy}
            onChange={(e) => {
              const key = e.target.value;
              setSelectedActorKey(key);
              if (!key) {
                return;
              }
              const actor = dogfoodActors.find(
                (a) => `${a.kind}:${a.id}` === key,
              );
              if (!actor) {
                return;
              }
              void (async () => {
                setDogfoodBusy(true);
                try {
                  const minted = await mintDogfoodSession(actor);
                  if (!minted.ok) {
                    setToast(minted.error);
                    pushLog({
                      level: 'error',
                      source: 'system',
                      message: `dogfood mint: ${minted.error}`,
                    });
                    return;
                  }
                  const inj = mapSessionToInject(minted.data);
                  setDogfoodAdminAccessToken(inj.adminAccessToken);
                  setDogfoodMiniappInitData(inj.miniappInitData);
                  if (inj.globalRole) {
                    setGlobalRole(inj.globalRole);
                  } else if (actor.kind === 'admin') {
                    setGlobalRole('');
                  }
                  setToast(inj.toast);
                  pushLog({
                    level: 'info',
                    source: 'system',
                    message: inj.toast,
                  });
                } finally {
                  setDogfoodBusy(false);
                }
              })();
            }}
          >
            <option value="">— выберите —</option>
            {dogfoodActors.map((a) => (
              <option key={`${a.kind}:${a.id}`} value={`${a.kind}:${a.id}`}>
                {formatDogfoodActorOption(a)}
              </option>
            ))}
          </Select>
        </Field>

        <div className="drawer__actions">
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!selectedActorKey || dogfoodBusy}
            onClick={() => {
              void (async () => {
                const actor = dogfoodActors.find(
                  (a) => `${a.kind}:${a.id}` === selectedActorKey,
                );
                if (!actor) {
                  return;
                }
                setDogfoodBusy(true);
                try {
                  const minted = await mintDogfoodSession(actor);
                  if (!minted.ok) {
                    setToast(minted.error);
                    pushLog({
                      level: 'error',
                      source: 'system',
                      message: `dogfood mint: ${minted.error}`,
                    });
                    return;
                  }
                  const inj = mapSessionToInject(minted.data);
                  setDogfoodAdminAccessToken(inj.adminAccessToken);
                  setDogfoodMiniappInitData(inj.miniappInitData);
                  if (inj.globalRole) {
                    setGlobalRole(inj.globalRole);
                  }
                  setToast(inj.toast);
                  pushLog({
                    level: 'info',
                    source: 'system',
                    message: inj.toast,
                  });
                } finally {
                  setDogfoodBusy(false);
                }
              })();
            }}
          >
            {dogfoodBusy ? 'Вход…' : 'Войти в карту'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setDogfoodAdminAccessToken('');
              setDogfoodMiniappInitData('');
              setSelectedActorKey('');
              setToast('Dogfood-сессии очищены');
            }}
          >
            Сбросить вход
          </Button>
        </div>

        <details className="sheet-block">
          <summary className="drawer__hint" style={{ cursor: 'pointer' }}>
            Вручную (токен / initData)
          </summary>
          <Field
            label="Admin access token"
            htmlFor="set-admin-tok"
            hint="?lam_access_token="
          >
            <Textarea
              id="set-admin-tok"
              rows={2}
              value={dogfoodAdminAccessToken}
              placeholder="Bearer-токен"
              onChange={(e) => setDogfoodAdminAccessToken(e.target.value)}
            />
          </Field>
          <Field label="Miniapp initData" htmlFor="set-init" hint="?lam_init_data=">
            <Textarea
              id="set-init"
              rows={3}
              value={dogfoodMiniappInitData}
              placeholder="query_id=…&user=…&hash=…"
              onChange={(e) => setDogfoodMiniappInitData(e.target.value)}
            />
          </Field>
        </details>
      </EdgeSheet>

      <EdgeSheet
        open={sheet === 'search'}
        side="top"
        title="Поиск экранов"
        description="По названию, пути или id. Клавиша / ."
        onClose={() => setSheet(null)}
      >
        <Field label="Запрос" htmlFor="set-search">
          <Input
            id="set-search"
            data-lam-search
            value={searchQuery}
            placeholder="например: feed, вакансии, /employer"
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </Field>
        {searchQuery.trim() ? (
          <p className="drawer__hint">
            Фильтр активен на холсте. Очистите поле, чтобы снова видеть все
            экраны.
          </p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setSearchQuery('');
            setSheet(null);
          }}
        >
          Сбросить поиск
        </Button>
      </EdgeSheet>
    </>
  );
}
