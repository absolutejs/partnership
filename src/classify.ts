import { z } from "zod";
import { clampDeep } from "./bounded";
import type { PartnershipContext } from "./ai";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const CLASSIFY_MAX_TOKENS = 600;

/** The relationship buckets a sourced company can fall into, relative to the
 *  member's business. Pass your own labels via `relationshipTypes` if your
 *  taxonomy differs — the result's `relationshipType` is typed to whatever you
 *  pass. */
export const DEFAULT_RELATIONSHIP_TYPES = [
  "complementary",
  "adjacent",
  "competitor",
] as const;

export type RelationshipType = (typeof DEFAULT_RELATIONSHIP_TYPES)[number];

const buildSchema = <T extends string>(
  relationshipTypes: readonly [T, ...T[]],
) =>
  z.object({
    // Plain strings (no `.max()`) so a long name/strategy never REJECTS the
    // whole classification; min(1) stays — we DO need a name. clampDeep bounds
    // the lengths.
    officialName: z.string().min(1),
    outServeStrategy: z.string().optional(),
    receptivenessScore: z.number().min(0).max(1),
    relationshipType: z.enum(relationshipTypes),
    // Official primary domain (e.g. "vercel.com") — used to fix wrong logos.
    website: z.string().nullish(),
  });

export type RelationshipClassification<T extends string = RelationshipType> = {
  officialName: string;
  outServeStrategy?: string;
  receptivenessScore: number;
  relationshipType: T;
  website?: string | null;
};

const SYSTEM = `You classify how a sourced company relates to a member's business, for a partnerships CRM. Use ONLY the supplied facts plus well-known public knowledge about the company. Return:
- officialName: the company's real brand capitalization (e.g. "StackBlitz", "Vapi", "val.town"). If you don't recognize the company, return the supplied name with sensible casing — never all-lowercase unless that is the real brand styling.
- website: the company's official primary domain only — no protocol, no "www" (e.g. "vercel.com", "contra.com", "stackblitz.com"). This powers their logo, so get it right for companies you know. Return null if you genuinely don't know it.
- relationshipType: "complementary" (serves the same customers with a non-overlapping offer — a natural partner), "adjacent" (nearby space, partial overlap), or "competitor" (sells a directly competing product to the same buyers — a direct partnership is unlikely).
- receptivenessScore: 0.0–1.0 — how likely this company is to actually engage if approached. Smaller, reachable companies score higher; large/slow ones and competitors score lower. This is independent of how good a target they are.
- outServeStrategy: REQUIRED for "competitor" (useful for "adjacent") — the concrete play to win or out-serve their clients instead of partnering (integration, migration path, an underserved segment). Omit for clean "complementary" matches.`;

/** Facts about the company being classified. */
export type ClassifyCompany = {
  employeeCount?: number | null;
  industry?: string | null;
  name?: string;
  size?: string | null;
  summary?: string | null;
  website?: string | null;
};

/** Facts about the member the company is being classified against. */
export type ClassifyMember = {
  identityRole?: string;
  niche?: string;
  offerSummary?: string;
  targetBrand?: string;
};

export type ClassifyInput<T extends string = RelationshipType> = {
  company: ClassifyCompany;
  member: ClassifyMember;
  /** Override the relationship taxonomy. Defaults to complementary/adjacent/competitor.
   *  The returned `relationshipType` is typed to the labels you pass here. */
  relationshipTypes?: readonly [T, ...T[]];
};

/** Classify one sourced company against a member's profile (relationship type,
 *  official name + domain, receptiveness, and a competitor out-serve play).
 *  Throws on failure so the host can skip the row and keep going. */
export const classifyRelationship = async <T extends string = RelationshipType>(
  input: ClassifyInput<T>,
  ctx: PartnershipContext,
): Promise<RelationshipClassification<T>> => {
  const relationshipTypes: readonly [T, ...T[]] =
    input.relationshipTypes ??
    (DEFAULT_RELATIONSHIP_TYPES as unknown as readonly [T, ...T[]]);
  const schema = buildSchema(relationshipTypes);

  const payload = {
    company: {
      employeeCount: input.company.employeeCount,
      industry: input.company.industry,
      name: input.company.name,
      size: input.company.size,
      summary: input.company.summary,
      website: input.company.website,
    },
    member: {
      identityRole: input.member.identityRole,
      niche: input.member.niche,
      offerSummary: input.member.offerSummary,
      targetBrand: input.member.targetBrand,
    },
  };

  const { object } = await ctx.generateObject({
    feature: "classifyMatch",
    maxTokens: CLASSIFY_MAX_TOKENS,
    messages: [{ content: JSON.stringify(payload), role: "user" }],
    model: ctx.model ?? DEFAULT_MODEL,
    schema: z.toJSONSchema(schema),
    systemPrompt: SYSTEM,
    toolDescription:
      "Return the company's official name and partnership relationship classification.",
    toolName: "classify_match",
    validate: (raw) => schema.parse(raw),
  });

  return clampDeep(object);
};
