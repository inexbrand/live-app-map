/**
 * Кнопка голоса: удержание — говорить, пока держите; короткий клик —
 * запись до второго клика. Рядом — настройки модели.
 */
import { Mic, Settings2, Square } from 'lucide-react';
import { useRef } from 'react';
import type { VoiceCapture } from '../../lib/voice/use-voice-capture';
import { useVoiceStore } from '../../store/voice-store';
import { Button } from '@/components/ui/button';

/** Дольше — это удержание. */
const HOLD_MS = 300;

/**
 * Голосовой ввод в поле замечания.
 */
export function VoiceButton(props: { readonly capture: VoiceCapture }) {
  const { capture } = props;
  const pressedAt = useRef(0);
  const toggled = useRef(false);
  const setDialog = useVoiceStore((s) => s.setDialog);
  const phase = useVoiceStore((s) => s.phase);

  return (
    <div className="voice-button">
      <Button
        type="button"
        size="icon-sm"
        variant={capture.recording ? 'default' : 'outline'}
        aria-pressed={capture.recording}
        aria-label={capture.recording ? 'Остановить запись' : 'Говорить (удерживайте)'}
        title="Удерживайте и говорите; короткий клик — запись до второго клика. ⌥ — то же с клавиатуры"
        data-testid="voice-button"
        disabled={capture.finishing}
        onPointerDown={(e) => {
          e.preventDefault();
          // Отпускание засчитывается кнопке, даже если строка черновика её сдвинула
          e.currentTarget.setPointerCapture(e.pointerId);
          if (capture.recording && toggled.current) {
            toggled.current = false;
            capture.stop();
            return;
          }
          pressedAt.current = Date.now();
          capture.start();
        }}
        onPointerUp={() => {
          if (pressedAt.current === 0) {
            return;
          }
          const held = Date.now() - pressedAt.current;
          pressedAt.current = 0;
          if (held >= HOLD_MS) {
            capture.stop();
          } else {
            toggled.current = true;
          }
        }}
      >
        {capture.recording ? <Square size={14} strokeWidth={2} /> : <Mic size={16} strokeWidth={1.75} />}
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Модель распознавания"
        title={phase === 'downloading' ? 'Модель загружается…' : 'Модель распознавания: язык, размер, удалить'}
        onClick={() => setDialog(true)}
      >
        <Settings2 size={14} strokeWidth={1.75} />
      </Button>
    </div>
  );
}