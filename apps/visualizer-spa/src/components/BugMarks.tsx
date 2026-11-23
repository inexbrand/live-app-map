/**
 * Пункты 09-bugs эпохи с отметкой «закрыт/открыт»: правка пишется в сам
 * markdown-файл на диске через dev-сервер после подтверждения, эпоха (готовность)
 * пересчитывается и заменяется в открытой карте.
 */
import { useState, type ReactNode } from 'react';
import { bugItems, type BugItem, type BugItemState } from '@live-app-map/scanner-docs/bugs';
import type { DocEpoch, DocFile, DocsModel } from '@live-app-map/schema';
import { markBug, withEpoch } from '../lib/docs-live-client';
import { useAppStore } from '../store/app-store';
import { Button } from '@/components/ui/button';

const STATE_WORDS: Readonly<Record<BugItemState, string>> = { open: 'открыт', closed: 'закрыт', other: 'вне разделов' };

/**
 * Текст пункта с зачёркиванием markdown (~~…~~) — как в файле, без самих тильд.
 *
 * @param text - текст пункта
 */
export function struckText(text: string): ReactNode[] {
  return text.split(/~~(.+?)~~/).map((part, i) => (i % 2 === 1 ? <del key={i}>{part}</del> : part));
}

/** Что подтверждается. */
type Pending = { readonly item: BugItem; readonly state: 'open' | 'closed' };

/** Подтверждение записи отметки в файл. */
function BugConfirm(props: { readonly file: string; readonly item: BugItem; readonly next: 'open' | 'closed'; readonly busy: boolean; readonly error: string | null; readonly onApply: () => void; readonly onCancel: () => void }) {
  const { item, next, busy } = props;
  return (
    <div className="docs-bugs__confirm" role="alertdialog" aria-label="Подтверждение записи" data-testid="docs-bug-confirm">
      <p>
        Записать в {props.file}: пункт станет {next === 'closed' ? 'закрытым' : 'открытым'}
        {item.checkbox ? ' (отметка чекбокса).' : ` (перенос в раздел ${next === 'closed' ? 'Closed' : 'Open'}).`}
      </p>
      <div className="docs-bugs__actions">
        <Button type="button" size="sm" variant="default" disabled={busy} onClick={props.onApply}>
          {busy ? 'Записываю…' : 'Записать'}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={props.onCancel}>
          Отмена
        </Button>
      </div>
      {props.error === null ? null : (
        <p className="docs-bugs__error" role="alert">
          {props.error}
        </p>
      )}
    </div>
  );
}

/** Состояние списка отметок: что подтверждается, идёт ли запись, ошибка. */
type MarksState = {
  readonly pending: Pending | null;
  readonly busy: boolean;
  readonly error: string | null;
  readonly ask: (p: Pending) => void;
  readonly cancel: () => void;
  readonly apply: (p: Pending) => void;
};

/** Пункт с кнопкой «Закрыть»/«Открыть» и подтверждением. */
function BugRow(props: { readonly item: BugItem; readonly file: string; readonly writable: true | string; readonly marks: MarksState }) {
  const { item, marks } = props;
  const next = item.state === 'closed' ? 'open' : 'closed';
  return (
    <li className={`docs-bugs__item docs-bugs__item--${item.state}`} data-testid="docs-bug-item" data-state={item.state}>
      <span className="docs-bugs__state">{STATE_WORDS[item.state]}</span>
      <span className="docs-bugs__text">{struckText(item.text)}</span>
      <Button type="button" size="sm" variant="outline" disabled={props.writable !== true || marks.busy} onClick={() => marks.ask({ item, state: next })}>
        {next === 'closed' ? 'Закрыть' : 'Открыть'}
      </Button>
      {marks.pending?.item.line === item.line ? (
        <BugConfirm file={props.file} item={item} next={next} busy={marks.busy} error={marks.error} onApply={() => marks.apply({ item, state: next })} onCancel={marks.cancel} />
      ) : null}
    </li>
  );
}

/** Отметки пунктов: запись в файл через dev-сервер и замена эпохи в карте. */
function useBugMarks(docs: DocsModel, file: DocFile): MarksState {
  const setDocs = useAppStore((s) => s.setDocs);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const apply = async (p: Pending): Promise<void> => {
    setBusy(true);
    const r = await markBug({ root: docs.root, path: file.path, line: p.item.line, text: p.item.text, state: p.state });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setError(null);
    setPending(null);
    setDocs(withEpoch(docs, r.value));
  };
  return {
    pending,
    busy,
    error,
    ask: (p) => {
      setError(null);
      setPending(p);
    },
    cancel: () => setPending(null),
    apply: (p) => void apply(p),
  };
}

/**
 * Список пунктов 09-bugs с кнопками отметки.
 *
 * @param props.docs - раздел docs открытой карты
 * @param props.epoch - эпоха
 * @param props.file - файл 09-bugs
 * @param props.writable - true, если документация есть на этой машине (иначе — почему нет)
 */
export function BugMarks(props: { readonly docs: DocsModel; readonly epoch: DocEpoch; readonly file: DocFile; readonly writable: true | string }) {
  const marks = useBugMarks(props.docs, props.file);
  const items = bugItems(props.file.text);
  if (items.length === 0) {
    return null;
  }
  return (
    <section className="docs-bugs" data-testid="docs-bug-marks">
      <h3>
        Пункты <span className="docs-count">{items.length}</span>
      </h3>
      <p className="docs-bugs__hint">
        {props.writable === true ? `Отметка правит файл на диске: ${props.file.path}` : `Отметка недоступна: ${props.writable}`}
      </p>
      <ul className="docs-bugs__list">
        {items.map((item) => (
          <BugRow key={item.line} item={item} file={props.file.path} writable={props.writable} marks={marks} />
        ))}
      </ul>
    </section>
  );
}
