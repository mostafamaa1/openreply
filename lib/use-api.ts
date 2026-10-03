"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Fetch one of the app's `{ success, data, error }` endpoints, refetching
 * when the URL changes. Keeps the previous data on screen while a new range
 * loads, so the score bar rolls to new numbers instead of blanking.
 */
export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [nonce, setNonce] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    if (!url) return;
    const id = ++latest.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(url)
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (id !== latest.current) return;
        if (body?.success) {
          setData(body.data as T);
          setError(null);
        } else {
          setError(body?.error ?? `Request failed (${r.status})`);
        }
      })
      .catch(() => id === latest.current && setError("Network error. Check your connection."))
      .finally(() => id === latest.current && setLoading(false));
  }, [url, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, reload };
}
