/**
 * Срез dogfood-входа и TLS-proxy: значения в localStorage, смена пересчитывает live URL.
 */
import { LS_ADMIN, LS_INIT, LS_TLS_PROXY, readLs, writeLs } from './browser-storage';
import type { AppSlice, DogfoodSlice } from './types';

/** Срез dogfood. */
export const createDogfoodSlice: AppSlice<DogfoodSlice> = (set, get) => ({
  dogfoodMiniappInitData: readLs(LS_INIT),
  dogfoodAdminAccessToken: readLs(LS_ADMIN),
  useTlsProxy: readLs(LS_TLS_PROXY) !== '0',

  setDogfoodMiniappInitData: (raw) => {
    writeLs(LS_INIT, raw);
    set({ dogfoodMiniappInitData: raw });
    get().pushLog({
      level: 'info',
      source: 'system',
      message: raw.trim()
        ? 'Dogfood: initData miniapp сохранён (подставится в live URL)'
        : 'Dogfood: initData miniapp очищен',
    });
    get().recomputeLive();
  },

  setDogfoodAdminAccessToken: (token) => {
    writeLs(LS_ADMIN, token);
    set({ dogfoodAdminAccessToken: token });
    get().pushLog({
      level: 'info',
      source: 'system',
      message: token.trim()
        ? 'Dogfood: admin access token сохранён'
        : 'Dogfood: admin token очищен',
    });
    get().recomputeLive();
  },

  setUseTlsProxy: (enabled) => {
    writeLs(LS_TLS_PROXY, enabled ? '1' : '0');
    set({ useTlsProxy: enabled });
    get().pushLog({
      level: 'info',
      source: 'system',
      message: enabled
        ? 'TLS-proxy: вкл (self-signed → /__lam_proxy/…)'
        : 'TLS-proxy: выкл (прямой HTTPS origin)',
    });
    get().recomputeLive();
  },
});
