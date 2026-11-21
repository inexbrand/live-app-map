import { createRoute } from '@tanstack/react-router';

declare const rootRoute: unknown;

function loadSettings() {
  return fetch('/v1/settings/defaults');
}

/** Маршрут TanStack: данные грузит loader, компонент страницы — в своём файле. */
export const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  loader: () => loadSettings(),
});
