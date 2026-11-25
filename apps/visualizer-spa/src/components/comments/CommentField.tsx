/**
 * Поле замечания: текст или голос («держи и говори» — кнопка или ⌥),
 * Enter — отправить, Shift+Enter — перенос, Esc — отменить запись или закрыть.
 */
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { appendSpoken } from '../../lib/voice/models';
import { useVoiceCapture, type VoiceCapture } from '../../lib/voice/use-voice-capture';
import { VoiceButton } from './VoiceButton';
import { Button } from '@/components/ui/button';

/** Сколько держать ⌥, чтобы это считалось «говорю», а не началом сочетания. */
const ALT_HOLD_MS = 150;

/** Удержание ⌥: таймер до «говорю» и признак, что запись идёт от ⌥. */
type AltHold = { timer: number | null; held: boolean };

/** ⌥ нажата: через ALT_HOLD_MS — запись (повтор клавиши и идущая запись — не в счёт). */
function altDown(alt: AltHold, e: ReactKeyboardEvent, voice: VoiceCapture): void {
  if (!e.repeat && alt.timer === null && !voice.recording) {
    alt.timer = window.setTimeout(() => {
      alt.timer = null;
      alt.held = true;
      voice.start();
    }, ALT_HOLD_MS);
  }
  e.preventDefault();
}

function clearAlt(alt: AltHold): void {
  if (alt.timer !== null) {
    window.clearTimeout(alt.timer);
    alt.timer = null;
  }
}

function altUp(alt: AltHold, voice: VoiceCapture): void {
  clearAlt(alt);
  if (alt.held) {
    alt.held = false;
    voice.stop();
  }
}

/** Клавиши поля: ⌥ — голос, ⌥ + клавиша — сочетание, Enter — отправить (Shift+Enter и набор IME — нет). */
function fieldKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>, alt: AltHold, voice: VoiceCapture, submit: () => void): void {
  if (e.key === 'Alt') {
    altDown(alt, e, voice);
    return;
  }
  clearAlt(alt);
  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
    e.preventDefault();
    submit();
  }
}

/** Живой черновик речи и громкость. */
function VoiceDraft(props: { readonly voice: VoiceCapture }) {
  const { voice } = props;
  if (!voice.recording && !voice.finishing) {
    return null;
  }
  return (
    <p className="comment-field__draft" aria-live="polite" data-testid="voice-draft">
      <span className="voice-level" style={{ transform: `scale(${1 + voice.level})` }} aria-hidden={true} />
      {voice.finishing ? 'Распознаю…' : voice.draft !== '' ? voice.draft : 'Слушаю…'}
    </p>
  );
}

function FieldError(props: { readonly text: string | null }) {
  return props.text === null ? null : (
    <p className="comment-field__error" role="alert">
      {props.text}
    </p>
  );
}

/** Props поля. */
export type CommentFieldProps = {
  readonly value: string;
  readonly onChange: (text: string) => void;
  /** Отправить текст (поле само ждёт конца распознавания). */
  readonly onSubmit: (text: string) => void;
  /** Esc вне записи. */
  readonly onEscape: () => void;
  readonly placeholder: string;
  readonly busy: boolean;
  readonly error: string | null;
  /** Ставить курсор в поле при появлении; false — поле внизу длинной панели, фокус прокрутил бы её. */
  readonly autoFocus?: boolean;
};

/**
 * Поле с голосом и кнопкой «Отправить».
 *
 * @param props - текст, обработчики, подсказка, занятость, ошибка
 */
export function CommentField(props: CommentFieldProps) {
  const { value, onChange, onSubmit, onEscape } = props;
  const area = useRef<HTMLTextAreaElement | null>(null);
  const alt = useRef<AltHold>({ timer: null, held: false });
  const latest = useRef(value);
  latest.current = value;
  const voice = useVoiceCapture((spoken) => {
    onChange(appendSpoken(latest.current, spoken));
    area.current?.focus();
  });
  const autoFocus = props.autoFocus !== false;
  useEffect(() => {
    if (autoFocus) {
      area.current?.focus();
    }
  }, [autoFocus]);
  const submit = (): void => {
    if (!voice.recording && !voice.finishing) {
      onSubmit(value);
    }
  };
  return (
    <div
      className="comment-field"
      onKeyDown={(e) => {
        if (e.key !== 'Escape') {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        if (voice.recording) {
          voice.cancel();
        } else {
          onEscape();
        }
      }}
    >
      <textarea
        ref={area}
        className="ui-textarea comment-field__text"
        aria-label="Что не так"
        placeholder={props.placeholder}
        value={value}
        rows={3}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => fieldKeyDown(e, alt.current, voice, submit)}
        onKeyUp={(e) => {
          if (e.key === 'Alt') {
            altUp(alt.current, voice);
          }
        }}
      />
      <VoiceDraft voice={voice} />
      <FieldError text={voice.error} />
      <FieldError text={props.error} />
      <div className="comment-field__bar">
        <VoiceButton capture={voice} />
        <span className="comment-field__hint">Enter — отправить, ⌥ — голос</span>
        <Button type="button" size="sm" disabled={props.busy || voice.finishing} onClick={submit}>
          Отправить
        </Button>
      </div>
    </div>
  );
}
