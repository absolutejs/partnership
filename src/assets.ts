import { z } from "zod";
import type { PartnershipContext } from "./ai";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const ASSET_MAX_TOKENS = 2200;

// The canonical enterprise partnership-asset library. The KEY is the stable
// `assetType` (stored verbatim by hosts); `label` is the human name; `guidance`
// is the per-type structure the model must follow so each document type comes
// out shaped like the real thing — not generic prose. Adding a type here is the
// ONE place to extend the catalog; the union + the runtime list derive from it.
export const PARTNERSHIP_ASSET_CATALOG = {
  // ── Partner-facing sales & marketing ──────────────────────────────────────
  one_pager: {
    guidance:
      "A single-page partner overview. Sections: a punchy headline value proposition, who-we-are (1-2 lines), the partnership opportunity, mutual value (what each side gives and gets), proof points, and one clear call to action. Scannable, not dense.",
    label: "Partnership One-Pager",
  },
  pitch_deck: {
    guidance:
      "A slide-by-slide pitch deck outline — ONE markdown H2 per slide (Title, Problem, Solution, Why Partner With Us, Market, Mutual Value, Proof, The Ask, Next Steps). 2-4 bullet talking points per slide. Presenter-ready, not paragraphs.",
    label: "Pitch Deck Outline",
  },
  executive_summary: {
    guidance:
      "A one-page executive brief for a decision-maker. Lead with the recommendation, then the opportunity, the strategic rationale, the expected impact, and the decision/ask. Crisp, no filler.",
    label: "Executive Summary",
  },
  sell_sheet: {
    guidance:
      "A sales-enablement sheet a partner's reps can use. Sections: what it is, key benefits, ideal customer, talking points, objection handling, and how to position. Tight and tactical.",
    label: "Sell Sheet",
  },
  joint_value_prop: {
    guidance:
      "Articulate the combined value the two companies create together that neither delivers alone. Sections: better-together thesis, target customer, combined offering, differentiation, and proof.",
    label: "Joint Value Proposition",
  },
  case_study_outline: {
    guidance:
      "Outline a partnership case study: context and challenge, the partnership approach, what was done, the results (ONLY from supplied facts), and the takeaway.",
    label: "Case Study Outline",
  },
  press_release: {
    guidance:
      "A standard joint press release: headline, dateline, lead paragraph (who/what/why), 1-2 supporting paragraphs, a clearly-LABELED placeholder quote from each company, boilerplate 'About' blurbs, and a contact line. Never fabricate quotes or metrics.",
    label: "Joint Press Release",
  },
  partnership_faq: {
    guidance:
      "Anticipated questions and clear answers about the partnership, grouped by audience (internal teams, customers). 6-12 Q&As, each grounded in the supplied facts.",
    label: "Partnership FAQ",
  },
  // ── Proposal & commercial ─────────────────────────────────────────────────
  proposal: {
    guidance:
      "A formal partnership proposal. Sections: overview, objectives, proposed scope of partnership, roles & responsibilities, commercial model, success metrics, timeline, and next steps.",
    label: "Partnership Proposal",
  },
  business_case: {
    guidance:
      "An ROI-focused justification. Sections: problem/opportunity, the proposed partnership, costs/investment, expected return & benefits (quantify ONLY from supplied facts), risks & mitigations, and a recommendation.",
    label: "Business Case",
  },
  deal_memo: {
    guidance:
      "An internal deal memo: partnership thesis, the offer, mutual value, commercial model, risks, and recommended next steps.",
    label: "Deal Memo",
  },
  commitment_brief: {
    guidance:
      "A brief that secures internal commitment: the opportunity, exactly what we're asking the organization to commit, the expected return, and the decision needed.",
    label: "Commitment Brief",
  },
  // ── Legal-style drafts (always non-binding, for legal review) ──────────────
  loi: {
    guidance:
      "A NON-BINDING Letter of Intent draft. Open with a one-line note that this is a non-binding draft for legal review. Sections: parties, purpose & intent, proposed key terms (high level), confidentiality/exclusivity intent, an explicit non-binding clause, and signature blocks.",
    label: "Letter of Intent (Draft)",
  },
  mou: {
    guidance:
      "A NON-BINDING Memorandum of Understanding draft. Sections: parties, background, purpose, scope of cooperation, roles & responsibilities, term, and an explicit statement that it is a non-binding draft pending legal review and a formal agreement.",
    label: "Memorandum of Understanding (Draft)",
  },
  term_sheet: {
    guidance:
      "A high-level NON-BINDING term sheet draft. Present proposed terms as a clean list/table: structure, commercials/splits, term & exclusivity, responsibilities, IP, and termination. Label clearly as a non-binding draft for negotiation and legal review.",
    label: "Term Sheet (Draft)",
  },
  // ── Execution & ongoing management ────────────────────────────────────────
  first_win_sprint: {
    guidance:
      "A 30-day plan to land an early joint win: week-by-week milestones, owners, deliverables, and the success metric.",
    label: "First-Win Sprint (30-day plan)",
  },
  enablement_guide: {
    guidance:
      "A guide to enable the partner's team: partnership overview, who-does-what, how to position & sell, key messaging, resources, and the engagement/escalation process.",
    label: "Partner Enablement Guide",
  },
  qbr: {
    guidance:
      "A Quarterly Business Review outline — one markdown H2 per section: partnership goals & status, what shipped, results vs targets (ONLY supplied facts), wins & challenges, and the plan/asks for next quarter. Bullets under each.",
    label: "Quarterly Business Review",
  },
  // ── Outreach copy ─────────────────────────────────────────────────────────
  outreach_email: {
    guidance:
      "A concise outreach email opening the partnership conversation: a specific subject line (as the title), a warm personalized opener tied to the partner, the mutual-value hook, ONE clear ask, and a sign-off. Short and human.",
    label: "Outreach Email",
  },
  follow_up_email: {
    guidance:
      "A brief, friendly follow-up email (after no response or after a meeting): reference the prior touch, restate the value succinctly, propose a low-friction next step, and sign off. The subject line is the title.",
    label: "Follow-Up Email",
  },
} satisfies Record<string, { guidance: string; label: string }>;

/** Stable key for a partnership document kind. */
export type PartnershipAssetType = keyof typeof PARTNERSHIP_ASSET_CATALOG;

/** Runtime list of every asset type (e.g. for host validation / UI menus). */
export const PARTNERSHIP_ASSET_TYPES = Object.keys(
  PARTNERSHIP_ASSET_CATALOG,
) as PartnershipAssetType[];

/** Narrow an arbitrary string to a known asset type, or null. */
export const parsePartnershipAssetType = (
  value: string,
): PartnershipAssetType | null =>
  value in PARTNERSHIP_ASSET_CATALOG ? (value as PartnershipAssetType) : null;

/** Length bounds for the asset, supplied by the host to match its UI/storage. */
export type AssetBounds = {
  markdownMax: number;
  markdownMin: number;
  titleMax: number;
  titleMin: number;
};

export type PartnershipAsset = {
  markdown: string;
  title: string;
};

export type AssetInput = {
  /** Stable key for the document kind — a known catalog type. */
  assetType: PartnershipAssetType;
  /** Human label override. Defaults to the catalog label for `assetType`. */
  assetTypeLabel?: string;
  bounds: AssetBounds;
  /** Match facts, serialized verbatim into the prompt. */
  match: Record<string, unknown>;
  /** Member/profile facts, serialized verbatim into the prompt. */
  profile: Record<string, unknown>;
};

const SYSTEM = `You generate concise, enterprise-grade partnership documents for partnership teams. Follow the STRUCTURE GUIDANCE for the requested document type exactly. Use only the supplied facts — do not invent metrics, customer names, quotes, guarantees, meeting dates, or legal terms (use clearly-labeled placeholders where a fact is missing). Return clean markdown with useful headings, bullets, and specific, grounded content.`;

const assetSchema = (bounds: AssetBounds) =>
  z.object({
    markdown: z.string().min(bounds.markdownMin).max(bounds.markdownMax),
    title: z.string().min(bounds.titleMin).max(bounds.titleMax),
  });

/** Draft a partnership document of any catalog type — returns a title + markdown
 *  body. Throws on failure so the host can drop in its own templated fallback. */
export const draftPartnershipAsset = async (
  input: AssetInput,
  ctx: PartnershipContext,
): Promise<PartnershipAsset> => {
  const schema = assetSchema(input.bounds);
  const entry = PARTNERSHIP_ASSET_CATALOG[input.assetType];

  const { object } = await ctx.generateObject({
    feature: "partnershipAssets",
    maxTokens: ASSET_MAX_TOKENS,
    messages: [
      {
        content: JSON.stringify({
          assetType: input.assetType,
          assetTypeLabel: input.assetTypeLabel ?? entry.label,
          match: input.match,
          profile: input.profile,
          structureGuidance: entry.guidance,
        }),
        role: "user",
      },
    ],
    model: ctx.model ?? DEFAULT_MODEL,
    schema: z.toJSONSchema(schema),
    systemPrompt: SYSTEM,
    toolDescription: "Return a partnership asset title and markdown body.",
    toolName: "partnership_asset",
    validate: (raw) => schema.parse(raw),
  });

  return object;
};

export type AssetEditInput = {
  assetType: PartnershipAssetType;
  assetTypeLabel?: string;
  bounds: AssetBounds;
  /** The current document body to revise. */
  currentMarkdown: string;
  /** The current document title. */
  currentTitle: string;
  /** The member's plain-language edit request. */
  instructions: string;
  /** Optional fresh match facts to ground new content. */
  match?: Record<string, unknown>;
  /** Optional fresh member/profile facts to ground new content. */
  profile?: Record<string, unknown>;
};

const EDIT_SYSTEM = `You revise an existing partnership document per the member's instructions. Keep everything that already works; apply ONLY the requested changes while honoring the document type's structure guidance. Do not invent facts (use clearly-labeled placeholders for anything missing). Return the FULL revised document — title + complete markdown body — not a diff or a description of changes.`;

/** Edit an existing partnership document per member instructions — returns the
 *  full revised title + markdown. Throws on failure so the host can fall back to
 *  the unchanged document. */
export const editPartnershipAsset = async (
  input: AssetEditInput,
  ctx: PartnershipContext,
): Promise<PartnershipAsset> => {
  const schema = assetSchema(input.bounds);
  const entry = PARTNERSHIP_ASSET_CATALOG[input.assetType];

  const { object } = await ctx.generateObject({
    feature: "partnershipAssetEdit",
    maxTokens: ASSET_MAX_TOKENS,
    messages: [
      {
        content: JSON.stringify({
          assetType: input.assetType,
          assetTypeLabel: input.assetTypeLabel ?? entry.label,
          currentMarkdown: input.currentMarkdown,
          currentTitle: input.currentTitle,
          instructions: input.instructions,
          match: input.match,
          profile: input.profile,
          structureGuidance: entry.guidance,
        }),
        role: "user",
      },
    ],
    model: ctx.model ?? DEFAULT_MODEL,
    schema: z.toJSONSchema(schema),
    systemPrompt: EDIT_SYSTEM,
    toolDescription: "Return the full revised partnership asset title and markdown.",
    toolName: "partnership_asset",
    validate: (raw) => schema.parse(raw),
  });

  return object;
};
