/**
 * Dev-вход Live App Map: приложение отдаёт роли и выдаёт их сессии,
 * визуализатор сам заводит профили входа.
 */
export * from './protocol';
export { createDevAuthHandler, isLoopbackAddress, type DevAuthHandler, type DevAuthOptions } from './server';
export {
  fetchDevAuthRoles,
  isDevAuthExpired,
  issueDevAuthSession,
  type DevAuthClientOptions,
  type DevAuthFetch,
  type DevAuthIssueResult,
  type DevAuthRolesResult,
} from './client';
