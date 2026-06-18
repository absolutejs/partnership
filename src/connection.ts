import { z } from "zod";
import { clampDeep } from "./bounded";
import type { PartnershipContext } from "./ai";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const SYNTH_MAX_TOKENS = 700;

// Plain strings (no `.max()`) so a slightly-long field never REJECTS the whole
// framing — the prompt guides lengths and clampDeep bounds the result.
const ConnectionSchema = z.object({
  connectionWhy: z.string(),
  conversationStarter: z.string(),
  mutualValue: z.string(),
  sharedGround: z.string(),
});

export type ConnectionFraming = z.infer<typeof ConnectionSchema>;

/** The specific person the member wants to reach. */
export type ConnectionPerson = {
  company?: string;
  fullName?: string;
  jobTitle?: string;
  why?: string;
};

/** The member doing the reaching. */
export type ConnectionMember = {
  audienceSizeTier?: string;
  goal90d?: string;
  identityRole?: string;
  niche?: string;
  offerSummary?: string;
  strengths?: string[];
};

export type ConnectionInput = {
  member: ConnectionMember;
  person: ConnectionPerson;
};

const SYSTEM = `You frame a person-to-person connection for a member who wants to reach a specific individual (often a decision-maker at a company they're pursuing). Ground everything in the supplied facts about the member and the person — do NOT invent biography. Output:
- connectionWhy: 1-2 sentences on why THIS member and THIS person specifically should know each other.
- sharedGround: what they genuinely have in common (space, audience, mission, prior overlap) — concrete, not generic.
- mutualValue: the two-sided value — what each side gains from the relationship.
- conversationStarter: one concrete, natural opening line the member could actually send to this person.
No fluff, no flattery, no fabrication.`;

/** AI connection framing (why-connect / shared-ground / mutual-value /
 *  conversation-starter) for a specific person, from the member's POV. Throws on
 *  failure. */
export const frameConnection = async (
  input: ConnectionInput,
  ctx: PartnershipContext,
): Promise<ConnectionFraming> => {
  const { object } = await ctx.generateObject({
    feature: "personConnection",
    maxTokens: SYNTH_MAX_TOKENS,
    messages: [
      {
        content: JSON.stringify({ member: input.member, person: input.person }),
        role: "user",
      },
    ],
    model: ctx.model ?? DEFAULT_MODEL,
    schema: z.toJSONSchema(ConnectionSchema),
    systemPrompt: SYSTEM,
    toolDescription: "Return the person-to-person connection framing.",
    toolName: "person_connection",
    validate: (raw) => ConnectionSchema.parse(raw),
  });

  return clampDeep(object);
};
