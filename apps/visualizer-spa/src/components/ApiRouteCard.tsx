/**
 * Карточка роута в виде «API»: метод, отметки доступа, описание, вход, таблицы, экраны, файл:строка.
 */
import { Fragment, useState } from 'react';
import { KeyRound, Lock } from 'lucide-react';
import { AUTO_DOC_NOTE, type TableTouch } from '@live-app-map/graph';
import type { ApiRoute, HttpMethod, RouteSchemaField } from '@live-app-map/schema';
import { type RouteCard } from '../lib/api-view-model';
import { useMapNav } from '../lib/use-map-nav';
import { Button, Chip } from '../ui';

/** Метод в слоте фиксированной ширины: читающие приглушены, меняющие — ярче. */
export function Method(props: { readonly method: HttpMethod }) {
  const m = props.method;
  const kind = m === 'GET' || m === 'HEAD' || m === 'OPTIONS' ? 'read' : m === 'DELETE' ? 'delete' : 'write';
  return <span className={`api-method api-method--${kind}`}>{m}</span>;
}

/** Признаки строки роута: проверка входа и доступ (пустой слот держит колонку). */
export function Marks(props: { readonly route: ApiRoute }) {
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
export function Card(props: { readonly card: RouteCard }) {
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
          {card.service?.name ?? r.serviceId} · {r.framework}
          <span className="api-card__file">
            {r.location.file}:{r.location.line}
          </span>
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
