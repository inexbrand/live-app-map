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

/** Крошки текущего места. */
function useCrumbs(): Crumb[] {
  const doc = useAppStore((s) => s.document);
  const selectedPage = useAppStore((s) => s.selectedPageId);
  const v = useViewStore();
  const graphSel = useDocGraphStore((s) => s.selected);
  return useMemo(() => {
    const root: Crumb = {
      label: VIEW_LABELS.get(v.view) ?? v.view,
      onClick: () => {
        if (v.view === 'screens') {
          useAppStore.getState().selectPage(null);
        } else if (v.view === 'docs') {
          useViewStore.setState({ docsMode: 'text' });
        } else {
          useViewStore.setState(v.view === 'api' ? { route: null } : { table: null });
        }
      },
    };
    const out: Crumb[] = [root];
    if (doc === null) {
      return out;
    }
    if (v.view === 'screens' && selectedPage !== null) {
      const n = doc.nodes.find((x) => x.id === selectedPage);
      const group = doc.groups?.find((g) => n?.groupIds?.includes(g.id) === true);
      if (group !== undefined) {
        out.push({ label: group.title });
      }
      if (n !== undefined) {
        out.push({ label: n.title, title: n.pathPattern });
      }
    }
    if (v.view === 'api' && v.route !== null) {
      const r = doc.code?.routes.find((x) => x.id === v.route);
      if (r !== undefined) {
        out.push({ label: `${r.method} ${r.path}`, title: r.location.file });
      }
    }
    if (v.view === 'database' && v.table !== null) {
      const t = doc.code?.tables.find((x) => x.exportName === v.table);
      if (t !== undefined) {
        out.push({ label: t.name, title: t.location.file });
      }
    }
    if (v.view === 'docs') {
      if (v.docsMode === 'graph') {
        out.push({ label: 'Граф' });
        if (graphSel !== null) {
          out.push({ label: graphSel.replace(/^[a-z-]+:/, '').split('/').pop() ?? graphSel, title: graphSel });
        }
        return out;
      }
      const path = v.doc;
      const epoch = path === null ? doc.docs?.epochs[0] : doc.docs?.epochs.find((e) => path === e.dir || path.startsWith(`${e.dir}/`));
      if (epoch !== undefined) {
        out.push({ label: epoch.slug, title: epoch.summary, onClick: () => useViewStore.getState().openDoc(epoch.dir) });
        const file = path === null || path === epoch.dir ? epoch.files[0]?.path : path;
        if (file !== undefined) {
          out.push({ label: epochFileLabel(epoch.dir, file), title: file });
        }
      } else if (path !== null) {
        const f = [...(doc.docs?.notes ?? []), ...(doc.docs?.guides ?? [])].find((x) => x.path === path);
        out.push({ label: f?.title ?? path, title: path });
      }
    }
    return out;
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
