/**
 * Вид «API»: архитектура API проекта — сервисы, разделы и модули роутов, фильтры
 * (поиск, метод, сервис, таблица, «без описания», «без экранов»), карточка роута:
 * авторское описание и собранное из кода, вход, доступ, таблицы, экраны (или почему
 * их нет), файл:строка. Переходы роут ↔ таблица ↔ экран.
 */
import { useEffect, useMemo, useRef, type RefObject } from 'react';

import { AUTO_DOC_NOTE, buildCodeIndex, type ApiFilter, type CodeIndex } from '@live-app-map/graph';
import type { HttpMethod } from '@live-app-map/schema';
import { apiViewState, routeCard, routeOneLine } from '../lib/api-view-model';

import { useAppStore } from '../store/app-store';
import { useViewStore } from '../store/view-store';
import { Button, Chip, Input, Select } from '../ui';
import { EmptyView } from '../ui/empty-view';
import { Card, Marks, Method, usualChecks, type UsualChecks } from './ApiRouteCard';

/** Пустой фильтр. */
const EMPTY: ApiFilter = {};

/** Число заданных условий фильтра. */
function filterCount(f: ApiFilter): number {
  return [
    f.query !== undefined && f.query !== '',
    (f.methods?.length ?? 0) > 0,
    f.service !== undefined && f.service !== '',
    f.table !== undefined && f.table !== '',
    f.undocumented === true,
    f.noScreens === true,
  ].filter(Boolean).length;
}

type ApiState = NonNullable<ReturnType<typeof apiViewState>>;
type Module = ApiState['tree'][number]['sections'][number]['modules'][number] & { readonly service: string };
type Coverage = ApiState['coverage'];
type SetFilter = (patch: Partial<ApiFilter>) => void;

/** Список методов после щелчка по методу: был — убрать, не было — добавить. */
function toggledMethods(methods: readonly HttpMethod[] | undefined, m: HttpMethod): HttpMethod[] {
  const now = new Set(methods ?? []);
  if (now.has(m)) {
    now.delete(m);
  } else {
    now.add(m);
  }
  return [...now];
}

/** Префикс внутри выбранного раздела дерева (null — все). */
function inScope(scope: string | null, prefix: string): boolean {
  return scope === null || prefix === scope || prefix.startsWith(`${scope}/`);
}

/** Модули выбранного раздела, с именем сервиса. */
function scopedModules(state: ApiState, scope: string | null): Module[] {
  return state.tree.flatMap((s) =>
    s.sections.flatMap((sec) => sec.modules.filter((m) => inScope(scope, m.prefix)).map((m) => ({ service: s.service.name, ...m }))),
  );
}

/** Роуты больше чем одного сервиса — показывать сервисы. */
function hasManyServices(index: CodeIndex): boolean {
  return index.code.services.filter((s) => index.code.routes.some((r) => r.serviceId === s.id)).length > 1;
}

/** Строка покрытия. */
type CoverageRow = { readonly label: string; readonly value: number; readonly onClick?: () => void; readonly hint?: string };

/** Строки покрытия API; две из них включают фильтр. */
function coverageRows(cov: Coverage, filter: ApiFilter, set: SetFilter): CoverageRow[] {
  return [
    { label: 'Описания авторов', value: cov.described, onClick: () => set({ undocumented: filter.undocumented !== true }), hint: 'Нажмите — только роуты без авторского описания' },
    { label: 'Описания из кода', value: cov.autoDescribed, hint: `${AUTO_DOC_NOTE}: вход, таблицы, доступ или ответ` },
    { label: 'Проверка входа', value: cov.withInput },
    { label: 'Доступ', value: cov.withAccess },
    {
      label: 'Вызываются экранами',
      value: cov.withScreens,
      onClick: () => set({ noScreens: filter.noScreens !== true }),
      hint: `Нажмите — только роуты без экранов. Не доходит ни один экран: ${cov.gaps.unreached}, не из экранов: ${cov.gaps.otherClient}, никто не вызывает: ${cov.gaps.noCaller}`,
    },
  ];
}

/** Доля в процентах для полосы (из нуля роутов — 0). */
function percent(value: number, total: number): number {
  return total === 0 ? 0 : Math.round((value / total) * 100);
}

/** Покрытие API: одна строка-итог, строки с полосами — по раскрытию. */
function CoverageList(props: { readonly cov: Coverage; readonly filter: ApiFilter; readonly set: SetFilter }) {
  const { cov } = props;
  return (
    <details className="api-coverage-box" data-testid="api-coverage-box">
      <summary>
        Покрытие: описано {cov.described} из {cov.routes} · вызываются экранами {cov.withScreens} из {cov.routes}
      </summary>
    <dl className="api-coverage" data-testid="api-coverage">
      {coverageRows(cov, props.filter, props.set).map((c) => (
        <div key={c.label} className={`api-coverage__row${c.onClick === undefined ? '' : ' api-coverage__row--click'}`} onClick={c.onClick} title={c.hint}>
          <dt>{c.label}</dt>
          <dd>
            {c.value} из {cov.routes}
          </dd>
          <span className="api-coverage__bar">
            <span style={{ width: `${percent(c.value, cov.routes)}%` }} />
          </span>
        </div>
      ))}
    </dl>
    </details>
  );
}

/** Класс строки дерева: выбранная подсвечена. */
function treeRowClass(base: string, on: boolean): string {
  return `${base}${on ? ' api-tree__row--on' : ''}`;
}

/** Раздел дерева и, если он открыт и модулей несколько, его модули. */
function TreeSection(props: { readonly sec: ApiState['tree'][number]['sections'][number]; readonly scope: string | null; readonly setScope: (p: string | null) => void }) {
  const { sec, scope, setScope } = props;
  const showModules = inScope(scope, sec.prefix) && scope !== null && sec.modules.length > 1;
  return (
    <div>
      <button type="button" className={treeRowClass('api-tree__row', scope === sec.prefix)} onClick={() => setScope(sec.prefix)} title={sec.prefix} data-testid="api-section">
        <span>{sec.name}</span>
        <span className="api-count">{sec.count}</span>
      </button>
      {showModules
        ? sec.modules.map((m) => (
            <button key={m.prefix} type="button" className={treeRowClass('api-tree__row api-tree__row--module', scope === m.prefix)} onClick={() => setScope(m.prefix)} title={m.prefix}>
              <span>{m.name}</span>
              <span className="api-count">{m.routes.length}</span>
            </button>
          ))
        : null}
    </div>
  );
}

/** Дерево разделов: все роуты, сервисы, разделы, модули. */
function ApiTree(props: { readonly state: ApiState; readonly multiService: boolean; readonly scope: string | null; readonly setScope: (p: string | null) => void }) {
  const { state, scope, setScope } = props;
  return (
    <nav className="api-tree__nav" aria-label="Разделы API">
      <button type="button" className={treeRowClass('api-tree__row', scope === null)} onClick={() => setScope(null)}>
        <span>Все роуты</span>
        <span className="api-count">{state.routes.length}</span>
      </button>
      {state.tree.map((s) => (
        <div key={s.service.id} className="api-tree__service">
          {props.multiService ? <p className="api-tree__service-name">{s.service.name}</p> : null}
          {s.sections.map((sec) => (
            <TreeSection key={sec.prefix} sec={sec} scope={scope} setScope={setScope} />
          ))}
        </div>
      ))}
    </nav>
  );
}

/** Фильтры списка: поиск, методы, сервис, таблица, «без описания», «без экранов», сброс. */
function ApiFilters(props: { readonly index: CodeIndex; readonly state: ApiState; readonly filter: ApiFilter; readonly set: SetFilter; readonly reset: () => void; readonly multiService: boolean }) {
  const { index, state, filter, set } = props;
  const n = filterCount(filter);
  return (
    <div className="api-filters" role="search">
      <Input id="api-search" aria-label="Поиск роутов" value={filter.query ?? ''} placeholder="Путь, описание, обработчик, файл" onChange={(e) => set({ query: e.target.value })} />
      <div className="api-filters__row">
        {state.methods.map((m) => (
          <Chip key={m} active={filter.methods?.includes(m) === true} onClick={() => set({ methods: toggledMethods(filter.methods, m) })} data-testid={`api-method-${m}`}>
            {m}
          </Chip>
        ))}
        {props.multiService ? (
          <Select aria-label="Сервис" value={filter.service ?? ''} onChange={(e) => set({ service: e.target.value })}>
            <option value="">Все сервисы</option>
            {state.tree.map((s) => (
              <option key={s.service.id} value={s.service.id}>
                {s.service.name}
              </option>
            ))}
          </Select>
        ) : null}
        <Input
          id="api-table"
          list="api-tables"
          aria-label="Таблица"
          className="api-filters__table"
          value={filter.table ?? ''}
          placeholder="Таблица"
          onChange={(e) => set({ table: e.target.value })}
        />
        <datalist id="api-tables">
          {index.code.tables.map((t) => (
            <option key={t.id} value={t.name} />
          ))}
        </datalist>
        <Chip active={filter.undocumented === true} onClick={() => set({ undocumented: filter.undocumented !== true })} data-testid="api-undocumented" title="Без авторского описания">
          Без описания
        </Chip>
        <Chip active={filter.noScreens === true} onClick={() => set({ noScreens: filter.noScreens !== true })} data-testid="api-no-screens">
          Без экранов
        </Chip>
        {n === 0 ? null : (
          <Button type="button" size="sm" variant="ghost" onClick={props.reset}>
            Сбросить ({n})
          </Button>
        )}
      </div>
    </div>
  );
}

/** Строка роута в списке. */
function RouteRow(props: { readonly index: CodeIndex; readonly route: Module['routes'][number]; readonly usual: UsualChecks; readonly selected: string | null; readonly openRoute: (id: string) => void }) {
  const { route: r } = props;
  const line = routeOneLine(props.index, r);
  return (
    <li>
      <button type="button" className={`api-row${r.id === props.selected ? ' api-row--on' : ''}`} onClick={() => props.openRoute(r.id)} data-route-id={r.id} data-testid="api-route-row">
        <span className="api-row__line">
          <Method method={r.method} />
          <span className="api-row__path">{r.path}</span>
          <Marks route={r} usual={props.usual} />
        </span>
        <span className={`api-row__doc${line.auto ? ' api-row__doc--auto' : ''}`} title={line.auto ? AUTO_DOC_NOTE : undefined}>
          {line.text}
        </span>
      </button>
    </li>
  );
}

/** Пусто по фильтру: «Ничего не найдено» и сброс. */
function NothingFound(props: { readonly query: string | undefined; readonly reset: () => void }) {
  const q = props.query;
  return (
    <div className="api-empty">
      <p>Ничего не найдено{q === undefined || q === '' ? '' : ` по «${q}»`}.</p>
      <Button type="button" size="sm" variant="outline" onClick={props.reset}>
        Сбросить фильтры
      </Button>
    </div>
  );
}

/** Список модулей с роутами; выбранный скрыт фильтром — подсказка. */
function RouteList(props: { readonly index: CodeIndex; readonly modules: readonly Module[]; readonly selected: string | null; readonly openRoute: (id: string) => void; readonly query: string | undefined; readonly resetAll: () => void }) {
  const { modules, selected } = props;
  const usual = useMemo(() => usualChecks(props.index.code.routes), [props.index]);
  const shown = modules.reduce((n, m) => n + m.routes.length, 0);
  const hiddenSelected = selected !== null && !modules.some((m) => m.routes.some((r) => r.id === selected));
  return (
    <>
      {hiddenSelected && shown > 0 ? (
        <div className="api-empty api-empty--inline" data-testid="api-hidden-selected">
          <p>Выбранный роут скрыт фильтром.</p>
          <Button type="button" size="sm" variant="outline" onClick={props.resetAll}>
            Показать все роуты
          </Button>
        </div>
      ) : null}
      {shown === 0 ? <NothingFound query={props.query} reset={props.resetAll} /> : null}
      {modules.map((m) => (
        <section key={`${m.service}${m.prefix}`} className="api-module">
          <h3 className="api-module__title" title={m.prefix}>
            {m.name} <span className="api-count">{m.routes.length}</span>
          </h3>
          <ul>
            {m.routes.map((r) => (
              <RouteRow key={r.id} index={props.index} route={r} usual={usual} selected={selected} openRoute={props.openRoute} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

/** Индекс кода карты; без роутов — null. */
function codeIndexOf(mapDocument: ReturnType<typeof useAppStore.getState>['document']): CodeIndex | null {
  return mapDocument === null || mapDocument.code === undefined || mapDocument.code.routes.length === 0 ? null : buildCodeIndex(mapDocument);
}

/** Вид «API». */
export function ApiView() {
  const mapDocument = useAppStore((s) => s.document);
  const index = useMemo(() => codeIndexOf(mapDocument), [mapDocument]);
  const selected = useViewStore((s) => s.route);
  const filter = useViewStore((s) => s.apiFilter);
  const state = useMemo(() => (index === null ? null : apiViewState(index, filter)), [index, filter]);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected !== null) {
      listRef.current?.querySelector(`[data-route-id="${CSS.escape(selected)}"]`)?.scrollIntoView({ block: 'nearest' });
    }
  }, [selected]);

  if (index === null || state === null) {
    return (
      <EmptyView view="api-view">
        В карте нет роутов API. Сканируйте с исходниками: <code>scan --code-dir &lt;корень репо&gt;</code>.
      </EmptyView>
    );
  }
  return <ApiLayout index={index} state={state} filter={filter} selected={selected} listRef={listRef} />;
}

/** Три колонки вида: дерево с покрытием, список с фильтрами, карточка роута. */
function ApiLayout(props: { readonly index: CodeIndex; readonly state: ApiState; readonly filter: ApiFilter; readonly selected: string | null; readonly listRef: RefObject<HTMLDivElement | null> }) {
  const { index, state, filter, selected } = props;
  const openRoute = useViewStore((s) => s.openRoute);
  const setFilter = useViewStore((s) => s.setApiFilter);
  const scope = useViewStore((s) => s.apiScope);
  const setScope = useViewStore((s) => s.setApiScope);
  const set: SetFilter = (patch) => setFilter({ ...filter, ...patch });
  const resetAll = (): void => {
    setFilter(EMPTY);
    setScope(null);
  };
  const multiService = hasManyServices(index);
  const card = selected === null ? null : routeCard(index, selected);
  return (
    <div className="api-view" data-testid="api-view">
      <aside className="api-tree">
        <CoverageList cov={state.coverage} filter={filter} set={set} />
        <ApiTree state={state} multiService={multiService} scope={scope} setScope={setScope} />
      </aside>

      <section className="api-list">
        <ApiFilters index={index} state={state} filter={filter} set={set} reset={() => setFilter(EMPTY)} multiService={multiService} />
        <div className="api-list__scroll" ref={props.listRef}>
          <RouteList index={index} modules={scopedModules(state, scope)} selected={selected} openRoute={openRoute} query={filter.query} resetAll={resetAll} />
        </div>
      </section>

      {card === null ? (
        <aside className="api-card api-card--empty">
          <p className="api-card__empty">Выберите роут — {index.code.routes.length} в карте.</p>
        </aside>
      ) : (
        <Card card={card} />
      )}
    </div>
  );
}
