/**
 * Feedback: описание проблемы по выбранному экрану → copy prompt / export JSON для CLI.
 */
import { Camera, ClipboardCopy, Download, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  buildFeedbackArtifact,
  type FeedbackSeverity,
} from '../lib/build-feedback-prompt';
import { Button, Field, PanelBody, PanelHeader, Select, Textarea } from '../ui';
import { useAppStore } from '../store/app-store';
import { useSnapshotStore } from '../store/snapshot-store';

/**
 * Панель feedback / prompt builder.
 */
export function FeedbackPanel() {
  const selectedPageId = useAppStore((s) => s.selectedPageId);
  const index = useAppStore((s) => s.index);
  const document = useAppStore((s) => s.document);
  const globalRole = useAppStore((s) => s.globalRole);
  const activeStates = useAppStore((s) => s.activeStates);
  const baseUrlOverride = useAppStore((s) => s.baseUrlOverride);
  const liveUrl = useAppStore((s) =>
    s.selectedPageId ? s.resolveLiveUrl(s.selectedPageId) : null,
  );
  const setToast = useAppStore((s) => s.setToast);

  const [note, setNote] = useState('');
  const [severity, setSeverity] = useState<FeedbackSeverity>('medium');
  const feedbackShot = useSnapshotStore((s) => s.feedbackShot);
  const setFeedbackShot = useSnapshotStore((s) => s.setFeedbackShot);
  const requestSnapshot = useSnapshotStore((s) => s.request);
  // Снимок относится к экрану, для которого его сняли
  const screenshotDataUrl =
    feedbackShot !== null && feedbackShot.pageId === selectedPageId
      ? feedbackShot.dataUrl
      : null;

  const node = selectedPageId ? index?.nodesById.get(selectedPageId) : undefined;
  const stateName = selectedPageId
    ? activeStates.get(selectedPageId)
    : undefined;

  const artifact = useMemo(() => {
    if (!node || !selectedPageId) {
      return null;
    }
    return buildFeedbackArtifact({
      pageId: selectedPageId,
      title: node.title,
      path: node.pathExample ?? node.pathPattern,
      url: liveUrl,
      role: globalRole || undefined,
      stateName,
      mapName: document?.project.name,
      baseUrl: baseUrlOverride || document?.baseUrl || undefined,
      note,
      severity,
      screenshotDataUrl,
    });
  }, [
    node,
    selectedPageId,
    liveUrl,
    globalRole,
    stateName,
    document?.project.name,
    document?.baseUrl,
    baseUrlOverride,
    note,
    severity,
    screenshotDataUrl,
  ]);

  /** Снимок области экрана (Screen Capture API, с iframe) — ведёт LamGrabHost. */
  const captureSnapshot = (): void => {
    if (!requestSnapshot({ kind: 'feedback', pageId: selectedPageId })) {
      setToast('Снимок уже идёт');
    }
  };

  const copyPrompt = async () => {
    if (!artifact) {
      setToast('Выберите экран и опишите проблему');
      return;
    }
    if (!note.trim()) {
      setToast('Напишите, что не так с экраном');
      return;
    }
    try {
      await navigator.clipboard.writeText(artifact.promptMarkdown);
      setToast('Промпт скопирован — вставьте в CLI / агента');
    } catch {
      setToast('Не удалось скопировать в буфер');
    }
  };

  const downloadJson = () => {
    if (!artifact) {
      return;
    }
    if (!note.trim()) {
      setToast('Напишите, что не так с экраном');
      return;
    }
    const blob = new Blob([`${JSON.stringify(artifact, null, 2)}\n`], {
      type: 'application/json',
    });
    const href = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = href;
    a.download = `lam-feedback-${artifact.page.id.replace(/[^a-zA-Z0-9_-]+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(href);
    setToast('JSON сохранён — bun run packages/cli/src/bin.ts feedback --file …');
  };

  if (!selectedPageId || !node) {
    // Без выбора экрана панель скрыта — холст чище.
    return null;
  }

  return (
    <aside className="drawer drawer--left ui-panel drawer--edge">
      <PanelHeader
        title="Замечание"
        description={`${node.title} · ${node.pathExample ?? node.pathPattern}`}
      />
      <PanelBody>
        <Field label="Важность" htmlFor="fb-severity">
          <Select
            id="fb-severity"
            value={severity}
            onChange={(e) => setSeverity(e.target.value as FeedbackSeverity)}
          >
            <option value="blocker">блокер</option>
            <option value="high">высокая</option>
            <option value="medium">средняя</option>
            <option value="low">низкая</option>
          </Select>
        </Field>

        <Field
          label="Что не так"
          htmlFor="fb-note"
          hint="UI, баг, iframe, роль, тексты — промпт уйдёт в агента или CLI."
        >
          <Textarea
            id="fb-note"
            value={note}
            placeholder="Например: кнопка «Откликнуться» обрезана на ширине 375px…"
            onChange={(e) => setNote(e.target.value)}
            rows={5}
          />
        </Field>

        {liveUrl ? (
          <p className="drawer__hint font-mono" style={{ wordBreak: 'break-all' }}>
            {liveUrl}
          </p>
        ) : null}

        {screenshotDataUrl ? (
          <div className="feedback-shot">
            <img
              src={screenshotDataUrl}
              alt="Снимок экрана к замечанию"
              data-testid="feedback-shot"
              style={{
                width: '100%',
                borderRadius: 8,
                border: '1px solid var(--border)',
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setFeedbackShot(null)}
            >
              <X size={16} strokeWidth={1.75} />
              Убрать снимок
            </Button>
          </div>
        ) : null}

        <div className="drawer__actions">
          <Button type="button" variant="outline" size="sm" onClick={captureSnapshot}>
            <Camera size={16} strokeWidth={1.75} />
            Снимок
          </Button>
          <Button type="button" variant="primary" size="sm" onClick={() => void copyPrompt()}>
            <ClipboardCopy size={16} strokeWidth={1.75} />
            Копировать промпт
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={downloadJson}>
            <Download size={16} strokeWidth={1.75} />
            Скачать JSON
          </Button>
        </div>
      </PanelBody>
    </aside>
  );
}
