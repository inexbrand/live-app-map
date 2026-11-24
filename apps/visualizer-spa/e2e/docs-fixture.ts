/**
 * Документация карты проекта (korbor) для e2e без зависимости от состояния korbor: в docs карты
 * добавляется тестовая незакрытая эпоха, «диск» отдаёт тот же docs. Карту пересобирают
 * (scan:korbor), эпохи на диске закрываются — сценарии от этого не меняются.
 */
import type { DocsModel } from '@live-app-map/schema';
import type { Page, Route } from '@playwright/test';
import { PROJECT_MAP } from './helpers';

/** Тестовая незакрытая эпоха: самая новая, один открытый пункт со ссылкой на роут. */
export const OPEN_EPOCH = {
  slug: 'e2e-open-task',
  dir: 'docs/epoch/e2e-open-task#20991231-235959',
  bug: 'E2E: лимитер запросов теряет счёт',
  route: 'POST /api/v1/auth/web/telegram-login',
};

const BUGS_TEXT = `# Найденные баги

## Open

- [ ] ${OPEN_EPOCH.bug} — \`${OPEN_EPOCH.route}\`, см. \`README.md\`

## Closed
`;

/**
 * docs с тестовой эпохой первой (эпохи идут от новых к старым).
 *
 * @param docs - docs карты
 */
export function withOpenEpoch(docs: DocsModel): DocsModel {
  const { slug, dir } = OPEN_EPOCH;
  return {
    ...docs,
    epochs: [
      {
        id: dir.slice('docs/epoch/'.length),
        slug,
        date: '2099-12-31T23:59:59',
        dir,
        summary: 'E2E: незакрытая задача с открытым пунктом.',
        declaredStatus: 'research',
        readiness: 'not-ready',
        openBugs: [`${OPEN_EPOCH.bug} — \`${OPEN_EPOCH.route}\`, см. \`README.md\``],
        files: [
          { path: `${dir}/00-brief.md`, title: 'Brief', text: `# Brief\n\n## Цель\n\nE2E: незакрытая задача — проверить \`${OPEN_EPOCH.route}\`.\n` },
          { path: `${dir}/09-bugs.md`, title: 'Найденные баги', text: BUGS_TEXT },
        ],
        images: [],
      },
      ...docs.epochs,
    ],
  };
}

/** Что отдаёт «диск»: тот же docs, ошибку или ответ из теста. */
export type LiveDocs = 'same' | 'off' | ((route: Route, docs: DocsModel) => Promise<void>);

/**
 * Подменяет docs карты проекта и ответ чтения диска во всём контексте (и в новых вкладках).
 *
 * @param page - страница
 * @param live - что отдаёт чтение диска
 * @returns docs, которые увидит вид (после загрузки карты)
 */
export async function pinKorborDocs(page: Page, live: LiveDocs = 'same'): Promise<() => DocsModel> {
  let pinned: DocsModel | null = null;
  const docs = (): DocsModel => {
    if (pinned === null) {
      throw new Error('карта проекта ещё не загружена');
    }
    return pinned;
  };
  // По пути запроса, а не по всему адресу: адрес страницы тоже содержит ?map=/__lam_project/map.json
  await page.context().route((url) => url.pathname === PROJECT_MAP, async (route) => {
    const res = await route.fetch();
    const map: { docs?: DocsModel } = await res.json();
    if (map.docs === undefined) {
      throw new Error('в карте проекта нет docs');
    }
    pinned = withOpenEpoch(map.docs);
    await route.fulfill({ response: res, json: { ...map, docs: pinned } });
  });
  await page.context().route('**/__lam_docs/live**', async (route) => {
    if (live === 'off') {
      await route.fulfill({ status: 404, json: { error: 'диск отключён в тесте' } });
    } else if (live === 'same') {
      await route.fulfill({ json: { docs: docs() } });
    } else {
      await live(route, docs());
    }
  });
  return docs;
}
