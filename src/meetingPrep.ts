import { z } from "zod";
import { clampDeep } from "./bounded";
import type { ResearchContext } from "./ai";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const SYNTH_MAX_TOKENS = 1800;

// Plain strings/arrays (no `.max()`) so a slightly-long field never REJECTS the
// whole brief — the prompt guides lengths and clampDeep bounds the result.
const PrepSchema = z.object({
  avoid: z.array(z.string()),
  objections: z.array(
    z.object({
      objection: z.string(),
      response: z.string(),
    }),
  ),
  talkingPoints: z.array(z.string()),
  theAsk: z.string(),
  whatsNew: z.array(z.string()),
  whereYouStand: z.string(),
  whoTheyAre: z.string(),
});

export type MeetingPrepBrief = z.infer<typeof PrepSchema> & {
  lastCall?: string;
  researchedAt: string;
};

export type MeetingPrepMember = {
  audienceSizeTier?: string;
  goal90d?: string;
  identityRole?: string;
  niche?: string;
  offerSummary?: string;
  strengths?: string[];
  targetBrand?: string;
};

export type MeetingPrepPartner = {
  company?: unknown;
  decisionMakerPath?: unknown;
  /** Industry hint used only to sharpen the research query. */
  industry?: string | null;
  name: string;
  person?: unknown;
  personBio?: unknown;
};

export type MeetingPrepPartnership = {
  estimatedValue?: unknown;
  matchRationale?: unknown;
  relationshipType?: unknown;
  revenueModel?: unknown;
  trustFit?: unknown;
  verification?: unknown;
};

export type MeetingPrepInput = {
  member: MeetingPrepMember;
  partner: MeetingPrepPartner;
  partnership?: MeetingPrepPartnership;
  /** A summary of touchpoint history, or a note that this is a first contact. */
  relationship?: string;
  /** The referee's prior-call recap, in its own words (not AI-rewritten). */
  priorCall?: string | null;
};

const RESEARCH_SYSTEM = `You are a meeting-prep researcher. Search the web for the most CURRENT, specific, public information about a company/person so someone walking into a conversation with them sounds informed and timely. Focus on: what they've shipped, launched, announced, raised, hired, or said publicly in the last few months; notable recent posts/content; momentum and direction. Report concrete, dated findings. Do not invent — if you find nothing recent, say so.`;

const SYNTH_SYSTEM = `You write a tight pre-conversation prep brief for a member about to reach out to or meet a prospective partner. The goal: walk in informed, relevant, and ready to advance the relationship. Use the supplied research, match reasoning, verification dossier, trust signals, relationship history, and any prior call. Be concrete and specific to THIS partner — no generic sales advice. Output:
- whoTheyAre: 1-2 sentences on who they are and what matters about them for this conversation.
- whatsNew: timely hooks from recent public activity the member can open with or reference. 2-5 items, each concrete. If research found nothing recent, return an empty list rather than inventing.
- whereYouStand: 1-2 sentences on the current state of the relationship from the touchpoint history (or that this is a first contact).
- talkingPoints: the strongest, specific points to make — tied to the member's offer and the mutual fit. 3-5 items.
- theAsk: the ONE concrete outcome to push for in this conversation (a next step, a commitment, an intro). One sentence.
- avoid: what NOT to lead with or pitch — sensitivities, areas they're strong/defensible, things still unverified. 2-4 items.
- objections: the likely pushbacks this specific partner will raise, each with a crisp suggested response. 2-4 items.
No fluff, no fabrication. This is a working brief, not a pitch deck.`;

const researchPrompt = (name: string, industry?: string | null) =>
  `Find the most CURRENT public information about "${name}"${
    industry ? ` (industry: ${industry})` : ""
  } for a meeting prep brief: recent launches, announcements, funding, hires, notable posts/content, and momentum in the last few months. Report concrete, dated findings; if nothing recent is found, say so.`;

/** Web-research a partner's recency and synthesize a structured pre-conversation
 *  prep brief from the match, verification, trust signals, and relationship
 *  history. Uses the injected `research` call when present; otherwise synthesizes
 *  from knowledge. */
export const generateMeetingPrep = async (
  input: MeetingPrepInput,
  ctx: ResearchContext,
): Promise<MeetingPrepBrief> => {
  const { partner } = input;
  const research = ctx.research
    ? await ctx.research(
        RESEARCH_SYSTEM,
        researchPrompt(partner.name, partner.industry),
      )
    : null;

  const { object } = await ctx.generateObject({
    feature: "meetingPrep",
    maxTokens: SYNTH_MAX_TOKENS,
    messages: [
      {
        content: JSON.stringify({
          member: input.member,
          partner: {
            company: partner.company,
            decisionMakerPath: partner.decisionMakerPath,
            name: partner.name,
            person: partner.person,
            personBio: partner.personBio,
          },
          partnership: {
            estimatedValue: input.partnership?.estimatedValue,
            matchRationale: input.partnership?.matchRationale,
            relationshipType: input.partnership?.relationshipType,
            revenueModel: input.partnership?.revenueModel,
            trustFit: input.partnership?.trustFit,
            verification: input.partnership?.verification,
          },
          priorCall: input.priorCall ?? null,
          relationship: input.relationship,
          research:
            research ?? "(no live research available — use public knowledge)",
        }),
        role: "user",
      },
    ],
    model: ctx.model ?? DEFAULT_MODEL,
    schema: z.toJSONSchema(PrepSchema),
    systemPrompt: SYNTH_SYSTEM,
    toolDescription: "Return the structured pre-conversation prep brief.",
    toolName: "meeting_prep_brief",
    validate: (raw) => PrepSchema.parse(raw),
  });

  // Clamp only the AI output; lastCall is passthrough input, left intact.
  return {
    ...clampDeep(object),
    lastCall: input.priorCall ?? undefined,
    researchedAt: new Date().toISOString(),
  };
};
