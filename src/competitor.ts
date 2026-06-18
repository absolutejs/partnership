import { z } from "zod";
import { clampDeep } from "./bounded";
import type { ResearchContext } from "./ai";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const SYNTH_MAX_TOKENS = 1600;

// Plain strings/arrays (no `.max()`) so a slightly-long field never REJECTS the
// whole analysis — the prompt guides lengths and clampDeep bounds the result.
const AnalysisSchema = z.object({
  notWorthChasing: z.array(z.string()),
  painPoints: z.array(z.string()),
  summary: z.string(),
  uniqueBenefits: z.array(z.string()),
});

export type CompetitorAnalysis = z.infer<typeof AnalysisSchema> & {
  researchedAt: string;
};

export type CompetitorCompany = {
  industry?: string | null;
  name?: string;
  summary?: string | null;
};

export type CompetitorMember = {
  identityRole?: string;
  niche?: string;
  offerSummary?: string;
  strengths?: string[];
};

export type CompetitorInput = {
  company: CompetitorCompany;
  member: CompetitorMember;
};

const RESEARCH_SYSTEM = `You are a competitive-intelligence researcher. Search the web for honest, specific, current information about a company's product. Focus on: real customer complaints and pain points (review sites, Reddit, forums, X/Twitter), what the product is genuinely strong at and loved for, its pricing, and its market positioning. Report concrete findings — quotes of the gist, recurring themes, specific gaps. Do not invent. If you can't find something, say so.`;

const SYNTH_SYSTEM = `You turn competitor research into a focused, honest strategy for a member who runs a competing or adjacent business. Use the supplied research; where it's thin, fall back to well-known public knowledge. Output four things:
- summary: 1-2 sentences on the competitive dynamic between the member and this company.
- painPoints: specific places the competitor's customers are underserved or frustrated — the openings where the member can win or out-serve them. Concrete, not generic.
- notWorthChasing: areas where the competitor is genuinely strong/defensible. Advise the member NOT to compete head-on here, to stay focused. This keeps them guided, not discouraged.
- uniqueBenefits: how the member can differentiate / where they realistically win, given their niche and strengths.
Each list item is ONE concrete sentence. 3-6 items per list. No fluff, no fabrication, no disparaging language — this is strategy, not a hit piece.`;

const researchPrompt = (name: string, industry?: string | null) =>
  `Research the company "${name}"${
    industry ? ` (industry: ${industry})` : ""
  }. Find, with specifics: (1) the most common complaints and pain points their customers report, (2) what the product is genuinely strong at and well-liked for, (3) their pricing and positioning. Report concrete, current findings.`;

/** Web-research a competitor and synthesize a member-specific strategy (openings
 *  to win, where not to compete, how to differentiate). Uses the injected
 *  `research` call when present; otherwise synthesizes from knowledge. */
export const analyzeCompetitor = async (
  input: CompetitorInput,
  ctx: ResearchContext,
): Promise<CompetitorAnalysis> => {
  const name = input.company.name ?? "this company";
  const research = ctx.research
    ? await ctx.research(RESEARCH_SYSTEM, researchPrompt(name, input.company.industry))
    : null;

  const { object } = await ctx.generateObject({
    feature: "competitorAnalysis",
    maxTokens: SYNTH_MAX_TOKENS,
    messages: [
      {
        content: JSON.stringify({
          company: {
            industry: input.company.industry,
            name,
            summary: input.company.summary,
          },
          member: input.member,
          research:
            research ?? "(no live research available — use public knowledge)",
        }),
        role: "user",
      },
    ],
    model: ctx.model ?? DEFAULT_MODEL,
    schema: z.toJSONSchema(AnalysisSchema),
    systemPrompt: SYNTH_SYSTEM,
    toolDescription: "Return the competitor strategy lists.",
    toolName: "competitor_analysis",
    validate: (raw) => AnalysisSchema.parse(raw),
  });

  return clampDeep({ ...object, researchedAt: new Date().toISOString() });
};
