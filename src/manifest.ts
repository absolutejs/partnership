import { defineManifest, toolFactory } from "@absolutejs/manifest";
import { Type } from "@sinclair/typebox";
import type { ResearchContext } from "./ai";
import { scoreTrustFit } from "./trustFit";
import { verifyPartner } from "./verify";

const tool = toolFactory<ResearchContext>();

/* Every primitive is a pure function of typed input plus the injected
 * ResearchContext (the host's structured-generation call, an optional
 * web-research call, and a model override). The context IS the runtime and
 * `model` is the only serializable knob. */
const memberInput = {
  audienceSizeTier: Type.Optional(Type.String({ examples: ["10k"] })),
  identityRole: Type.Optional(Type.String()),
  niche: Type.Optional(Type.String({ examples: ["devtools"] })),
  offerSummary: Type.Optional(Type.String()),
  strengths: Type.Optional(Type.Array(Type.String())),
};

export const manifest = defineManifest<ResearchContext, ResearchContext>()({
  contract: 1,
  identity: {
    accent: "#f43f5e",
    category: "growth",
    description:
      "In-house partnership & relationship intelligence — AI reasoning over the partnership lifecycle so you don't pay a deal-copilot SaaS per seat: trust & fit scoring, relationship classification, connection framing, partner verification dossiers (web-grounded when a research call is injected), meeting prep, competitor analysis, outreach drafting, nudges, and stage plans. Every primitive is a pure function of typed input plus your injected AI call; the package never picks a provider or touches your ledger.",
    docsUrl: "https://github.com/absolutejs/partnership",
    name: "@absolutejs/partnership",
    tagline: "Judge, verify, and plan business partnerships with AI.",
  },
  settings: Type.Object({
    model: Type.Optional(
      Type.String({
        description:
          "Override the AI model used by the partnership primitives. Leave empty for each primitive's default.",
        title: "AI model",
        "x-group": "advanced",
      }),
    ),
  }),
  tools: {
    score_trust_fit: tool.runtime({
      annotations: { openWorldHint: true, readOnlyHint: true },
      description:
        "Score a prospective partner on four 0–1 dimensions (audience overlap, capability, mutual value, credibility) with a per-score reason for you, for them, and for the fit.",
      handler: async ({ member, partner, priorScores }, ctx) =>
        JSON.stringify(
          await scoreTrustFit(
            {
              member: {
                audienceSize: member?.audienceSizeTier,
                identityRole: member?.identityRole,
                niche: member?.niche,
                offer: member?.offerSummary,
                strengths: member?.strengths,
              },
              partner: partner ?? {},
              priorScores,
            },
            ctx,
          ),
        ),
      input: Type.Object({
        member: Type.Optional(
          Type.Object(memberInput, {
            description: "You — the side evaluating the partnership.",
          }),
        ),
        partner: Type.Optional(
          Type.Object(
            {
              company: Type.Optional(
                Type.Record(Type.String(), Type.Unknown(), {
                  description: "Known facts about the partner company.",
                }),
              ),
              person: Type.Optional(
                Type.Record(Type.String(), Type.Unknown(), {
                  description: "Known facts about the contact person.",
                }),
              ),
              reasoning: Type.Optional(
                Type.Record(Type.String(), Type.Unknown(), {
                  description: "Why this match was suggested.",
                }),
              ),
            },
            { description: "The prospective partner." },
          ),
        ),
        priorScores: Type.Optional(
          Type.Object({
            theirReceptiveness: Type.Optional(
              Type.Number({ maximum: 1, minimum: 0 }),
            ),
            yourFit: Type.Optional(Type.Number({ maximum: 1, minimum: 0 })),
          }),
        ),
      }),
    }),
    verify_partner: tool.runtime({
      annotations: { openWorldHint: true, readOnlyHint: true },
      description:
        "Build a structured due-diligence dossier on a prospective partner: credibility score with findings and risks, delivery track record, audience overlap, partnership economics, and open questions. Web-grounded when the host wired a research call; knowledge-only otherwise.",
      handler: async ({ member, partner, partnership }, ctx) =>
        JSON.stringify(
          await verifyPartner(
            { member: member ?? {}, partner, partnership },
            ctx,
          ),
        ),
      input: Type.Object({
        member: Type.Optional(Type.Object(memberInput)),
        partner: Type.Object({
          company: Type.Optional(
            Type.Record(Type.String(), Type.Unknown()),
          ),
          employeeCount: Type.Optional(Type.Integer({ minimum: 0 })),
          industry: Type.Optional(Type.String()),
          linkedinUrl: Type.Optional(Type.String()),
          name: Type.String({ minLength: 1 }),
          website: Type.Optional(Type.String({ examples: ["acme.com"] })),
        }),
        partnership: Type.Optional(
          Type.Object({
            estimatedValue: Type.Optional(Type.Unknown()),
            partnershipBucket: Type.Optional(Type.Unknown()),
            revenueModel: Type.Optional(Type.Unknown()),
          }),
        ),
      }),
    }),
  },
  wiring: [
    {
      description:
        "Inject your structured-generation call once (and optionally a web-research call for verification/meeting-prep grounding); every primitive rides it.",
      id: "default",
      server: {
        code: [
          "const partnershipContext: ResearchContext = {",
          "\t// TODO: wire your structured-generation call with provider and",
          "\t// metering bound in (e.g. @absolutejs/ai's generateObjectAI).",
          "\tgenerateObject: async () => {",
          "\t\tthrow new Error('partnership: generateObject not wired');",
          "\t},",
          "\tmodel: ${settings.model}",
          "\t// Optional: ground verification and meeting prep on live data.",
          "\t// research: (system, user) => webResearch(system, user)",
          "};",
        ].join("\n"),
        imports: [
          {
            from: "@absolutejs/partnership",
            names: ["ResearchContext"],
            typeOnly: true,
          },
        ],
        placement: "module-scope",
      },
      title: "Inject your AI call",
    },
  ],
});
