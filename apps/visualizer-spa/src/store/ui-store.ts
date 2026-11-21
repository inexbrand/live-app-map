/**
 * Открытые оверлеи оболочки: глобальный поиск и справка по клавишам.
 */
import { create } from 'zustand';

type UiState = {
  readonly palette: boolean;
  readonly help: boolean;
  readonly setPalette: (open: boolean) => void;
  readonly setHelp: (open: boolean) => void;
};

/** Store оверлеев. */
export const useUiStore = create<UiState>((set) => ({
  palette: false,
  help: false,
  setPalette: (palette) => set({ palette, help: false }),
  setHelp: (help) => set({ help, palette: false }),
}));
