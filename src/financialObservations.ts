import { z } from "zod";
import type { StructuredResearch } from "./researchEvidence";

const publicUrl = z.url().refine(raw => {
  const url = new URL(raw);
  return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
}, "Financial source must be a public HTTP(S) URL");
/** Exact source material, never an implicit input to the opportunity formula. */
export const FinancialObservationSchema = z.object({
  kind: z.enum(["revenue", "pricing", "financial_context"]),
  scope: z.enum(["partner_site", "client_site", "external_source"]),
  quote: z.string().min(1),
  sourceUrl: publicUrl,
  sourceTitle: z.string().min(1),
  observedAt: z.iso.datetime(),
});
export type FinancialObservation = z.infer<typeof FinancialObservationSchema>;
const host = (url?: string) => {
  if (!url) return null;
  const parsed = publicUrl.safeParse(url);
  return parsed.success ? new URL(parsed.data).hostname.toLowerCase().replace(/^www\./, "") : null;
};
const sameSite = (source: string | null, website: string | null) => Boolean(source && website && (source === website || source.endsWith(`.${website}`)));
const hasMoney = (quote: string) => /[$€£¥]\s*\d|\b(?:USD|EUR|GBP|CAD|AUD|JPY)\s*\d|\d[\d,.]*\s*(?:USD|EUR|GBP|CAD|AUD|JPY)\b/i.test(quote);
const kind = (quote: string): FinancialObservation["kind"] => {
  if (/\b(?:revenue|turnover)\b/i.test(quote)) return "revenue";
  if (/\b(?:pric(?:e|es|ing)|cost|fee|plan|month|monthly|annual|year|ticket|payment|subscription|pay)\b|\/\s*(?:mo|yr)\b/i.test(quote)) return "pricing";
  return "financial_context";
};
export const uniqueFinancialObservations = (observations: unknown[]): FinancialObservation[] => {
  const unique = new Map<string, FinancialObservation>();
  for (const observation of observations) {
    const parsed = FinancialObservationSchema.safeParse(observation);
    if (!parsed.success) continue;
    const key = `${parsed.data.sourceUrl}\n${parsed.data.quote.replace(/\s+/g, " ").trim()}`;
    if (!unique.has(key)) unique.set(key, parsed.data);
  }
  return [...unique.values()];
};
/** Reuses already grounded findings; no extra model call or unreviewed source text. */
export const collectFinancialObservations = (research: StructuredResearch, context: { partnerWebsite?: string; clientWebsite?: string } = {}): FinancialObservation[] => {
  if (!["grounded", "partial"].includes(research.status) || !Number.isFinite(Date.parse(research.generatedAt))) return [];
  const observations: FinancialObservation[] = [];
  for (const finding of research.findings) {
    if (!hasMoney(finding.quote)) continue;
    const source = research.sources.find(item => item.id === finding.sourceId);
    if (!source || !publicUrl.safeParse(source.url).success || !source.title) continue;
    const sourceHost = host(source.url);
    const scope = sameSite(sourceHost, host(context.clientWebsite)) ? "client_site" : sameSite(sourceHost, host(context.partnerWebsite)) ? "partner_site" : "external_source";
    observations.push({ kind: kind(finding.quote), scope, quote: finding.quote, sourceUrl: source.url, sourceTitle: source.title, observedAt: research.generatedAt });
  }
  return uniqueFinancialObservations(observations);
};
