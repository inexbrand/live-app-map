/**
 * Feedback: описание проблемы по выбранному экрану → copy prompt / export JSON для CLI.
 */
import { Camera, ClipboardCopy, Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  buildFeedbackArtifact,
  type FeedbackSeverity,
} from '../lib/build-feedback-prompt';
import { Button, Field, PanelBody, PanelHeader, Select, Textarea } from '../ui';
import { useAppStore } from '../store/app-store';

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
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(
    null,
  );

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

  const captureNodeChrome = async () => {
    if (!selectedPageId) {
      setToast('Сначала выберите экран на карте');
      return;
    }
    const el = window.document.querySelector(
      `[data-lam-node="${CSS.escape(selectedPageId)}"]`,
    );
    if (!(el instanceof HTMLElement)) {
      setToast('Нода не найдена в DOM');
      return;
    }
    try {
      // html2canvas optional — fallback to SVG foreignObject-free snapshot via draw
      const rect = el.getBoundingClientRect();
      const canvas = window.document.createElement('canvas');
      const scale = 1;
      canvas.width = Math.max(1, Math.floor(rect.width * scale));
      canvas.height = Math.max(1, Math.floor(rect.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setToast('Canvas недоступен');
        return;
      }
      ctx.fillStyle = '#111111';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#f5f5f5';
      ctx.font = '600 14px Manrope, sans-serif';
      ctx.fillText(node?.title ?? selectedPageId, 12, 28);
      ctx.fillStyle = '#a3a3a3';
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillText(node?.pathPattern ?? '', 12, 48);
      if (liveUrl) {
        ctx.fillText(liveUrl.slice(0, 64), 12, 68);
      }
      ctx.strokeStyle = '#404040';
      ctx.strokeRect(8, 80, canvas.width - 16, canvas.height - 96);
      ctx.fillStyle = '#737373';
      ctx.font = '11px Manrope, sans-serif';
      ctx.fillText(
        'Chrome snapshot (iframe cross-origin не захватывается)',
        16,
        100,
      );
      const dataUrl = canvas.toDataURL('image/png');
      setScreenshotDataUrl(dataUrl);
      setToast('Снимок chrome ноды добавлен к feedback');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setToast(`Снимок не удался: ${message}`);
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
          <img
            src={screenshotDataUrl}
            alt="Снимок chrome ноды"
            style={{
              width: '100%',
              borderRadius: 8,
              border: '1px solid var(--border)',
            }}
          />
        ) : null}

        <div className="drawer__actions">
          <Button type="button" variant="outline" size="sm" onClick={() => void captureNodeChrome()}>
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
