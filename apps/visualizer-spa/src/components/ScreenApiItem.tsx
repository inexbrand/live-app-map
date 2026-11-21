/**
 * Вызов API экрана: метод и путь, роут бэкенда с сервисом и таблицами, переход к роуту.
 */
import { ArrowRight } from 'lucide-react';
import type { ScreenApiItem as Item } from '../lib/node-code';
import { useAppStore } from '../store/app-store';
import { Badge, Button } from '../ui';
import { DbLine, where } from './code-parts';

/** Пункт списка вызовов экрана. */
export function ScreenApiItem(props: { readonly item: Item }) {
  const focusRoute = useAppStore((s) => s.focusRoute);
  const { call, route, service, via } = props.item;
  return (
    <li className="code-item" data-testid={route === undefined ? 'screen-api-unmatched' : 'screen-api-call'}>
      <div className="code-item__head">
        <Badge className="code-item__method">{call.method}</Badge>
        <span className="code-item__name font-mono">{call.path}</span>
      </div>
      {route === undefined ? (
        <p className="code-item__empty">Роут не найден в исходниках</p>
      ) : (
        <>
          <p className="code-item__doc">
            {service?.name ?? route.serviceId} · <span className="font-mono">{route.path}</span>
          </p>
          {route.doc === undefined ? null : <p className="code-item__doc">{route.doc.split('\n')[0]}</p>}
          <DbLine groups={props.item.db} />
        </>
      )}
      <p className="code-item__where font-mono">
        {call.client}
        {via === undefined ? '' : ` · через ${via}`}
        {call.via === undefined ? '' : ` · ${call.via}`} · {where(call.location)}
      </p>
      {route === undefined ? null : (
        <Button
          size="sm"
          variant="ghost"
          data-testid="go-to-route"
          onClick={() => focusRoute(route.serviceId, route.id)}
        >
          <ArrowRight size={14} aria-hidden="true" /> К роуту
        </Button>
      )}
    </li>
  );
}
