// Generous safety-net caps. The PROMPT is what guides the model to the real
// lengths ("1-2 sentences", "3-6 items"); these are well above that intent and
// exist only so a slightly-long string or one extra list item can never fail
// the whole synthesis. Schemas keep their fields as PLAIN strings/arrays (no
// `.max()`), so they round-trip to JSON Schema and the model is never rejected
// for overshooting — we clamp the result here instead. (Same convention
// trustFit.ts already documents with its post-parse `.slice()`.)
const STRING_CAP = 800;
const LIST_CAP = 12;

/** Recursively bound an AI-synthesized value: clamp every string to a generous
 *  char cap (trimmed at the cut) and every array to a generous item cap. Never
 *  rejects — a robust net under every structured generation in this package. */
export const clampDeep = <T>(value: T): T => {
  if (typeof value === "string") {
    return (
      value.length > STRING_CAP ? value.slice(0, STRING_CAP).trimEnd() : value
    ) as T;
  }
  if (Array.isArray(value)) {
    return value.slice(0, LIST_CAP).map((item) => clampDeep(item)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, clampDeep(item)]),
    ) as T;
  }

  return value;
};
