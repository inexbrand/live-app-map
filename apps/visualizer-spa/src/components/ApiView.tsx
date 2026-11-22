/**
 * Вид «API»: архитектура API проекта — сервисы, разделы и модули роутов, фильтры
 * (поиск, метод, сервис, таблица, «без описания», «без экранов»), карточка роута:
 * авторское описание и собранное из кода, вход, доступ, таблицы, экраны (или почему
 * их нет), файл:строка. Переходы роут ↔ таблица ↔ экран.
 */
import { useEffect, useMemo, useRef } from 'react';

import { AUTO_DOC_NOTE, buildCodeIndex, type ApiFilter, type CodeIndex } from '@live-app-map/graph';
import type { HttpMethod } from '@live-app-map/schema';
import { apiViewState, routeCard, routeOneLine } from '../lib/api-view-model';

import { useAppStore } from '../store/app-store';
import { useViewStore } from '../store/view-store';
import { Button, Chip, Input, Select } from '../ui';
import { Card, Marks, Method } from './ApiRouteCard';

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

/** Вид «API». */
export function ApiView() {
  const mapDocument = useAppStore((s) => s.document);
  const index = useMemo<CodeIndex | null>(
    () => (mapDocument === null || mapDocument.code === undefined || mapDocument.code.routes.length === 0 ? null : buildCodeIndex(mapDocument)),
    [mapDocument],
  );
  const selected = useViewStore((s) => s.route);
  const openRoute = useViewStore((s) => s.openRoute);
  const filter = useViewStore((s) => s.apiFilter);
  const setFilter = useViewStore((s) => s.setApiFilter);
  const scope = useViewStore((s) => s.apiScope);
  const setScope = useViewStore((s) => s.setApiScope);
  const state = useMemo(() => (index === null ? null : apiViewState(index, filter)), [index, filter]);
  const listRef = useRef<HTMLDivElement>(null);
  const card = index === null || selected === null ? null : routeCard(index, selected);
  useEffect(() => {
    if (selected !== null) {
      listRef.current?.querySelector(`[data-route-id="${CSS.escape(selected)}"]`)?.scrollIntoView({ block: 'nearest' });
    }
  }, [selected]);

  if (index === null || state === null) {
    return (
      <div className="api-view api-view--empty" data-testid="api-view">
        <p>
          В карте нет роутов API. Сканируйте с исходниками: <code>scan --code-dir &lt;корень репо&gt;</code>.
        </p>
      </div>
    );
  }
  const set = (patch: Partial<ApiFilter>): void => setFilter({ ...filter, ...patch });
  const toggleMethod = (m: HttpMethod): void => {
    const now = new Set(filter.methods ?? []);
    if (now.has(m)) {
      now.delete(m);
    } else {
      now.add(m);
    }
    set({ methods: [...now] });
  };
  const inScope = (prefix: string): boolean => scope === null || prefix === scope || prefix.startsWith(`${scope}/`);
  const modules = state.tree.flatMap((s) =>
    s.sections.flatMap((sec) => sec.modules.filter((m) => inScope(m.prefix)).map((m) => ({ service: s.service.name, ...m }))),
  );
  const shown = modules.reduce((n, m) => n + m.routes.length, 0);
  const hiddenSelected = selected !== null && !modules.some((m) => m.routes.some((r) => r.id === selected));
  const cov = state.coverage;
  const n = filterCount(filter);
  const multiService = index.code.services.filter((s) => index.code.routes.some((r) => r.serviceId === s.id)).length > 1;

  return (
    <div className="api-view" data-testid="api-view">
      <aside className="api-tree">
        <dl className="api-coverage" data-testid="api-coverage">
          {[
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
          ].map((c) => (
            <div key={c.label} className={`api-coverage__row${c.onClick === undefined ? '' : ' api-coverage__row--click'}`} onClick={c.onClick} title={c.hint}>
              <dt>{c.label}</dt>
              <dd>
                {c.value} из {cov.routes}
              </dd>
              <span className="api-coverage__bar">
                <span style={{ width: `${cov.routes === 0 ? 0 : Math.round((c.value / cov.routes) * 100)}%` }} />
              </span>
            </div>
          ))}
        </dl>
        <nav className="api-tree__nav" aria-label="Разделы API">
          <button type="button" className={`api-tree__row${scope === null ? ' api-tree__row--on' : ''}`} onClick={() => setScope(null)}>
            <span>Все роуты</span>
            <span className="api-count">{state.routes.length}</span>
          </button>
          {state.tree.map((s) => (
            <div key={s.service.id} className="api-tree__service">
              {multiService ? <p className="api-tree__service-name">{s.service.name}</p> : null}
              {s.sections.map((sec) => (
                <div key={sec.prefix}>
                  <button
                    type="button"
                    className={`api-tree__row${scope === sec.prefix ? ' api-tree__row--on' : ''}`}
                    onClick={() => setScope(sec.prefix)}
                    title={sec.prefix}
                    data-testid="api-section"
                  >
                    <span>{sec.name}</span>
                    <span className="api-count">{sec.count}</span>
                  </button>
                  {inScope(sec.prefix) && scope !== null && sec.modules.length > 1
                    ? sec.modules.map((m) => (
                        <button
                          key={m.prefix}
                          type="button"
                          className={`api-tree__row api-tree__row--module${scope === m.prefix ? ' api-tree__row--on' : ''}`}
                          onClick={() => setScope(m.prefix)}
                          title={m.prefix}
                        >
                          <span>{m.name}</span>
                          <span className="api-count">{m.routes.length}</span>
                        </button>
                      ))
                    : null}
                </div>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <section className="api-list">
        <div className="api-filters" role="search">
          <Input id="api-search" aria-label="Поиск роутов" value={filter.query ?? ''} placeholder="Путь, описание, обработчик, файл" onChange={(e) => set({ query: e.target.value })} />
          <div className="api-filters__row">
            {state.methods.map((m) => (
              <Chip key={m} active={filter.methods?.includes(m) === true} onClick={() => toggleMethod(m)} data-testid={`api-method-${m}`}>
                {m}
              </Chip>
            ))}
            {multiService ? (
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
              <Button type="button" size="sm" variant="ghost" onClick={() => setFilter(EMPTY)}>
                Сбросить ({n})
              </Button>
            )}
          </div>
        </div>
        <div className="api-list__scroll" ref={listRef}>
          {hiddenSelected && shown > 0 ? (
            <div className="api-empty api-empty--inline" data-testid="api-hidden-selected">
              <p>Выбранный роут скрыт фильтром.</p>
              <Button type="button" size="sm" variant="outline" onClick={() => { setFilter(EMPTY); setScope(null); }}>
                Показать все роуты
              </Button>
            </div>
          ) : null}
          {shown === 0 ? (
            <div className="api-empty">
              <p>Ничего не найдено{filter.query === undefined || filter.query === '' ? '' : ` по «${filter.query}»`}.</p>
              <Button type="button" size="sm" variant="outline" onClick={() => { setFilter(EMPTY); setScope(null); }}>
                Сбросить фильтры
              </Button>
            </div>
          ) : null}
          {modules.map((m) => (
            <section key={`${m.service}${m.prefix}`} className="api-module">
              <h3 className="api-module__title">
                {m.name} <span className="api-count">{m.routes.length}</span>
                <span className="api-module__prefix">{m.prefix}</span>
              </h3>
              <ul>
                {m.routes.map((r) => {
                  const line = routeOneLine(index, r);
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        className={`api-row${r.id === selected ? ' api-row--on' : ''}`}
                        onClick={() => openRoute(r.id)}
                        data-route-id={r.id}
                        data-testid="api-route-row"
                      >
                        <span className="api-row__line">
                          <Method method={r.method} />
                          <span className="api-row__path">{r.path}</span>
                          <Marks route={r} />
                        </span>
                        <span className={`api-row__doc${line.auto ? ' api-row__doc--auto' : ''}`} title={line.auto ? AUTO_DOC_NOTE : undefined}>
                          {line.text}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
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
