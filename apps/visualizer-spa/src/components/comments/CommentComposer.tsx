/**
 * Поле нового замечания рядом с выбранным компонентом: текст или голос
 * («держи и говори» — кнопка или ⌥), Enter — сохранить, Esc — закрыть.
 */
import { X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { composerPosition, quoteText, sourceRef } from '../../lib/comments/format';
import { appendSpoken } from '../../lib/voice/models';
import { useVoiceCapture, type VoiceCapture } from '../../lib/voice/use-voice-capture';
import { useAppStore } from '../../store/app-store';
import { useCommentsStore, type CommentDraft } from '../../store/comments-store';
import { VoiceButton } from './VoiceButton';
import { Button } from '@/components/ui/button';

const SIZE = { width: 380, height: 300 };
/** Сколько держать ⌥, чтобы это считалось «говорю», а не началом сочетания. */
const ALT_HOLD_MS = 150;

type DraftElement = NonNullable<CommentDraft['anchor']['element']>;

/** Выбранный элемент: компонент (или тег), текст, исходник. */
function ElementTarget(props: { readonly el: DraftElement }) {
  const { el } = props;
  const src = el.component?.source ?? null;
  return (
    <div className="comment-composer__what" title={el.domPath}>
      <strong>{el.component?.name ?? el.tag}</strong>
      <span>
        {el.component !== null ? el.tag : ''}
        {el.text !== '' ? ` «${quoteText(el.text, 48)}»` : ''}
      </span>
      {src !== null ? <span className="comment-composer__src">{sourceRef(src)}</span> : null}
    </div>
  );
}

function Target(props: { readonly draft: CommentDraft }) {
  const el = props.draft.anchor.element;
  if (el === null) {
    return (
      <div className="comment-composer__what">
        <strong>Экран целиком</strong>
        <span>{props.draft.anchor.pageTitle}</span>
      </div>
    );
  }
  return <ElementTarget el={el} />;
}

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

/** Отменить ожидание удержания ⌥. */
function clearAlt(alt: AltHold): void {
  if (alt.timer !== null) {
    window.clearTimeout(alt.timer);
    alt.timer = null;
  }
}

/** ⌥ отпущена: запись от ⌥ — остановить и распознать. */
function altUp(alt: AltHold, voice: VoiceCapture): void {
  clearAlt(alt);
  if (alt.held) {
    alt.held = false;
    voice.stop();
  }
}

/** Клавиши поля: ⌥ — голос, ⌥ + клавиша — сочетание, Enter — сохранить (Shift+Enter и набор IME — нет). */
function fieldKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>, alt: AltHold, voice: VoiceCapture, submit: () => void): void {
  if (e.key === 'Alt') {
    altDown(alt, e, voice);
    return;
  }
  // ⌥ + клавиша — это сочетание, а не «говорю»
  clearAlt(alt);
  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
    e.preventDefault();
    submit();
  }
}

/** Esc из любого места поля (текст, кнопки): запись — отменить, иначе закрыть. */
function rootKeyDown(e: ReactKeyboardEvent<HTMLDivElement>, voice: VoiceCapture, close: () => void): void {
  if (e.key !== 'Escape') {
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  if (voice.recording) {
    voice.cancel();
  } else {
    close();
  }
}

/** Живой черновик речи и громкость. */
function VoiceDraft(props: { readonly voice: VoiceCapture }) {
  const { voice } = props;
  if (!voice.recording && !voice.finishing) {
    return null;
  }
  return (
    <p className="comment-composer__draft" aria-live="polite" data-testid="voice-draft">
      <span className="voice-level" style={{ transform: `scale(${1 + voice.level})` }} aria-hidden={true} />
      {voice.finishing ? 'Распознаю…' : voice.draft !== '' ? voice.draft : 'Слушаю…'}
    </p>
  );
}

/** Сохранить замечание; пока голос пишется или распознаётся, текст ещё не весь. */
async function submitComment(text: string, voice: VoiceCapture, save: (text: string) => Promise<boolean>, setToast: (t: string) => void): Promise<void> {
  if (!voice.recording && !voice.finishing && (await save(text))) {
    setToast('Замечание сохранено');
  }
}

/** Ошибка строкой с ролью alert. */
function ComposerError(props: { readonly text: string | null }) {
  return props.text === null ? null : (
    <p className="comment-composer__error" role="alert">
      {props.text}
    </p>
  );
}

function ComposerCard(props: { readonly draft: CommentDraft }) {
  const { draft } = props;
  const [text, setText] = useState('');
  const saving = useCommentsStore((s) => s.saving);
  const saveError = useCommentsStore((s) => s.saveError);
  const save = useCommentsStore((s) => s.save);
  const close = useCommentsStore((s) => s.closeDraft);
  const setToast = useAppStore((s) => s.setToast);
  const area = useRef<HTMLTextAreaElement | null>(null);
  const alt = useRef<AltHold>({ timer: null, held: false });
  const voice = useVoiceCapture((spoken) => {
    setText((t) => appendSpoken(t, spoken));
    area.current?.focus();
  });
  const pos = composerPosition(draft.viewRect, { width: window.innerWidth, height: window.innerHeight }, SIZE);

  useEffect(() => {
    area.current?.focus();
  }, []);

  const submit = (): Promise<void> => submitComment(text, voice, save, setToast);

  return (
    <div className="comment-composer ui-panel" role="dialog" aria-label="Новое замечание" data-testid="comment-composer" style={{ left: pos.left, top: pos.top, width: SIZE.width }} onKeyDown={(e) => rootKeyDown(e, voice, close)}>
      <div className="comment-composer__head">
        <Target draft={draft} />
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Закрыть" onClick={close}>
          <X size={16} strokeWidth={1.75} />
        </Button>
      </div>
      {draft.shot !== null && draft.shot !== 'pending' ? <img className="comment-composer__shot" src={draft.shot} alt="Снимок компонента" data-testid="comment-shot" /> : null}
      <textarea
        ref={area}
        className="ui-textarea comment-composer__text"
        aria-label="Что не так"
        placeholder="Что не так с этим компонентом?"
        value={text}
        rows={3}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => fieldKeyDown(e, alt.current, voice, () => void submit())}
        onKeyUp={(e) => {
          if (e.key === 'Alt') {
            altUp(alt.current, voice);
          }
        }}
      />
      <VoiceDraft voice={voice} />
      <ComposerError text={voice.error} />
      <ComposerError text={saveError} />
      <div className="comment-composer__bar">
        <VoiceButton capture={voice} />
        <span className="comment-composer__hint">Enter — сохранить, ⌥ — голос</span>
        <Button type="button" variant="default" size="sm" disabled={saving || voice.finishing} onClick={() => void submit()}>
          Сохранить
        </Button>
      </div>
    </div>
  );
}

/**
 * Поле замечания; появляется, когда снимок компонента готов.
 */
export function CommentComposer() {
  const draft = useCommentsStore((s) => s.draft);
  if (draft === null || draft.shot === 'pending') {
    return null;
  }
  return <ComposerCard key={`${draft.anchor.pageId}:${draft.anchor.element?.selector ?? ''}:${draft.viewRect.x}:${draft.viewRect.y}`} draft={draft} />;
}
