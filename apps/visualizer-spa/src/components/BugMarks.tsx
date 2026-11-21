/**
 * Пункты 09-bugs эпохи с отметкой «закрыт/открыт»: правка пишется в сам
 * markdown-файл на диске через dev-сервер после подтверждения, эпоха (готовность)
 * пересчитывается и заменяется в открытой карте.
 */
import { useState } from 'react';
import { bugItems, type BugItem, type BugItemState } from '@live-app-map/scanner-docs/bugs';
import type { DocEpoch, DocFile, DocsModel } from '@live-app-map/schema';
import { markBug, withEpoch } from '../lib/docs-live-client';
import { useAppStore } from '../store/app-store';
import { Button } from '../ui';

const STATE_WORDS: Readonly<Record<BugItemState, string>> = { open: 'открыт', closed: 'закрыт', other: 'вне разделов' };

/** Что подтверждается. */
type Pending = { readonly item: BugItem; readonly state: 'open' | 'closed' };

/**
 * Список пунктов 09-bugs с кнопками отметки.
 *
 * @param props.docs - раздел docs открытой карты
 * @param props.epoch - эпоха
 * @param props.file - файл 09-bugs
 * @param props.writable - true, если документация есть на этой машине (иначе — почему нет)
 */
export function BugMarks(props: { readonly docs: DocsModel; readonly epoch: DocEpoch; readonly file: DocFile; readonly writable: true | string }) {
  const setDocs = useAppStore((s) => s.setDocs);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const items = bugItems(props.file.text);
  if (items.length === 0) {
    return null;
  }
  const apply = async (p: Pending): Promise<void> => {
    setBusy(true);
    const r = await markBug({ root: props.docs.root, path: props.file.path, line: p.item.line, text: p.item.text, state: p.state });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setError(null);
    setPending(null);
    setDocs(withEpoch(props.docs, r.value));
  };
  return (
    <section className="docs-bugs" data-testid="docs-bug-marks">
      <h3>
        Пункты <span className="docs-count">{items.length}</span>
      </h3>
      <p className="docs-bugs__hint">
        {props.writable === true ? `Отметка правит файл на диске: ${props.file.path}` : `Отметка недоступна: ${props.writable}`}
      </p>
      <ul className="docs-bugs__list">
        {items.map((item) => {
          const next = item.state === 'closed' ? 'open' : 'closed';
          const asking = pending?.item.line === item.line;
          return (
            <li key={item.line} className={`docs-bugs__item docs-bugs__item--${item.state}`} data-testid="docs-bug-item" data-state={item.state}>
              <span className="docs-bugs__state">{STATE_WORDS[item.state]}</span>
              <span className="docs-bugs__text">{item.text}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={props.writable !== true || busy}
                onClick={() => {
                  setError(null);
                  setPending({ item, state: next });
                }}
              >
                {next === 'closed' ? 'Закрыть' : 'Открыть'}
              </Button>
              {asking ? (
                <div className="docs-bugs__confirm" role="alertdialog" aria-label="Подтверждение записи" data-testid="docs-bug-confirm">
                  <p>
                    Записать в {props.file.path}: пункт станет {next === 'closed' ? 'закрытым' : 'открытым'}
                    {item.checkbox ? ' (отметка чекбокса).' : ` (перенос в раздел ${next === 'closed' ? 'Closed' : 'Open'}).`}
                  </p>
                  <div className="docs-bugs__actions">
                    <Button type="button" size="sm" variant="primary" disabled={busy} onClick={() => void apply({ item, state: next })}>
                      {busy ? 'Записываю…' : 'Записать'}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setPending(null)}>
                      Отмена
                    </Button>
                  </div>
                  {error === null ? null : (
                    <p className="docs-bugs__error" role="alert">
                      {error}
                    </p>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
