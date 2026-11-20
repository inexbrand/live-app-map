/**
 * Общие части панели кода: место в коде, описание, запросы в БД, секция со счётчиком.
 */
import type { ReactElement } from 'react';
import type { DbCallGroup } from '../lib/node-code';

/** Сколько элементов списка показывать сразу. */
const LIST_LIMIT = 100;

/** Место в коде строкой `file:line`. */
export function where(loc: { readonly file: string; readonly line: number }): string {
  return `${loc.file}:${loc.line}`;
}

/** Описание: первая строка сразу, остальное — по раскрытию. */
export function Description(props: { readonly text: string | undefined }) {
  if (props.text === undefined) {
    return <p className="code-item__empty">Без комментария</p>;
  }
  const [first, ...rest] = props.text.split('\n');
  if (rest.length === 0) {
    return <p className="code-item__doc">{first}</p>;
  }
  return (
    <details className="code-item__details">
      <summary className="code-item__doc">{first}</summary>
      <pre className="code-item__more">{rest.join('\n').trim()}</pre>
    </details>
  );
}

/** Запросы в БД: «операция таблица ×N», пометка N+1. */
export function DbLine(props: { readonly groups: readonly DbCallGroup[] }) {
  if (props.groups.length === 0) {
    return null;
  }
  return (
    <p className="code-item__db">
      БД:{' '}
      {props.groups.map((g, i) => (
        <span key={`${g.operation}-${g.table}`}>
          {i > 0 ? ', ' : ''}
          {g.operation} {g.table}
          {g.count > 1 ? ` ×${g.count}` : ''}
          {g.inLoop ? (
            <strong className="code-item__loop" title="Запрос внутри цикла — N+1">
              {' '}
              в цикле
            </strong>
          ) : null}
        </span>
      ))}
    </p>
  );
}

/** Секция со счётчиком и пределом показа. */
export function Section<T>(props: {
  readonly title: string;
  readonly items: readonly T[];
  readonly render: (item: T) => ReactElement;
  readonly testId?: string;
}) {
  if (props.items.length === 0) {
    return null;
  }
  const shown = props.items.slice(0, LIST_LIMIT);
  return (
    <section className="code-section" data-testid={props.testId}>
      <h3 className="code-section__title">
        {props.title} · {props.items.length}
      </h3>
      <ul className="code-section__list">{shown.map(props.render)}</ul>
      {props.items.length > shown.length ? (
        <p className="drawer__hint">
          Показаны первые {shown.length} из {props.items.length} — уточните фильтр.
        </p>
      ) : null}
    </section>
  );
}
