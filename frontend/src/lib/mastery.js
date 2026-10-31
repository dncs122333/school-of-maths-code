// Confirmation flags are computed by the backend (lib/mastery.py): weak/strong in >= 2 separate tests
// for a student, and stricter student/question thresholds for pooled batch topics. Every mastery
// endpoint sends them, so the UI must not re-derive them from band + attempts.
export const isConfirmedWeak = (t) => Boolean(t && t.is_confirmed_weak);
export const isConfirmedStrong = (t) => Boolean(t && t.is_confirmed_strong);
