"use client";

import { useEffect, useId, useState } from "react";

const KEY = "lms.collectionBranch";

/** The branch this desk is collecting at, kept on this device so it is not chosen again for every student. */
export function useRememberedBranch(institutes: { id: string }[]): [string, (id: string) => void] {
  const [branchId, setBranchId] = useState("");

  // Read after mount: the server render has no storage, so reading earlier would not match it.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- storage is only readable in the browser
      if (saved && institutes.some((i) => i.id === saved)) setBranchId(saved);
    } catch {
      // Storage can be blocked; the choice then lasts for this page only.
    }
  }, [institutes]);

  const choose = (id: string): void => {
    setBranchId(id);
    try {
      if (id) localStorage.setItem(KEY, id);
      else localStorage.removeItem(KEY);
    } catch {
      // See above.
    }
  };
  return [branchId, choose];
}

interface Props {
  institutes: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
}

export function CollectionBranch({ institutes, value, onChange }: Props) {
  const id = useId();
  if (institutes.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 text-xs text-muted-foreground print:hidden">
      <label htmlFor={id}>Collecting at</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-fit rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="">No branch</option>
        {institutes.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
      </select>
      <span>Cash you take is counted against this branch at the end of the day.</span>
    </div>
  );
}
