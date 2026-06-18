// The injection contract. Every primitive in this package is a pure function of
// its typed input plus a `PartnershipContext` that supplies the AI call. The
// package builds the prompt, the JSON Schema, the tool name, and the validator;
// the *caller* supplies the actual generate implementation (and, with it, the
// provider, billing/metering, and timeouts). That keeps this package free of any
// app-specific concern — metering, persistence, and provider choice all live in
// the host app's thin wrapper.
//
// The shape of `GenerateObjectRequest` is deliberately the subset of
// `@absolutejs/ai`'s `generateObjectAI` options the package needs, MINUS
// `provider` and any metering fields. A host app wires it up in one line, e.g.:
//
//   const generateObject: GenerateObject = (req) =>
//     meteredGenerateObjectAI({ ...req, provider: aiProvider, userSub });
//
// so the metered wrapper a host already uses for everything else applies here
// for free.

/** A single chat message handed to the model. The package only ever emits
 *  `role: "user"`; the wider union exists so a host's generate impl type lines
 *  up without a cast. */
export type AIMessage = {
  content: string;
  role: "user" | "assistant" | "system";
};

/** The option bag a primitive builds for one structured generation. Mirrors the
 *  fields of `@absolutejs/ai`'s `generateObjectAI` that the package controls. */
export type GenerateObjectRequest<T> = {
  /** Ledger/metrics tag for the host's metering (e.g. "trustFit"). Opaque here. */
  feature: string;
  maxTokens: number;
  messages: AIMessage[];
  /** Model id; defaulted per primitive, override via `PartnershipContext.model`. */
  model: string;
  /** JSON Schema (already converted from zod) describing the tool's arguments.
   *  Typed to match `@absolutejs/ai`'s `generateObjectAI` so a host can forward
   *  the request verbatim with no cast. */
  schema: Record<string, unknown>;
  systemPrompt: string;
  toolDescription: string;
  toolName: string;
  /** Parse/validate the raw tool args into the typed result. Throws on mismatch. */
  validate: (raw: unknown) => T;
};

/** The injected structured-generation call. Returns the validated object. */
export type GenerateObject = <T>(
  request: GenerateObjectRequest<T>,
) => Promise<{ object: T }>;

/** Optional web-research call injected into primitives that ground on live data
 *  (e.g. partner verification). Returns the research text, or null when research
 *  is unavailable so the primitive can fall back to knowledge-only synthesis. */
export type ResearchFn = (
  systemPrompt: string,
  userPrompt: string,
) => Promise<string | null>;

/** Shared context every primitive accepts. */
export type PartnershipContext = {
  /** Host-supplied structured-generation call (provider + metering bound in). */
  generateObject: GenerateObject;
  /** Override the primitive's default model when set. */
  model?: string;
};

/** Context for web-grounded primitives (partner verification, meeting prep,
 *  competitor analysis): a `PartnershipContext` plus an optional injected
 *  research call. When `research` is omitted (or returns null), those primitives
 *  fall back to knowledge-only synthesis. */
export type ResearchContext = PartnershipContext & {
  research?: ResearchFn;
};
