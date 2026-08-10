/**
 * Fixture App Router route handler: GET /api/health.
 * Нужен scanner-next unit-тестам includeRouteHandlers.
 */
export function GET(): Response {
  return Response.json({ ok: true });
}
