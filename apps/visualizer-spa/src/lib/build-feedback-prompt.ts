/**
 * Сборка канонического промпта для CLI/агента по выбранному экрану.
 */

export type FeedbackSeverity = 'blocker' | 'high' | 'medium' | 'low';

export type FeedbackPromptInput = {
  readonly pageId: string;
  readonly title: string;
  readonly path?: string;
  readonly url?: string | null;
  readonly role?: string;
  readonly stateName?: string;
  readonly mapName?: string;
  readonly baseUrl?: string;
  readonly note: string;
  readonly severity?: FeedbackSeverity;
  readonly screenshotDataUrl?: string | null;
  readonly generatedAt?: string;
};

export type FeedbackArtifact = {
  readonly version: 1;
  readonly kind: 'live-app-map-feedback';
  readonly generatedAt: string;
  readonly page: {
    readonly id: string;
    readonly title: string;
    readonly path?: string;
    readonly url?: string;
  };
  readonly context: {
    readonly role?: string;
    readonly stateName?: string;
    readonly mapName?: string;
    readonly baseUrl?: string;
  };
  readonly severity: FeedbackSeverity;
  readonly note: string;
  readonly screenshotDataUrl?: string;
  readonly promptMarkdown: string;
};

/**
 * Собирает markdown-промпт для агента (Grok / CLI).
 */
export function buildFeedbackPromptMarkdown(input: FeedbackPromptInput): string {
  const severity = input.severity ?? 'medium';
  const lines = [
    '# Live App Map — feedback / fix request',
    '',
    `Сгенерировано: ${input.generatedAt ?? new Date().toISOString()}`,
    `Severity: **${severity}**`,
    '',
    '## Экран',
    `- **id:** \`${input.pageId}\``,
    `- **title:** ${input.title}`,
  ];
  if (input.path) {
    lines.push(`- **path:** \`${input.path}\``);
  }
  if (input.url) {
    lines.push(`- **live URL:** ${input.url}`);
  }
  if (input.role) {
    lines.push(`- **role inject:** \`${input.role}\``);
  }
  if (input.stateName) {
    lines.push(`- **page state:** \`${input.stateName}\``);
  }
  if (input.mapName) {
    lines.push(`- **map:** ${input.mapName}`);
  }
  if (input.baseUrl) {
    lines.push(`- **baseUrl:** ${input.baseUrl}`);
  }
  lines.push(
    '',
    '## Что не так',
    input.note.trim() || '(описание не указано)',
    '',
    '## Ожидаемое поведение',
    'Исправь root cause так, чтобы экран в Live App Map / target app вёл себя корректно при live-preview и user path. Сохрани monochrome UI kit, Manrope, без emoji — только иконки Lucide.',
    '',
    '## Acceptance',
    '- [ ] Проблема воспроизводится/закрыта на live URL',
    '- [ ] `bun run test` зелёный',
    '- [ ] `bun run smoke` / visualizer `:4310` ok',
    '',
  );
  if (input.screenshotDataUrl) {
    lines.push(
      '## Screenshot',
      'Data URL приложен в JSON-артефакте (`screenshotDataUrl`).',
      '',
    );
  }
  lines.push(
    '## Команда CLI',
    '```bash',
    'bun run packages/cli/src/bin.ts feedback --file feedback.json',
    '```',
    '',
  );
  return lines.join('\n');
}

/**
 * Полный JSON-артефакт feedback для CLI / MCP.
 */
export function buildFeedbackArtifact(input: FeedbackPromptInput): FeedbackArtifact {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const severity = input.severity ?? 'medium';
  const promptMarkdown = buildFeedbackPromptMarkdown({ ...input, generatedAt, severity });
  return {
    version: 1,
    kind: 'live-app-map-feedback',
    generatedAt,
    page: {
      id: input.pageId,
      title: input.title,
      path: input.path,
      url: input.url ?? undefined,
    },
    context: {
      role: input.role || undefined,
      stateName: input.stateName || undefined,
      mapName: input.mapName || undefined,
      baseUrl: input.baseUrl || undefined,
    },
    severity,
    note: input.note.trim(),
    screenshotDataUrl: input.screenshotDataUrl ?? undefined,
    promptMarkdown,
  };
}
