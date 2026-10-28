import { expect, test } from "bun:test";
import { collectFinancialObservations, calculatePartnerRevenuePipeline, researchPartnerRevenuePipeline, PartnerRevenuePipelineSchema } from "../src/revenuePipeline";
import type { StructuredResearch } from "../src/researchEvidence";
const research: StructuredResearch = {
  status: "partial", text: "Unreviewed price $99999", generatedAt: "2026-10-28T18:00:00.000Z", limitations: ["Some inputs remain unknown"],
  sources: [{ id: "revenue", url: "https://directory.example/partner", title: "Partner company revenue" }, { id: "pricing", url: "https://partner.example/offers", title: "Partner offers" }, { id: "client", url: "https://client.example/pricing", title: "Client pricing" }],
  findings: [
    { sourceId: "revenue", claim: "Revenue", quote: "Annual revenue: less than $5 million." },
    { sourceId: "pricing", claim: "Program", quote: "Coaching program: $1,350/month for two months or $2,499 paid in full." },
    { sourceId: "pricing", claim: "Event", quote: "Retreat ticket: $2,799, one-time payment." },
    { sourceId: "pricing", claim: "Vendor offer", quote: "Our third-party CRM partner offers plans starting at $279/month." },
    { sourceId: "client", claim: "Subscription", quote: "Sync costs $179/mo plus usage." },
    { sourceId: "missing", claim: "Invented source", quote: "$99/month" },
    { sourceId: "pricing", claim: "Unsupported amount $8888", quote: "Contact our sales team." },
  ],
};
test("retains exact qualified prices and revenue ranges without making them calculator inputs", async () => {
  let calls = 0;
  const result = await researchPartnerRevenuePipeline({ partnerName: "Partner", partnerWebsite: "https://partner.example", clientWebsite: "https://client.example" }, {
    research: async () => research,
    generateObject: async request => { calls++; return { object: request.validate({ partnerAnnualRevenue: null, partnerPricing: null, assumptions: [] }) }; },
  });
  expect(calls).toBe(1);
  expect(result.observations).toHaveLength(5);
  expect(result.observations?.[0]?.quote).toBe(research.findings[0]!.quote);
  expect(result.observations?.[0]?.scope).toBe("external_source");
  expect(result.observations?.[1]?.scope).toBe("partner_site");
  expect(result.observations?.[4]?.scope).toBe("client_site");
  expect(result.inputs.partnerPricing).toBeNull();
  expect(result.potentialPartnerRevenue).toBeNull();
  expect(JSON.stringify(result.observations)).not.toMatch(/99999|8888|Invented source/);
  const roundTrip = calculatePartnerRevenuePipeline(PartnerRevenuePipelineSchema.parse(result).inputs);
  expect(roundTrip.observations).toEqual(result.observations);
});
test("retains financial facts when calculation extraction fails", async () => {
  const result = await researchPartnerRevenuePipeline({ partnerName: "Partner" }, { research: async () => research, generateObject: async () => { throw Error("Provider unavailable"); } });
  expect(result.observations).toHaveLength(5);
  expect(result.potentialPartnerRevenue).toBeNull();
  expect(result.limitations.join(" ")).toContain("extraction did not complete");
});
test("source binding preserves qualifiers and exact title/date; rejects unsafe sources and ungrounded research", () => {
  const duplicate = { ...research, findings: [...research.findings, research.findings[0]!] };
  const values = collectFinancialObservations(duplicate);
  expect(values).toHaveLength(5);
  expect(values[0]?.sourceTitle).toBe("Partner company revenue");
  expect(values[0]?.observedAt).toBe(research.generatedAt);
  expect(values[3]?.quote).toContain("third-party CRM partner");
  expect(values[3]?.quote).toContain("starting at");
  expect(collectFinancialObservations({ ...research, status: "unavailable" })).toEqual([]);
  expect(collectFinancialObservations({ ...research, sources: research.sources.map(s => ({ ...s, url: "https://user:secret@example.com" })) })).toEqual([]);
});
test("cancellation is not disguised as a completed financial extraction", async () => {
  await expect(researchPartnerRevenuePipeline({partnerName:"Partner"},{research:async()=>research,generateObject:async()=>{throw new DOMException("Stopped","AbortError");}})).rejects.toThrow("Stopped");
});
