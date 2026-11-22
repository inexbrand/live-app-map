/**
 * Классы UI-kit: сборка className и обёртки тегов.
 */
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { cx } from './class-names';
import { Badge } from './badge';
import { Input, Select, Textarea } from './field';

describe('cx', () => {
  test('пустые и ложные части пропускаются', () => {
    expect(cx('a', undefined, false, '', null, 'b')).toBe('a b');
    expect(cx('a')).toBe('a');
  });
});

describe('обёртки тегов', () => {
  test('базовый класс плюс внешний, props и дети проходят, имя компонента сохранено', () => {
    expect(renderToStaticMarkup(createElement(Input, { className: 'x', placeholder: 'p' }))).toBe('<input class="ui-input x" placeholder="p"/>');
    expect(renderToStaticMarkup(createElement(Textarea, {}))).toBe('<textarea class="ui-textarea"></textarea>');
    expect(renderToStaticMarkup(createElement(Select, { 'aria-label': 'L' }, createElement('option', { value: '1' }, 'один')))).toBe(
      '<select class="ui-select" aria-label="L"><option value="1">один</option></select>',
    );
    expect(renderToStaticMarkup(createElement(Badge, { title: 't' }, 'метка'))).toBe('<span class="ui-badge" title="t">метка</span>');
    expect([Input.displayName, Select.displayName, Textarea.displayName, Badge.displayName]).toEqual(['Input', 'Select', 'Textarea', 'Badge']);
  });
});
