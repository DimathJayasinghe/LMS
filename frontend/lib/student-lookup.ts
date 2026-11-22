"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ApiList, StudentLookupRow } from "@/lib/types";

/**
 * Students matching what the desk has typed (name, index number or phone), looked up after a short pause.
 * Two characters is the least that narrows anything; a failed lookup reads as "no matches".
 */
export function useStudentLookup(term: string): StudentLookupRow[] {
  const query = term.trim();
  const [response, setResponse] = useState<{ query: string; results: StudentLookupRow[] }>({ query: "", results: [] });

  useEffect(() => {
    if (query.length < 2) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .get<ApiList<StudentLookupRow>>(`/users/lookup?q=${encodeURIComponent(query)}`)
        .then((r) => {
          if (!cancelled) setResponse({ query, results: r.data });
        })
        .catch(() => {
          if (!cancelled) setResponse({ query, results: [] });
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  // Answers for an older search must not show under newer text.
  return response.query === query ? response.results : [];
}
