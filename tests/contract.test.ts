import { describe, expect, test } from "bun:test";
import {
  analyzeCompetitor,
  classifyRelationship,
  draftOutreach,
  draftPartnershipAsset,
  frameConnection,
  generateMeetingPrep,
  generateDealStructure,
  generateNudges,
  generateRenewalPlan,
  redlineDeal,
  scoreTrustFit,
  verifyPartner,
  type GenerateObject,
  type GenerateObjectRequest,
} from "../src/index";

// A stub generate call that records the last request the package built and
// returns a caller-supplied canned object. This is the golden harness: it lets
// us assert the package emits the exact prompt/schema/tool contract (and maps
// the result) without hitting a real model — the same contract a host's metered
// `generateObjectAI` will receive.
const stub = (object: unknown) => {
  const calls: GenerateObjectRequest<unknown>[] = [];
  const generateObject: GenerateObject = async (request) => {
    calls.push(request as GenerateObjectRequest<unknown>);

    return { object: object as never };
  };

  return { calls, generateObject };
};

describe("scoreTrustFit", () => {
  test("builds the trust_fit_score request and maps dimensions + reasons", async () => {
    const { calls, generateObject } = stub({
      audienceOverlap: 0.8,
      capability: 0.6,
      credibility: 0.7,
      mutualValue: 0.5,
      whyFit: "f".repeat(700),
      whyThem: "them",
      whyYou: "you",
    });

    const result = await scoreTrustFit(
      {
        member: { niche: "devtools", offer: "CI" },
        partner: { company: { name: "Acme" } },
        priorScores: { theirReceptiveness: 0.4, yourFit: 0.9 },
      },
      { generateObject },
    );

    expect(calls[0]?.toolName).toBe("trust_fit_score");
    expect(calls[0]?.feature).toBe("trustFit");
    expect(calls[0]?.model).toBe("claude-haiku-4-5-20251001");
    expect(typeof calls[0]?.schema).toBe("object");
    // The serialized payload carries member, partner, and the prior scores.
    const payload = JSON.parse(calls[0]?.messages[0]?.content ?? "{}");
    expect(payload.scores.yourFit).toBe(0.9);
    expect(payload.partner.company.name).toBe("Acme");

    expect(result.dimensions.audienceOverlap).toBe(0.8);
    // whyFit is truncated to REASON_MAX (600) and used as the rationale.
    expect(result.rationale.length).toBe(600);
    expect(result.reasons.you).toBe("you");
  });

  test("honors a model override", async () => {
    const { calls, generateObject } = stub({
      audienceOverlap: 0.1,
      capability: 0.1,
      credibility: 0.1,
      mutualValue: 0.1,
      whyFit: "a",
      whyThem: "b",
      whyYou: "c",
    });
    await scoreTrustFit(
      { member: {}, partner: {} },
      { generateObject, model: "claude-opus-4-8" },
    );
    expect(calls[0]?.model).toBe("claude-opus-4-8");
  });
});

describe("classifyRelationship", () => {
  test("builds the classify_match request and returns the classification", async () => {
    const { calls, generateObject } = stub({
      officialName: "StackBlitz",
      receptivenessScore: 0.7,
      relationshipType: "complementary",
      website: "stackblitz.com",
    });

    const result = await classifyRelationship(
      {
        company: { name: "stackblitz", industry: "devtools" },
        member: { niche: "CI" },
      },
      { generateObject },
    );

    expect(calls[0]?.toolName).toBe("classify_match");
    expect(result.officialName).toBe("StackBlitz");
    expect(result.relationshipType).toBe("complementary");
  });
});

describe("frameConnection", () => {
  test("builds the person_connection request (defaults to sonnet)", async () => {
    const { calls, generateObject } = stub({
      connectionWhy: "why",
      conversationStarter: "hi",
      mutualValue: "value",
      sharedGround: "ground",
    });

    const result = await frameConnection(
      { member: { niche: "devtools" }, person: { fullName: "Jane Doe" } },
      { generateObject },
    );

    expect(calls[0]?.toolName).toBe("person_connection");
    expect(calls[0]?.model).toBe("claude-sonnet-4-6");
    expect(result.conversationStarter).toBe("hi");
  });
});

describe("verifyPartner", () => {
  const dossier = {
    audienceOverlap: { rationale: "r", score: 0.6 },
    credibility: { findings: ["f"], risks: ["x"], score: 0.7 },
    economics: { assessment: "ok", risks: ["thin"] },
    openQuestions: ["q"],
    summary: "credible",
    trackRecord: ["shipped"],
  };

  test("injects research output into the synthesis payload", async () => {
    const { calls, generateObject } = stub(dossier);
    let researchedName = "";
    const result = await verifyPartner(
      { member: { niche: "CI" }, partner: { name: "Acme", industry: "devtools" } },
      {
        generateObject,
        research: async (_sys, user) => {
          researchedName = user;

          return "Acme is a real, well-reviewed company.";
        },
      },
    );

    expect(researchedName).toContain("Acme");
    const payload = JSON.parse(calls[0]?.messages[0]?.content ?? "{}");
    expect(payload.research).toContain("well-reviewed");
    expect(result.summary).toBe("credible");
    expect(typeof result.researchedAt).toBe("string");
  });

  test("falls back to knowledge-only when no research fn is supplied", async () => {
    const { calls, generateObject } = stub(dossier);
    await verifyPartner(
      { member: {}, partner: { name: "Acme" } },
      { generateObject },
    );
    const payload = JSON.parse(calls[0]?.messages[0]?.content ?? "{}");
    expect(payload.research).toContain("no live research available");
  });
});

describe("generateMeetingPrep", () => {
  const brief = {
    avoid: ["a"],
    objections: [{ objection: "o", response: "r" }],
    talkingPoints: ["t"],
    theAsk: "ask",
    whatsNew: ["n"],
    whereYouStand: "first contact",
    whoTheyAre: "a company",
  };

  test("injects research, threads priorCall into lastCall, stamps researchedAt", async () => {
    const { calls, generateObject } = stub(brief);
    const result = await generateMeetingPrep(
      {
        member: { niche: "CI" },
        partner: { name: "Acme", industry: "devtools" },
        priorCall: "we spoke last month",
        relationship: "2 prior emails",
      },
      { generateObject, research: async () => "Acme shipped v2 last week." },
    );
    expect(calls[0]?.toolName).toBe("meeting_prep_brief");
    const payload = JSON.parse(calls[0]?.messages[0]?.content ?? "{}");
    expect(payload.research).toContain("shipped v2");
    expect(payload.relationship).toBe("2 prior emails");
    expect(result.lastCall).toBe("we spoke last month");
    expect(typeof result.researchedAt).toBe("string");
  });
});

describe("analyzeCompetitor", () => {
  test("builds competitor_analysis and defaults the name", async () => {
    const { calls, generateObject } = stub({
      notWorthChasing: ["strong"],
      painPoints: ["slow"],
      summary: "head to head",
      uniqueBenefits: ["faster"],
    });
    const result = await analyzeCompetitor(
      { company: {}, member: { niche: "CI" } },
      { generateObject },
    );
    const payload = JSON.parse(calls[0]?.messages[0]?.content ?? "{}");
    expect(calls[0]?.toolName).toBe("competitor_analysis");
    expect(payload.company.name).toBe("this company");
    expect(payload.research).toContain("no live research");
    expect(result.summary).toBe("head to head");
  });
});

describe("draftOutreach", () => {
  const bounds = { bodyMax: 2000, bodyMin: 1, subjectMax: 200, subjectMin: 1 };

  test("uses the outreach feature/system by default", async () => {
    const { calls, generateObject } = stub({ body: "hello", subject: "hi" });
    const result = await draftOutreach(
      { bounds, match: { company: "Acme" }, profile: { niche: "CI" } },
      { generateObject },
    );
    expect(calls[0]?.feature).toBe("outreachDraft");
    expect(result.subject).toBe("hi");
  });

  test("switches to the winback feature in winback mode", async () => {
    const { calls, generateObject } = stub({ body: "b", subject: "s" });
    await draftOutreach(
      { bounds, match: {}, mode: "winback", profile: {} },
      { generateObject },
    );
    expect(calls[0]?.feature).toBe("winbackDraft");
  });
});

describe("generateNudges", () => {
  test("returns one suggestion per person and skips the call when empty", async () => {
    const { calls, generateObject } = stub({
      suggestions: [{ key: "p1", nudge: "follow up" }],
    });
    const result = await generateNudges(
      [
        {
          channels: ["email"],
          interactionCount: 2,
          key: "p1",
          name: "Jane",
        },
      ],
      { niche: "CI" },
      { generateObject },
    );
    expect(calls[0]?.toolName).toBe("relationship_nudges");
    expect(result[0]?.nudge).toBe("follow up");

    const empty = stub({ suggestions: [] });
    const none = await generateNudges([], {}, { generateObject: empty.generateObject });
    expect(none).toEqual([]);
    expect(empty.calls.length).toBe(0);
  });
});

describe("lifecycle planners", () => {
  const economics = { estimatedValue: "$50k", revenueModel: "rev-share" };
  const base = {
    economics,
    member: { niche: "CI" },
    partner: { company: { name: "Acme" }, name: "Acme", person: null },
  };

  test("dealStructure builds deal_structure, keys comparablePastDeals, stamps recommendedAt", async () => {
    const { calls, generateObject } = stub({
      escalationPath: "e",
      exclusivity: "none",
      protections: ["p"],
      revenueSplit: "50/50",
      roles: ["r"],
      successMetrics: ["m"],
      summary: "fair",
    });
    const result = await generateDealStructure(
      { ...base, comparables: ["past deal A"] },
      { generateObject },
    );
    expect(calls[0]?.toolName).toBe("deal_structure");
    const payload = JSON.parse(calls[0]?.messages[0]?.content ?? "{}");
    expect(payload.comparablePastDeals).toEqual(["past deal A"]);
    expect(payload.economics.revenueModel).toBe("rev-share");
    expect(typeof result.recommendedAt).toBe("string");
  });

  test("renewal is generic over the verdict union and keys comparablePastRenewals", async () => {
    const { calls, generateObject } = stub({
      caseForRenewal: ["c"],
      expansionOpportunities: ["x"],
      recommendation: "renew it",
      risks: ["r"],
      summary: "strong",
      verdict: "renew",
      whatToRenegotiate: ["w"],
    });
    const result = await generateRenewalPlan(
      { ...base, comparables: ["past renewal"] },
      { generateObject },
    );
    expect(calls[0]?.toolName).toBe("renewal_plan");
    const payload = JSON.parse(calls[0]?.messages[0]?.content ?? "{}");
    expect(payload.comparablePastRenewals).toEqual(["past renewal"]);
    const verdict: "renew" | "restructure" | "expand" | "sunset" = result.verdict;
    expect(verdict).toBe("renew");
    expect(typeof result.plannedAt).toBe("string");
  });
});

describe("redlineDeal", () => {
  test("truncates the counter, passes partner name + recommended structure", async () => {
    const { calls, generateObject } = stub({
      aligned: ["a"],
      concessions: ["c"],
      counterMoves: ["m"],
      risks: ["r"],
      summary: "mixed",
    });
    const result = await redlineDeal(
      {
        counterProposal: "x".repeat(7000),
        partnerName: "Acme",
        recommendedStructure: { revenueSplit: "50/50" },
      },
      { generateObject },
    );
    const payload = JSON.parse(calls[0]?.messages[0]?.content ?? "{}");
    expect(payload.counterProposal.length).toBe(6000);
    expect(payload.partner).toBe("Acme");
    expect(result.summary).toBe("mixed");
  });
});

describe("draftPartnershipAsset", () => {
  test("builds partnership_asset with the supplied label + facts", async () => {
    const { calls, generateObject } = stub({
      markdown: "# Memo\n\nbody",
      title: "Deal Memo: Acme",
    });
    const result = await draftPartnershipAsset(
      {
        assetType: "deal_memo",
        assetTypeLabel: "Deal Memo",
        bounds: { markdownMax: 9000, markdownMin: 1, titleMax: 120, titleMin: 1 },
        match: { company: "Acme" },
        profile: { niche: "CI" },
      },
      { generateObject },
    );
    expect(calls[0]?.toolName).toBe("partnership_asset");
    const payload = JSON.parse(calls[0]?.messages[0]?.content ?? "{}");
    expect(payload.assetTypeLabel).toBe("Deal Memo");
    expect(result.title).toBe("Deal Memo: Acme");
  });
});
