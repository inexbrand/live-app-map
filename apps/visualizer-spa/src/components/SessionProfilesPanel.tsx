/**
 * Профили входа шлюза: под кем открываются экраны карты. Приложения с
 * автовходом (`@live-app-map/dev-auth`) заводят профили сами при загрузке
 * карты; ручной вход — запасной путь.
 */
import { useMemo, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { Spinner } from '@/components/ui/spinner';
import { requestOk } from '../lib/dev-api';
import type { DogfoodActor } from '../lib/dogfood-api';
import { mapOrigins } from '../lib/gateway/map-origins';
import type { ProfileSummary } from '../lib/gateway/session-store';
import { useAppStore } from '../store/app-store';
import { useGatewayStore, type AutoLoginState } from '../store/gateway-store';
import { OptionSelect } from './option-select';
import { ManualLoginForm } from './toolbar/ManualLoginForm';

/** Origin экранов открытой карты. */
function useMapOrigins(): string[] {
  const document = useAppStore((s) => s.document);
  return useMemo(() => mapOrigins(document?.nodes ?? []), [document]);
}

/** Шлюз не отвечает: профилей нет. */
function GatewayDown(props: { readonly error: string | null }) {
  return (
    <Alert>
      <AlertTitle>Шлюз живых экранов не отвечает</AlertTitle>
      <AlertDescription>
        {props.error === null ? '' : `${props.error}. `}Он запускается вместе с dev-сервером визуализатора.
      </AlertDescription>
    </Alert>
  );
}

/** Что сохранено в профиле для origin: куки и ключи sessionStorage. */
function originContents(o: ProfileSummary['origins'][number]): string {
  return [...o.cookies.map((c) => `кука ${c}`), ...o.storageKeys].join(', ') || 'пусто';
}

/** Профиль в списке: кто, где вошёл, автовход ли, кнопка выхода. */
function ProfileItem(props: { readonly profile: ProfileSummary; readonly refresh: () => Promise<void> }) {
  const p = props.profile;
  const auto = p.origins.some((o) => o.autoUntil !== undefined);
  return (
    <Item variant="outline" size="sm" data-testid={`profile-${p.id}`}>
      <ItemContent>
        <ItemTitle>
          {p.label}
          <Badge variant="secondary">{p.role ?? p.id}</Badge>
          {auto ? <Badge variant="outline">автовход</Badge> : null}
        </ItemTitle>
        {p.origins.map((o) => (
          <ItemDescription key={o.origin}>
            {o.origin} · {originContents(o)}
          </ItemDescription>
        ))}
      </ItemContent>
      <ItemActions>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void requestOk(`/__lam_sessions/${p.id}`, { method: 'DELETE' }).then(() => props.refresh());
          }}
        >
          Выйти
        </Button>
      </ItemActions>
    </Item>
  );
}

/** Ход автовхода: идёт, какие роли не выданы, у каких приложений его нет. */
function AutoLoginStatus(props: { readonly auto: AutoLoginState; readonly onRetry: () => void }) {
  const { auto } = props;
  if (auto.status === 'idle') {
    return null;
  }
  if (auto.status === 'running') {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Spinner /> Спрашиваем роли у приложений карты…
      </p>
    );
  }
  const failedRoles = auto.roles.filter((r) => r.state === 'error');
  const brokenSources = auto.sources.filter((s) => s.state === 'error');
  const withoutAuto = auto.sources.filter((s) => s.state === 'absent').map((s) => s.origin);
  const problems = [
    ...(auto.error === null ? [] : [auto.error]),
    ...failedRoles.map((r) => `${r.label}: ${r.error ?? 'вход не выдан'}`),
    ...brokenSources.map((s) => `${s.origin}: ${s.error ?? 'не отвечает'}`),
  ];
  return (
    <>
      {problems.length > 0 ? (
        <Alert variant="destructive" data-testid="auto-login-problems">
          <AlertTitle>Автовход сработал не для всех</AlertTitle>
          <AlertDescription>
            <ul className="flex list-disc flex-col gap-1 pl-4">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={props.onRetry}>
              Спросить ещё раз
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {withoutAuto.length > 0 ? <p className="text-sm text-muted-foreground">Без автовхода: {withoutAuto.join(', ')} — эти экраны открываются как есть.</p> : null}
    </>
  );
}

/** «Смотреть как»: роль экранов без своего стейта — переключает профиль входа. */
function ViewAsField(props: { readonly profiles: readonly ProfileSummary[] }) {
  const globalRole = useAppStore((s) => s.globalRole);
  const setGlobalRole = useAppStore((s) => s.setGlobalRole);
  const items = [{ value: '', label: 'Как задано у экрана' }, ...props.profiles.map((p) => ({ value: p.role ?? p.id, label: p.label }))];
  return (
    <Field>
      <FieldLabel htmlFor="logins-view-as">Смотреть как</FieldLabel>
      <OptionSelect id="logins-view-as" aria-label="Смотреть как" value={globalRole} onValueChange={setGlobalRole} items={items} placeholder="Как задано у экрана" />
      <FieldDescription>Экраны приложения с этой ролью откроются под ней; у кого роли нет — под своей.</FieldDescription>
    </Field>
  );
}

/**
 * Панель профилей.
 *
 * @param props.actors - пользователи из dev-API korbor (для ручного входа)
 * @param props.actorsError - почему список пользователей пуст
 * @param props.apiBase - адрес API korbor для ручного dev-входа
 */
export function SessionProfilesPanel(props: { readonly actors: readonly DogfoodActor[]; readonly actorsError: string | null; readonly apiBase: string }) {
  const port = useGatewayStore((s) => s.port);
  const profiles = useGatewayStore((s) => s.profiles);
  const gatewayError = useGatewayStore((s) => s.error);
  const refresh = useGatewayStore((s) => s.refresh);
  const auto = useGatewayStore((s) => s.auto);
  const autoLogin = useGatewayStore((s) => s.autoLogin);
  const origins = useMapOrigins();
  // Форма — по кнопке: в листе сначала видно, кто уже вошёл
  const [adding, setAdding] = useState(false);

  if (port === null) {
    return <GatewayDown error={gatewayError} />;
  }

  return (
    <div className="flex flex-col gap-4" data-testid="session-profiles">
      {profiles.length > 0 ? <ViewAsField profiles={profiles} /> : null}
      <AutoLoginStatus auto={auto} onRetry={() => void autoLogin(origins, true)} />
      {profiles.length === 0 && auto.status !== 'running' ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Профилей нет</EmptyTitle>
            <EmptyDescription>Экраны открываются без входа. Подключите автовход в приложении (пакет @live-app-map/dev-auth) или добавьте вход вручную.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ItemGroup className="gap-2">
          {profiles.map((p) => (
            <ProfileItem key={p.id} profile={p} refresh={refresh} />
          ))}
        </ItemGroup>
      )}
      {adding ? (
        <ManualLoginForm origins={origins} actors={props.actors} actorsError={props.actorsError} apiBase={props.apiBase} refresh={refresh} onCancel={() => setAdding(false)} />
      ) : (
        <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setAdding(true)}>
          Добавить вход вручную
        </Button>
      )}
    </div>
  );
}
