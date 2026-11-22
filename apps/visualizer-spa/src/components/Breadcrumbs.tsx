/**
 * Хлебные крошки: вид › раздел › выбранное. Клик по крошке возвращает на её уровень,
 * стрелка — назад по истории браузера (адрес хранит место, см. use-nav-history).
 */
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { epochFileLabel } from '../lib/docs-view-model';
import { useAppStore } from '../store/app-store';
import { useDocGraphStore } from '../store/doc-graph-store';
import { useViewStore, type AppView } from '../store/view-store';

const VIEW_LABELS: ReadonlyMap<AppView, string> = new Map([
  ['screens', 'Экраны'],
  ['api', 'API'],
  ['database', 'База данных'],
  ['docs', 'Документация'],
  ['compare', 'Сравнение'],
]);

/** Крошка. */
type Crumb = { readonly label: string; readonly onClick?: () => void; readonly title?: string };

type ViewSnapshot = ReturnType<typeof useViewStore.getState>;
type Doc = NonNullable<ReturnType<typeof useAppStore.getState>['document']>;
type Docs = NonNullable<Doc['docs']>;

/** Клик по корневой крошке: вернуться к началу вида. */
const ROOT_RESET: Readonly<Record<AppView, () => void>> = {
  screens: () => useAppStore.getState().selectPage(null),
  docs: () => useViewStore.setState({ docsMode: 'text' }),
  api: () => useViewStore.setState({ route: null }),
  database: () => useViewStore.setState({ table: null }),
  compare: () => useViewStore.setState({ table: null }),
};

/** Крошки экрана: группа и экран. */
function screenCrumbs(doc: Doc, selectedPage: string | null): Crumb[] {
  const n = doc.nodes.find((x) => x.id === selectedPage);
  if (n === undefined) {
    return [];
  }
  const group = doc.groups?.find((g) => n.groupIds?.includes(g.id) === true);
  const out: Crumb[] = group === undefined ? [] : [{ label: group.title }];
  out.push({ label: n.title, title: n.pathPattern });
  return out;
}

/** Одна крошка найденного объекта; не найден — пусто. */
function crumbOf<T>(found: T | undefined, crumb: (x: T) => Crumb): Crumb[] {
  return found === undefined ? [] : [crumb(found)];
}

/** Крошка роута API. */
function routeCrumbs(doc: Doc, route: string | null): Crumb[] {
  return crumbOf(doc.code?.routes.find((x) => x.id === route), (r) => ({ label: `${r.method} ${r.path}`, title: r.location.file }));
}

/** Крошка таблицы. */
function tableCrumbs(doc: Doc, table: string | null): Crumb[] {
  return crumbOf(doc.code?.tables.find((x) => x.exportName === table), (t) => ({ label: t.name, title: t.location.file }));
}

/** Крошки графа документации: «Граф» и выбранный узел. */
function graphCrumbs(graphSel: string | null): Crumb[] {
  const out: Crumb[] = [{ label: 'Граф' }];
  if (graphSel !== null) {
    out.push({ label: graphSel.replace(/^[a-z-]+:/, '').split('/').pop() ?? graphSel, title: graphSel });
  }
  return out;
}

/** Эпоха открытого документа: без документа — первая. */
function epochOf(docs: Docs | undefined, path: string | null): Docs['epochs'][number] | undefined {
  if (path === null) {
    return docs?.epochs[0];
  }
  return docs?.epochs.find((e) => path === e.dir || path.startsWith(`${e.dir}/`));
}

/** Крошки эпохи: эпоха и её файл. */
function epochCrumbs(epoch: Docs['epochs'][number], path: string | null): Crumb[] {
  const out: Crumb[] = [{ label: epoch.slug, title: epoch.summary, onClick: () => useViewStore.getState().openDoc(epoch.dir) }];
  const file = path === null || path === epoch.dir ? epoch.files[0]?.path : path;
  if (file !== undefined) {
    out.push({ label: epochFileLabel(epoch.dir, file), title: file });
  }
  return out;
}

/** Крошки документации: граф, эпоха или заметка. */
function docsCrumbs(doc: Doc, v: ViewSnapshot, graphSel: string | null): Crumb[] {
  if (v.docsMode === 'graph') {
    return graphCrumbs(graphSel);
  }
  const epoch = epochOf(doc.docs, v.doc);
  if (epoch !== undefined) {
    return epochCrumbs(epoch, v.doc);
  }
  return v.doc === null ? [] : noteCrumbs(doc.docs, v.doc);
}

/** Крошка заметки или руководства (неизвестный путь — сам путь). */
function noteCrumbs(docs: Docs | undefined, path: string): Crumb[] {
  const f = [...(docs?.notes ?? []), ...(docs?.guides ?? [])].find((x) => x.path === path);
  return [{ label: f?.title ?? path, title: path }];
}

/** Крошки после корня — по виду. */
function placeCrumbs(doc: Doc, v: ViewSnapshot, selectedPage: string | null, graphSel: string | null): Crumb[] {
  switch (v.view) {
    case 'screens':
      return screenCrumbs(doc, selectedPage);
    case 'api':
      return routeCrumbs(doc, v.route);
    case 'database':
      return tableCrumbs(doc, v.table);
    case 'docs':
      return docsCrumbs(doc, v, graphSel);
    default:
      return [];
  }
}

/** Крошки текущего места. */
function useCrumbs(): Crumb[] {
  const doc = useAppStore((s) => s.document);
  const selectedPage = useAppStore((s) => s.selectedPageId);
  const v = useViewStore();
  const graphSel = useDocGraphStore((s) => s.selected);
  return useMemo(() => {
    const root: Crumb = { label: VIEW_LABELS.get(v.view) ?? v.view, onClick: ROOT_RESET[v.view] };
    return doc === null ? [root] : [root, ...placeCrumbs(doc, v, selectedPage, graphSel)];
  }, [doc, selectedPage, v, graphSel]);
}

/** Крошки и кнопка «назад». */
export function Breadcrumbs() {
  const crumbs = useCrumbs();
  return (
    <nav className="crumbs" aria-label="Где вы" data-testid="breadcrumbs">
      <button type="button" className="crumbs__back" onClick={() => window.history.back()} title="Назад (Alt+←)" aria-label="Назад">
        <ArrowLeft size={16} strokeWidth={1.75} />
      </button>
      <ol className="crumbs__list">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={`${i}:${c.label}`} className="crumbs__item">
              {i === 0 ? null : <ChevronRight size={14} className="crumbs__sep" aria-hidden="true" />}
              {last || c.onClick === undefined ? (
                <span className={last ? 'crumbs__current' : 'crumbs__text'} title={c.title} aria-current={last ? 'page' : undefined}>
                  {c.label}
                </span>
              ) : (
                <button type="button" className="crumbs__link" onClick={c.onClick} title={c.title}>
                  {c.label}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
