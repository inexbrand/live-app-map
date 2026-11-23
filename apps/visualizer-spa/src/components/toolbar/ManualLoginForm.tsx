/**
 * Ручной вход — запасной путь, когда у приложения нет автовхода: пользователь
 * из базы korbor (dev-вход) или вставка кук и токена из DevTools.
 */
import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { requestJson } from '../../lib/dev-api';
import type { DogfoodActor } from '../../lib/dogfood-api';
import { buildSessionRequest, type SessionFormFields, type SessionMethod } from '../../lib/gateway/session-form';
import { OptionSelect } from '../option-select';

/** Результат отправки формы. */
type FormState = { readonly field: keyof SessionFormFields | null; readonly error: string | null; readonly done: string | null };

const EMPTY: FormState = { field: null, error: null, done: null };

const METHODS = [
  { value: 'korbor-dogfood', label: 'Пользователь из базы korbor (dev-вход)' },
  { value: 'paste', label: 'Вставить куки или токен' },
];

/** Строковое поле формы (нет поля — пусто). */
function formText(form: FormData, k: string): string {
  const v = form.get(k);
  return typeof v === 'string' ? v : '';
}

/**
 * Отправка формы профиля: проверка полей, запрос к шлюзу, обновление списка.
 *
 * @param method - способ входа
 * @param form - поля формы (списки выбора дописаны вызывающим)
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

/** Ошибка под полем, если она у него. */
function ErrorOf(props: { readonly state: FormState; readonly field: keyof SessionFormFields }) {
  return props.state.field === props.field && props.state.error !== null ? <FieldError>{props.state.error}</FieldError> : null;
}

/** Поля входа пользователем из базы korbor. */
function DogfoodFields(props: { readonly state: FormState; readonly actors: readonly DogfoodActor[]; readonly actorsError: string | null; readonly apiBase: string; readonly actor: string; readonly onActor: (v: string) => void }) {
  const { state, actors } = props;
  return (
    <>
      <Field data-invalid={state.field === 'actor' || undefined}>
        <FieldLabel htmlFor="sess-actor">Пользователь</FieldLabel>
        <OptionSelect
          id="sess-actor"
          aria-label="Пользователь"
          value={props.actor}
          onValueChange={props.onActor}
          placeholder="Выберите"
          items={actors.map((a) => ({ value: `${a.kind}:${a.id}`, label: `[${a.role}] ${a.label}` }))}
        />
        {actors.length === 0 ? <FieldDescription>Список пуст: {props.actorsError ?? 'нужен API korbor с DOGFOOD_DEV'}</FieldDescription> : null}
        <ErrorOf state={state} field="actor" />
      </Field>
      <Field data-invalid={state.field === 'apiBase' || undefined}>
        <FieldLabel htmlFor="sess-api">API korbor</FieldLabel>
        <Input id="sess-api" name="apiBase" defaultValue={props.apiBase} />
        <ErrorOf state={state} field="apiBase" />
      </Field>
    </>
  );
}

/** Поля вставки кук или токена. */
function PasteFields(props: { readonly state: FormState }) {
  const { state } = props;
  return (
    <>
      <Field data-invalid={state.field === 'cookies' || undefined}>
        <FieldLabel htmlFor="sess-cookies">Куки</FieldLabel>
        <Textarea id="sess-cookies" name="cookies" rows={2} />
        <FieldDescription>Из DevTools → Application → Cookies: «sid=…; csrf=…»</FieldDescription>
        <ErrorOf state={state} field="cookies" />
      </Field>
      <Field data-invalid={state.field === 'storageKey' || undefined}>
        <FieldLabel htmlFor="sess-skey">Ключ sessionStorage</FieldLabel>
        <Input id="sess-skey" name="storageKey" />
        <ErrorOf state={state} field="storageKey" />
      </Field>
      <Field data-invalid={state.field === 'storageValue' || undefined}>
        <FieldLabel htmlFor="sess-sval">Значение (токен)</FieldLabel>
        <Textarea id="sess-sval" name="storageValue" rows={2} />
        <ErrorOf state={state} field="storageValue" />
      </Field>
    </>
  );
}

/** Props формы ручного входа. */
export type ManualLoginFormProps = {
  readonly origins: readonly string[];
  readonly actors: readonly DogfoodActor[];
  readonly actorsError: string | null;
  readonly apiBase: string;
  readonly refresh: () => Promise<void>;
  readonly onCancel: () => void;
};

/**
 * Форма ручного входа.
 *
 * @param props - origin карты, пользователи dev-входа, обновление списка, отмена
 */
export function ManualLoginForm(props: ManualLoginFormProps) {
  const [method, setMethod] = useState<SessionMethod>('korbor-dogfood');
  const [origin, setOrigin] = useState('');
  const [actor, setActor] = useState('');
  const [state, submit, pending] = useActionState((_prev: FormState, form: FormData) => {
    form.set('origin', origin);
    form.set('actor', actor);
    return submitSession(method, form, props.refresh);
  }, EMPTY);
  return (
    <form action={submit} className="flex flex-col gap-4 rounded-lg border p-4" aria-label="Ручной вход">
      <FieldGroup>
        <Field data-invalid={state.field === 'id' || undefined}>
          <FieldLabel htmlFor="sess-id">Профиль (id)</FieldLabel>
          <Input id="sess-id" name="id" list="sess-id-list" />
          <datalist id="sess-id-list">
            <option value="recruiter" />
            <option value="employer" />
            <option value="admin" />
          </datalist>
          <FieldDescription>recruiter, employer, admin — совпадает со стейтом экрана</FieldDescription>
          <ErrorOf state={state} field="id" />
        </Field>
        <Field data-invalid={state.field === 'label' || undefined}>
          <FieldLabel htmlFor="sess-label">Подпись</FieldLabel>
          <Input id="sess-label" name="label" />
          <ErrorOf state={state} field="label" />
        </Field>
        <Field>
          <FieldLabel htmlFor="sess-role">Роль (необязательно)</FieldLabel>
          <Input id="sess-role" name="role" />
        </Field>
        <Field data-invalid={state.field === 'origin' || undefined}>
          <FieldLabel htmlFor="sess-origin">Приложение</FieldLabel>
          <OptionSelect id="sess-origin" aria-label="Приложение" value={origin} onValueChange={setOrigin} placeholder="Выберите" items={props.origins.map((o) => ({ value: o, label: o }))} />
          <ErrorOf state={state} field="origin" />
        </Field>
        <Field>
          <FieldLabel htmlFor="sess-method">Как войти</FieldLabel>
          <OptionSelect id="sess-method" aria-label="Как войти" value={method} onValueChange={(v) => setMethod(v === 'paste' ? 'paste' : 'korbor-dogfood')} items={METHODS} />
        </Field>
        {method === 'korbor-dogfood' ? (
          <DogfoodFields state={state} actors={props.actors} actorsError={props.actorsError} apiBase={props.apiBase} actor={actor} onActor={setActor} />
        ) : (
          <PasteFields state={state} />
        )}
      </FieldGroup>
      {state.error !== null && state.field === null ? <FieldError>{state.error}</FieldError> : null}
      {state.done !== null ? (
        <p className="text-sm text-muted-foreground" role="status">
          {state.done}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Spinner /> : null}
          {pending ? 'Вход…' : 'Войти'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={props.onCancel}>
          Отмена
        </Button>
      </div>
    </form>
  );
}
