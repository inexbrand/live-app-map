/**
 * Лист «Настройки просмотра»: простые вещи сверху (масштаб, размер экранов, роль),
 * техника — под «Для разработчика» (сколько экранов живут, адрес приложения, прокси).
 */
import { resolveViewportPresets } from '../../lib/viewport-presets';
import { mapAdaptive } from './map-adaptive';
import { useAppStore } from '../../store/app-store';
import { Field, Input, Select } from '../../ui';
import { EdgeSheet } from '../EdgeSheet';
import { BudgetField } from './BudgetField';
import { TlsProxyBlock } from './TlsProxyBlock';

/** Масштабы превью экранов. */
const SCALES: ReadonlyArray<{ readonly value: 0.25 | 0.35 | 0.5 | 0.75 | 1; readonly label: string }> = [
  { value: 0.25, label: '25% — обзор карты' },
  { value: 0.35, label: '35%' },
  { value: 0.5, label: '50%' },
  { value: 0.75, label: '75%' },
  { value: 1, label: '100%' },
];

/** Подписи размеров экранов. */
const PRESET_NOTE: Readonly<Record<string, string>> = {
  w390: ' · телефон (по умолчанию)',
  w360: ' · маленький телефон',
  w768: ' · планшет',
  w1280: ' · ноутбук',
  w1920: ' · монитор',
};

/** Props листа настроек. */
export type SettingsSheetProps = {
  readonly open: boolean;
  readonly onClose: () => void;
};

/** Размер всех экранов карты. */
function MapAdaptiveField() {
  const hasDocument = useAppStore((s) => s.document !== null);
  const layout = useAppStore((s) => s.document?.layout);
  const setPreset = useAppStore((s) => s.setMapViewportPreset);
  const { w, h, mode, presetId } = mapAdaptive(layout);
  const presets = resolveViewportPresets(layout);
  return (
    <Field label="Размер всех экранов" htmlFor="set-map-adaptive" hint={`Сейчас ${w}×${h}, ${mode === 'auto' ? 'страница целиком' : 'окно с прокруткой'}.`}>
      <Select id="set-map-adaptive" data-testid="map-adaptive-select" disabled={!hasDocument} value={presetId} onChange={(e) => setPreset(e.target.value)}>
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
  const warmCount = useAppStore((s) => s.warmPageIds.size);
  const pinCount = useAppStore((s) => s.pinnedPageIds.size);
  const maxLive = useAppStore((s) => s.maxLiveIframes);
  const maxWarm = useAppStore((s) => s.maxWarmIframes);
  return (
    <p className="drawer__hint" data-testid="iframe-budget">
      Живых экранов {liveCount}
      {maxLive >= 9999 ? '' : ` из ${maxLive}`} · на паузе {warmCount}
      {maxWarm >= 9999 ? '' : ` из ${maxWarm}`} · закреплено {pinCount}
    </p>
  );
}

/** Масштаб превью. */
function ScaleField() {
  const iframeScale = useAppStore((s) => s.iframeScale);
  const setIframeScale = useAppStore((s) => s.setIframeScale);
  return (
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
  );
}

/** Роль, от лица которой открываются экраны. */
function RoleField() {
  const globalRole = useAppStore((s) => s.globalRole);
  const setGlobalRole = useAppStore((s) => s.setGlobalRole);
  return (
    <Field label="Смотреть как" htmlFor="set-role" hint="Экраны мини-приложения откроются от лица этой роли.">
      <Select id="set-role" value={globalRole} onChange={(e) => setGlobalRole(e.target.value)}>
        <option value="">Без роли</option>
        <option value="recruiter">Рекрутер</option>
        <option value="employer">Клиент (работодатель)</option>
      </Select>
    </Field>
  );
}

/** Техника: сколько экранов живут, адрес приложения, прокси. */
function DeveloperBlock() {
  const maxLive = useAppStore((s) => s.maxLiveIframes);
  const setMaxLive = useAppStore((s) => s.setMaxLiveIframes);
  const maxWarm = useAppStore((s) => s.maxWarmIframes);
  const setMaxWarm = useAppStore((s) => s.setMaxWarmIframes);
  const baseUrl = useAppStore((s) => s.baseUrlOverride);
  const setBaseUrl = useAppStore((s) => s.setBaseUrlOverride);
  return (
    <details className="sheet-block settings-dev">
      <summary>Для разработчика</summary>
      <BudgetField
        id="set-max"
        label="Сколько экранов живут одновременно"
        hint="Закреплённые, выбранный и видимые на холсте. Остальные показывают снимок. Без предела — только для маленьких карт."
        value={maxLive}
        onChange={setMaxLive}
        counts={[4, 6, 8, 12, 16]}
        unlimitedLabel="Без предела (тяжело)"
      />
      <BudgetField
        id="set-warm"
        label="Сколько экранов держать на паузе"
        hint="Ушедший с экрана сохраняет своё состояние и не перезагружается. Закреплённые выгружаются последними."
        value={maxWarm}
        onChange={setMaxWarm}
        counts={[0, 4, 6, 8, 12, 16]}
        zeroLabel="0 — выгружать сразу"
        unlimitedLabel="Без предела"
      />
      <Field label="Адрес приложения" htmlFor="set-base" hint="Где запущено приложение, чьи экраны показывает карта.">
        <Input id="set-base" value={baseUrl} placeholder="https://vite.localhost:5175" onChange={(e) => setBaseUrl(e.target.value)} onBlur={(e) => setBaseUrl(e.target.value)} />
      </Field>
      <TlsProxyBlock />
    </details>
  );
}

/**
 * Лист настроек.
 *
 * @param props - открыт ли и как закрыть
 */
export function SettingsSheet(props: SettingsSheetProps) {
  const { open, onClose } = props;
  return (
    <EdgeSheet open={open} side="right" title="Настройки просмотра" description="Как выглядят экраны на карте." onClose={onClose}>
      <IframeBudgetLine />
      <ScaleField />
      <MapAdaptiveField />
      <RoleField />
      <DeveloperBlock />
    </EdgeSheet>
  );
}
