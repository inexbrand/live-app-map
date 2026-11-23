/**
 * Вид «Документация» — состояния интерфейса на собранной вручную документации:
 * режим «Текст / Граф», выделение строк и вкладок, готовность эпохи в строке,
 * шапка эпохи (дата, статус, цель, ровно пять пунктов), путь файла, скриншоты, пустые разделы.
 */
import { useDom } from '../test/dom';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act, fireEvent, render, within } from '@testing-library/react';
import type { DocEpoch, DocsModel } from '@live-app-map/schema';
import { useAppStore } from '../store/app-store';
import { useDocGraphStore } from '../store/doc-graph-store';
import { useViewStore } from '../store/view-store';
import { jsonResponse, openMap, resetStores, stubFetch } from '../test/fixtures';
import { DocsView } from './DocsView';

useDom();

let net: ReturnType<typeof stubFetch>;

beforeEach(() => {
  resetStores();
  net = stubFetch((url) => (url.startsWith('/__lam_docs/live') ? jsonResponse({ error: 'каталога нет на этой машине' }, 404) : undefined));
});

afterEach(() => net.restore());

function epoch(id: string, extra: Partial<DocEpoch> = {}): DocEpoch {
  const dir = `docs/epoch/${id}`;
  return {
    id,
    slug: id.split('#')[0] ?? id,
    dir,
    readiness: 'ready',
    openBugs: [],
    files: [
      { path: `${dir}/00-brief.md`, title: 'Бриф', text: '# Бриф\n\nтекст брифа' },
      { path: `${dir}/09-bugs.md`, title: 'Баги', text: '# Баги\n\n- [x] закрыт' },
    ],
    images: [],
    ...extra,
  };
}

const DOCS: DocsModel = {
  root: '/proj',
  epochs: [
    epoch('alpha#20261101-101500', { summary: 'Цель альфы', declaredStatus: 'done', readiness: 'not-ready', openBugs: ['п1', 'п2', 'п3', 'п4', 'п5'], images: ['docs/epoch/alpha#20261101-101500/screens/a.png'] }),
    epoch('beta', { readiness: 'no-bugs-file' }),
  ],
  notes: [{ path: 'docs/agent-notes/n1.md', title: 'Заметка один', text: '# Заметка один' }],
  guides: [],
};

function show(docPath: string | null) {
  const doc = openMap('korbor-miniapp');
  act(() => {
    useAppStore.getState().loadDocument({ ...doc, docs: DOCS });
    if (docPath !== null) {
      useViewStore.getState().openDoc(docPath);
    }
  });
  const r = render(<DocsView />);
  return { ui: within(r.container), container: r.container };
}

describe('список документов', () => {
  test('строки эпох: открытая выделена, неготовая помечена, цель и подсказка', () => {
    const { ui } = show('docs/epoch/alpha#20261101-101500');
    const rows = ui.getAllByTestId('docs-epoch-row');
    expect(rows.map((r) => [r.className, r.title, r.querySelector('.docs-row__summary')?.textContent ?? null, r.querySelector('.docs-row__state')?.className])).toEqual([
      ['docs-row docs-row--on', 'Цель альфы', 'Цель альфы', 'docs-row__state docs-row__state--open'],
      ['docs-row', 'beta', null, 'docs-row__state'],
    ]);
  });

  test('заметка: строка открытой выделена; руководств нет — раздела нет', () => {
    const { ui, container } = show('docs/agent-notes/n1.md');
    expect(ui.getByTitle('docs/agent-notes/n1.md').className).toBe('docs-row docs-row--on');
    expect([...container.querySelectorAll('.docs-group__title')].map((h) => h.textContent)).toEqual(['Эпохи 2', 'Заметки агентов 1']);
    expect(ui.queryAllByTestId('docs-epoch-row').map((r) => r.className)).toEqual(['docs-row', 'docs-row']);
  });

  test('фильтр готовности: выбранный чип отмечен', () => {
    const { ui } = show(null);
    const group = within(ui.getByRole('group', { name: 'Готовность эпох' }));
    const active = () => group.getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent);
    expect(active()).toEqual(['Все']);
    fireEvent.click(group.getByRole('button', { name: 'Без 09-bugs' }));
    expect(active()).toEqual(['Без 09-bugs']);
    expect(ui.getAllByTestId('docs-epoch-row').map((r) => r.title)).toEqual(['beta']);
  });

  test('режим: нажатая кнопка отмечена', () => {
    const { ui } = show(null);
    const pressed = () => within(ui.getByRole('group', { name: 'Режим документации' })).getAllByRole('button').map((b) => `${b.textContent}:${b.getAttribute('aria-pressed')}:${b.className.includes('--on')}`);
    expect(pressed()).toEqual(['Текст:true:true', 'Граф:false:false']);
    act(() => useViewStore.getState().setDocsMode('graph'));
    expect(pressed()).toEqual(['Текст:false:false', 'Граф:true:true']);
  });
});

describe('документ эпохи', () => {
  test('шапка: дата, статус и готовность через точку, цель, ровно пять пунктов без «ещё»', () => {
    const { ui } = show('docs/epoch/alpha#20261101-101500');
    const head = ui.getByTestId('docs-epoch-head');
    expect(head.querySelector('.docs-doc__meta')?.textContent?.split(' · ').length).toBe(3);
    expect(head.querySelector('.docs-doc__meta')?.textContent).toContain('статус: done');
    expect(head.querySelector('.docs-doc__summary')?.textContent).toBe('Цель альфы');
    expect(within(ui.getByTestId('docs-open-bugs')).queryByRole('button', { name: /^ещё/ })).toBeNull();
    expect(within(ui.getByTestId('docs-open-bugs')).getAllByRole('listitem')).toHaveLength(5);
  });

  test('эпоха без даты, статуса и цели: в шапке только готовность', () => {
    const { ui } = show('docs/epoch/beta');
    const head = ui.getByTestId('docs-epoch-head');
    expect(head.querySelector('.docs-doc__meta')?.textContent?.split(' · ')).toHaveLength(1);
    expect(head.querySelector('.docs-doc__summary')).toBeNull();
    expect(ui.queryByTestId('docs-open-bugs')).toBeNull();
    expect(ui.queryByTestId('docs-gallery')).toBeNull();
  });

  test('вкладки: текущая отмечена, путь файла — в подсказке вкладки, не строкой над текстом; скриншоты подписаны именем файла', () => {
    const { ui, container } = show('docs/epoch/alpha#20261101-101500/09-bugs.md');
    const tabs = within(ui.getByRole('navigation', { name: 'Файлы эпохи' })).getAllByRole('button');
    expect(tabs.map((t) => `${t.title}:${t.getAttribute('aria-current')}:${t.className}`)).toEqual(['00-brief.md:false:docs-tab', '09-bugs.md:true:docs-tab docs-tab--on']);
    expect(container.querySelector('.docs-doc__file')).toBeNull();
    const gallery = within(ui.getByTestId('docs-gallery'));
    expect(gallery.getByRole('img').getAttribute('alt')).toBe('a.png');
  });
});

/** Строка файла кода карты, где нет ни роута, ни таблицы: ссылка на неё — «файл». */
function plainCodeFile(): string {
  const doc = useAppStore.getState().document ?? openMap('korbor-miniapp');
  const route = doc.code?.routes[0];
  if (route === undefined) {
    throw new Error('нет роутов');
  }
  return `${route.location.file}:99999`;
}

/** Документация с одной заметкой заданного текста и эпохой alpha. */
function showNote(text: string, extraNotes: DocsModel['notes'] = []) {
  const doc = openMap('korbor-miniapp');
  const note = { path: 'docs/agent-notes/n1.md', title: 'Заметка один', text };
  act(() => {
    useAppStore.getState().loadDocument({ ...doc, docs: { ...DOCS, notes: [note, ...extraNotes] } });
    useViewStore.getState().openDoc(note.path);
  });
  const r = render(<DocsView />);
  const md = r.container.querySelector('[data-testid="doc-markdown"]');
  if (!(md instanceof HTMLElement)) {
    throw new Error('нет markdown');
  }
  return { md, container: r.container, ui: within(r.container) };
}

describe('markdown: код и ссылки', () => {
  test('инлайн-код: документ раздела, роут карты, файл кода, просто код, блок', () => {
    const route = openMap('korbor-miniapp').code?.routes[0];
    const file = plainCodeFile();
    const { md } = showNote(`\`docs/epoch/beta/00-brief.md\` \`${route?.method} ${route?.path}\` \`${file}\` \`просто-код\`\n\n\`\`\`ts\nconst a = 1;\n\`\`\`\n`);
    const codes = [...md.querySelectorAll('code')].map((c) => `${c.parentElement?.tagName}|${c.parentElement?.getAttribute('data-testid') ?? ''}|${c.getAttribute('title') === null ? '' : 'title'}|${c.className}`);
    expect(codes).toEqual(['BUTTON|doc-ref-doc||', 'BUTTON|doc-ref||', 'P||title|', 'P|||', 'PRE|||language-ts']);
    fireEvent.click(within(md).getByTestId('doc-ref-doc'));
    expect(useViewStore.getState().doc).toBe('docs/epoch/beta/00-brief.md');
  });

  test('ссылки: внешняя, документ рядом, таблица, файл кода, мёртвая; картинки — своя и чужая', () => {
    const table = openMap('korbor-miniapp').code?.tables[0];
    const { md } = showNote(`[сайт](https://example.com) [бета](../epoch/beta/00-brief.md) [таблица](/${table?.location.file}) [файл](/${plainCodeFile()}) [нет](./нет.md)\n\n![](./img/a.png) ![чужая](https://e.com/x.png)\n`);
    expect([...md.querySelectorAll('a, button, span.md__dead, img')].map((el) => `${el.tagName}.${el.className}|${el.textContent}|${el.getAttribute('title') ?? ''}|${el.getAttribute('alt') ?? ''}`)).toEqual([
      'A.|сайт||',
      'BUTTON.md__link|бета||',
      'BUTTON.md__link|таблица|Открыть таблицу в «Базе данных»|',
      `SPAN.md__dead|файл|/${plainCodeFile()}|`,
      'SPAN.md__dead|нет|./%D0%BD%D0%B5%D1%82.md|',
      'IMG.md__img|||',
      'SPAN.md__dead|чужая||',
    ]);
    expect(md.querySelector('a')?.getAttribute('target')).toBe('_blank');
    fireEvent.click(within(md).getByRole('button', { name: 'бета' }));
    expect(useViewStore.getState().doc).toBe('docs/epoch/beta/00-brief.md');
  });
});

describe('локальный граф документа', () => {
  test('ссылки заметки: документ открывается, файл кода — нет; глубина отмечена', () => {
    const { ui } = showNote(`См. \`docs/epoch/beta/00-brief.md\` и \`${plainCodeFile()}\`.`);
    const local = within(ui.getByTestId('local-graph'));
    const out = within(local.getByTestId('local-graph-out')).getAllByRole('button');
    expect(out.map((b) => `${b.textContent}:${b.hasAttribute('disabled')}`)).toEqual(['Бриф:false', `${plainCodeFile().split(':')[0]?.split('/').pop()}:true`]);
    expect(local.queryByTestId('local-graph-in')).toBeNull();
    const depth = () => within(within(ui.getByTestId('local-graph')).getByRole('group', { name: 'Глубина' })).getAllByRole('button').map((b) => `${b.textContent}:${b.getAttribute('aria-pressed') === 'true'}`);
    expect(depth()).toEqual(['1 шаг:true', '2 шага:false']);
    expect(local.getByTestId('local-graph-canvas').getAttribute('aria-label')).toBe('Связи документа: 2 узлов');
    fireEvent.click(within(ui.getByTestId('local-graph')).getByRole('button', { name: '2 шага' }));
    expect(depth()).toEqual(['1 шаг:false', '2 шага:true']);
    expect(within(ui.getByTestId('local-graph')).getByTestId('local-graph-canvas').getAttribute('aria-label')).toBe('Связи документа: 3 узлов');
  });

  test('документ без связей: пояснение вместо графа', () => {
    const { ui } = showNote('Ни одной ссылки.');
    expect(within(ui.getByTestId('local-graph')).getByText('Документ ни на что не ссылается, и на него не ссылаются.')).toBeTruthy();
  });
});
