const squash = (name: string): string =>
  name.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();

const editDistance = (a: string, b: string): number => {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(previous[j]! + 1, row[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = row;
  }
  return previous[b.length]!;
};

/**
 * Whether two names plausibly belong to one person: the same words in any order or with an initial or middle name left
 * out, or a typo or two. Used only to warn a clerk, never to merge, so it leans towards flagging.
 */
export const namesSimilar = (first: string, second: string): boolean => {
  const a = squash(first);
  const b = squash(second);
  if (!a || !b) return false;
  if (a === b) return true;

  const left = new Set(a.split(' '));
  const right = new Set(b.split(' '));
  const [fewer, more] = left.size <= right.size ? [left, right] : [right, left];
  if (fewer.size >= 2 && [...fewer].every((word) => more.has(word))) return true;

  const sortedA = [...left].sort().join(' ');
  const sortedB = [...right].sort().join(' ');
  return editDistance(sortedA, sortedB) <= (Math.max(sortedA.length, sortedB.length) >= 16 ? 2 : 1);
};
