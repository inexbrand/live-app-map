/**
 * Лист «Настройки просмотра»: тема и простые вещи сверху (масштаб, размер экранов, роль),
 * техника — под «Для разработчика» (сколько экранов живут, адрес приложения, прокси).
 */
import { resolveViewportPresets } from '../../lib/viewport-presets';
import { mapAdaptive } from './map-adaptive';
import { useAppStore } from '../../store/app-store';
import { ChevronDown, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { applyTheme, currentTheme, type Theme } from '../../lib/theme';
import { OptionSelect } from '../option-select';
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

/** Тема интерфейса: светлая или тёмная (то же делает клавиша T). */
function ThemeField() {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  useEffect(() => {
    const mo = new MutationObserver(() => setTheme(currentTheme()));
    mo.observe(window.document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);
  return (
    <Field>
      <FieldLabel>Тема</FieldLabel>
      <ToggleGroup
        variant="outline"
        aria-label="Тема"
        value={[theme]}
        onValueChange={(v) => {
          const next = v[0];
          if (next === 'dark' || next === 'light') {
            applyTheme(next);
          }
        }}
      >
        <ToggleGroupItem value="dark" aria-label="Тёмная" data-testid="theme-dark">
          <Moon />
          Тёмная
        </ToggleGroupItem>
        <ToggleGroupItem value="light" aria-label="Светлая" data-testid="theme-light">
          <Sun />
          Светлая
        </ToggleGroupItem>
      </ToggleGroup>
      <FieldDescription>Клавиша T переключает тему с любого экрана.</FieldDescription>
    </Field>
  );
}

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
    <Field>
      <FieldLabel htmlFor="set-map-adaptive">Размер всех экранов</FieldLabel>
      <OptionSelect
        id="set-map-adaptive"
        aria-label="Размер всех экранов"
        data-testid="map-adaptive-select"
        disabled={!hasDocument}
        value={presetId}
        onValueChange={setPreset}
        items={presets.map((p) => ({ value: p.id, label: `${p.width}×${p.height}${PRESET_NOTE[p.id] ?? ''}` }))}
      />
      <FieldDescription>{`Сейчас ${w}×${h}, ${mode === 'auto' ? 'страница целиком' : 'окно с прокруткой'}.`}</FieldDescription>
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
    <p className="text-sm text-muted-foreground" data-testid="iframe-budget">
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
    <Field>
      <FieldLabel htmlFor="set-scale">Масштаб превью</FieldLabel>
      <OptionSelect
        id="set-scale"
        aria-label="Масштаб превью"
        value={String(iframeScale)}
        items={SCALES.map((s) => ({ value: String(s.value), label: s.label }))}
        onValueChange={(v) => {
          const scale = SCALES.find((s) => s.value === Number(v));
          if (scale !== undefined) {
            setIframeScale(scale.value);
          }
        }}
      />
    </Field>
  );
}

/** Состояния экранов узлами рядом с экраном (по умолчанию включено). */
function StatesField() {
  const show = useAppStore((s) => s.showStates);
  const setShow = useAppStore((s) => s.setShowStates);
  return (
    <Field orientation="horizontal">
      <Switch id="set-states" checked={show} onCheckedChange={(v) => setShow(v)} data-testid="show-states" />
      <FieldLabel htmlFor="set-states">Состояния</FieldLabel>
      <FieldDescription>Пустой список, ошибка, открытая модалка — отдельными экранами рядом со своим экраном.</FieldDescription>
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
    <Collapsible className="flex flex-col gap-4 border-t pt-4">
      <CollapsibleTrigger render={<Button variant="ghost" size="sm" className="w-fit" />}>
        Для разработчика
        <ChevronDown />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-5">
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
        <Field>
          <FieldLabel htmlFor="set-base">Адрес приложения</FieldLabel>
          <Input id="set-base" value={baseUrl} placeholder="https://vite.localhost:5175" onChange={(e) => setBaseUrl(e.target.value)} onBlur={(e) => setBaseUrl(e.target.value)} />
          <FieldDescription>Где запущено приложение, чьи экраны показывает карта.</FieldDescription>
        </Field>
        <TlsProxyBlock />
      </CollapsibleContent>
    </Collapsible>
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
      <ThemeField />
      <IframeBudgetLine />
      <ScaleField />
      <StatesField />
      <MapAdaptiveField />
      <DeveloperBlock />
    </EdgeSheet>
  );
}
