/**
 * Пример конфига Live App Map (Korbor dogfood defaults).
 */
import { defineConfig } from './packages/cli/src/define-config';

export default defineConfig({
  baseUrl: 'https://vite.localhost:5175',
  framework: 'auto',
  exampleParams: {
    id: 'demo',
    vacancyId: 'vac-demo',
    dealId: 'deal-demo',
    userId: 'user-demo',
    candidateId: 'cand-demo',
  },
  iframe: {
    maxLiveIframes: 8,
    maxPinned: 6,
    /** keep-alive LRU сверх live (DOM без unmount) */
    maxWarmIframes: 8,
    freezeStrategy: 'hybrid',
  },
  edge: {
    includeLowConfidence: false,
    maxFiles: 5000,
  },
});
