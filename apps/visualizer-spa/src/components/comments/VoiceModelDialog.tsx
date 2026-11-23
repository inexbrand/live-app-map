/**
 * Окно модели распознавания: предложение скачать (размер, язык, где
 * хранится), прогресс загрузки, удаление. Звук не покидает компьютер.
 */
import { X } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { formatBytes, VOICE_LANGUAGES, VOICE_MODELS } from '../../lib/voice/models';
import { useVoiceStore } from '../../store/voice-store';
import { Button } from '@/components/ui/button';

function Progress() {
  const progress = useVoiceStore((s) => s.progress);
  const size = useVoiceStore((s) => s.sizeBytes);
  const total = progress !== null && progress.total > 0 ? progress.total : size ?? 0;
  const loaded = progress?.loaded ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
  return (
    <div className="voice-progress" data-testid="voice-progress">
      <div className="voice-progress__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div style={{ width: `${pct}%` }} />
      </div>
      <span>{total > 0 ? `${formatBytes(loaded)} из ${formatBytes(total)}` : 'Готовим модель…'}</span>
    </div>
  );
}

type Voice = ReturnType<typeof useVoiceStore.getState>;

/** Где считает модель — словами. */
function deviceText(device: Voice['device']): string {
  if (device === null) {
    return 'проверяем видеокарту…';
  }
  return device === 'webgpu' ? 'видеокарта (WebGPU)' : 'процессор (WASM) — WebGPU в этом браузере недоступен';
}

/** Подпись главной кнопки: загрузка, включить (модель есть) или скачать с размером. */
function downloadLabel(v: Voice): string {
  if (v.phase === 'downloading') {
    return 'Загрузка…';
  }
  return v.present === true ? 'Включить' : `Скачать ${v.sizeBytes === null ? '' : formatBytes(v.sizeBytes)}`.trim();
}

/** Esc закрывает открытое окно. */
function useEscapeCloses(open: boolean, close: () => void): void {
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);
}

/** Выбор модели; у выбранной — размер. */
function ModelChoice(props: { readonly v: Voice }) {
  const { v } = props;
  const size = v.sizeBytes === null ? 'размер уточняется' : formatBytes(v.sizeBytes);
  return (
    <fieldset className="voice-dialog__group" disabled={v.phase === 'downloading'}>
      <legend>Модель</legend>
      {VOICE_MODELS.map((m) => (
        <label key={m.id} className={`voice-option${v.model === m.id ? ' voice-option--on' : ''}`}>
          <input type="radio" name="voice-model" checked={v.model === m.id} onChange={() => v.setModel(m.id)} />
          <span className="voice-option__body">
            <strong>{m.title}</strong>
            <span>{m.note}</span>
          </span>
          {v.model === m.id ? <span className="voice-option__size" data-testid="voice-size">{size}</span> : null}
        </label>
      ))}
    </fieldset>
  );
}

/** Выбор языка речи. */
function LanguageChoice(props: { readonly v: Voice }) {
  const { v } = props;
  return (
    <fieldset className="voice-dialog__group">
      <legend>Язык речи</legend>
      <div className="mode-seg" role="radiogroup" aria-label="Язык речи">
        {VOICE_LANGUAGES.map((l) => (
          <button key={l.id} type="button" role="radio" aria-checked={v.language === l.id} className={`mode-seg__btn${v.language === l.id ? ' mode-seg__btn--on' : ''}`} onClick={() => v.setLanguage(l.id)}>
            {l.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** Кнопки окна: удалить модель, готово или скачать/включить. */
function DialogActions(props: { readonly v: Voice }) {
  const { v } = props;
  const busy = v.phase === 'downloading';
  return (
    <div className="voice-dialog__actions">
      {v.present === true && !busy ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => void v.remove()} data-testid="voice-remove">
          Удалить модель
        </Button>
      ) : null}
      <span className="toolbar__spacer" />
      {v.phase === 'ready' ? (
        <Button type="button" variant="default" size="sm" onClick={() => v.setDialog(false)}>
          Готово — держите ⌥ и говорите
        </Button>
      ) : (
        <Button type="button" variant="default" size="sm" disabled={busy} onClick={() => void v.load()} data-testid="voice-download">
          {downloadLabel(v)}
        </Button>
      )}
    </div>
  );
}

/**
 * Модальное окно модели.
 */
export function VoiceModelDialog() {
  const open = useVoiceStore((s) => s.dialog);
  const v = useVoiceStore();
  const close = useCallback(() => v.setDialog(false), [v]);
  useEscapeCloses(open, close);
  if (!open) {
    return null;
  }
  return (
    <div className="voice-dialog__backdrop" onClick={close}>
      <div className="voice-dialog ui-panel" role="dialog" aria-modal={true} aria-label="Голосовой ввод" data-testid="voice-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="voice-dialog__head">
          <h2>Голосовой ввод на этом компьютере</h2>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Закрыть" onClick={close}>
            <X size={16} strokeWidth={1.75} />
          </Button>
        </div>
        <p className="voice-dialog__lead">
          Речь распознаёт модель Whisper прямо в браузере. Звук не уходит ни на сервер, ни в интернет; модель скачивается один раз и дальше работает офлайн.
        </p>
        <ModelChoice v={v} />
        <LanguageChoice v={v} />
        <dl className="voice-dialog__facts">
          <dt>Считает</dt>
          <dd>{deviceText(v.device)}</dd>
          <dt>Хранится</dt>
          <dd>в кэше браузера и в папке .lam-models проекта</dd>
        </dl>
        {v.phase === 'downloading' ? <Progress /> : null}
        {v.error !== null && v.phase === 'error' ? <p className="comment-composer__error" role="alert">{v.error}</p> : null}
        <DialogActions v={v} />
      </div>
    </div>
  );
}
