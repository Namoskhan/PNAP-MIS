import { createContext, useContext, useEffect, useState } from 'react';
import { Storage } from '../utils/storage';
import { api } from '../api/client';
import { useAuth } from './AuthContext';
import { LEVEL_ORDER, homeTierOf, homeUnitIdOf, levelIndex } from '../utils/unitTier';

// Port of web/src/context/UnitContext.jsx.
// Uses cross-platform Storage (SecureStore on Native, localStorage on Web).

const UnitContext = createContext(null);
const STORAGE_KEY = 'pnap_unit_ctx';

async function readStored(userId) {
  try {
    const raw = JSON.parse(await Storage.getItem(STORAGE_KEY) || 'null');
    if (!raw || !raw.unitLevel || !raw.unitId) return null;
    if (!raw.userId || String(raw.userId) !== String(userId || '')) return null;
    return { unitLevel: raw.unitLevel, unitId: raw.unitId, unitName: raw.unitName };
  } catch {
    return null;
  }
}

async function writeStored(ctx, userId) {
  try {
    await Storage.setItem(STORAGE_KEY, JSON.stringify({ ...ctx, userId }));
  } catch { /* ignore */ }
}

export function UnitProvider({ children }) {
  const { user } = useAuth();
  const [provinces, setProvinces] = useState([]);
  const [ctx, setCtxRaw] = useState(null);
  const [ready, setReady] = useState(false);

  // Hydrate stored context for the current user, or fallback to home tier.
  useEffect(() => {
    if (!user?._id) { setCtxRaw(null); setReady(true); return; }
    readStored(user._id).then(async (stored) => {
      if (stored) {
        if (stored.unitLevel === 'CENTRAL' && (!stored.unitId || stored.unitId === 'CENTRAL')) {
          try {
            const r = await api.get('/org/central');
            if (r.data?.data?._id) {
              const updated = { unitLevel: 'CENTRAL', unitId: r.data.data._id, unitName: r.data.data.name || 'PKNAP Central' };
              setCtxRaw(updated);
              await writeStored(updated, user._id);
              setReady(true);
              return;
            }
          } catch {}
        }
        setCtxRaw(stored);
      } else {
        const home = homeTierOf(user);
        const s = user?.scope || {};
        const unitId = homeUnitIdOf(user);
        let unitName = s.basicUnitName || s.areaName || s.districtName || s.provinceName || 'My Unit';
        if (home.level === 'CENTRAL') {
          unitName = 'PKNAP Central';
          try {
            const r = await api.get('/org/central');
            if (r.data?.data?._id) {
              const updated = { unitLevel: 'CENTRAL', unitId: r.data.data._id, unitName: r.data.data.name || 'PKNAP Central' };
              setCtxRaw(updated);
              await writeStored(updated, user._id);
              setReady(true);
              return;
            }
          } catch {}
          setCtxRaw({ unitLevel: 'CENTRAL', unitId: 'CENTRAL', unitName });
        } else {
          setCtxRaw({ unitLevel: home.level, unitId: unitId, unitName });
        }
      }
      setReady(true);
    });
  }, [user?._id]);

  // Load provinces list when user is authenticated.
  useEffect(() => {
    if (!user) { setProvinces([]); return; }
    api.get('/org/provinces').then((r) => setProvinces(r.data.data || [])).catch(() => {});
  }, [user]);

  async function setCtx(newCtx) {
    let resolvedCtx = newCtx;
    if (resolvedCtx && resolvedCtx.unitLevel === 'CENTRAL' && (!resolvedCtx.unitId || resolvedCtx.unitId === 'CENTRAL')) {
      try {
        const r = await api.get('/org/central');
        if (r.data?.data?._id) {
          resolvedCtx = { ...resolvedCtx, unitId: r.data.data._id, unitName: r.data.data.name || 'PKNAP Central' };
        }
      } catch {}
    }
    setCtxRaw(resolvedCtx);
    if (resolvedCtx && user?._id) await writeStored(resolvedCtx, user._id);
    else if (!resolvedCtx) await Storage.removeItem(STORAGE_KEY);
  }

  return (
    <UnitContext.Provider value={{ ctx, setCtx, provinces, ready }}>
      {children}
    </UnitContext.Provider>
  );
}

export function useUnit() {
  return useContext(UnitContext);
}
