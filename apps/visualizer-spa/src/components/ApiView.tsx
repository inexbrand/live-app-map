/**
 * Вид «API»: архитектура API проекта — сервисы, разделы и модули роутов, фильтры
 * (поиск, метод, сервис, таблица, «без описания», «без экранов»), карточка роута:
 * авторское описание и собранное из кода, вход, доступ, таблицы, экраны (или почему
 * их нет), файл:строка. Переходы роут ↔ таблица ↔ экран.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyRound, Lock } from 'lucide-react';
import { AUTO_DOC_NOTE, buildCodeIndex, type ApiFilter, type CodeIndex, type TableTouch } from '@live-app-map/graph';
import type { ApiRoute, HttpMethod } from '@live-app-map/schema';
import { apiViewState, routeCard, routeOneLine, type RouteCard } from '../lib/api-view-model';
import { useMapNav } from '../lib/use-map-nav';
import { useAppStore } from '../store/app-store';
import { useViewStore } from '../store/view-store';
import { Button, Chip, Input, Select } from '../ui';

/** Метод в слоте фиксированной ширины: читающие приглушены, меняющие — ярче. */
function Method(props: { readonly method: HttpMethod }) {
  const m = props.method;
  const kind = m === 'GET' || m === 'HEAD' || m === 'OPTIONS' ? 'read' : m === 'DELETE' ? 'delete' : 'write';
  return <span className={`api-method api-method--${kind}`}>{m}</span>;
}

/** Признаки строки роута: проверка входа и доступ (пустой слот держит колонку). */
function Marks(props: { readonly route: ApiRoute }) {
  const r = props.route;
  return (
    <span className="api-marks">
      <span className="api-mark" title={r.input === undefined ? 'Схемы входа нет' : 'Есть проверка входа (схема)'}>
        {r.input === undefined ? null : <KeyRound size={14} aria-label="вход проверяется" />}
      </span>
      <span className="api-mark" title={r.access === undefined ? 'Проверок доступа в коде нет' : 'Есть проверка доступа'}>
        {r.access === undefined ? null : <Lock size={14} aria-label="доступ проверяется" />}
      </span>
    </span>
  );
}

/** Таблицы чтения или записи кнопками перехода. */
function Tables(props: { readonly title: string; readonly touches: readonly TableTouch[] }) {
  const nav = useMapNav();
  if (props.touches.length === 0) {
    return null;
  }
  return (
    <div className="api-card__row">
      <span className="api-card__label">{props.title}</span>
      <span className="api-card__chips">
        {props.touches.map((t) => (
          <Chip key={t.table} onClick={() => nav({ kind: 'table', table: t.table })} title={`${t.operations.join(', ')} ×${t.count}`} data-testid="api-table-link">
            {t.dbName ?? t.table}
            {t.inLoop ? ' · в цикле' : ''}
          </Chip>
        ))}
      </span>
    </div>
  );
}

/** Описание роута: первый абзац, остальное по кнопке. */
function Summary(props: { readonly text: string }) {
  const [full, setFull] = useState(false);
  const head = props.text.split(/\n\s*\n/)[0] ?? props.text;
  const more = head.length < props.text.length;
  return (
    <div className="api-card__doc-wrap">
      <p className="api-card__doc">{full ? props.text : head}</p>
      {more && !full ? (
        <Button type="button" size="sm" variant="ghost" onClick={() => setFull(true)}>
          Полностью
        </Button>
      ) : null}
    </div>
  );
}

/** Карточка выбранного роута. */
function Card(props: { readonly card: RouteCard }) {
  const { card } = props;
  const r = card.route;
  const nav = useMapNav();
  const a = r.access;
  return (
    <aside className="api-card" data-testid="api-route-card">
      <header className="api-card__head">
        <h2>
          <Method method={r.method} /> <span className="api-card__path">{r.path}</span>
        </h2>
        <p className="api-card__meta">
          {card.service?.name ?? r.serviceId} · {r.framework} · {r.location.file}:{r.location.line}
        </p>
      </header>
      {card.summary === undefined ? (
        <p className="api-card__empty">Авторского описания нет — добавьте комментарий над обработчиком ({r.location.file}:{r.location.line}).</p>
      ) : (
        <Summary key={r.id} text={card.summary} />
      )}
      <div className="api-auto" data-testid="api-auto-doc">
        <p className="api-auto__note">{AUTO_DOC_NOTE}</p>
        <p className="api-auto__summary">{card.auto.summary}</p>
        {card.auto.lines
          .filter((l) => l.label === 'Ответ')
          .map((l) => (
            <p key={l.label} className="api-card__text" data-testid="api-response">
              Ответ: {l.text}
            </p>
          ))}
      </div>

      <section className="api-card__section">
        <h3>Вход</h3>
        {card.inputs.length === 0 ? <p className="api-card__empty">Схемы входа в коде не найдено.</p> : null}
        {card.inputs.map((i) => (
          <div key={i.part} className="api-schema" data-testid="api-input">
            <p className="api-schema__title">
              {i.label}
              {i.schema.name === undefined ? '' : ` · ${i.schema.name}`}
              <span className="api-card__meta"> · {i.schema.kind === 'zod' ? 'zod' : 'Elysia t'}</span>
            </p>
            {i.schema.fields.length === 0 ? (
              <p className="api-schema__text">{i.schema.text ?? i.schema.name}</p>
            ) : (
              <table className="api-schema__fields">
                <tbody>
                  {i.schema.fields.map((f) => (
                    <tr key={f.name}>
                      <td>
                        {f.name}
                        {f.optional === true ? <span className="api-card__meta">?</span> : null}
                      </td>
                      <td>{f.type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </section>

      <section className="api-card__section" data-testid="api-access">
        <h3>Доступ</h3>
        {a === undefined ? <p className="api-card__empty">Проверок доступа в коде не найдено — роут открыт.</p> : null}
        {a?.auth === true ? <p className="api-card__line">Нужен вход</p> : null}
        {a?.roles === undefined ? null : (
          <div className="api-card__row">
            <span className="api-card__label">Роли</span>
            <span className="api-card__chips">{a.roles.map((x) => <span key={x} className="api-tag">{x}</span>)}</span>
          </div>
        )}
        {a?.permissions === undefined ? null : (
          <div className="api-card__row">
            <span className="api-card__label">Права</span>
            <span className="api-card__chips">{a.permissions.map((x) => <span key={x} className="api-tag">{x}</span>)}</span>
          </div>
        )}
        {a?.checks === undefined ? null : (
          <div className="api-card__row">
            <span className="api-card__label">Проверки</span>
            <span className="api-card__text">{a.checks.join(', ')}</span>
          </div>
        )}
      </section>

      <section className="api-card__section">
        <h3>Таблицы</h3>
        {card.reads.length + card.writes.length === 0 ? <p className="api-card__empty">Запросов в БД не найдено.</p> : null}
        <Tables title="Читает" touches={card.reads} />
        <Tables title="Пишет" touches={card.writes} />
      </section>

      <section className="api-card__section">
        <h3>Экраны</h3>
        {card.gap === undefined ? null : (
          <div className="api-card__empty" data-testid="api-screen-gap">
            <p className="api-card__line">Экраны карты не вызывают: {card.gap.text}.</p>
            {card.gap.files.length === 0 ? null : <p className="api-card__meta">{card.gap.files.join(', ')}</p>}
          </div>
        )}
        <span className="api-card__chips">
          {card.callers.map((c) => (
            <Chip
              key={c.nodeId ?? c.file}
              disabled={c.nodeId === undefined}
              title={c.via === undefined ? c.file : `${c.file} · через ${c.via}`}
              onClick={() => (c.nodeId === undefined ? undefined : nav({ kind: 'screen', nodeId: c.nodeId }))}
              data-testid="api-screen-link"
            >
              {c.title}
            </Chip>
          ))}
        </span>
      </section>

      <section className="api-card__section">
        <h3>Обработчик</h3>
        <p className="api-card__text">
          {r.handler.name === undefined ? 'встроенная функция' : r.handler.name} · {r.handler.location.file}:{r.handler.location.line}
        </p>
      </section>
    </aside>
  );
}

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
