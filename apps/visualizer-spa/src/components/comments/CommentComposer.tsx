/**
 * Поле нового замечания рядом с выбранным компонентом: текст или голос
 * («держи и говори» — кнопка или ⌥), Enter — сохранить, Esc — закрыть.
 */
import { X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { composerPosition, quoteText } from '../../lib/comments/format';
import { appendSpoken } from '../../lib/voice/models';
import { useVoiceCapture } from '../../lib/voice/use-voice-capture';
import { useAppStore } from '../../store/app-store';
import { useCommentsStore, type CommentDraft } from '../../store/comments-store';
import { Button } from '../../ui';
import { VoiceButton } from './VoiceButton';

const SIZE = { width: 380, height: 300 };
/** Сколько держать ⌥, чтобы это считалось «говорю», а не началом сочетания. */
const ALT_HOLD_MS = 150;

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
  const src = el.component?.source ?? null;
  return (
    <div className="comment-composer__what" title={el.domPath}>
      <strong>{el.component?.name ?? el.tag}</strong>
      <span>
        {el.component !== null ? el.tag : ''}
        {el.text !== '' ? ` «${quoteText(el.text, 48)}»` : ''}
      </span>
      {src !== null ? <span className="comment-composer__src">{src.file}{src.line === null ? '' : `:${src.line}`}</span> : null}
    </div>
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
  const altTimer = useRef<number | null>(null);
  const altHeld = useRef(false);
  const voice = useVoiceCapture((spoken) => {
    setText((t) => appendSpoken(t, spoken));
    area.current?.focus();
  });
  const pos = composerPosition(draft.viewRect, { width: window.innerWidth, height: window.innerHeight }, SIZE);

  useEffect(() => {
    area.current?.focus();
  }, []);

  const submit = async (): Promise<void> => {
    if (voice.recording || voice.finishing) {
      return;
    }
    if (await save(text)) {
      setToast('Замечание сохранено');
    }
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Alt') {
      if (!e.repeat && altTimer.current === null && !voice.recording) {
        altTimer.current = window.setTimeout(() => {
          altTimer.current = null;
          altHeld.current = true;
          voice.start();
        }, ALT_HOLD_MS);
      }
      e.preventDefault();
      return;
    }
    if (altTimer.current !== null) {
      // ⌥ + клавиша — это сочетание, а не «говорю»
      window.clearTimeout(altTimer.current);
      altTimer.current = null;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
      return;
    }
  };

  // Esc из любого места поля (текст, кнопки): запись — отменить, иначе закрыть
  const onRootKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
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
  };

  const onKeyUp = (e: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key !== 'Alt') {
      return;
    }
    if (altTimer.current !== null) {
      window.clearTimeout(altTimer.current);
      altTimer.current = null;
    }
    if (altHeld.current) {
      altHeld.current = false;
      voice.stop();
    }
  };

  return (
    <div className="comment-composer ui-panel" role="dialog" aria-label="Новое замечание" data-testid="comment-composer" style={{ left: pos.left, top: pos.top, width: SIZE.width }} onKeyDown={onRootKeyDown}>
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
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
      />
      {voice.recording || voice.finishing ? (
        <p className="comment-composer__draft" aria-live="polite" data-testid="voice-draft">
          <span className="voice-level" style={{ transform: `scale(${1 + voice.level})` }} aria-hidden={true} />
          {voice.finishing ? 'Распознаю…' : voice.draft === '' ? 'Слушаю…' : voice.draft}
        </p>
      ) : null}
      {voice.error !== null ? <p className="comment-composer__error" role="alert">{voice.error}</p> : null}
      {saveError !== null ? <p className="comment-composer__error" role="alert">{saveError}</p> : null}
      <div className="comment-composer__bar">
        <VoiceButton capture={voice} />
        <span className="comment-composer__hint">Enter — сохранить, ⌥ — голос</span>
        <Button type="button" variant="primary" size="sm" disabled={saving || voice.finishing} onClick={() => void submit()}>
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
