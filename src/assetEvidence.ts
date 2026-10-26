import { createHash } from "node:crypto";
import { z } from "zod";

/** Source authenticity is not truth verification. Hosts own provenance; models
 * may select records but cannot supply quotations, labels, or verified status. */
export type AssetEvidenceSource = {
  id: string;
  label: string;
  content: string;
  kind?: string;
};
export type AssetEvidenceRecord = {
  id: string;
  sourceId: string;
  sourceDigest: string;
  sourceLabel: string;
  provenance: string;
  pointer: string;
  start: number;
  end: number;
  text: string;
};
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const escapePointer = (text: string) => text.replaceAll("~", "~0").replaceAll("/", "~1");
const provenance = (kind?: string) => kind === "match" ? "Unverified research / match record" : kind === "intake" ? "Recorded intake information" : kind === "operator" ? "Operator-provided information" : kind === "profile" ? "Profile record" : "Supplied source";
const leaves = (value: unknown, pointer = ""): { pointer: string; text: string }[] => {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return [{ pointer, text: String(value) }];
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => leaves(child, `${pointer}/${escapePointer(key)}`));
};
/** Complete sentences or complete structured values, never model-chosen
 * substrings. Offsets address the decoded value at the JSON pointer. */
export const buildAssetEvidence = (sources: readonly AssetEvidenceSource[]) => {
  if (new Set(sources.map(source => source.id)).size !== sources.length) throw new Error("Duplicate asset source ID");
  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  return sources.flatMap(source => {
    let values: { pointer: string; text: string }[];
    try { values = leaves(JSON.parse(source.content)); }
    catch { values = [{ pointer: "", text: source.content }]; }
    const sourceDigest = digest(source.content);
    return values.flatMap(value => [...segmenter.segment(value.text)].flatMap(segment => {
      const text = segment.segment.trim();
      if (!text) return [];
      const start = segment.index + segment.segment.indexOf(text);
      const end = start + text.length;
      return [{ id: digest(JSON.stringify([source.id, sourceDigest, value.pointer, start, end])), sourceId: source.id, sourceDigest, sourceLabel: source.label, provenance: provenance(source.kind), pointer: value.pointer, start, end, text }];
    }));
  });
};

export const ASSET_EVIDENCE_HEADINGS = ["Overview", "Opportunity", "Audience", "Offer", "Roles and responsibilities", "Positioning", "Talking points", "Discovery questions", "Proof and track record", "Commercial terms", "Distribution", "Timeline", "Success measures", "Risks and open decisions", "Next steps", "Contact"] as const;
const Text = z.string().trim().min(1).max(1200).refine(value => !/[\r\n<>]/u.test(value), "Use plain single-line text");
export const AssetEvidencePlanSchema = z.object({
  sections: z.array(z.object({
    heading: z.enum(ASSET_EVIDENCE_HEADINGS),
    blocks: z.array(z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("source"), evidenceId: z.string().min(1) }).strict(),
      z.object({ kind: z.literal("proposal"), text: Text }).strict(),
      z.object({ kind: z.literal("question"), text: Text }).strict(),
    ])).min(1).max(12),
  }).strict()).min(1).max(16),
  missingInputs: z.array(Text).max(20),
}).strict();
export type AssetEvidencePlan = z.infer<typeof AssetEvidencePlanSchema>;
export type AssetEvidenceDocument = {
  version: 1;
  sourceDigest: string;
  plan: AssetEvidencePlan;
  citations: AssetEvidenceRecord[];
  markdownDigest: string;
};
const plain = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replace(/[\\`*_{}\[\]()#+.!|~-]/gu, "\\$&");
/** The caller's source snapshot is authoritative. Rebuild the ledger on every
 * render; a model-supplied citation object is never accepted. */
export const renderAssetEvidencePlan = (sources: readonly AssetEvidenceSource[], raw: unknown) => {
  const plan = AssetEvidencePlanSchema.parse(raw);
  const ledger = new Map(buildAssetEvidence(sources).map(record => [record.id, record]));
  const citations = new Map<string, AssetEvidenceRecord>();
  const markdown = plan.sections.map(section => `## ${section.heading}\n\n${section.blocks.map(block => {
    if (block.kind !== "source") return `**${block.kind === "proposal" ? "Proposed" : "To confirm"}:** ${plain(block.text)}`;
    const record = ledger.get(block.evidenceId);
    if (!record) throw new Error("Unknown or stale asset evidence reference");
    citations.set(record.id, record);
    return `> ${plain(record.text).replaceAll("\n", "\n> ")}\n\nSource: ${plain(record.sourceLabel)} · ${record.provenance} · ${plain(record.pointer || "source text")} · reference ${record.id.slice(0, 12)}`;
  }).join("\n\n")}`).join("\n\n") + (plan.missingInputs.length ? `\n\n## Operator inputs needed\n${plan.missingInputs.map(text => `- ${plain(text)}`).join("\n")}` : "");
  const evidenceDocument: AssetEvidenceDocument = { version: 1, sourceDigest: digest(JSON.stringify(sources)), plan, citations: [...citations.values()], markdownDigest: digest(markdown) };
  return { markdown, evidenceDocument };
};
/** Verify persisted content, including after recovery and before export. */
export const validateAssetEvidenceDocument = (sources: readonly AssetEvidenceSource[], markdown: string, document: AssetEvidenceDocument) => {
  const rebuilt = renderAssetEvidencePlan(sources, document.plan);
  if (document.version !== 1 || JSON.stringify(rebuilt.evidenceDocument) !== JSON.stringify(document) || rebuilt.markdown !== markdown)
    throw new Error("Asset document no longer matches its source-backed construction");
  return rebuilt;
};

/** Deliberately no AI-supplied numeric output. Values retain their dimensions,
 * period, evidence references and assumptions; callers must supply validated
 * inputs. This computes scenarios, never guaranteed revenue. */
export const calculateAssetScenario = (input: {
  revenue: { value: number; currency: string; period: "annual"; evidenceId: string };
  partnerPrice: { value: number; currency: string; period: "annual"; evidenceId: string };
  clientPrice: { value: number; currency: string; period: "annual"; evidenceId: string };
  evidence: readonly AssetEvidenceRecord[];
  assumptions: readonly string[];
}) => {
  const records = new Map(input.evidence.map(record => [record.id, record]));
  const values = [input.revenue, input.partnerPrice, input.clientPrice];
  if (values.some(value => !Number.isFinite(value.value) || value.value <= 0 || !records.has(value.evidenceId))) throw new Error("Scenario inputs require positive amounts and evidence");
  for (const value of values) {
    const text = records.get(value.evidenceId)?.text.trim() ?? "";
    if (!/^\d+(?:\.\d+)?$/u.test(text) || Number(text) !== value.value) throw new Error("Scenario amount must equal its complete numeric source field");
  }
  if (values.some(value => value.currency !== input.revenue.currency || value.period !== "annual")) throw new Error("Scenario inputs require matching currencies and annual periods");
  if (!input.assumptions.length) throw new Error("Scenario assumptions are required");
  const estimatedCustomers = input.revenue.value / input.partnerPrice.value;
  const potentialRevenue = estimatedCustomers * input.clientPrice.value;
  if (!Number.isFinite(estimatedCustomers) || !Number.isFinite(potentialRevenue)) throw new Error("Scenario result is not finite");
  return { kind: "scenario" as const, estimatedCustomers, potentialRevenue, currency: input.revenue.currency, period: "annual" as const, formula: "(partner annual revenue / partner annual price) * client annual price", inputs: { revenue: input.revenue, partnerPrice: input.partnerPrice, clientPrice: input.clientPrice }, assumptions: [...input.assumptions] };
};
