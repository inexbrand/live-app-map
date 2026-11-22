/**
 * Профили сессий шлюза: кто вошёл в какие приложения, вход один раз
 * (dev-вход korbor или вставка кук/токена), выход.
 */
import { useActionState, useMemo, useState } from 'react';
import { requestJson, requestOk } from '../lib/dev-api';
import type { DogfoodActor } from '../lib/dogfood-api';
import { buildSessionRequest, type SessionFormFields, type SessionMethod } from '../lib/gateway/session-form';
import type { ProfileSummary } from '../lib/gateway/session-store';
import { useAppStore } from '../store/app-store';
import { useGatewayStore } from '../store/gateway-store';
import { Button, Field, Input, Select, Textarea } from '../ui';

/** Результат отправки формы. */
type FormState = { readonly field: keyof SessionFormFields | null; readonly error: string | null; readonly done: string | null };

const EMPTY: FormState = { field: null, error: null, done: null };

/** Origin экранов карты — из чего выбирать приложение. */
function mapOrigins(nodes: readonly { readonly url?: string }[]): string[] {
  const set = new Set<string>();
  for (const n of nodes) {
    const origin = n.url === undefined ? null : httpOrigin(n.url);
    if (origin !== null) {
      set.add(origin);
    }
  }
  return [...set].sort();
}

/** Origin http(s)-адреса; адрес без схемы или другой схемы — не приложение. */
function httpOrigin(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

/** Origin экранов открытой карты. */
function useMapOrigins(): string[] {
  const document = useAppStore((s) => s.document);
  return useMemo(() => mapOrigins(document?.nodes ?? []), [document]);
}

/** Строковое поле формы (нет поля — пусто). */
function formText(form: FormData, k: string): string {
  const v = form.get(k);
  return typeof v === 'string' ? v : '';
}

/**
 * Отправка формы профиля: проверка полей, запрос к шлюзу, обновление списка.
 *
 * @param method - способ входа
 * @param form - поля формы
 * @param refresh - перечитать профили
 */
async function submitSession(method: SessionMethod, form: FormData, refresh: () => Promise<void>): Promise<FormState> {
  const text = (k: string): string => formText(form, k);
  const req = buildSessionRequest({
    id: text('id'),
    label: text('label'),
    role: text('role'),
    origin: text('origin'),
    method,
    actor: text('actor'),
    apiBase: text('apiBase'),
    cookies: text('cookies'),
    storageKey: text('storageKey'),
    storageValue: text('storageValue'),
  });
  if (!req.ok) {
    return { field: req.field, error: req.error, done: null };
  }
  const r = await requestJson(req.path, { method: req.method, json: req.body });
  if (!r.ok && r.status === null) {
    throw new Error(r.error);
  }
  if (!r.ok) {
    return { field: null, error: r.error, done: null };
  }
  await refresh();
  return { field: null, error: null, done: `Профиль «${text('label')}» сохранён — экраны откроются под ним` };
}

/** Подсказка под полем, если ошибка у него. */
function FieldError(props: { readonly state: FormState; readonly field: keyof SessionFormFields }) {
  return props.state.field === props.field && props.state.error !== null ? (
    <span className="drawer__hint session-form__error" role="alert">
      {props.state.error}
    </span>
  ) : null;
}

/** Шлюз не отвечает: профилей нет. */
function GatewayDown(props: { readonly error: string | null }) {
  return (
    <div className="sheet-block">
      <div className="ui-field__label">Профили входа</div>
      <p className="drawer__hint" role="status">
        Шлюз живых экранов не отвечает{props.error === null ? '' : `: ${props.error}`}. Он запускается вместе с dev-сервером визуализатора.
      </p>
    </div>
  );
}

/** Что сохранено в профиле для origin: куки и ключи sessionStorage. */
function originContents(o: ProfileSummary['origins'][number]): string {
  return [...o.cookies.map((c) => `кука ${c}`), ...o.storageKeys].join(', ') || 'пусто';
}

/** Профиль в списке: кто, где вошёл, кнопка выхода. */
function ProfileItem(props: { readonly profile: ProfileSummary; readonly refresh: () => Promise<void> }) {
  const p = props.profile;
  return (
    <li className="session-profiles__item">
      <div>
        <strong>{p.label}</strong> <span className="drawer__hint">{p.role ?? p.id}</span>
        {p.origins.map((o) => (
          <div key={o.origin} className="drawer__hint">
            {o.origin} · {originContents(o)}
          </div>
        ))}
      </div>
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
    </li>
  );
}

/** Поля входа пользователем из базы korbor. */
function DogfoodFields(props: { readonly state: FormState; readonly actors: readonly DogfoodActor[]; readonly actorsError: string | null; readonly apiBase: string }) {
  const { state, actors } = props;
  return (
    <>
      <Field label="Пользователь" htmlFor="sess-actor" hint={actors.length === 0 ? `Список пуст: ${props.actorsError ?? 'нужен API korbor с DOGFOOD_DEV'}` : undefined}>
        <Select id="sess-actor" name="actor" defaultValue="">
          <option value="">— выберите —</option>
          {actors.map((a) => (
            <option key={`${a.kind}:${a.id}`} value={`${a.kind}:${a.id}`}>
              [{a.role}] {a.label}
            </option>
          ))}
        </Select>
        <FieldError state={state} field="actor" />
      </Field>
      <Field label="API korbor" htmlFor="sess-api">
        <Input id="sess-api" name="apiBase" defaultValue={props.apiBase} />
        <FieldError state={state} field="apiBase" />
      </Field>
    </>
  );
}

/** Поля вставки кук или токена. */
function PasteFields(props: { readonly state: FormState }) {
  const { state } = props;
  return (
    <>
      <Field label="Куки" htmlFor="sess-cookies" hint="Из DevTools → Application → Cookies: «sid=…; csrf=…»">
        <Textarea id="sess-cookies" name="cookies" rows={2} />
        <FieldError state={state} field="cookies" />
      </Field>
      <Field label="Ключ sessionStorage" htmlFor="sess-skey">
        <Input id="sess-skey" name="storageKey" />
        <FieldError state={state} field="storageKey" />
      </Field>
      <Field label="Значение (токен)" htmlFor="sess-sval">
        <Textarea id="sess-sval" name="storageValue" rows={2} />
        <FieldError state={state} field="storageValue" />
      </Field>
    </>
  );
}

/** Итог отправки: общая ошибка или «сохранён». */
function FormOutcome(props: { readonly state: FormState }) {
  const { state } = props;
  return (
    <>
      {state.error !== null && state.field === null ? (
        <p className="drawer__hint session-form__error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.done !== null ? (
        <p className="drawer__hint" role="status">
          {state.done}
        </p>
      ) : null}
    </>
  );
}

/**
 * Панель профилей.
 *
 * @param props.actors - пользователи из dev-API korbor (если доступно)
 * @param props.actorsError - почему список пользователей пуст
 * @param props.apiBase - адрес API korbor для dev-входа
 */
export function SessionProfilesPanel(props: { readonly actors: readonly DogfoodActor[]; readonly actorsError: string | null; readonly apiBase: string }) {
  const port = useGatewayStore((s) => s.port);
  const profiles = useGatewayStore((s) => s.profiles);
  const gatewayError = useGatewayStore((s) => s.error);
  const refresh = useGatewayStore((s) => s.refresh);
  const origins = useMapOrigins();
  const [method, setMethod] = useState<SessionMethod>('korbor-dogfood');
  const [state, submit, pending] = useActionState((_prev: FormState, form: FormData) => submitSession(method, form, refresh), EMPTY);

  if (port === null) {
    return <GatewayDown error={gatewayError} />;
  }

  return (
    <div className="sheet-block session-profiles" data-testid="session-profiles">
      <div className="ui-field__label">Профили входа</div>
      <p className="drawer__hint">
        Войдите один раз — шлюз подставит сессию во все экраны этого приложения. Данные лежат в .lam-sessions вне git.
      </p>
      {profiles.length === 0 ? <p className="drawer__hint">Профилей нет: экраны открываются без входа.</p> : null}
      <ul className="session-profiles__list">
        {profiles.map((p) => (
          <ProfileItem key={p.id} profile={p} refresh={refresh} />
        ))}
      </ul>

      <form action={submit} className="session-form">
        <Field label="Профиль (id)" htmlFor="sess-id" hint="recruiter, employer, admin — совпадает со стейтом ноды">
          <Input id="sess-id" name="id" list="sess-id-list" />
          <datalist id="sess-id-list">
            <option value="recruiter" />
            <option value="employer" />
            <option value="admin" />
          </datalist>
          <FieldError state={state} field="id" />
        </Field>
        <Field label="Подпись" htmlFor="sess-label">
          <Input id="sess-label" name="label" />
          <FieldError state={state} field="label" />
        </Field>
        <Field label="Роль (необязательно)" htmlFor="sess-role">
          <Input id="sess-role" name="role" />
        </Field>
        <Field label="Приложение" htmlFor="sess-origin">
          <Select id="sess-origin" name="origin" defaultValue="">
            <option value="">— выберите —</option>
            {origins.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </Select>
          <FieldError state={state} field="origin" />
        </Field>
        <Field label="Как войти" htmlFor="sess-method">
          <Select id="sess-method" value={method} onChange={(e) => setMethod(e.target.value === 'paste' ? 'paste' : 'korbor-dogfood')}>
            <option value="korbor-dogfood">Пользователь из базы korbor (dev-вход)</option>
            <option value="paste">Вставить куки или токен</option>
          </Select>
        </Field>
        {method === 'korbor-dogfood' ? <DogfoodFields state={state} actors={props.actors} actorsError={props.actorsError} apiBase={props.apiBase} /> : <PasteFields state={state} />}
        <FormOutcome state={state} />
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? 'Вход…' : 'Войти'}
        </Button>
      </form>
    </div>
  );
}
