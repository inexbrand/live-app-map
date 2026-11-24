import type { LamComponentFixtures, LamScreenStates } from '../../../src/project';

export const screens: LamScreenStates = {
  'app:route:/': [
    { id: 'empty', label: 'Пусто', kind: 'empty', api: { 'GET /api/items': { status: 200, body: [] }, 'GET /api/items/:id': { status: 404, body: { error: 'нет' } } } },
    { id: 'error', label: 'Ошибка', kind: 'error', api: { 'GET /api/items': { status: 500, body: 'упало' } } },
    { id: 'loading', label: 'Загрузка', kind: 'loading', api: { 'GET /api/items': 'pending', 'GET /api/items/:id': 'pending' } },
    { id: 'slow', label: 'Медленно', kind: 'data', api: { 'GET /api/items': { status: 200, body: [1], delayMs: 600 } } },
  ],
};

export const components: LamComponentFixtures = {
  'src/Card.tsx#Card': [
    { id: 'red', label: 'Красная', props: { title: 'Из варианта', tone: 'red' } },
  ],
  'src/Remote.tsx#Remote': [
    { id: 'empty', label: 'Пусто', api: { 'GET /api/items': { status: 200, body: [] } } },
  ],
};
