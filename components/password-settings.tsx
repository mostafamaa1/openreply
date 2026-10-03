"use client";

/**
 * Password Settings
 *
 * Set a sign-in password (first time) or change it (needs the current one).
 */

import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { PanelHeader } from "@/components/broadcast/primitives";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/password-rules";

const inputClass =
  "w-full rounded-md border border-border bg-background px-4 py-2 text-sm text-foreground outline-none transition-colors focus:border-border-hover";

export default function PasswordSettings() {
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/account/password")
      .then((r) => r.json())
      .then((p) => p.success && setHasPassword(p.data.hasPassword))
      .catch(() => undefined);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (next !== repeat) {
      setMessage({ text: "The two new passwords differ.", error: true });
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: current || undefined, newPassword: next }),
    });
    const payload = await res.json().catch(() => null);
    if (payload?.success) {
      setHasPassword(true);
      setCurrent("");
      setNext("");
      setRepeat("");
      setMessage({ text: "Password saved. Use it next time you sign in.", error: false });
    } else {
      setMessage({ text: payload?.error ?? "Could not save the password.", error: true });
    }
    setBusy(false);
  }

  return (
    <section className="panel rounded p-4 sm:p-6">
      <PanelHeader
        icon={KeyRound}
        title="Password"
        description={
          hasPassword === false
            ? "Set a password to sign in without waiting for an email link."
            : "Change the password you sign in with."
        }
      />

      <form onSubmit={submit} className="space-y-4">
        {hasPassword && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">Current password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              className={inputClass}
            />
          </label>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">New password</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              maxLength={MAX_PASSWORD_LENGTH}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">Repeat it</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              maxLength={MAX_PASSWORD_LENGTH}
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              required
              className={inputClass}
            />
          </label>
        </div>
        <p className="text-xs text-muted">At least {MIN_PASSWORD_LENGTH} characters.</p>
        <button
          type="submit"
          disabled={busy || hasPassword === null}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? "Saving..." : hasPassword ? "Change password" : "Set password"}
        </button>
        {message && (
          <p className={`text-sm ${message.error ? "text-error" : "text-success"}`}>{message.text}</p>
        )}
      </form>
    </section>
  );
}
