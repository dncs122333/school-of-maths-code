import axios from "axios";

const RAW_BACKEND_URL = process.env.REACT_APP_BACKEND_URL || ""; // same-origin /api via the CRA dev proxy
const BASE_URL = RAW_BACKEND_URL.replace(/\/+$/, "");
const API = `${BASE_URL}/api`;

export const api = axios.create({ baseURL: API });
export const DATABASE_UNAVAILABLE_MESSAGE = "We can't reach the database right now. Please try again in a few minutes.";

function notifyDatabaseAvailability(eventName) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(eventName));
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("som_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// When responseType is "blob", axios puts the JSON error body into a Blob.
// We read it back to give meaningful error messages (e.g. "Not authenticated").
api.interceptors.response.use(
  (res) => {
    if (!(res.config?.url || "").includes("/admin/data-source-status") || res.data?.available !== false) {
      notifyDatabaseAvailability("som:database-available");
    }
    return res;
  },
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
    if (res?.status === 503 && res?.data?.detail === DATABASE_UNAVAILABLE_MESSAGE) {
      notifyDatabaseAvailability("som:database-unavailable");
    }
    const isBlockedOrDisabled = res?.status === 403 && typeof res?.data?.detail === "string" && (
      res.data.detail.toLowerCase().includes("disabled") || res.data.detail.toLowerCase().includes("blocked")
    );
    // A parent has withdrawn their agreement while the app was open: the saved user is out of date
    if (res?.status === 403 && typeof res?.data?.detail === "string" && res.data.detail.startsWith("Waiting for your parent")) {
      window.dispatchEvent(new CustomEvent("som:consent-needed"));
    }
    if ((res?.status === 401 || isBlockedOrDisabled) && !isAuthAttempt && localStorage.getItem("som_token")) {
      localStorage.removeItem("som_token");
      // AuthContext signs out in place and the route guards send the user to /auth. No full-page
      // reload: inside an installed or native app shell a reload would restart the whole app.
      window.dispatchEvent(new CustomEvent("som:signed-out", {
        detail: { reason: typeof res?.data?.detail === "string" ? res.data.detail : null },
      }));
    }
    return Promise.reject(err);
  }
);


export function formatApiErrorDetail(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).filter(Boolean).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}
