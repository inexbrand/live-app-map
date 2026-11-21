/**
 * Вид «Сравнение»: две версии карты — «было» и «стало» (открытая карта, файл на
 * диске, коммит из истории, свежий скан, файл с компьютера) — и что добавилось,
 * пропало и изменилось: экраны, роуты, таблицы, связи.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppMapDocument } from '@live-app-map/schema';
import { compareMaps, type CompareChange, type CompareSection } from '../lib/compare-view-model';
import { fetchMapVersions, loadVersion, type LoadedVersion, type MapVersionInfo, type VersionChoice } from '../lib/map-compare-client';
import { importMapFile } from '../lib/import-map';
import { targetTitle, useMapNav } from '../lib/use-map-nav';
import { useAppStore } from '../store/app-store';
import { useMapSourceStore } from '../store/map-source-store';
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
    const v = versions.find((x) => `git:${x.ref}` === value);
    props.onChoose(v !== undefined ? { kind: 'git', ref: v.ref } : value === 'disk' ? { kind: 'disk' } : value === 'scan' ? { kind: 'scan' } : { kind: 'open' });
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
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        data-testid={`${props.testId}-file`}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f !== undefined) {
            void importMapFile(f).then((r) => props.onChoose(r.ok ? { kind: 'file', name: f.name, json: r.json } : { kind: 'file', name: f.name, json: null }));
          }
        }}
      />
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

/** Раздел результата. */
function SectionList(props: { readonly section: CompareSection; readonly navigable: boolean }) {
  const nav = useMapNav();
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
          <li key={`${it.change}:${it.id}`} className={`cmp-view__item cmp-view__item--${it.change}`} data-change={it.change} data-testid="compare-item">
            <span className="cmp-view__mark" title={CHANGE_WORDS[it.change]} aria-label={CHANGE_WORDS[it.change]}>
              {CHANGE_MARKS[it.change]}
            </span>
            {props.navigable && it.target !== undefined ? (
              <button type="button" className="db-view__link" title={targetTitle(it.target)} onClick={() => (it.target === undefined ? undefined : nav(it.target))}>
                {it.label}
              </button>
            ) : (
              <span>{it.label}</span>
            )}
            {it.detail === undefined ? null : <span className="cmp-view__detail">{it.detail}</span>}
          </li>
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

/** Вид «Сравнение». */
export function CompareView() {
  const open = useAppStore((s) => s.document);
  const source = useMapSourceStore((s) => s.source);
  const mapId = source?.kind === 'catalog' ? source.id : null;
  const mapPath = source?.kind === 'catalog' ? source.path : null;
  const [versions, setVersions] = useState<readonly MapVersionInfo[]>([]);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [left, setLeft] = useState<Side>({ choice: { kind: mapId === null ? 'open' : 'disk' }, loaded: null });
  const [right, setRight] = useState<Side>({ choice: { kind: 'open' }, loaded: null });
  /** Пользователь сам выбрал «было» — история его не перезаписывает. */
  const leftTouched = useRef(false);

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
      setVersionsError(r.ok ? null : r.error);
      // «Было» по умолчанию — последний коммит файла карты.
      const last = r.ok ? r.versions[0] : undefined;
      if (last !== undefined && !leftTouched.current) {
        setLeft({ choice: { kind: 'git', ref: last.ref }, loaded: null });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [mapId]);

  useVersion(left, setLeft, { open, mapId, mapPath });
  useVersion(right, setRight, { open, mapId, mapPath });

  const leftDoc = left.loaded?.ok === true ? left.loaded.document : null;
  const rightDoc = right.loaded?.ok === true ? right.loaded.document : null;
  const result = useMemo(() => (leftDoc === null || rightDoc === null ? null : compareMaps(leftDoc, rightDoc)), [leftDoc, rightDoc]);
  const catalog = mapId !== null;

  return (
    <div className="cmp-view" data-testid="compare-view">
      <header className="cmp-view__head">
        <h2>Сравнение карты</h2>
        <span className="drawer__hint">{source === null ? 'карта не открыта' : source.kind === 'catalog' ? source.label : `файл ${source.name}`}</span>
      </header>
      <div className="cmp-view__pickers">
        <VersionPicker label="Было" testId="compare-left" side={left} versions={versions} catalog={catalog} onChoose={(c) => {
            leftTouched.current = true;
            setLeft({ choice: c, loaded: null });
          }}
        />
        <VersionPicker label="Стало" testId="compare-right" side={right} versions={versions} catalog={catalog} onChoose={(c) => setRight({ choice: c, loaded: null })} />
      </div>
      {versionsError === null ? null : <p className="drawer__hint">История карты недоступна: {versionsError}</p>}
      {!catalog ? <p className="drawer__hint">Карта открыта из файла: история, файл на диске и свежий скан есть только у карт каталога.</p> : null}
      <SideStatus name="Было" side={left} />
      <SideStatus name="Стало" side={right} />
      {result === null ? null : (
        <>
          <p className="cmp-view__total" data-testid="compare-total">
            {result.total === 0 ? 'Версии совпадают: изменений нет.' : `Изменений: ${result.total}`}
          </p>
          {result.sections.map((s) => (
            <SectionList key={s.key} section={s} navigable={right.choice.kind === 'open'} />
          ))}
        </>
      )}
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

/** Загружает документ стороны, когда выбор поменялся (loaded сброшен в null). */
function useVersion(side: Side, set: (s: Side) => void, ctx: { open: AppMapDocument | null; mapId: string | null; mapPath: string | null }): void {
  const { choice, loaded } = side;
  const { open, mapId, mapPath } = ctx;
  useEffect(() => {
    if (loaded !== null) {
      return;
    }
    let cancelled = false;
    void loadVersion(choice, { open, mapId, mapPath }).then((r) => {
      if (!cancelled) {
        set({ choice, loaded: r });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [choice, loaded, open, mapId, mapPath, set]);
}
