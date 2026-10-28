import { z } from "zod";
import type { StructuredResearch } from "./researchEvidence";
const sourceUrl = z.url().refine(value => { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; });
/** Checked sources describe coverage, never proof that a value cannot be found elsewhere. */
export const RevenueResearchCoverageSchema = z.object({
  status: z.enum(["not_started", "checked_sources", "incomplete", "failed"]),
  sources: z.array(z.object({ url: sourceUrl, title: z.string() })),
  limitations: z.array(z.string()),
});
export type RevenueResearchCoverage = z.infer<typeof RevenueResearchCoverageSchema>;
export const revenueResearchCoverage = (research?: StructuredResearch | string | null): RevenueResearchCoverage => ({
  status: research && typeof research !== "string" ? research.status === "grounded" ? "checked_sources" : research.status === "partial" ? "incomplete" : "failed" : "failed",
  sources: research && typeof research !== "string" ? research.sources.filter(source => sourceUrl.safeParse(source.url).success).map(source => ({ url: source.url, title: source.title ?? "Source" })) : [],
  limitations: research && typeof research !== "string" ? research.limitations : ["Source-bound research did not complete."],
});
export const partnerRevenueResearchQueries = (input: { partnerName: string; partnerWebsite?: string; clientName?: string; clientWebsite?: string; clientPricing?: unknown }) => {
  const site = (website?: string) => { try { return website ? new URL(website).hostname.replace(/^www\./, "") : null; } catch { return null; } };
  const domain = site(input.partnerWebsite);
  const queries = [
    `${input.partnerName} annual revenue financial statements`,
    domain ? `site:${domain} pricing plans subscriptions` : `${input.partnerName} pricing plans subscriptions`,
    domain ? `site:${domain} store packages membership checkout` : `${input.partnerName} store packages membership checkout`,
    `${input.partnerName} active customers locations franchise disclosure annual report`,
  ];
  if (!input.clientPricing && input.clientName) queries.push(site(input.clientWebsite) ? `site:${site(input.clientWebsite)} pricing plans` : `${input.clientName} annual pricing`);
  return queries;
};
