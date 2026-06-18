import { z } from "zod";
import { clampDeep } from "./bounded";
import type { PartnershipContext } from "./ai";

// The six post-signature lifecycle planners (Negotiation → Exit). They share a
// shape: synthesize a structured plan for one stage from the member, the
// partner, the economics, the trust signals, the prior-stage plans, and any
// comparable past deals. A small `runPlanner` does the generation; each stage
// owns its schema, prompt, and exact payload so output matches the host's prior
// behavior. (System prompts say "a member" rather than naming any product — the
// uniform normalization applied across this package.)

const DEFAULT_MODEL = "claude-sonnet-4-6";
const SYNTH_MAX_TOKENS = 1800;

// Plain strings/arrays (no `.max()`) so the schema round-trips to JSON Schema
// and a slightly-long field or one extra item never REJECTS the whole plan —
// the prompt guides the lengths/counts and clampDeep bounds the result.
const list = () => z.array(z.string());
const field = () => z.string();

export type PlannerMember = {
  audienceSizeTier?: string;
  goal90d?: string;
  identityRole?: string;
  niche?: string;
  offerSummary?: string;
  strengths?: string[];
};

export type PlannerPartner = {
  company?: unknown;
  name: string;
  person?: unknown;
};

/** Deal economics, passed through verbatim. `revenueImpact` is included by the
 *  deal-structure stage and omitted by the later stages — set only what your
 *  stage carried before. */
export type PlannerEconomics = {
  estimatedValue?: unknown;
  partnershipBucket?: unknown;
  relationshipType?: unknown;
  revenueImpact?: unknown;
  revenueModel?: unknown;
};

type PlannerSpec<T> = {
  feature: string;
  schema: z.ZodType<T>;
  systemPrompt: string;
  toolDescription: string;
  toolName: string;
};

const runPlanner = async <T>(
  spec: PlannerSpec<T>,
  payload: Record<string, unknown>,
  ctx: PartnershipContext,
): Promise<T> => {
  const { object } = await ctx.generateObject({
    feature: spec.feature,
    maxTokens: SYNTH_MAX_TOKENS,
    messages: [{ content: JSON.stringify(payload), role: "user" }],
    model: ctx.model ?? DEFAULT_MODEL,
    schema: z.toJSONSchema(spec.schema),
    systemPrompt: spec.systemPrompt,
    toolDescription: spec.toolDescription,
    toolName: spec.toolName,
    validate: (raw) => spec.schema.parse(raw),
  });

  // Bound the result (never reject) — the prompt guides lengths, this is the net.
  return clampDeep(object);
};

const stamp = () => new Date().toISOString();

// ── Negotiation: deal structure ────────────────────────────────────────────
const DealStructureSchema = z.object({
  escalationPath: field(),
  exclusivity: field(),
  protections: list(),
  revenueSplit: field(),
  roles: list(),
  successMetrics: list(),
  summary: field(),
});

export type DealStructurePlan = z.infer<typeof DealStructureSchema> & {
  recommendedAt: string;
};

export type DealStructureInput = {
  comparables?: string[];
  economics: PlannerEconomics;
  member: PlannerMember;
  partner: PlannerPartner;
  trustFit?: unknown;
  verification?: { audienceOverlap?: unknown; economics?: unknown };
};

const DEAL_STRUCTURE_SYSTEM = `You are a partnership deal architect. Recommend a fair, specific, two-sided deal STRUCTURE for a member entering Negotiation (lifecycle stage 3) with a prospective partner. Ground every term in the supplied economics, verification diligence, trust signals, and any comparable past deals — do NOT invent facts. Be concrete and balanced; protect BOTH parties. Calibrate to the relationship type (complementary vs adjacent) and the trust basis (be more cautious / staged when trust is only "predicted"). Output:
- summary: 1-2 sentences on the recommended shape of the deal and why it's fair.
- revenueSplit: a concrete recommended split or commercial model (actual %s or fee structure) with a one-line rationale tied to the economics.
- exclusivity: a clear stance on exclusivity (none / category / time-boxed) and why — avoid over-committing early.
- successMetrics: the 3-5 specific, measurable outcomes both sides should agree to track.
- roles: who owns what on EACH side — responsibilities, deliverables, cadence. 3-6 items.
- escalationPath: how issues, disputes, or underperformance get raised and resolved. 1-2 sentences.
- protections: the terms/clauses that protect both parties (out clauses, IP/audience ownership, data, payment terms, kill criteria). 3-6 items.
Each list item is ONE concrete sentence. No fluff, no boilerplate legalese, no fabrication — this is a working term sheet a member can negotiate from.`;

/** Recommend a structured, two-sided deal structure, grounded in the economics,
 *  verification, trust score, and comparable past deals. */
export const generateDealStructure = async (
  input: DealStructureInput,
  ctx: PartnershipContext,
): Promise<DealStructurePlan> => {
  const object = await runPlanner(
    {
      feature: "dealStructure",
      schema: DealStructureSchema,
      systemPrompt: DEAL_STRUCTURE_SYSTEM,
      toolDescription: "Return the recommended deal structure.",
      toolName: "deal_structure",
    },
    {
      comparablePastDeals: input.comparables?.length
        ? input.comparables
        : undefined,
      economics: input.economics,
      member: input.member,
      partner: input.partner,
      trustFit: input.trustFit,
      verification: input.verification,
    },
    ctx,
  );

  return { ...object, recommendedAt: stamp() };
};

// ── Launch: go-live plan ─────────────────────────────────────────────────────
const LaunchPlanSchema = z.object({
  coLaunchPlays: list(),
  firstWin: field(),
  goLiveChecklist: list(),
  kpiTracking: list(),
  milestones: z.array(
    z.object({
      owner: z.string(),
      timeframe: z.string(),
      title: z.string(),
    }),
  ),
  summary: field(),
});

export type LaunchPlan = z.infer<typeof LaunchPlanSchema> & {
  plannedAt: string;
};

export type LaunchPlanInput = {
  comparables?: string[];
  dealStructure?: unknown;
  economics: PlannerEconomics;
  member: PlannerMember;
  partner: PlannerPartner;
  trustFit?: unknown;
  verification?: { economics?: unknown };
};

const LAUNCH_PLAN_SYSTEM = `You are a partnership launch lead. Turn a signed deal into a concrete, two-sided GO-LIVE plan for a member entering Launch (lifecycle stage 4). Ground every element in the recommended deal structure (roles, success metrics, splits, exclusivity), the verification economics, the trust signals, and any comparable past launches — do NOT invent facts. The goal of Launch is to take the partnership live and land a measurable FIRST WIN that proves the relationship works. Output:
- summary: 1-2 sentences on what "live" looks like and the target window to land the first win.
- firstWin: the single, specific, measurable first joint win to land in ~30 days (tie it to the deal's success metrics).
- milestones: 3-6 sequenced go-live steps. Each has a title, the side that OWNS it (member / partner / both), and a rough timeframe (e.g. "Week 1", "Days 30-60"). Order them.
- goLiveChecklist: 3-6 concrete things that must be TRUE before announcing/going live (assets ready, tracking in place, approvals, etc.).
- coLaunchPlays: 3-6 joint go-to-market moves both sides run together (co-announcement, joint content/webinar, bundle, cross-promo to each audience).
- kpiTracking: 3-6 specific ways to instrument the agreed success metrics so Amplification has real data (what to measure, where, how often).
Each list item is ONE concrete sentence. No fluff, no boilerplate — this is a working launch plan a member executes from.`;

/** Produce a structured go-live launch plan, grounded in the deal structure,
 *  economics, trust score, and comparable past launches. */
export const generateLaunchPlan = async (
  input: LaunchPlanInput,
  ctx: PartnershipContext,
): Promise<LaunchPlan> => {
  const object = await runPlanner(
    {
      feature: "launchPlan",
      schema: LaunchPlanSchema,
      systemPrompt: LAUNCH_PLAN_SYSTEM,
      toolDescription: "Return the go-live launch plan.",
      toolName: "launch_plan",
    },
    {
      comparablePastLaunches: input.comparables?.length
        ? input.comparables
        : undefined,
      dealStructure: input.dealStructure,
      economics: input.economics,
      member: input.member,
      partner: input.partner,
      trustFit: input.trustFit,
      verification: input.verification,
    },
    ctx,
  );

  return { ...object, plannedAt: stamp() };
};

// ── Amplification: scale-up plan ─────────────────────────────────────────────
const AmplificationSchema = z.object({
  doubleDown: list(),
  expansionPlays: list(),
  flywheel: list(),
  momentumMetrics: list(),
  scopeExpansion: list(),
  summary: field(),
});

export type AmplificationPlan = z.infer<typeof AmplificationSchema> & {
  plannedAt: string;
};

export type AmplificationPlanInput = {
  comparables?: string[];
  dealStructure?: unknown;
  economics: PlannerEconomics;
  launchPlan?: unknown;
  member: PlannerMember;
  partner: PlannerPartner;
  trustFit?: unknown;
};

const AMPLIFICATION_SYSTEM = `You are a partnership growth lead. The partnership is LIVE and its first win has landed — now produce a concrete plan to AMPLIFY it (lifecycle stage 5). Ground every element in the launch plan, the deal structure, the trust signals, the member profile, and any comparable past scale-ups — do NOT invent facts. The goal of Amplification is to compound what's working: scale traction, widen the partnership, and turn each win into the next. Output:
- summary: 1-2 sentences on the scale-up thesis — what's working that you compound, and the growth you're aiming for.
- doubleDown: 3-6 launch plays / channels showing traction to scale up now (be specific about WHY each is worth more investment).
- expansionPlays: 3-6 NEW joint growth motions to add (new segments, channels, co-marketing at scale, content series, joint events).
- scopeExpansion: 3-6 ways to widen the partnership ITSELF (new products/bundles, deeper integration, exclusivity upgrade, new markets).
- flywheel: 3-6 referral / compounding mechanics so each win feeds the next (case studies, testimonials, referrals, co-selling, advocacy).
- momentumMetrics: 3-6 leading indicators that show amplification is working (growth-RATE metrics, not just the launch KPIs).
Each list item is ONE concrete sentence. No fluff, no boilerplate — this is a working scale-up plan a member executes from.`;

/** Produce a structured scale-up plan for a live partnership, grounded in its
 *  launch plan, deal structure, trust score, and comparable past scale-ups. */
export const generateAmplificationPlan = async (
  input: AmplificationPlanInput,
  ctx: PartnershipContext,
): Promise<AmplificationPlan> => {
  const object = await runPlanner(
    {
      feature: "amplificationPlan",
      schema: AmplificationSchema,
      systemPrompt: AMPLIFICATION_SYSTEM,
      toolDescription: "Return the amplification / scale-up plan.",
      toolName: "amplification_plan",
    },
    {
      comparablePastScaleUps: input.comparables?.length
        ? input.comparables
        : undefined,
      dealStructure: input.dealStructure,
      economics: input.economics,
      launchPlan: input.launchPlan,
      member: input.member,
      partner: input.partner,
      trustFit: input.trustFit,
    },
    ctx,
  );

  return { ...object, plannedAt: stamp() };
};

// ── Maturation: stewardship plan ─────────────────────────────────────────────
const MaturationSchema = z.object({
  deepeningMoves: list(),
  governanceCadence: list(),
  healthSignals: list(),
  optimizations: list(),
  risks: list(),
  summary: field(),
});

export type MaturationPlan = z.infer<typeof MaturationSchema> & {
  plannedAt: string;
};

export type MaturationPlanInput = {
  amplificationPlan?: unknown;
  comparables?: string[];
  dealStructure?: unknown;
  economics: PlannerEconomics;
  launchPlan?: unknown;
  member: PlannerMember;
  partner: PlannerPartner;
  trustFit?: unknown;
};

const MATURATION_SYSTEM = `You are a partnership-success lead stewarding a MATURE, established partnership at peak value (lifecycle stage 6, Maturation). The partnership is live, scaled, and working — the job now is to KEEP IT HEALTHY and make it durable so it survives to renewal. Ground every element in the amplification plan, launch plan, deal structure, trust signals, member profile, and any comparable past mature partnerships — do NOT invent facts. Output:
- summary: 1-2 sentences on the state of the partnership and the stewardship thesis (what keeps it at peak value).
- healthSignals: 3-6 concrete signs the partnership is healthy and durable right now (what to keep reinforcing).
- risks: 3-6 EARLY-WARNING signals of drift, decline, or dormancy to watch — catch them before they bite.
- governanceCadence: 3-6 operating-rhythm moves to keep it healthy (QBRs, joint planning, reporting, check-in cadence, shared dashboards).
- deepeningMoves: 3-6 ways to deepen / institutionalize the relationship so it's resilient (multi-thread stakeholders, exec sponsorship, contracts, integrations, shared roadmap).
- optimizations: 3-6 ways to tune what's already running (reduce friction, improve margins/splits, automate, retire what isn't working).
Each list item is ONE concrete sentence. No fluff, no boilerplate — this is a working stewardship plan a member runs an established partnership from.`;

/** Produce a structured partnership-health / stewardship plan for a mature
 *  partnership. */
export const generateMaturationPlan = async (
  input: MaturationPlanInput,
  ctx: PartnershipContext,
): Promise<MaturationPlan> => {
  const object = await runPlanner(
    {
      feature: "maturationPlan",
      schema: MaturationSchema,
      systemPrompt: MATURATION_SYSTEM,
      toolDescription: "Return the maturation / stewardship plan.",
      toolName: "maturation_plan",
    },
    {
      amplificationPlan: input.amplificationPlan,
      comparablePastPartnerships: input.comparables?.length
        ? input.comparables
        : undefined,
      dealStructure: input.dealStructure,
      economics: input.economics,
      launchPlan: input.launchPlan,
      member: input.member,
      partner: input.partner,
      trustFit: input.trustFit,
    },
    ctx,
  );

  return { ...object, plannedAt: stamp() };
};

// ── Renewal: renew / restructure / expand / sunset ───────────────────────────
export const DEFAULT_RENEWAL_VERDICTS = [
  "renew",
  "restructure",
  "expand",
  "sunset",
] as const;

export type RenewalVerdict = (typeof DEFAULT_RENEWAL_VERDICTS)[number];

const buildRenewalSchema = <V extends string>(
  verdicts: readonly [V, ...V[]],
) =>
  z.object({
    caseForRenewal: list(),
    expansionOpportunities: list(),
    recommendation: field(),
    risks: list(),
    summary: field(),
    verdict: z.enum(verdicts),
    whatToRenegotiate: list(),
  });

export type RenewalPlan<V extends string = RenewalVerdict> = z.infer<
  ReturnType<typeof buildRenewalSchema<V>>
> & { plannedAt: string };

export type RenewalPlanInput<V extends string = RenewalVerdict> = {
  amplificationPlan?: unknown;
  comparables?: string[];
  dealStructure?: unknown;
  economics: PlannerEconomics;
  launchPlan?: unknown;
  maturationPlan?: unknown;
  member: PlannerMember;
  partner: PlannerPartner;
  trustFit?: unknown;
  /** The verdict labels. Defaults to renew/restructure/expand/sunset; the
   *  result's `verdict` is typed to whatever you pass. */
  verdicts?: readonly [V, ...V[]];
};

const RENEWAL_SYSTEM = `You are a partnership-renewal advisor. The partnership cycle is ending — make a clear-eyed call on whether to RENEW, RESTRUCTURE, EXPAND, or SUNSET it (lifecycle stage 7, Renewal), based on its track record. Ground every element in the maturation/stewardship plan, the amplification + launch plans, the deal structure, the trust signals, the member profile, and any comparable past renewals — do NOT invent facts. Be decisive but honest: if the evidence says walk away, say so. Output:
- summary: 1-2 sentences on where the partnership stands at the end of this cycle.
- verdict: EXACTLY one of "renew", "restructure", "expand", or "sunset" (lowercase) — your single clear call.
- recommendation: a one-line why for that verdict, grounded in the track record.
- caseForRenewal: 3-6 pieces of track-record evidence (wins, value delivered, trust earned) that justify continuing — or, if sunsetting, what value was captured.
- whatToRenegotiate: 3-6 specific terms/structure to change for the NEXT cycle (splits, duration, exclusivity, scope, SLAs) — what the current deal got wrong or outgrew.
- expansionOpportunities: 3-6 concrete ways to grow the partnership in the renewal (new products, markets, deeper integration, bigger commitments).
- risks: 3-6 things to de-risk BEFORE re-committing (dependencies, concentration, unproven assumptions, partner-side changes).
Each list item is ONE concrete sentence. No fluff, no boilerplate — this is a working renewal recommendation a member decides from.`;

/** Produce a structured renew/restructure/expand/sunset recommendation for a
 *  cycle-ending partnership. */
export const generateRenewalPlan = async <V extends string = RenewalVerdict>(
  input: RenewalPlanInput<V>,
  ctx: PartnershipContext,
): Promise<RenewalPlan<V>> => {
  const verdicts: readonly [V, ...V[]] =
    input.verdicts ??
    (DEFAULT_RENEWAL_VERDICTS as unknown as readonly [V, ...V[]]);
  const schema = buildRenewalSchema(verdicts);

  const object = await runPlanner(
    {
      feature: "renewalPlan",
      schema,
      systemPrompt: RENEWAL_SYSTEM,
      toolDescription: "Return the renewal recommendation.",
      toolName: "renewal_plan",
    },
    {
      amplificationPlan: input.amplificationPlan,
      comparablePastRenewals: input.comparables?.length
        ? input.comparables
        : undefined,
      dealStructure: input.dealStructure,
      economics: input.economics,
      launchPlan: input.launchPlan,
      maturationPlan: input.maturationPlan,
      member: input.member,
      partner: input.partner,
      trustFit: input.trustFit,
    },
    ctx,
  );

  return { ...object, plannedAt: stamp() };
};

// ── Exit: graceful wind-down ─────────────────────────────────────────────────
const ExitSchema = z.object({
  cleanBreakItems: list(),
  lessonsLearned: list(),
  relationshipPreservation: list(),
  summary: field(),
  windDownSteps: list(),
});

export type ExitPlan = z.infer<typeof ExitSchema> & { plannedAt: string };

export type ExitPlanInput = {
  amplificationPlan?: unknown;
  comparables?: string[];
  dealStructure?: unknown;
  economics: PlannerEconomics;
  launchPlan?: unknown;
  maturationPlan?: unknown;
  member: PlannerMember;
  partner: PlannerPartner;
  renewalPlan?: unknown;
  trustFit?: unknown;
};

const EXIT_SYSTEM = `You are a partnership-transitions advisor. The partnership is concluding — help the member exit it GRACEFULLY (lifecycle stage 8, Exit). This is a value-preserving conclusion (amicable wind-down, graduation, or it ran its course), NOT a failure: close well and BANK the relationship. Ground every element in the renewal recommendation, the maturation/amplification/launch history, the deal structure, the trust signals, the member profile, and any comparable past exits — do NOT invent facts. Output:
- summary: 1-2 sentences on how this partnership is concluding and the posture (part on good terms, preserve value).
- windDownSteps: 3-6 concrete operational steps to conclude cleanly (notice, transition timeline, final deliverables/payments, announcements).
- cleanBreakItems: 3-6 loose ends to CLOSE so nothing lingers (data/IP ownership, shared assets, audience handoff, contractual obligations, access revocation).
- relationshipPreservation: 3-6 ways to part well and keep the door open (gratitude, referrals, mutual recommendations, staying in each other's network, future-collaboration triggers).
- lessonsLearned: 3-6 honest takeaways from the full partnership — what worked, what didn't, what to do differently — so future partnerships start smarter.
Each list item is ONE concrete sentence. No fluff, no boilerplate, no doom — this is a working, dignified off-board plan a member executes from.`;

/** Produce a structured graceful-exit / wind-down plan for a concluding
 *  partnership. */
export const generateExitPlan = async (
  input: ExitPlanInput,
  ctx: PartnershipContext,
): Promise<ExitPlan> => {
  const object = await runPlanner(
    {
      feature: "exitPlan",
      schema: ExitSchema,
      systemPrompt: EXIT_SYSTEM,
      toolDescription: "Return the graceful exit / wind-down plan.",
      toolName: "exit_plan",
    },
    {
      amplificationPlan: input.amplificationPlan,
      comparablePastExits: input.comparables?.length
        ? input.comparables
        : undefined,
      dealStructure: input.dealStructure,
      economics: input.economics,
      launchPlan: input.launchPlan,
      maturationPlan: input.maturationPlan,
      member: input.member,
      partner: input.partner,
      renewalPlan: input.renewalPlan,
      trustFit: input.trustFit,
    },
    ctx,
  );

  return { ...object, plannedAt: stamp() };
};
