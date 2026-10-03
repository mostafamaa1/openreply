"use client";

/**
 * Content Agent Settings
 *
 * The profile the agents write for, and the competitors they benchmark
 * against. Stored in the database so none of it lands in the public repo.
 */

import { useEffect, useState } from "react";
import { Bot, X } from "lucide-react";
import { PanelHeader } from "@/components/broadcast/primitives";

interface Profile {
  niche: string;
  voice: string;
  audience: string;
  goals: string;
  categories: string[];
}

type TextField = Exclude<keyof Profile, "categories">;

interface Competitor {
  username: string;
  followersCount: number | null;
  lastScrapedAt: string | null;
  postCount: number;
}

const FIELDS: Array<{ key: TextField; label: string; placeholder: string }> = [
  { key: "niche", label: "Niche", placeholder: "Public speaking coaching" },
  { key: "voice", label: "Voice", placeholder: "Practical, story-led" },
  { key: "audience", label: "Audience", placeholder: "Students and young professionals" },
  { key: "goals", label: "Goals", placeholder: "Grow followers; book coaching calls" },
];

const inputClass =
  "w-full rounded border border-border bg-surface px-4 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent/40";

export default function ContentAgentSettings({ canEdit }: { canEdit: boolean }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [handle, setHandle] = useState("");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/agents/profile").then((r) => r.json()),
      fetch("/api/agents/competitors").then((r) => r.json()),
    ]).then(([p, c]) => {
      if (p.success) setProfile(p.data);
      if (c.success) setCompetitors(c.data);
    });
  }, []);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setBusy("profile");
    const res = await fetch("/api/agents/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    const payload = await res.json();
    setMessage(
      payload.success
        ? { text: "Profile saved. The next agent run uses it.", error: false }
        : { text: payload.error ?? "Could not save profile", error: true }
    );
    setBusy(null);
  }

  async function changeCompetitor(method: "POST" | "DELETE", username: string) {
    setBusy(`${method}:${username}`);
    const res = await fetch("/api/agents/competitors", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    const payload = await res.json();
    if (payload.success) {
      setCompetitors(payload.data);
      if (method === "POST") setHandle("");
      setMessage(null);
    } else {
      setMessage({ text: payload.error ?? "Could not update competitors", error: true });
    }
    setBusy(null);
  }

  return (
    <section id="content-agents" className="panel rounded p-4 sm:p-6">
      <PanelHeader
        icon={Bot}
        title="Content agents"
        description="What the Ideator and Hook & Script agents write for, and who they benchmark against."
      />

      {profile && (
        <form onSubmit={saveProfile} className="space-y-4">
          {FIELDS.map((field) => (
            <label key={field.key} className="block">
              <span className="mb-1.5 block text-sm font-medium text-foreground">
                {field.label}
              </span>
              <textarea
                value={profile[field.key]}
                onChange={(e) => setProfile({ ...profile, [field.key]: e.target.value })}
                placeholder={field.placeholder}
                rows={2}
                maxLength={500}
                disabled={!canEdit}
                className={inputClass}
              />
            </label>
          ))}

          <div>
            <span className="mb-1.5 block text-sm font-medium text-foreground">Topics</span>
            <p className="mb-2 text-xs text-muted">
              The Ideator plans every week across these, and your posts are tagged with them.
              Each one should serve communication, public speaking or self development.
            </p>
            <ul className="flex flex-wrap gap-2">
              {profile.categories.map((c) => (
                <li
                  key={c}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background py-1 pl-3 pr-1.5 text-sm text-foreground"
                >
                  {c}
                  {canEdit && profile.categories.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setProfile({ ...profile, categories: profile.categories.filter((x) => x !== c) })
                      }
                      aria-label={`Remove ${c}`}
                      className="flex h-5 w-5 items-center justify-center rounded-full text-muted hover:bg-surface-hover hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {canEdit && (
              <div className="mt-2 flex gap-2">
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const t = topic.trim();
                      if (t && !profile.categories.includes(t)) {
                        setProfile({ ...profile, categories: [...profile.categories, t] });
                      }
                      setTopic("");
                    }
                  }}
                  maxLength={40}
                  placeholder="Add a topic and press Enter"
                  className={inputClass}
                />
              </div>
            )}
          </div>

          {canEdit && (
            <button
              type="submit"
              disabled={busy === "profile"}
              className="rounded bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {busy === "profile" ? "Saving..." : "Save profile"}
            </button>
          )}
        </form>
      )}

      <div className="mt-8 border-t border-border pt-6">
        <p className="text-sm font-medium text-foreground">Competitors</p>
        <p className="mt-0.5 mb-4 text-xs text-muted">
          Public accounts only. Their posts are fetched weekly through Apify.
        </p>

        <div className="space-y-2">
          {competitors.length === 0 && (
            <p className="text-sm text-muted">No competitors yet.</p>
          )}
          {competitors.map((c) => (
            <div
              key={c.username}
              className="flex items-center justify-between gap-3 rounded border border-border bg-surface/70 p-3"
            >
              <div className="min-w-0">
                <a
                  href={`https://www.instagram.com/${c.username}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-foreground hover:text-accent-ink"
                >
                  @{c.username}
                </a>
                <p className="text-xs text-muted">
                  {c.followersCount !== null
                    ? `${c.followersCount.toLocaleString()} followers · `
                    : ""}
                  {c.lastScrapedAt
                    ? `${c.postCount} posts, fetched ${new Date(c.lastScrapedAt).toLocaleDateString()}`
                    : "Not fetched yet"}
                </p>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => changeCompetitor("DELETE", c.username)}
                  disabled={busy === `DELETE:${c.username}`}
                  className="rounded border border-error/20 px-3 py-1.5 text-xs font-medium text-error transition-colors hover:bg-error/10 disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>

        {canEdit && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void changeCompetitor("POST", handle);
            }}
            className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]"
          >
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@handle or instagram.com/handle"
              className={inputClass}
              required
            />
            <button
              type="submit"
              disabled={busy?.startsWith("POST:")}
              className="rounded bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              Add competitor
            </button>
          </form>
        )}
      </div>

      {message && (
        <p className={`mt-4 text-sm ${message.error ? "text-error" : "text-success"}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
