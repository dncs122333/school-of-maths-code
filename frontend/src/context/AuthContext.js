import React, { createContext, useContext, useEffect, useState } from "react";
import { toast } from "sonner";
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

  // The API client signals an expired session or a blocked account; drop the user without reloading
  useEffect(() => {
    const onSignedOut = (e) => {
      setUser(null);
      if (e.detail?.reason) toast.error(e.detail.reason === "Token expired" ? "Your session expired. Please log in again." : e.detail.reason);
    };
    window.addEventListener("vidya:signed-out", onSignedOut);
    return () => window.removeEventListener("vidya:signed-out", onSignedOut);
  }, []);

  const persist = (data) => {
    localStorage.setItem("vidya_token", data.token);
    setUser(data.user);
    return data.user;
  };

  const login = async (email, password) => persist((await api.post("/auth/login", { email, password })).data);
  // Teacher sign-ups wait for admin approval and come back without a token
  const register = async (payload) => {
    const data = (await api.post("/auth/register", payload)).data;
    if (data.pending_approval) return { pendingApproval: true, message: data.message };
    return persist(data);
  };
  const logout = () => { localStorage.removeItem("vidya_token"); setUser(null); };
  const refreshUser = async () => { const r = await api.get("/auth/me"); setUser(r.data); return r.data; };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}
