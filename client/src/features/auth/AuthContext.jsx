import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiRequest('/auth/refresh', { method: 'POST' })
      .then(({ user: currentUser }) => { if (active) setUser(currentUser); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    async login(email, password) {
      const result = await apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      setUser(result.user);
      return result.user;
    },
    async register(values) {
      const result = await apiRequest('/auth/register', { method: 'POST', body: JSON.stringify(values) });
      setUser(result.user);
      return result.user;
    },
    async logout() {
      await apiRequest('/auth/logout', { method: 'POST' });
      setUser(null);
    },
    updateUser(nextUser) { setUser(nextUser); },
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
