/**
 * Лист «Настройки просмотра»: масштаб, адаптив, бюджет iframe, роль, базовый URL, proxy, профили.
 */
import { getKorborApiBase } from '../../lib/dogfood-api';
import { resolveViewportPresets } from '../../lib/viewport';
import { useAppStore } from '../../store/app-store';
import { Field, Input, Select } from '../../ui';
import { EdgeSheet } from '../EdgeSheet';
import { SessionProfilesPanel } from '../SessionProfilesPanel';
import { BudgetField } from './BudgetField';
import { TlsProxyBlock } from './TlsProxyBlock';
import type { DogfoodActorsState } from './use-dogfood-actors';

/** Масштабы превью экранов. */
const SCALES: ReadonlyArray<{ readonly value: 0.25 | 0.35 | 0.5 | 0.75 | 1; readonly label: string }> = [
  { value: 0.25, label: '25% (карта)' },
  { value: 0.35, label: '35%' },
  { value: 0.5, label: '50%' },
  { value: 0.75, label: '75%' },
  { value: 1, label: '100%' },
];

/** Подписи пресетов адаптива. */
const PRESET_NOTE: Readonly<Record<string, string>> = {
  w390: ' phone (default)',
  w360: ' phone S',
  w768: ' tablet',
  w1280: ' laptop',
  w1920: ' desktop',
};

/** Props листа настроек. */
export type SettingsSheetProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly dogfood: DogfoodActorsState;
};

/** Адаптив всех экранов карты. */
function MapAdaptiveField() {
  const hasDocument = useAppStore((s) => s.document !== null);
  const layout = useAppStore((s) => s.document?.layout);
  const setPreset = useAppStore((s) => s.setMapViewportPreset);
  const w = layout?.defaultDeviceViewport?.width ?? layout?.defaultWidth ?? 390;
  const h = layout?.defaultDeviceViewport?.height ?? layout?.defaultHeight ?? 844;
  const mode = layout?.defaultDeviceViewport?.heightMode ?? layout?.defaultHeightMode ?? 'fixed';
  const presets = resolveViewportPresets(layout);
  return (
    <Field
      label="Адаптив всех экранов (карта)"
      htmlFor="set-map-adaptive"
      hint={`Сейчас ${w}×${h} · ${mode}. Размер из layout JSON (fixed), не measure при рендере.`}
    >
      <Select
        id="set-map-adaptive"
        data-testid="map-adaptive-select"
        disabled={!hasDocument}
        value={presets.find((p) => p.width === w && p.height === h)?.id ?? 'w390'}
        onChange={(e) => setPreset(e.target.value)}
      >
        {presets.map((p) => (
          <option key={p.id} value={p.id}>
            {p.width}×{p.height}
            {PRESET_NOTE[p.id] ?? ''}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/** Сколько экранов живут, на паузе и закреплено. */
function IframeBudgetLine() {
  const liveCount = useAppStore((s) => s.livePageIds.size);
  const warmCount = useAppStore((s) => s.warmPageIds?.size ?? 0);
  const pinCount = useAppStore((s) => s.pinnedPageIds.size);
  const maxLive = useAppStore((s) => s.maxLiveIframes);
  // maxWarm / warmCount — keep-alive; запасное значение на случай частичного HMR store
  const maxWarm = useAppStore((s) => (typeof s.maxWarmIframes === 'number' ? s.maxWarmIframes : 8));
  return (
    <p className="drawer__hint" data-testid="iframe-budget">
      Живых экранов {liveCount}
      {maxLive >= 9999 ? '' : ` из ${maxLive}`} · на паузе {warmCount}
      {maxWarm >= 9999 ? '' : ` из ${maxWarm}`} · закреплено {pinCount}
    </p>
  );
}

/**
 * Лист настроек.
 *
 * @param props - открыт ли и пользователи dev-входа
 */
export function SettingsSheet(props: SettingsSheetProps) {
  const { open, onClose, dogfood } = props;
  const iframeScale = useAppStore((s) => s.iframeScale);
  const setIframeScale = useAppStore((s) => s.setIframeScale);
  const maxLive = useAppStore((s) => s.maxLiveIframes);
  const setMaxLive = useAppStore((s) => s.setMaxLiveIframes);
  const maxWarm = useAppStore((s) => (typeof s.maxWarmIframes === 'number' ? s.maxWarmIframes : 8));
  const setMaxWarm = useAppStore((s) => s.setMaxWarmIframes);
  const globalRole = useAppStore((s) => s.globalRole);
  const setGlobalRole = useAppStore((s) => s.setGlobalRole);
  const baseUrl = useAppStore((s) => s.baseUrlOverride);
  const setBaseUrl = useAppStore((s) => s.setBaseUrlOverride);
  return (
    <EdgeSheet
      open={open}
      side="right"
      title="Настройки просмотра"
      description="Масштаб превью, сколько экранов живут одновременно, роль и базовый URL."
      onClose={onClose}
    >
      <IframeBudgetLine />
      <Field label="Масштаб превью" htmlFor="set-scale">
        <Select
          id="set-scale"
          value={iframeScale}
          onChange={(e) => {
            const scale = SCALES.find((s) => s.value === Number(e.target.value));
            if (scale !== undefined) {
              setIframeScale(scale.value);
            }
          }}
        >
          {SCALES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </Field>

      <MapAdaptiveField />

      <BudgetField
        id="set-max"
        label="Макс. живых iframe"
        hint="Multi-iframe с бюджетом: pin + выбранный + видимые (по приоритету). Остальные — placeholder. «Без лимита» только для маленьких карт."
        value={maxLive}
        onChange={setMaxLive}
        counts={[4, 6, 8, 12, 16]}
        unlimitedLabel="Без лимита (осторожно)"
      />

      <BudgetField
        id="set-warm"
        label="Warm keep-alive"
        hint="Сколько iframe держать в DOM после ухода из live (без перезагрузки SPA). Pin не вытесняются первыми."
        value={maxWarm}
        onChange={setMaxWarm}
        counts={[0, 4, 6, 8, 12, 16]}
        zeroLabel="0 (сразу unmount)"
        unlimitedLabel="Без лимита warm"
      />

      <Field label="Роль (miniapp)" htmlFor="set-role" hint="Добавляет ?lam_role=… к live URL.">
        <Select id="set-role" value={globalRole} onChange={(e) => setGlobalRole(e.target.value)}>
          <option value="">Без роли</option>
          <option value="recruiter">Рекрутер</option>
          <option value="employer">Клиент (работодатель)</option>
        </Select>
      </Field>

      <Field label="Базовый URL" htmlFor="set-base" hint="Куда смотрят live-iframe (dev-сервер приложения).">
        <Input
          id="set-base"
          value={baseUrl}
          placeholder="https://vite.localhost:5175"
          onChange={(e) => setBaseUrl(e.target.value)}
          onBlur={(e) => setBaseUrl(e.target.value)}
        />
      </Field>

      <TlsProxyBlock />

      <SessionProfilesPanel actors={dogfood.actors} actorsError={dogfood.error} apiBase={getKorborApiBase()} />
    </EdgeSheet>
  );
}
