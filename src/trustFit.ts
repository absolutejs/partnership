import { z } from "zod";
import type { PartnershipContext } from "./ai";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const TRUST_FIT_MAX_TOKENS = 900;
const REASON_MAX = 600;

const Dim = z.number().min(0).max(1);
// Plain strings (no max/transform) so the schema round-trips to JSON Schema; the
// reasons are truncated when mapping the result instead of rejected.
const TrustFitSchema = z.object({
  audienceOverlap: Dim,
  capability: Dim,
  credibility: Dim,
  mutualValue: Dim,
  whyFit: z.string(),
  whyThem: z.string(),
  whyYou: z.string(),
});

const SYSTEM = `You score a potential business partner on a Trust & Fit rubric for a specific member. Return four 0.0–1.0 scores and THREE separate reasons. Calibrate honestly — spread scores, don't cluster high.
- audienceOverlap: how much the two parties' audiences/customers genuinely overlap and would welcome this collaboration.
- capability: how capable and credible the partner is at actually delivering (track record, maturity, execution).
- mutualValue: how strong and TWO-SIDED the value exchange is (both gain meaningfully, not one-way).
- credibility: how real, trustworthy, and verifiable this partner is right now (reputation, legitimacy, risk).

Then write three SEPARATE one-to-two-sentence reasons, each EXPLAINING why that specific number lands where it does for THIS exact pairing — never define what the metric means, never restate the number. Be concrete: cite the member's offer/audience and the partner's specifics. Address the member as "you" and the partner as "they".
- whyYou: why YOUR interest is this high/low — how strong a fit they are for your audience, offer and goals (and what holds it back).
- whyThem: why THEIR interest is this high/low — how likely they are to actually engage given their size, momentum, incentives, and reachability.
- whyFit: why the combined Trust & Fit is this high/low — the deeper read across overlap, capability, mutual value and credibility, plus the biggest blocker or risk to watch.`;

/** Facts about the member (the party seeking the partnership). */
export type TrustFitMember = {
  audienceSize?: string;
  identityRole?: string;
  niche?: string;
  offer?: string;
  strengths?: string[];
  targetPartner?: string;
};

/** The prospective partner. `company` / `person` / `reasoning` are opaque,
 *  app-shaped fact blobs serialized verbatim into the prompt. */
export type TrustFitPartner = {
  company?: unknown;
  person?: unknown;
  reasoning?: unknown;
};

export type TrustFitInput = {
  member: TrustFitMember;
  partner: TrustFitPartner;
  /** The numbers the model is asked to justify, so each reason fits the actual
   *  score the host already computed elsewhere. */
  priorScores?: {
    theirReceptiveness?: number;
    yourFit?: number;
  };
};

export type TrustFitDimensions = {
  audienceOverlap: number;
  capability: number;
  credibility: number;
  mutualValue: number;
};

export type TrustFitReasons = {
  fit: string;
  them: string;
  you: string;
};

export type TrustFitResult = {
  dimensions: TrustFitDimensions;
  rationale: string;
  reasons: TrustFitReasons;
};

/** AI-score the four Trust & Fit dimensions for a partner against a member, with
 *  three per-score reasons. Throws on model/validation failure — the host wraps
 *  this with whatever fallback (e.g. a heuristic from existing signals) it wants. */
export const scoreTrustFit = async (
  input: TrustFitInput,
  ctx: PartnershipContext,
): Promise<TrustFitResult> => {
  const payload = JSON.stringify({
    member: input.member,
    partner: input.partner,
    scores: {
      theirReceptiveness: input.priorScores?.theirReceptiveness,
      yourFit: input.priorScores?.yourFit,
    },
  });

  const { object } = await ctx.generateObject({
    feature: "trustFit",
    maxTokens: TRUST_FIT_MAX_TOKENS,
    messages: [{ content: payload, role: "user" }],
    model: ctx.model ?? DEFAULT_MODEL,
    schema: z.toJSONSchema(TrustFitSchema),
    systemPrompt: SYSTEM,
    toolDescription:
      "Return four Trust & Fit dimension scores + three per-score reasons.",
    toolName: "trust_fit_score",
    validate: (raw) => TrustFitSchema.parse(raw),
  });

  const reasons: TrustFitReasons = {
    fit: object.whyFit.slice(0, REASON_MAX),
    them: object.whyThem.slice(0, REASON_MAX),
    you: object.whyYou.slice(0, REASON_MAX),
  };

  return {
    dimensions: {
      audienceOverlap: object.audienceOverlap,
      capability: object.capability,
      credibility: object.credibility,
      mutualValue: object.mutualValue,
    },
    rationale: reasons.fit,
    reasons,
  };
};
