/**
 * Доска роута в виде «API»: всё о роуте на одном экране — описание, что принимает
 * (путь, query, тело), что отдаёт, доступ, таблицы БД с колонками, что меняет,
 * какие экраны вызывают, где код.
 */
import { Fragment, useState, type ReactNode } from 'react';
import { ChevronRight, KeyRound, Lock, LockOpen } from 'lucide-react';
import { AUTO_DOC_NOTE } from '@live-app-map/graph';
import type { ApiRoute, DbColumn, HttpMethod, RouteSchemaField } from '@live-app-map/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { BoardTable, RouteCard } from '../lib/api-view-model';
import { useMapNav } from '../lib/use-map-nav';

/** Вид метода для цвета: читает, удаляет или меняет. */
function methodKind(m: HttpMethod): 'read' | 'delete' | 'write' {
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') {
    return 'read';
  }
  return m === 'DELETE' ? 'delete' : 'write';
}

const METHOD_CLASS: Readonly<Record<'read' | 'delete' | 'write', string>> = {
  read: 'text-muted-foreground',
  write: 'text-foreground',
  delete: 'text-destructive',
};

/** Метод в слоте фиксированной ширины: читающие приглушены, меняющие — ярче, удаление — красным. */
export function Method(props: { readonly method: HttpMethod }) {
  const kind = methodKind(props.method);
  return (
    <span className={cn('w-12 shrink-0 font-mono text-xs font-semibold', METHOD_CLASS[kind])} data-kind={kind}>
      {props.method}
    </span>
  );
}

/** Что у большинства роутов карты: есть ли проверка входа и доступа. */
export type UsualChecks = { readonly input: boolean; readonly access: boolean };

/**
 * Обычное для карты: признак есть хотя бы у половины роутов.
 *
 * @param routes - роуты карты
 */
export function usualChecks(routes: readonly ApiRoute[]): UsualChecks {
  const half = (n: number): boolean => n * 2 >= routes.length;
  return { input: half(routes.filter((r) => r.input !== undefined).length), access: half(routes.filter((r) => r.access !== undefined).length) };
}

/** Признаки строки роута — только отличия от большинства (пустой слот держит колонку). */
export function Marks(props: { readonly route: ApiRoute; readonly usual: UsualChecks }) {
  const { route: r, usual } = props;
  const hasInput = r.input !== undefined;
  const hasAccess = r.access !== undefined;
  return (
    <span className="flex shrink-0 gap-1 text-muted-foreground">
      <span className="size-3.5" data-testid="api-mark" title={hasInput ? 'Есть проверка входа (схема)' : 'Схемы входа нет'}>
        {hasInput === usual.input ? null : <KeyRound className={cn('size-3.5', !hasInput && 'opacity-40')} aria-label={hasInput ? 'вход проверяется' : 'вход не проверяется'} />}
      </span>
      <span className="size-3.5" data-testid="api-mark" title={hasAccess ? 'Есть проверка доступа' : 'Проверок доступа в коде нет'}>
        {hasAccess === usual.access ? null : hasAccess ? <Lock className="size-3.5" aria-label="доступ проверяется" /> : <LockOpen className="size-3.5 opacity-40" aria-label="доступ не проверяется" />}
      </span>
    </span>
  );
}

/** Блок доски: заголовок и содержимое. */
function Block(props: { readonly title: string; readonly description?: string; readonly testId?: string; readonly className?: string; readonly children: ReactNode }) {
  return (
    <Card size="sm" className={props.className} data-testid={props.testId}>
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
        {props.description === undefined ? null : <CardDescription>{props.description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">{props.children}</CardContent>
    </Card>
  );
}

/** Приглушённая строка «ничего не найдено». */
function Muted(props: { readonly children: ReactNode; readonly testId?: string }) {
  return (
    <p className="text-sm text-muted-foreground" data-testid={props.testId}>
      {props.children}
    </p>
  );
}

/** Описание роута: первый абзац, остальное по кнопке. */
function Summary(props: { readonly text: string }) {
  const [full, setFull] = useState(false);
  const head = props.text.split(/\n\s*\n/)[0] ?? props.text;
  const more = head.length < props.text.length;
  return (
    <div className="flex flex-col items-start gap-1">
      <p className="whitespace-pre-line" data-testid="api-summary">{full ? props.text : head}</p>
      {more && !full ? (
        <Button size="sm" variant="link" className="h-auto p-0" onClick={() => setFull(true)}>
          Полностью
        </Button>
      ) : null}
    </div>
  );
}

/** Шапка доски: метод, путь, домен, сервис, фреймворк, файл:строка. */
function BoardHead(props: { readonly card: RouteCard }) {
  const { card } = props;
  const r = card.route;
  return (
    <header className="flex flex-col gap-1">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Method method={r.method} />
        <span className="font-mono break-all">{r.path}</span>
      </h2>
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary">{card.domain}</Badge>
        <span>
          {card.service?.name ?? r.serviceId} · {r.framework}
        </span>
        <span className="font-mono">
          {r.location.file}:{r.location.line}
        </span>
      </p>
    </header>
  );
}

/** Описание: авторское и собранное из кода. */
function DescriptionBlock(props: { readonly card: RouteCard }) {
  const { card } = props;
  const r = card.route;
  return (
    <Block title="Описание" className="xl:col-span-2">
      {card.summary === undefined ? (
        <Muted>Авторского описания нет — добавьте комментарий над обработчиком ({r.location.file}:{r.location.line}).</Muted>
      ) : (
        <Summary key={r.id} text={card.summary} />
      )}
      <div className="flex flex-col gap-1 rounded-md bg-muted/50 p-2" data-testid="api-auto-doc">
        <p className="text-xs text-muted-foreground">{AUTO_DOC_NOTE}</p>
        <p>{card.auto.summary}</p>
      </div>
    </Block>
  );
}

/** Строки полей схемы: вложенные объекты — с отступом под родителем. */
function SchemaRows({ fields, depth }: { readonly fields: readonly RouteSchemaField[]; readonly depth: number }) {
  return (
    <>
      {fields.map((f) => (
        <Fragment key={f.name}>
          <TableRow data-testid="api-input-field" data-depth={depth}>
            <TableCell className="font-mono text-xs" style={{ paddingLeft: `${8 + depth * 14}px` }}>
              {f.name}
            </TableCell>
            <TableCell className="font-mono text-xs">{f.type}</TableCell>
            <TableCell className="text-xs">{f.optional === true ? 'нет' : 'да'}</TableCell>
            <TableCell className="text-xs text-muted-foreground whitespace-normal">{f.rules?.join(', ')}</TableCell>
          </TableRow>
          {f.fields === undefined ? null : <SchemaRows fields={f.fields} depth={depth + 1} />}
        </Fragment>
      ))}
    </>
  );
}

/** Таблица полей схемы. */
function FieldsTable(props: { readonly children: ReactNode }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Поле</TableHead>
          <TableHead>Тип</TableHead>
          <TableHead>Обязательно</TableHead>
          <TableHead>Правила</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>{props.children}</TableBody>
    </Table>
  );
}

/** Часть входа: заголовок со схемой и поля (или тип одной строкой). */
function InputPartView(props: { readonly input: RouteCard['inputs'][number] }) {
  const i = props.input;
  return (
    <div className="flex flex-col gap-1" data-testid="api-input">
      <p className="text-xs font-medium">
        {i.label}
        {i.schema.name === undefined ? '' : ` · ${i.schema.name}`}
        <span className="font-normal text-muted-foreground">
          {' · '}
          {i.schema.kind === 'zod' ? 'zod' : 'TypeBox'}
          {i.schema.optional === true ? ' · необязательно' : ''}
        </span>
      </p>
      {i.schema.fields.length === 0 ? (
        <p className="font-mono text-xs" data-testid="api-input-type">
          {i.schema.type ?? i.schema.text ?? i.schema.name}
        </p>
      ) : (
        <FieldsTable>
          <SchemaRows fields={i.schema.fields} depth={0} />
        </FieldsTable>
      )}
    </div>
  );
}

/** «Принимает»: параметры пути, query, тело, заголовки. */
function InputBlock(props: { readonly card: RouteCard }) {
  const { inputs, pathParams } = props.card;
  return (
    <Block title="Принимает" description="Параметры пути, query и тело запроса">
      {pathParams.length === 0 ? null : (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="api-path-params">
          <span className="text-xs text-muted-foreground">Параметры пути без схемы:</span>
          {pathParams.map((p) => (
            <Badge key={p} variant="outline" className="font-mono">
              {p}
            </Badge>
          ))}
        </div>
      )}
      {inputs.length === 0 ? <Muted>Схемы входа в коде не найдено.</Muted> : null}
      {inputs.map((i) => (
        <InputPartView key={i.part} input={i} />
      ))}
    </Block>
  );
}

/** Строка ключ — метки. */
function TagRow(props: { readonly label: string; readonly tags: readonly (string | number)[] | undefined; readonly mono?: boolean }) {
  if (props.tags === undefined || props.tags.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-24 shrink-0 text-xs text-muted-foreground">{props.label}</span>
      {props.tags.map((x) => (
        <Badge key={x} variant="outline" className={props.mono === true ? 'font-mono' : undefined}>
          {x}
        </Badge>
      ))}
    </div>
  );
}

/** «Отдаёт»: поля ответа, значения, статусы. */
function ResponseBlock(props: { readonly route: ApiRoute }) {
  const res = props.route.response;
  return (
    <Block title="Отдаёт" testId="api-response">
      {res === undefined ? <Muted>Ответ в коде не найден.</Muted> : null}
      <TagRow label="Поля" tags={res?.fields} mono />
      <TagRow label="Возвращает" tags={res?.values} mono />
      <TagRow label="Статусы" tags={res?.statuses} mono />
    </Block>
  );
}

/** «Доступ»: вход, роли, права, проверки. */
function AccessBlock(props: { readonly access: ApiRoute['access'] }) {
  const a = props.access;
  return (
    <Block title="Доступ" testId="api-access">
      {a === undefined ? <Muted>Проверок доступа в коде не найдено — роут открыт.</Muted> : null}
      {a?.auth === true ? <p>Нужен вход</p> : null}
      <TagRow label="Роли" tags={a?.roles} />
      <TagRow label="Права" tags={a?.permissions} />
      <TagRow label="Проверки" tags={a?.checks} mono />
    </Block>
  );
}

/** Признаки колонки одной строкой. */
function columnFlags(c: DbColumn): string {
  return [
    c.primaryKey === true ? 'ключ' : '',
    c.notNull === true ? 'not null' : '',
    c.unique === true ? 'уникальная' : '',
    c.default === undefined ? '' : `по умолчанию ${c.default}`,
    c.references === undefined ? '' : `→ ${c.references.table}.${c.references.column}`,
  ]
    .filter((s) => s !== '')
    .join(', ');
}

/** Таблица БД: имя с переходом, операции, колонки по раскрытию. */
function DbTableItem(props: { readonly table: BoardTable }) {
  const nav = useMapNav();
  const { touch, mode, columns } = props.table;
  return (
    <Collapsible className="rounded-md border border-border" data-testid="api-db-table" data-mode={mode}>
      <div className="flex flex-wrap items-center gap-2 p-2">
        <CollapsibleTrigger render={<Button variant="ghost" size="icon-xs" aria-label={`Колонки ${touch.dbName ?? touch.table}`} disabled={columns.length === 0} />}>
          <ChevronRight />
        </CollapsibleTrigger>
        <Button variant="link" size="sm" className="h-auto p-0 font-mono" onClick={() => nav({ kind: 'table', table: touch.table })} data-testid="api-table-link">
          {touch.dbName ?? touch.table}
        </Button>
        <Badge variant={mode === 'write' ? 'default' : 'secondary'}>{mode === 'write' ? 'пишет' : 'читает'}</Badge>
        {touch.operations.map((op) => (
          <Badge key={op} variant="outline" className="font-mono">
            {op}
          </Badge>
        ))}
        <span className="text-xs text-muted-foreground">×{touch.count}</span>
        {touch.inLoop ? <Badge variant="destructive">в цикле</Badge> : null}
        {touch.dbName === undefined ? <span className="text-xs text-muted-foreground">нет в схеме</span> : null}
      </div>
      <CollapsibleContent>
        <Table>
          <TableBody>
            {columns.map((c) => (
              <TableRow key={c.name} data-testid="api-db-column">
                <TableCell className="font-mono text-xs">{c.sqlName ?? c.name}</TableCell>
                <TableCell className="font-mono text-xs">{c.type}</TableCell>
                <TableCell className="text-xs whitespace-normal text-muted-foreground">{columnFlags(c)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** «База данных»: что меняет и какие таблицы читает и пишет. */
function DbBlock(props: { readonly card: RouteCard }) {
  const { effects, tables } = props.card;
  return (
    <Block title="База данных" description="Что роут меняет и какие таблицы трогает" testId="api-db" className="xl:col-span-2">
      {tables.length === 0 ? <Muted>Запросов в БД не найдено.</Muted> : null}
      {effects.length === 0 ? null : (
        <ul className="flex flex-col gap-1" data-testid="api-effects">
          {effects.map((e) => (
            <li key={e.label} className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium">{e.label}:</span>
              {e.tables.map((t) => (
                <Badge key={t} variant="outline" className="font-mono">
                  {t}
                </Badge>
              ))}
            </li>
          ))}
        </ul>
      )}
      {tables.length > 0 && effects.length === 0 ? <Muted>Только читает — данных не меняет.</Muted> : null}
      {tables.map((t) => (
        <DbTableItem key={`${t.mode}:${t.touch.table}`} table={t} />
      ))}
    </Block>
  );
}

/** Экран, который вызывает роут: кнопка перехода (без ноды на карте — неактивна). */
function CallerButton(props: { readonly caller: RouteCard['callers'][number] }) {
  const c = props.caller;
  const nav = useMapNav();
  const nodeId = c.nodeId;
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={nodeId === undefined}
      title={c.via === undefined ? c.file : `${c.file} · через ${c.via}`}
      onClick={() => (nodeId === undefined ? undefined : nav({ kind: 'screen', nodeId }))}
      data-testid="api-screen-link"
    >
      {c.title}
    </Button>
  );
}

/** «Экраны»: кто вызывает или почему никто. */
function ScreensBlock(props: { readonly card: RouteCard }) {
  const { card } = props;
  const gap = card.gap;
  return (
    <Block title="Экраны">
      {gap === undefined ? null : (
        <div className="flex flex-col gap-1 text-muted-foreground" data-testid="api-screen-gap">
          <p>Экраны карты не вызывают: {gap.text}.</p>
          {gap.files.length === 0 ? null : <p className="font-mono text-xs">{gap.files.join(', ')}</p>}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {card.callers.map((c) => (
          <CallerButton key={c.nodeId ?? c.file} caller={c} />
        ))}
      </div>
    </Block>
  );
}

/** «Код»: обработчик и место. */
function CodeBlock(props: { readonly route: ApiRoute }) {
  const r = props.route;
  return (
    <Block title="Код">
      <TagRow label="Обработчик" tags={[r.handler.name ?? 'встроенная функция']} mono />
      <p className="font-mono text-xs break-all text-muted-foreground">
        {r.handler.location.file}:{r.handler.location.line}
      </p>
    </Block>
  );
}

/** Доска выбранного роута. */
export function RouteBoard(props: { readonly card: RouteCard }) {
  const { card } = props;
  const r = card.route;
  return (
    <section className="flex min-h-0 flex-col gap-4 overflow-y-auto p-4" data-testid="api-route-card" aria-label={`${r.method} ${r.path}`}>
      <BoardHead card={card} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <DescriptionBlock card={card} />
        <InputBlock card={card} />
        <ResponseBlock route={r} />
        <DbBlock card={card} />
        <AccessBlock access={r.access} />
        <ScreensBlock card={card} />
        <CodeBlock route={r} />
      </div>
    </section>
  );
}
