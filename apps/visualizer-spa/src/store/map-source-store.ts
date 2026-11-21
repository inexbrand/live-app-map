/**
 * Откуда загружена открытая карта: запись каталога (по ней — история версий и
 * свежий скан) или файл с компьютера (только имя для подписи). Один писатель —
 * места загрузки карты (шапка, пустой экран, ссылка ?map=, перетаскивание файла).
 */
import { create } from 'zustand';

/** Источник открытой карты. */
export type MapSourceRef =
  | { readonly kind: 'catalog'; readonly id: string; readonly label: string; readonly path: string }
  | { readonly kind: 'file'; readonly name: string };

type MapSourceState = {
  readonly source: MapSourceRef | null;
  readonly setSource: (source: MapSourceRef | null) => void;
};

/** Store источника карты. */
export const useMapSourceStore = create<MapSourceState>((set) => ({
  source: null,
  setSource: (source) => set({ source }),
}));
