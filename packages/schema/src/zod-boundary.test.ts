/**
 * Граничные unit-тесты Zod-схем (stateInjectSpec и связанные).
 */
import { describe, expect, test } from 'bun:test';
import { stateInjectSpecSchema } from './zod';

describe('stateInjectSpecSchema boundary', () => {
  test('принимает валидный inject: query + hash + role + labels', () => {
    const input = {
      query: { lam_role: 'recruiter', tab: 'feed' },
      hash: '#section-roles',
      role: 'recruiter',
      labels: ['miniapp', 'auth'],
    };

    const result = stateInjectSpecSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data.query).toEqual({ lam_role: 'recruiter', tab: 'feed' });
    expect(result.data.hash).toBe('#section-roles');
    expect(result.data.role).toBe('recruiter');
    expect(result.data.labels).toEqual(['miniapp', 'auth']);
  });

  test('принимает пустой объект (все поля optional)', () => {
    const result = stateInjectSpecSchema.safeParse({});
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data).toEqual({});
  });

  test('принимает localStorage и sessionStorage как record string', () => {
    const result = stateInjectSpecSchema.safeParse({
      localStorage: { token: 'abc' },
      sessionStorage: { draft: '1' },
    });
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data.localStorage).toEqual({ token: 'abc' });
    expect(result.data.sessionStorage).toEqual({ draft: '1' });
  });

  test('отклоняет role числом (нужна string)', () => {
    const result = stateInjectSpecSchema.safeParse({ role: 42 });
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    const roleIssue = result.error.issues.find(
      (issue) => issue.path[0] === 'role',
    );
    expect(roleIssue).toBeDefined();
    expect(roleIssue?.code).toBe('invalid_type');
  });

  test('отклоняет query не-record (массив)', () => {
    const result = stateInjectSpecSchema.safeParse({
      query: ['lam_role=recruiter'],
    });
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    const queryIssue = result.error.issues.find(
      (issue) => issue.path[0] === 'query',
    );
    expect(queryIssue).toBeDefined();
  });

  test('отклоняет query строкой (не record)', () => {
    const result = stateInjectSpecSchema.safeParse({
      query: 'lam_role=recruiter',
    });
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    const queryIssue = result.error.issues.find(
      (issue) => issue.path[0] === 'query',
    );
    expect(queryIssue).toBeDefined();
  });

  test('отклоняет query с non-string value', () => {
    const result = stateInjectSpecSchema.safeParse({
      query: { lam_role: 1 },
    });
    expect(result.success).toBe(false);
  });

  test('отклоняет labels не-array', () => {
    const result = stateInjectSpecSchema.safeParse({
      labels: 'recruiter',
    });
    expect(result.success).toBe(false);
  });

  test('отклоняет hash числом', () => {
    const result = stateInjectSpecSchema.safeParse({ hash: 12 });
    expect(result.success).toBe(false);
  });

  test('strict: отклоняет неизвестные ключи', () => {
    const result = stateInjectSpecSchema.safeParse({
      role: 'employer',
      cookie: 'x=1',
    });
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(
      result.error.issues.some((issue) => issue.code === 'unrecognized_keys'),
    ).toBe(true);
  });
});
