import { z } from "zod";
import { clampDeep } from "./bounded";
import type { PartnershipContext } from "./ai";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const SYNTH_MAX_TOKENS = 1600;
const COUNTER_MAX = 6000;

// Plain strings/arrays (no `.max()`) so a slightly-long field never REJECTS the
// whole plan — the prompt guides lengths and clampDeep bounds the result.
const RedlineSchema = z.object({
  aligned: z.array(z.string()),
  concessions: z.array(z.string()),
  counterMoves: z.array(z.string()),
  risks: z.array(z.string()),
  summary: z.string(),
});

export type DealRedline = z.infer<typeof RedlineSchema>;

export type RedlineInput = {
  /** The partner's counter-proposal text (truncated to a safe length). */
  counterProposal: string;
  /** Display name of the partner who sent the counter. */
  partnerName: string;
  /** The member's recommended deal structure, serialized verbatim. */
  recommendedStructure: unknown;
};

const SYSTEM = `You are a partnership deal negotiator. The member has a RECOMMENDED deal structure and has received a COUNTER-PROPOSAL from the prospective partner. Redline the counter against the recommendation — clear-eyed, in the member's interest, but fair. Ground everything in the two documents; do NOT invent terms. Output:
- summary: 1-2 sentences on how the counter compares overall (favorable / mixed / one-sided) and the headline gap.
- aligned: 3-6 points where the counter already MATCHES or improves on the recommended structure (don't re-fight these).
- concessions: 3-6 places where the counter asks the member to GIVE UP something material vs the recommendation (what it costs them).
- risks: 3-6 terms in the counter that are vague, one-sided, or create downside the member should not accept as-is.
- counterMoves: 3-6 specific, reasonable counter-offers or redlines the member should propose back (concrete language/positions, tied to the gaps).
Each list item is ONE concrete sentence. No fluff, no boilerplate, no fabrication — this is a working redline a member negotiates from.`;

/** Redline a partner's counter-proposal against the member's recommended deal
 *  structure. Ephemeral — returns the analysis, persists nothing. */
export const redlineDeal = async (
  input: RedlineInput,
  ctx: PartnershipContext,
): Promise<DealRedline> => {
  const { object } = await ctx.generateObject({
    feature: "dealRedline",
    maxTokens: SYNTH_MAX_TOKENS,
    messages: [
      {
        content: JSON.stringify({
          counterProposal: input.counterProposal.slice(0, COUNTER_MAX),
          partner: input.partnerName,
          recommendedStructure: input.recommendedStructure,
        }),
        role: "user",
      },
    ],
    model: ctx.model ?? DEFAULT_MODEL,
    schema: z.toJSONSchema(RedlineSchema),
    systemPrompt: SYSTEM,
    toolDescription: "Return the redline analysis of the counter-proposal.",
    toolName: "deal_redline",
    validate: (raw) => RedlineSchema.parse(raw),
  });

  return clampDeep(object);
};
