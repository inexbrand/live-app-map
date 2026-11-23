/**
 * Карточка роута в виде «API»: метод, отметки доступа, описание, вход, таблицы, экраны, файл:строка.
 */
import { Fragment, useState } from 'react';
import { KeyRound, Lock, LockOpen } from 'lucide-react';
import { AUTO_DOC_NOTE, type TableTouch } from '@live-app-map/graph';
import type { ApiRoute, HttpMethod, RouteSchemaField } from '@live-app-map/schema';
import { type RouteCard } from '../lib/api-view-model';
import { useMapNav } from '../lib/use-map-nav';
import { Button, Chip } from '../ui';

/** Метод в слоте фиксированной ширины: читающие приглушены, меняющие — ярче. */
export function Method(props: { readonly method: HttpMethod }) {
  return <span className={`api-method api-method--${methodKind(props.method)}`}>{props.method}</span>;
}

/** Вид метода для цвета: читает, удаляет или меняет. */
function methodKind(m: HttpMethod): 'read' | 'delete' | 'write' {
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') {
    return 'read';
  }
  return m === 'DELETE' ? 'delete' : 'write';
}

/** Что у большинства роутов карты: есть ли проверка входа и доступа. */
export type UsualChecks = { readonly input: boolean; readonly access: boolean };

/**
 * Обычное для карты: признак есть хотя бы у половины роутов.
 *
 * @param routes - роуты карты
 */
export function usualChecks(routes: readonly ApiRoute[]): UsualChecks {
  const half = (n: number): boolean => n * 2 >= routes.length;
  return { input: half(routes.filter((r) => r.input !== undefined).length), access: half(routes.filter((r) => r.access !== undefined).length) };
}

/**
 * Признаки строки роута — только отличия от большинства: обычное не повторяется в каждой строке
 * (пустой слот держит колонку).
 */
export function Marks(props: { readonly route: ApiRoute; readonly usual: UsualChecks }) {
  const { route: r, usual } = props;
  const hasInput = r.input !== undefined;
  const hasAccess = r.access !== undefined;
  return (
    <span className="api-marks">
      <span className="api-mark" title={hasInput ? 'Есть проверка входа (схема)' : 'Схемы входа нет'}>
        {hasInput === usual.input ? null : <KeyRound size={14} className={hasInput ? undefined : 'api-mark--absent'} aria-label={hasInput ? 'вход проверяется' : 'вход не проверяется'} />}
      </span>
      <span className="api-mark" title={hasAccess ? 'Есть проверка доступа' : 'Проверок доступа в коде нет'}>
        {hasAccess === usual.access ? null : hasAccess ? <Lock size={14} aria-label="доступ проверяется" /> : <LockOpen size={14} className="api-mark--absent" aria-label="доступ не проверяется" />}
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

type Route = RouteCard['route'];

/** Шапка карточки: метод, путь, сервис, фреймворк, файл:строка. */
function CardHead(props: { readonly card: RouteCard }) {
  const { card } = props;
  const r = card.route;
  return (
    <header className="api-card__head">
      <h2>
        <Method method={r.method} /> <span className="api-card__path">{r.path}</span>
      </h2>
      <p className="api-card__meta">
        {card.service?.name ?? r.serviceId} · {r.framework}
        <span className="api-card__file">
          {r.location.file}:{r.location.line}
        </span>
      </p>
    </header>
  );
}

/** Описание из кода; строка «Ответ» отдельно. */
function AutoDoc(props: { readonly auto: RouteCard['auto'] }) {
  return (
    <div className="api-auto" data-testid="api-auto-doc">
      <p className="api-auto__note">{AUTO_DOC_NOTE}</p>
      <p className="api-auto__summary">{props.auto.summary}</p>
      {props.auto.lines
        .filter((l) => l.label === 'Ответ')
        .map((l) => (
          <p key={l.label} className="api-card__text" data-testid="api-response">
            Ответ: {l.text}
          </p>
        ))}
    </div>
  );
}

/** Часть входа: заголовок со схемой и поля (или тип одной строкой). */
function InputPartView(props: { readonly input: RouteCard['inputs'][number] }) {
  const i = props.input;
  return (
    <div className="api-schema" data-testid="api-input">
      <p className="api-schema__title">
        {i.label}
        {i.schema.name === undefined ? '' : ` · ${i.schema.name}`}
        <span className="api-card__meta">
          {' · '}
          {i.schema.kind === 'zod' ? 'zod' : 'TypeBox'}
          {i.schema.optional === true ? ' · необязательно' : ''}
        </span>
      </p>
      {i.schema.fields.length === 0 ? (
        <p className="api-schema__text" data-testid="api-input-type">
          {i.schema.type ?? i.schema.text ?? i.schema.name}
        </p>
      ) : (
        <table className="api-schema__fields">
          <tbody>
            <SchemaRows fields={i.schema.fields} depth={0} />
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Раздел «Вход». */
function InputSection(props: { readonly inputs: RouteCard['inputs'] }) {
  return (
    <section className="api-card__section">
      <h3>Вход</h3>
      {props.inputs.length === 0 ? <p className="api-card__empty">Схемы входа в коде не найдено.</p> : null}
      {props.inputs.map((i) => (
        <InputPartView key={i.part} input={i} />
      ))}
    </section>
  );
}

/** Строка доступа с метками (роли, права); нет списка — ничего. */
function TagRow(props: { readonly label: string; readonly tags: readonly string[] | undefined }) {
  if (props.tags === undefined) {
    return null;
  }
  return (
    <div className="api-card__row">
      <span className="api-card__label">{props.label}</span>
      <span className="api-card__chips">
        {props.tags.map((x) => (
          <span key={x} className="api-tag">
            {x}
          </span>
        ))}
      </span>
    </div>
  );
}

/** Раздел «Доступ»: вход, роли, права, проверки. */
function AccessSection(props: { readonly access: Route['access'] }) {
  const a = props.access;
  return (
    <section className="api-card__section" data-testid="api-access">
      <h3>Доступ</h3>
      {a === undefined ? <p className="api-card__empty">Проверок доступа в коде не найдено — роут открыт.</p> : null}
      {a?.auth === true ? <p className="api-card__line">Нужен вход</p> : null}
      <TagRow label="Роли" tags={a?.roles} />
      <TagRow label="Права" tags={a?.permissions} />
      {a?.checks === undefined ? null : (
        <div className="api-card__row">
          <span className="api-card__label">Проверки</span>
          <span className="api-card__text">{a.checks.join(', ')}</span>
        </div>
      )}
    </section>
  );
}

/** Почему экраны карты не вызывают роут. */
function ScreenGapNote(props: { readonly gap: NonNullable<RouteCard['gap']> }) {
  const { gap } = props;
  return (
    <div className="api-card__empty" data-testid="api-screen-gap">
      <p className="api-card__line">Экраны карты не вызывают: {gap.text}.</p>
      {gap.files.length === 0 ? null : <p className="api-card__meta">{gap.files.join(', ')}</p>}
    </div>
  );
}

/** Экран, который вызывает роут: кнопка перехода (без ноды на карте — неактивна). */
function CallerChip(props: { readonly caller: RouteCard['callers'][number] }) {
  const c = props.caller;
  const nav = useMapNav();
  const nodeId = c.nodeId;
  return (
    <Chip
      disabled={nodeId === undefined}
      title={c.via === undefined ? c.file : `${c.file} · через ${c.via}`}
      onClick={() => (nodeId === undefined ? undefined : nav({ kind: 'screen', nodeId }))}
      data-testid="api-screen-link"
    >
      {c.title}
    </Chip>
  );
}

/** Раздел «Экраны». */
function ScreensSection(props: { readonly card: RouteCard }) {
  const { card } = props;
  return (
    <section className="api-card__section">
      <h3>Экраны</h3>
      {card.gap === undefined ? null : <ScreenGapNote gap={card.gap} />}
      <span className="api-card__chips">
        {card.callers.map((c) => (
          <CallerChip key={c.nodeId ?? c.file} caller={c} />
        ))}
      </span>
    </section>
  );
}

/** Карточка выбранного роута. */
export function Card(props: { readonly card: RouteCard }) {
  const { card } = props;
  const r = card.route;
  return (
    <aside className="api-card" data-testid="api-route-card">
      <CardHead card={card} />
      {card.summary === undefined ? (
        <p className="api-card__empty">Авторского описания нет — добавьте комментарий над обработчиком ({r.location.file}:{r.location.line}).</p>
      ) : (
        <Summary key={r.id} text={card.summary} />
      )}
      <AutoDoc auto={card.auto} />
      <InputSection inputs={card.inputs} />
      <AccessSection access={r.access} />

      <section className="api-card__section">
        <h3>Таблицы</h3>
        {card.reads.length + card.writes.length === 0 ? <p className="api-card__empty">Запросов в БД не найдено.</p> : null}
        <Tables title="Читает" touches={card.reads} />
        <Tables title="Пишет" touches={card.writes} />
      </section>

      <ScreensSection card={card} />

      <section className="api-card__section">
        <h3>Обработчик</h3>
        <p className="api-card__text">
          {r.handler.name === undefined ? 'встроенная функция' : r.handler.name} · {r.handler.location.file}:{r.handler.location.line}
        </p>
      </section>
    </aside>
  );
}

/** Строки полей схемы входа: вложенные объекты — с отступом под родителем. */
function SchemaRows({ fields, depth }: { readonly fields: readonly RouteSchemaField[]; readonly depth: number }) {
  return (
    <>
      {fields.map((f) => (
        <Fragment key={f.name}>
          <tr data-testid="api-input-field" data-depth={depth}>
            <td style={{ paddingLeft: `${depth * 14}px` }}>
              {f.name}
              {f.optional === true ? <span className="api-card__meta" title="необязательное">?</span> : null}
            </td>
            <td>
              {f.type}
              {f.rules === undefined ? null : <span className="api-card__meta"> · {f.rules.join(', ')}</span>}
            </td>
          </tr>
          {f.fields === undefined ? null : <SchemaRows fields={f.fields} depth={depth + 1} />}
        </Fragment>
      ))}
    </>
  );
}
