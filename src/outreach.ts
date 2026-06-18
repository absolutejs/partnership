import { z } from "zod";
import type { PartnershipContext } from "./ai";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const OUTREACH_MAX_TOKENS = 1200;

export type OutreachMode = "outreach" | "winback";

export type OutreachDraft = {
  body: string;
  subject: string;
};

/** Length bounds for the draft, supplied by the host so subject/body sizing
 *  matches its UI. */
export type OutreachBounds = {
  bodyMax: number;
  bodyMin: number;
  subjectMax: number;
  subjectMin: number;
};

/** The match facts the draft is grounded in. Both a full match row and a
 *  synthesized member-to-member match map onto this. */
export type OutreachMatchFacts = {
  company?: string;
  contactName?: string;
  contactTitle?: string;
  estimatedValue?: unknown;
  industry?: string;
  matchRationale?: unknown;
  outServeStrategy?: unknown;
  partnershipBucket?: unknown;
  relationshipType?: unknown;
  revenueImpact?: unknown;
  revenueModel?: unknown;
};

export type OutreachProfileFacts = {
  audienceSizeTier?: string;
  desiredPartnerTraits?: string[];
  firstName?: string | null;
  goal90d?: string;
  identityRole?: string;
  lastName?: string | null;
  niche?: string;
  offerSummary?: string;
  strengths?: string[];
};

export type OutreachInput = {
  bounds: OutreachBounds;
  match: OutreachMatchFacts;
  mode?: OutreachMode;
  profile: OutreachProfileFacts;
};

const SYSTEM = `You write warm, concise outreach emails for members reaching out to companies they were matched with. Use ONLY the supplied JSON facts. Do not invent names, traction, customers, social metrics, dates, or claims. If a fact is missing, write around it.

Adapt the angle to match.relationshipType:
- "complementary" or missing: a genuine partnership intro — propose collaborating and ask for a short call.
- "adjacent": a narrow, specific partnership angle (one concrete area of overlap); stay humble, don't overreach.
- "competitor": do NOT pitch a partnership — they sell a competing product. Instead use match.outServeStrategy as the spine: open a respectful conversation around serving their clients/users better (an integration, a migration path, or a segment they underserve). Never disparage them. Frame it as a value exchange, not a takeover.

Output a subject and body. The body must be plain text, 120-220 words, easy to edit, and should ask for a short, low-pressure next conversation.`;

const WINBACK_SYSTEM = `You write warm, brief RE-ENGAGEMENT emails for a member reaching back out to a partner whose collaboration has CONCLUDED. The relationship ended on good terms; the goal is to reopen the door with a fresh, specific reason to reconnect — NOT to relitigate the past. Use ONLY the supplied JSON facts; do not invent traction, names, dates, or claims. Acknowledge the prior partnership warmly and briefly, then propose ONE concrete new reason to talk (a new offering, a changed circumstance, a new segment, a renewed fit). Output a subject and body. The body must be plain text, 110-200 words, easy to edit, low-pressure, and end with a soft ask for a quick catch-up.`;

/** AI-draft an editable outreach (or win-back) email — subject + plain-text body,
 *  angled by the match's relationship type. Throws on failure so the host can
 *  drop in its own templated fallback. */
export const draftOutreach = async (
  input: OutreachInput,
  ctx: PartnershipContext,
): Promise<OutreachDraft> => {
  const isWinback = input.mode === "winback";
  const schema = z.object({
    body: z.string().min(input.bounds.bodyMin).max(input.bounds.bodyMax),
    subject: z
      .string()
      .min(input.bounds.subjectMin)
      .max(input.bounds.subjectMax),
  });

  const { object } = await ctx.generateObject({
    feature: isWinback ? "winbackDraft" : "outreachDraft",
    maxTokens: OUTREACH_MAX_TOKENS,
    messages: [
      {
        content: JSON.stringify({ match: input.match, profile: input.profile }),
        role: "user",
      },
    ],
    model: ctx.model ?? DEFAULT_MODEL,
    schema: z.toJSONSchema(schema),
    systemPrompt: isWinback ? WINBACK_SYSTEM : SYSTEM,
    toolDescription: "Return an editable outreach email subject and body.",
    toolName: "outreach_draft",
    validate: (raw) => schema.parse(raw),
  });

  return object;
};
