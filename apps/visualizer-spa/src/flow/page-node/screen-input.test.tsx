/**
 * Ввод в экран трансляции: нажатие, начатое до того, как экран стал
 * интерактивным (клик, который выбрал экран), в страницу не уходит —
 * иначе первый же клик по экрану выбирал бы компонент под курсором.
 */
import { useDom } from '../../test/dom';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act, fireEvent, render } from '@testing-library/react';
import { computeNodeLayout } from '../../lib/node-layout';
import { startFakeStream, type FakeStream } from '../../test/fake-stream';
import { SCREEN_ATTR, ScreenView } from './ScreenView';

useDom();

let stream: FakeStream;

beforeEach(() => {
  stream = startFakeStream();
});

afterEach(() => {
  stream.stop();
});

const viewport = { width: 390, height: 844 };

function screen() {
  const r = render(<ScreenView nodeId="s" title="Главная" url="http://x.localhost/" viewport={viewport} layout={computeNodeLayout(viewport, 0.5)} mounted={true} interactive={true} snapshot={null} onSnapshotError={() => undefined} />);
  const canvas = r.container.querySelector<HTMLCanvasElement>(`canvas[${SCREEN_ATTR}]`);
  if (canvas === null) {
    throw new Error('нет холста');
  }
  canvas.setPointerCapture = () => undefined;
  return canvas;
}

async function mouseSent(): Promise<string[]> {
  await stream.ready();
  await act(async () => {
    await new Promise((r) => setTimeout(r, 60));
  });
  return stream.received.flatMap((m) => (m.t === 'input' && m.input.kind === 'mouse' ? [m.input.type] : []));
}

describe('ввод в экран', () => {
  test('отпускание без нажатия на этом экране — не в страницу; нажатие и отпускание — в страницу', async () => {
    const canvas = screen();
    await stream.ready();
    // Контроль: ввод вообще доходит
    fireEvent.pointerMove(canvas, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 10, clientY: 10, pointerId: 1 });
    expect(await mouseSent()).toEqual(['move']);
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 10, clientY: 10, pointerId: 1 });
    expect(await mouseSent()).toEqual(['move', 'down', 'up']);
  });
});
