import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading, null = logged out
  const [meta, setMeta] = useState(null);
  // Owner can look at one location or all of them; staff are fixed to their own.
  const [ownerLocation, setOwnerLocation] = useState(() => {
    try {
      return localStorage.getItem('jd_location') || '';
    } catch {
      return '';
    }
  });

  const refreshMeta = useCallback(() => api('/meta').then(setMeta), []);

  const load = useCallback(async () => {
    try {
      const me = await api('/me');
      setUser(me);
      await refreshMeta();
    } catch {
      setUser(null);
    }
  }, [refreshMeta]);

  useEffect(() => {
    load();
  }, [load]);

  const login = async (username, password) => {
    await api('/login', { method: 'POST', body: { username, password } });
    await load();
  };
  const logout = async () => {
    await api('/logout', { method: 'POST' });
    setUser(null);
    setMeta(null);
  };
  const chooseLocation = (id) => {
    setOwnerLocation(id);
    try {
      localStorage.setItem('jd_location', id);
    } catch {
      /* ignore */
    }
  };

  const isOwner = user?.role === 'owner';
  const locationId = isOwner ? ownerLocation : String(user?.location_id ?? '');

  return (
    <SessionContext.Provider
      value={{ user, meta, refreshMeta, login, logout, isOwner, locationId, chooseLocation }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);
