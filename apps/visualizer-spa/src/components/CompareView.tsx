/**
 * Вид «Сравнение»: две версии карты — «было» и «стало» (открытая карта, файл на
 * диске, коммит из истории, свежий скан, файл с компьютера) — и что добавилось,
 * пропало и изменилось: экраны, роуты, таблицы, связи.
 */
import { useEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { AppMapDocument } from '@live-app-map/schema';
import { compareMaps, type CompareChange, type CompareSection } from '../lib/compare-view-model';
import { fetchMapVersions, loadVersion, type LoadedVersion, type MapVersionInfo, type VersionChoice } from '../lib/map-compare-client';
import { importMapFile } from '../lib/import-map';
import { targetTitle, useMapNav } from '../lib/use-map-nav';
import { useAppStore } from '../store/app-store';
import { useMapSourceStore, type MapSourceRef } from '../store/map-source-store';
import { Button, Field, Select } from '../ui';

const CHANGE_WORDS: Readonly<Record<CompareChange, string>> = { added: 'добавлено', removed: 'пропало', changed: 'изменено' };
const CHANGE_MARKS: Readonly<Record<CompareChange, string>> = { added: '+', removed: '−', changed: '~' };

/** Значение селекта по выбору. */
function choiceKey(c: VersionChoice): string {
  return c.kind === 'git' ? `git:${c.ref}` : c.kind === 'file' ? 'file-chosen' : c.kind;
}

/** Дата коммита: `21.11 17:13`. */
function shortDate(iso: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  return m === null ? iso : `${m[2]}.${m[1]} ${m[3]}:${m[4]}`;
}

/** Состояние стороны сравнения. */
type Side = { readonly choice: VersionChoice; readonly loaded: LoadedVersion | null };

/** Выбор по значению селекта (кроме «Файл с компьютера…», который открывает диалог). */
function choiceOf(value: string, versions: readonly MapVersionInfo[]): VersionChoice {
  const v = versions.find((x) => `git:${x.ref}` === value);
  if (v !== undefined) {
    return { kind: 'git', ref: v.ref };
  }
  return value === 'disk' ? { kind: 'disk' } : value === 'scan' ? { kind: 'scan' } : { kind: 'open' };
}

/** Скрытое поле файла: выбранный файл — версия (неразобранный — с json: null). */
function MapFileInput(props: { readonly inputRef: RefObject<HTMLInputElement | null>; readonly testId: string; readonly onChoose: (c: VersionChoice) => void }) {
  return (
    <input
      ref={props.inputRef}
      type="file"
      accept=".json,application/json"
      hidden
      data-testid={`${props.testId}-file`}
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (f !== undefined) {
          void importMapFile(f).then((r) => props.onChoose({ kind: 'file', name: f.name, json: r.ok ? r.json : null }));
        }
      }}
    />
  );
}

/** Селект версии с загрузкой файла. */
function VersionPicker(props: {
  readonly label: string;
  readonly testId: string;
  readonly side: Side;
  readonly versions: readonly MapVersionInfo[];
  readonly catalog: boolean;
  readonly onChoose: (c: VersionChoice) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { side, versions, catalog } = props;
  const fileName = side.choice.kind === 'file' ? side.choice.name : null;
  const onSelect = (value: string): void => {
    if (value === 'file') {
      fileRef.current?.click();
      return;
    }
    props.onChoose(choiceOf(value, versions));
  };
  return (
    <Field label={props.label} className="cmp-view__picker">
      <Select aria-label={props.label} data-testid={props.testId} value={choiceKey(side.choice)} onChange={(e) => onSelect(e.target.value)}>
        <option value="open">Открытая карта</option>
        <option value="disk" disabled={!catalog}>
          Файл на диске
        </option>
        <option value="scan" disabled={!catalog}>
          Свежий скан
        </option>
        {versions.map((v) => (
          <option key={v.ref} value={`git:${v.ref}`}>
            {shortDate(v.date)} · {v.ref.slice(0, 7)} · {v.subject}
          </option>
        ))}
        {fileName === null ? null : <option value="file-chosen" hidden>Файл: {fileName}</option>}
        <option value="file">Файл с компьютера…</option>
      </Select>
      <MapFileInput inputRef={fileRef} testId={props.testId} onChoose={props.onChoose} />
    </Field>
  );
}

/** Сколько строк раздела показать сразу. */
const SHOWN = 40;

/** Сводка раздела: `+3 −1 ~2`. */
function sectionSummary(section: CompareSection): string {
  if (section.items.length === 0) {
    return 'без изменений';
  }
  const count = (c: CompareChange): number => section.items.filter((i) => i.change === c).length;
  const order: readonly CompareChange[] = ['added', 'removed', 'changed'];
  return order
    .filter((c) => count(c) > 0)
    .map((c) => `${CHANGE_MARKS[c]}${count(c)}`)
    .join(' ');
}

/** Строка раздела: знак изменения, подпись (кнопкой, если ведёт на открытую карту), подробность. */
function CompareRow(props: { readonly item: CompareSection['items'][number]; readonly navigable: boolean }) {
  const nav = useMapNav();
  const it = props.item;
  const target = props.navigable ? it.target : undefined;
  return (
    <li className={`cmp-view__item cmp-view__item--${it.change}`} data-change={it.change} data-testid="compare-item">
      <span className="cmp-view__mark" title={CHANGE_WORDS[it.change]} aria-label={CHANGE_WORDS[it.change]}>
        {CHANGE_MARKS[it.change]}
      </span>
      {target === undefined ? (
        <span>{it.label}</span>
      ) : (
        <button type="button" className="db-view__link" title={targetTitle(target)} onClick={() => nav(target)}>
          {it.label}
        </button>
      )}
      {it.detail === undefined ? null : <span className="cmp-view__detail">{it.detail}</span>}
    </li>
  );
}

/** Раздел результата. */
function SectionList(props: { readonly section: CompareSection; readonly navigable: boolean }) {
  const [all, setAll] = useState(false);
  const { section } = props;
  if (section.items.length === 0 && section.key === 'nodes') {
    return null;
  }
  const shown = all ? section.items : section.items.slice(0, SHOWN);
  return (
    <section className="cmp-view__section" data-testid={`compare-${section.key}`}>
      <h3>
        {section.title} <span className="db-view__count" data-testid="compare-summary">{sectionSummary(section)}</span>
      </h3>
      <ul className="cmp-view__items">
        {shown.map((it) => (
          <CompareRow key={`${it.change}:${it.id}`} item={it} navigable={props.navigable} />
        ))}
      </ul>
      {section.items.length > SHOWN ? (
        <Button type="button" size="sm" variant="ghost" onClick={() => setAll(!all)}>
          {all ? 'Свернуть' : `Показать ещё ${section.items.length - SHOWN}`}
        </Button>
      ) : null}
    </section>
  );
}

/** Подпись источника открытой карты. */
function sourceLabel(source: MapSourceRef | null): string {
  if (source === null) {
    return 'карта не открыта';
  }
  return source.kind === 'catalog' ? source.label : `файл ${source.name}`;
}

/**
 * Коммиты файла карты; «было» по умолчанию — последний из них, если пользователь
 * ещё не выбрал «было» сам.
 */
function useMapVersions(mapId: string | null, leftTouched: RefObject<boolean>, setLeft: Dispatch<SetStateAction<Side>>): { readonly versions: readonly MapVersionInfo[]; readonly error: string | null } {
  const [versions, setVersions] = useState<readonly MapVersionInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (mapId === null) {
      setVersions([]);
      return;
    }
    let cancelled = false;
    void fetchMapVersions(mapId).then((r) => {
      if (cancelled) {
        return;
      }
      setVersions(r.ok ? r.versions : []);
      setError(r.ok ? null : r.error);
      const last = r.ok ? r.versions[0] : undefined;
      if (last !== undefined && !leftTouched.current) {
        setLeft({ choice: { kind: 'git', ref: last.ref }, loaded: null });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [mapId]);
  return { versions, error };
}

/** Итог и разделы; переходы — только когда «стало» — открытая карта. */
function CompareResult(props: { readonly left: Side; readonly right: Side }) {
  const leftDoc = props.left.loaded?.ok === true ? props.left.loaded.document : null;
  const rightDoc = props.right.loaded?.ok === true ? props.right.loaded.document : null;
  const result = useMemo(() => (leftDoc === null || rightDoc === null ? null : compareMaps(leftDoc, rightDoc)), [leftDoc, rightDoc]);
  if (result === null) {
    return null;
  }
  return (
    <>
      <p className="cmp-view__total" data-testid="compare-total">
        {result.total === 0 ? 'Версии совпадают: изменений нет.' : `Изменений: ${result.total}`}
      </p>
      {result.sections.map((s) => (
        <SectionList key={s.key} section={s} navigable={props.right.choice.kind === 'open'} />
      ))}
    </>
  );
}

/** Вид «Сравнение». */
export function CompareView() {
  const open = useAppStore((s) => s.document);
  const source = useMapSourceStore((s) => s.source);
  const mapId = source?.kind === 'catalog' ? source.id : null;
  const mapPath = source?.kind === 'catalog' ? source.path : null;
  const [left, setLeft] = useState<Side>({ choice: { kind: mapId === null ? 'open' : 'disk' }, loaded: null });
  const [right, setRight] = useState<Side>({ choice: { kind: 'open' }, loaded: null });
  /** Пользователь сам выбрал «было» — история его не перезаписывает. */
  const leftTouched = useRef(false);
  const history = useMapVersions(mapId, leftTouched, setLeft);
  useVersion(left, setLeft, { open, mapId, mapPath });
  useVersion(right, setRight, { open, mapId, mapPath });
  const catalog = mapId !== null;

  return (
    <div className="cmp-view" data-testid="compare-view">
      <header className="cmp-view__head">
        <h2>Сравнение карты</h2>
        <span className="drawer__hint">{sourceLabel(source)}</span>
      </header>
      <div className="cmp-view__pickers">
        <VersionPicker label="Было" testId="compare-left" side={left} versions={history.versions} catalog={catalog} onChoose={(c) => {
            leftTouched.current = true;
            setLeft({ choice: c, loaded: null });
          }}
        />
        <VersionPicker label="Стало" testId="compare-right" side={right} versions={history.versions} catalog={catalog} onChoose={(c) => setRight({ choice: c, loaded: null })} />
      </div>
      {history.error === null ? null : <p className="drawer__hint">История карты недоступна: {history.error}</p>}
      {!catalog ? <p className="drawer__hint">Карта открыта из файла: история, файл на диске и свежий скан есть только у карт каталога.</p> : null}
      <SideStatus name="Было" side={left} />
      <SideStatus name="Стало" side={right} />
      <CompareResult left={left} right={right} />
    </div>
  );
}

/** Загрузка или ошибка стороны. */
function SideStatus(props: { readonly name: string; readonly side: Side }) {
  const { side } = props;
  if (side.loaded === null) {
    return (
      <p className="drawer__hint" data-testid="compare-loading">
        {props.name}: {side.choice.kind === 'scan' ? 'сканирую проект…' : 'загружаю…'}
      </p>
    );
  }
  return side.loaded.ok ? null : (
    <p className="cmp-view__error" role="alert">
      {props.name}: {side.loaded.error}
    </p>
  );
}

/**
 * Загружает документ стороны, когда выбор поменялся (loaded сброшен в null).
 * Ответ пишется, только если выбор стороны всё ещё тот же: иначе поздний ответ
 * прежней версии затёр бы новый выбор (например, коммит из истории).
 */
function useVersion(side: Side, set: Dispatch<SetStateAction<Side>>, ctx: { open: AppMapDocument | null; mapId: string | null; mapPath: string | null }): void {
  const { choice, loaded } = side;
  const { open, mapId, mapPath } = ctx;
  useEffect(() => {
    if (loaded !== null) {
      return;
    }
    let cancelled = false;
    void loadVersion(choice, { open, mapId, mapPath }).then((r) => {
      if (!cancelled) {
        set((cur) => (cur.choice === choice ? { choice, loaded: r } : cur));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [choice, loaded, open, mapId, mapPath, set]);
}
