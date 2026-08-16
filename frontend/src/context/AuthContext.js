import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "../lib/api";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("vidya_token");
    if (!token) { setLoading(false); return; }
    api.get("/auth/me")
      .then((r) => setUser(r.data))
      .catch(() => localStorage.removeItem("vidya_token"))
      .finally(() => setLoading(false));
  }, []);

  const persist = (data) => {
    localStorage.setItem("vidya_token", data.token);
    setUser(data.user);
    return data.user;
  };

  const login = async (email, password) => persist((await api.post("/auth/login", { email, password })).data);
  const register = async (payload) => persist((await api.post("/auth/register", payload)).data);
  const logout = () => { localStorage.removeItem("vidya_token"); setUser(null); };
  const refreshUser = async () => { const r = await api.get("/auth/me"); setUser(r.data); return r.data; };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}
