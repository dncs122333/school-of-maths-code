import axios from "axios";

const RAW_BACKEND_URL = process.env.REACT_APP_BACKEND_URL || ""; // same-origin /api via the CRA dev proxy
const BASE_URL = RAW_BACKEND_URL.replace(/\/+$/, "");
const API = `${BASE_URL}/api`;

export const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("vidya_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// When responseType is "blob", axios puts the JSON error body into a Blob.
// We read it back to give meaningful error messages (e.g. "Not authenticated").
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const res = err.response;
    if (res && res.data instanceof Blob && res.data.type?.includes("json")) {
      try {
        const text = await res.data.text();
        res.data = JSON.parse(text);
      } catch (_) {
        // leave as blob if parse fails
      }
    }
    // On 401, clear the stored token and bounce to the login screen.
    // Skipped for the login/register calls themselves — a wrong password returns 401
    // too, and redirecting there would wipe the form before the error can be shown.
    // Also skipped when already on /auth, to avoid a reload loop.
    const url = err.config?.url || "";
    const isAuthAttempt = url.includes("/auth/login") || url.includes("/auth/register");
    if (res?.status === 401 && !isAuthAttempt && window.location.pathname !== "/auth") {
      localStorage.removeItem("vidya_token");
      window.location.href = "/auth"; // the app's login route is /auth (see App.js)
    }
    return Promise.reject(err);
  }
);

export const mediaUrl = (path) => `${API}/media/${path}`;

export function formatApiErrorDetail(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).filter(Boolean).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}
