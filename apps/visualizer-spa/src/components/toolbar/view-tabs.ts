/**
 * Вкладки видов шапки: какие есть, когда показываются, чем подписаны.
 */
import { BookOpen, Database, GitCompare, LayoutGrid, Network, type LucideIcon } from 'lucide-react';
import type { AppView } from '../../store/view-store';

/** Что есть в открытой карте: от этого зависят вкладки. */
export type MapSections = {
  readonly hasApi: boolean;
  readonly hasDb: boolean;
  readonly hasDocs: boolean;
};

/** Вкладка вида. */
export type ViewTab = {
  readonly view: AppView;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly title: string;
  readonly testId?: string;
  /** Показывать ли вкладку для этой карты. */
  readonly shown: (sections: MapSections) => boolean;
};

const always = (): boolean => true;

/** Вкладки в порядке шапки. */
export const VIEW_TABS: readonly ViewTab[] = [
  { view: 'screens', icon: LayoutGrid, label: 'Экраны', title: 'Экраны', shown: always },
  { view: 'api', icon: Network, label: 'API', title: 'API', testId: 'view-api', shown: (s) => s.hasApi },
  { view: 'database', icon: Database, label: 'База данных', title: 'База данных', shown: (s) => s.hasDb },
  { view: 'docs', icon: BookOpen, label: 'Документация', title: 'Документация', testId: 'view-docs', shown: (s) => s.hasDocs },
  { view: 'compare', icon: GitCompare, label: 'Сравнение', title: 'Сравнение версий карты', testId: 'view-compare', shown: always },
];

/**
 * Вкладки, видимые для карты.
 *
 * @param sections - что есть в карте
 */
export function visibleViewTabs(sections: MapSections): readonly ViewTab[] {
  return VIEW_TABS.filter((t) => t.shown(sections));
}
