/**
 * Вид «API»: роуты по доменам (не по сервисам), фильтры и доска выбранного роута —
 * вход, ответ, доступ, таблицы с колонками, что меняет, экраны, код.
 */
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { ChevronRight, Search } from 'lucide-react';

import { AUTO_DOC_NOTE, buildCodeIndex, type ApiFilter, type CodeIndex } from '@live-app-map/graph';
import type { HttpMethod } from '@live-app-map/schema';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Toggle } from '@/components/ui/toggle';
import { cn } from '@/lib/utils';
import { apiViewState, routeCard, routeOneLine, type ApiViewState } from '../lib/api-view-model';
import { useAppStore } from '../store/app-store';
import { useViewStore } from '../store/view-store';
import { Marks, Method, RouteBoard, usualChecks, type UsualChecks } from './ApiRouteCard';

/** Пустой фильтр. */
const EMPTY: ApiFilter = {};

/** Число заданных условий фильтра. */
function filterCount(f: ApiFilter): number {
  return [
    f.query !== undefined && f.query !== '',
    (f.methods?.length ?? 0) > 0,
    f.table !== undefined && f.table !== '',
    f.undocumented === true,
    f.noScreens === true,
  ].filter(Boolean).length;
}

type Domain = ApiViewState['domains'][number];
type Coverage = ApiViewState['coverage'];
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

/** Покрытие API: строка-итог, строки с полосами — по раскрытию. */
function CoverageList(props: { readonly cov: Coverage; readonly filter: ApiFilter; readonly set: SetFilter }) {
  const { cov } = props;
  return (
    <Collapsible data-testid="api-coverage-box" className="border-b border-border px-3 py-2">
      <CollapsibleTrigger render={<Button variant="ghost" size="sm" className="h-auto w-full justify-start gap-1 px-1 py-1 text-left text-xs font-normal whitespace-normal text-muted-foreground" />}>
        <ChevronRight className="size-3.5 shrink-0" />
        Покрытие: описано {cov.described} из {cov.routes} · вызываются экранами {cov.withScreens} из {cov.routes}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <dl className="mt-2 flex flex-col gap-2" data-testid="api-coverage">
          {coverageRows(cov, props.filter, props.set).map((c) => (
            <div
              key={c.label}
              className={cn('grid grid-cols-[1fr_auto] gap-x-2 gap-y-1 rounded-md px-1 py-1 text-xs', c.onClick !== undefined && 'cursor-pointer hover:bg-muted')}
              onClick={c.onClick}
              title={c.hint}
            >
              <dt className="text-muted-foreground">{c.label}</dt>
              <dd className="tabular-nums">
                {c.value} из {cov.routes}
              </dd>
              <span className="col-span-2 h-1 overflow-hidden rounded-full bg-muted">
                <span className="block h-full bg-foreground/60" style={{ width: `${percent(c.value, cov.routes)}%` }} />
              </span>
            </div>
          ))}
        </dl>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Строка списка доменов. */
function DomainRow(props: { readonly label: string; readonly count: number; readonly on: boolean; readonly onClick: () => void; readonly testId?: string }) {
  return (
    <Button
      variant={props.on ? 'secondary' : 'ghost'}
      size="sm"
      className="w-full justify-between font-normal"
      onClick={props.onClick}
      aria-pressed={props.on}
      data-testid={props.testId}
    >
      <span className="truncate">{props.label}</span>
      <span className="text-xs text-muted-foreground tabular-nums">{props.count}</span>
    </Button>
  );
}

/** Домены: «Все роуты» и домены по алфавиту. */
function DomainList(props: { readonly state: ApiViewState; readonly scope: string | null; readonly setScope: (d: string | null) => void }) {
  const { state, scope, setScope } = props;
  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2" aria-label="Домены API">
      <DomainRow label="Все роуты" count={state.routes.length} on={scope === null} onClick={() => setScope(null)} />
      {state.domains.map((d) => (
        <DomainRow key={d.name} label={d.name} count={d.routes.length} on={scope === d.name} onClick={() => setScope(d.name)} testId="api-domain" />
      ))}
    </nav>
  );
}

/** Переключатель фильтра. */
function FilterToggle(props: { readonly on: boolean; readonly onChange: () => void; readonly testId: string; readonly title?: string; readonly children: string }) {
  return (
    <Toggle variant="outline" size="sm" pressed={props.on} onPressedChange={props.onChange} data-testid={props.testId} title={props.title}>
      {props.children}
    </Toggle>
  );
}

/** Фильтры списка: поиск, методы, таблица, «без описания», «без экранов», сброс. */
function ApiFilters(props: { readonly index: CodeIndex; readonly state: ApiViewState; readonly filter: ApiFilter; readonly set: SetFilter; readonly reset: () => void }) {
  const { index, state, filter, set } = props;
  const n = filterCount(filter);
  return (
    <div className="flex flex-col gap-2 border-b border-border p-3" role="search">
      <InputGroup>
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput id="api-search" aria-label="Поиск роутов" value={filter.query ?? ''} placeholder="Путь, описание, обработчик, файл" onChange={(e) => set({ query: e.target.value })} />
      </InputGroup>
      <div className="flex flex-wrap items-center gap-1.5">
        {state.methods.map((m) => (
          <FilterToggle key={m} on={filter.methods?.includes(m) === true} onChange={() => set({ methods: toggledMethods(filter.methods, m) })} testId={`api-method-${m}`}>
            {m}
          </FilterToggle>
        ))}
        <Input id="api-table" list="api-tables" aria-label="Таблица" className="h-7 w-32" value={filter.table ?? ''} placeholder="Таблица" onChange={(e) => set({ table: e.target.value })} />
        <datalist id="api-tables">
          {index.code.tables.map((t) => (
            <option key={t.id} value={t.name} />
          ))}
        </datalist>
        <FilterToggle on={filter.undocumented === true} onChange={() => set({ undocumented: filter.undocumented !== true })} testId="api-undocumented" title="Без авторского описания">
          Без описания
        </FilterToggle>
        <FilterToggle on={filter.noScreens === true} onChange={() => set({ noScreens: filter.noScreens !== true })} testId="api-no-screens">
          Без экранов
        </FilterToggle>
        {n === 0 ? null : (
          <Button size="sm" variant="ghost" onClick={props.reset}>
            Сбросить ({n})
          </Button>
        )}
      </div>
    </div>
  );
}

/** Строка роута в списке. */
function RouteRow(props: { readonly index: CodeIndex; readonly route: Domain['routes'][number]; readonly usual: UsualChecks; readonly selected: string | null; readonly openRoute: (id: string) => void }) {
  const { route: r } = props;
  const line = routeOneLine(props.index, r);
  const on = r.id === props.selected;
  return (
    <li>
      <button
        type="button"
        className={cn('flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-muted', on && 'bg-muted')}
        onClick={() => props.openRoute(r.id)}
        aria-current={on ? 'true' : undefined}
        data-route-id={r.id}
        data-testid="api-route-row"
      >
        <span className="flex items-center gap-2">
          <Method method={r.method} />
          <span className="min-w-0 flex-1 truncate font-mono text-xs">{r.path}</span>
          <Marks route={r} usual={props.usual} />
        </span>
        <span className={cn('line-clamp-1 pl-14 text-xs text-muted-foreground', line.auto && 'italic')} title={line.auto ? AUTO_DOC_NOTE : undefined}>
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
    <Empty className="py-8">
      <EmptyDescription>Ничего не найдено{q === undefined || q === '' ? '' : ` по «${q}»`}.</EmptyDescription>
      <Button size="sm" variant="outline" onClick={props.reset}>
        Сбросить фильтры
      </Button>
    </Empty>
  );
}

/** Список доменов с роутами; выбранный скрыт фильтром — подсказка. */
function RouteList(props: { readonly index: CodeIndex; readonly domains: readonly Domain[]; readonly selected: string | null; readonly openRoute: (id: string) => void; readonly query: string | undefined; readonly resetAll: () => void }) {
  const { domains, selected } = props;
  const usual = useMemo(() => usualChecks(props.index.code.routes), [props.index]);
  const shown = domains.reduce((n, d) => n + d.routes.length, 0);
  const hiddenSelected = selected !== null && !domains.some((d) => d.routes.some((r) => r.id === selected));
  return (
    <>
      {hiddenSelected && shown > 0 ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-xs" data-testid="api-hidden-selected">
          <p>Выбранный роут скрыт фильтром.</p>
          <Button size="sm" variant="outline" onClick={props.resetAll}>
            Показать все роуты
          </Button>
        </div>
      ) : null}
      {shown === 0 ? <NothingFound query={props.query} reset={props.resetAll} /> : null}
      {domains.map((d) => (
        <section key={d.name} className="flex flex-col gap-0.5" data-testid="api-domain-group">
          <h3 className="sticky top-0 z-10 bg-background px-2 py-1 text-sm font-medium">
            {d.name} <span className="text-xs font-normal text-muted-foreground tabular-nums">{d.routes.length}</span>
          </h3>
          <ul className="flex flex-col">
            {d.routes.map((r) => (
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
      <Empty data-testid="api-view" className="h-full">
        <EmptyDescription>
          В карте нет роутов API. Сканируйте с исходниками: <code>scan --code-dir &lt;корень репо&gt;</code>.
        </EmptyDescription>
      </Empty>
    );
  }
  return <ApiLayout index={index} state={state} filter={filter} selected={selected} listRef={listRef} />;
}

/** Колонки вида: домены с покрытием, список с фильтрами, доска роута. */
function ApiLayout(props: { readonly index: CodeIndex; readonly state: ApiViewState; readonly filter: ApiFilter; readonly selected: string | null; readonly listRef: RefObject<HTMLDivElement | null> }) {
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
  const card = selected === null ? null : routeCard(index, selected);
  const domains = scope === null ? state.domains : state.domains.filter((d) => d.name === scope);
  return (
    <div className="grid h-full min-h-0 grid-cols-[200px_minmax(320px,420px)_1fr] bg-background text-foreground" data-testid="api-view">
      <aside className="flex min-h-0 flex-col border-r border-border">
        <CoverageList cov={state.coverage} filter={filter} set={set} />
        <DomainList state={state} scope={scope} setScope={setScope} />
      </aside>

      <section className="flex min-h-0 flex-col border-r border-border">
        <ApiFilters index={index} state={state} filter={filter} set={set} reset={() => setFilter(EMPTY)} />
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-2" ref={props.listRef}>
          <RouteList index={index} domains={domains} selected={selected} openRoute={openRoute} query={filter.query} resetAll={resetAll} />
        </div>
      </section>

      {card === null ? (
        <Empty className="h-full">
          <EmptyDescription>Выберите роут — {index.code.routes.length} в карте.</EmptyDescription>
        </Empty>
      ) : (
        <RouteBoard card={card} />
      )}
    </div>
  );
}
