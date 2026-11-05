import React, { createContext, useContext, useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../lib/api";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const USER_KEY = "som_user";

function readSavedUser() {
  try {
    if (!localStorage.getItem("som_token")) return null;
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
}

function saveUser(user) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch { /* storage full or blocked: the app still works, it just waits for the server next time */ }
}

export function AuthProvider({ children }) {
  // The last known user shows the app straight away, even on a bad network, while the server confirms it.
  // Screens fetch their own data, and the server still checks every request.
  const [user, setUserState] = useState(readSavedUser);
  const [loading, setLoading] = useState(() => !!localStorage.getItem("som_token") && !readSavedUser());
  const setUser = (next) => { saveUser(next); setUserState(next); };

  useEffect(() => {
    const token = localStorage.getItem("som_token");
    if (!token) { setLoading(false); return; }
    api.get("/auth/me")
      .then((r) => setUser(r.data))
      .catch((err) => {
        // Only the server saying no ends the session. A dropped connection or a server restart must not log
        // a student out. (A 401 has already been handled by the API client.)
        if (err.response?.status === 401 || err.response?.status === 403) {
          localStorage.removeItem("som_token");
          setUser(null);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  // The API client signals an expired session or a blocked account; drop the user without reloading
  useEffect(() => {
    const onSignedOut = (e) => {
      setUser(null);
      if (e.detail?.reason) toast.error(e.detail.reason === "Token expired" ? "Your session expired. Please log in again." : e.detail.reason);
    };
    window.addEventListener("som:signed-out", onSignedOut);
    return () => window.removeEventListener("som:signed-out", onSignedOut);
  }, []);

  const persist = (data) => {
    localStorage.setItem("som_token", data.token);
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
  const logout = () => { localStorage.removeItem("som_token"); setUser(null); };
  const refreshUser = async () => { const r = await api.get("/auth/me"); setUser(r.data); return r.data; };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}
