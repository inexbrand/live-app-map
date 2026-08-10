import { describe, expect, test } from 'bun:test';
import { buildFeedbackArtifact, buildFeedbackPromptMarkdown } from './build-feedback-prompt';

describe('buildFeedbackPrompt', () => {
  test('markdown содержит экран, роль и note', () => {
    const md = buildFeedbackPromptMarkdown({
      pageId: 'route:/feed',
      title: 'Feed',
      path: '/feed',
      url: 'https://vite.localhost:5175/feed?lam_role=recruiter',
      role: 'recruiter',
      note: 'Кнопка отклика обрезана',
      severity: 'high',
    });
    expect(md).toContain('route:/feed');
    expect(md).toContain('recruiter');
    expect(md).toContain('Кнопка отклика обрезана');
    expect(md).toContain('Severity: **high**');
  });

  test('artifact version 1 + promptMarkdown', () => {
    const a = buildFeedbackArtifact({
      pageId: 'route:/employer/create',
      title: 'Create',
      note: 'Форма не сабмитится',
    });
    expect(a.version).toBe(1);
    expect(a.kind).toBe('live-app-map-feedback');
    expect(a.promptMarkdown).toContain('Форма не сабмитится');
    expect(a.page.id).toBe('route:/employer/create');
  });
});
