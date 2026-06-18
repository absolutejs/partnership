import { z } from "zod";
import { clampDeep } from "./bounded";
import type { ResearchContext } from "./ai";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const SYNTH_MAX_TOKENS = 1800;

// Plain strings/arrays (no `.max()`) so the schema round-trips to JSON Schema
// and the model is never REJECTED for a slightly-long field — the prompt guides
// the lengths and clampDeep bounds the result. (See bounded.ts / trustFit.ts.)
const Score = z.number().min(0).max(1);
const DossierSchema = z.object({
  audienceOverlap: z.object({
    rationale: z.string(),
    score: Score,
  }),
  credibility: z.object({
    findings: z.array(z.string()),
    risks: z.array(z.string()),
    score: Score,
  }),
  economics: z.object({
    assessment: z.string(),
    risks: z.array(z.string()),
  }),
  openQuestions: z.array(z.string()),
  summary: z.string(),
  trackRecord: z.array(z.string()),
});

export type VerificationDossier = z.infer<typeof DossierSchema> & {
  researchedAt: string;
};

export type VerifyMember = {
  audienceSizeTier?: string;
  identityRole?: string;
  niche?: string;
  offerSummary?: string;
  strengths?: string[];
};

export type VerifyPartner = {
  /** Opaque company fact blob, serialized verbatim. */
  company?: unknown;
  employeeCount?: number | null;
  /** Industry hint used only to sharpen the research query. */
  industry?: string | null;
  linkedinUrl?: string | null;
  name: string;
  person?: unknown;
  website?: string | null;
};

export type VerifyPartnership = {
  estimatedValue?: unknown;
  partnershipBucket?: unknown;
  revenueModel?: unknown;
};

export type VerifyInput = {
  member: VerifyMember;
  partner: VerifyPartner;
  partnership?: VerifyPartnership;
};

/** Context for `verifyPartner` — a research-grounded primitive. Alias of the
 *  shared `ResearchContext`. */
export type VerificationContext = ResearchContext;

const RESEARCH_SYSTEM = `You are a partnership due-diligence researcher. Search the web for honest, specific, current evidence about whether a company is real, credible, and a safe partner. Focus on: reputation and legitimacy (is this a genuine, operating business), financial health and stability signals, customer satisfaction and complaints (review sites, Reddit, forums, X/Twitter), and delivery / execution track record (do they ship, honor commitments, retain customers). Report concrete findings with specifics. Do not invent. If you can't verify something, say so explicitly — gaps are themselves a finding.`;

const SYNTH_SYSTEM = `You turn partnership due-diligence research into a structured Verification Dossier for a member evaluating a potential partner. This is lifecycle stage 2 (Verification): validate the partner is real and credible, confirm the audiences overlap, and stress-test the partnership economics. Use the supplied research; where it's thin, fall back to well-known public knowledge and be candid about uncertainty. Calibrate scores honestly — do NOT cluster high; a partner you couldn't verify should score lower. Output:
- summary: 1-2 sentences on how credible and verifiable this partner is right now.
- credibility.score: 0.0–1.0 — how real, trustworthy, and verifiable the partner is, given the evidence found.
- credibility.findings: concrete positive evidence of legitimacy / good standing (reputation, longevity, satisfied customers, stability). 3-6 items.
- credibility.risks: concrete red flags, gaps, or unverifiable claims that temper trust. 2-5 items. Be honest, not alarmist.
- trackRecord: specific evidence of delivery / execution — shipped products, honored partnerships, retention, growth. 3-6 items.
- audienceOverlap.score: 0.0–1.0 — how genuinely the member's audience and the partner's audience overlap and would welcome this collaboration, given the member's niche/audience size and the partner's space/size/socials.
- audienceOverlap.rationale: one sentence justifying the overlap score.
- economics.assessment: 1-2 sentences stress-testing the proposed revenue model and estimated value — is the partnership economically sound and two-sided?
- economics.risks: specific economic risks (one-sided value, thin margins, channel conflict, unproven demand). 2-4 items.
- openQuestions: what still needs verifying before fully trusting this partner — references to request, claims to confirm, checks to run. 3-6 items.
Each list item is ONE concrete sentence. No fluff, no fabrication, no disparaging language — this is diligence, not a hit piece.`;

const researchPrompt = (name: string, industry?: string | null) =>
  `Research the company "${name}"${
    industry ? ` (industry: ${industry})` : ""
  } as a potential business partner. Find, with specifics: (1) reputation and whether it's a legitimate, operating business, (2) financial health / stability signals, (3) customer satisfaction and the most common complaints, (4) delivery and execution track record. Report concrete, current findings, and flag anything you cannot verify.`;

/** Web-research a prospective partner and synthesize a structured Verification
 *  Dossier (credibility, track record, audience overlap, economics). Uses the
 *  injected `research` call when present; otherwise synthesizes from knowledge. */
export const verifyPartner = async (
  input: VerifyInput,
  ctx: VerificationContext,
): Promise<VerificationDossier> => {
  const { partner } = input;
  const research = ctx.research
    ? await ctx.research(
        RESEARCH_SYSTEM,
        researchPrompt(partner.name, partner.industry),
      )
    : null;

  const { object } = await ctx.generateObject({
    feature: "verification",
    maxTokens: SYNTH_MAX_TOKENS,
    messages: [
      {
        content: JSON.stringify({
          member: input.member,
          partner: {
            company: partner.company ?? {},
            employeeCount: partner.employeeCount,
            name: partner.name,
            person: partner.person,
            socials: {
              linkedin: partner.linkedinUrl,
              website: partner.website,
            },
          },
          partnership: {
            estimatedValue: input.partnership?.estimatedValue,
            partnershipBucket: input.partnership?.partnershipBucket,
            revenueModel: input.partnership?.revenueModel,
          },
          research:
            research ?? "(no live research available — use public knowledge)",
        }),
        role: "user",
      },
    ],
    model: ctx.model ?? DEFAULT_MODEL,
    schema: z.toJSONSchema(DossierSchema),
    systemPrompt: SYNTH_SYSTEM,
    toolDescription: "Return the structured Verification Dossier.",
    toolName: "verification_dossier",
    validate: (raw) => DossierSchema.parse(raw),
  });

  // Bound the result (never reject) — the prompt guides lengths, this is the net.
  return clampDeep({ ...object, researchedAt: new Date().toISOString() });
};
