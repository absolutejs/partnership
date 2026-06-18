import { z } from "zod";
import { clampDeep } from "./bounded";
import type { PartnershipContext } from "./ai";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const NUDGE_MAX_TOKENS = 1300;

// Plain strings (no `.max()`) so a slightly-long nudge never REJECTS the whole
// batch — the prompt guides length and clampDeep bounds the result.
const NudgesSchema = z.object({
  suggestions: z.array(z.object({ key: z.string(), nudge: z.string() })),
});

export type NudgeSuggestion = { key: string; nudge: string };

/** One relationship in the member's network, keyed by a stable graph key. */
export type NudgePerson = {
  channels: string[];
  company?: string | null;
  daysSinceTouch?: number | null;
  interactionCount: number;
  key: string;
  name?: string | null;
  stage?: string | null;
  title?: string | null;
};

export type NudgeMember = { niche?: string; offer?: string };

const SYSTEM = `You are a partnerships coach. For EACH relationship, suggest ONE concrete next step to move it forward — specific to its deal stage, how long since the last touch, and the channels already used. Be actionable and brief (max ~30 words). Good moves: send a short follow-up, propose a specific call, share a relevant asset, ask for an intro, re-engage a cold thread, or hold off if it's too soon. No fluff, no generic "stay in touch." Return exactly one suggestion per supplied person key.`;

/** A concrete next-step nudge per network person, keyed by their graph key.
 *  Returns one `{ key, nudge }` per supplied person. Empty input → empty result
 *  (no model call). Throws on failure so the host can degrade as it likes. */
export const generateNudges = async (
  people: NudgePerson[],
  member: NudgeMember,
  ctx: PartnershipContext,
): Promise<NudgeSuggestion[]> => {
  if (people.length === 0) return [];

  const { object } = await ctx.generateObject({
    feature: "networkNudges",
    maxTokens: NUDGE_MAX_TOKENS,
    messages: [{ content: JSON.stringify({ member, people }), role: "user" }],
    model: ctx.model ?? DEFAULT_MODEL,
    schema: z.toJSONSchema(NudgesSchema),
    systemPrompt: SYSTEM,
    toolDescription: "Return one next-step nudge per person key.",
    toolName: "relationship_nudges",
    validate: (raw) => NudgesSchema.parse(raw),
  });

  return clampDeep(object.suggestions);
};
