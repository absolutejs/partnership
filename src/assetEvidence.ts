import { ASSET_FORMATS, type AssetFormatType } from "./assetFormats";
import { createHash } from "node:crypto";
import { z } from "zod";

/** Source authenticity is not truth verification. Hosts own provenance; models
 * may select records but cannot supply quotations, labels, or verified status. */
export type AssetEvidenceSource = {
  id: string;
  label: string;
  content: string;
  kind?: string;
  /** Host-owned eligible JSON-pointer fields or text spans. Empty means context
   * only. Unverified match records are context-only unless explicitly selected. */
  evidenceSelection?: readonly { pointer: string; start?: number; end?: number }[];
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
// JSONB reorders object keys. Integrity checks must bind values, not insertion order.
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).filter(([,item]) => item !== undefined).sort(([left],[right]) => left.localeCompare(right)).map(([key,item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
};

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
    const selection = source.evidenceSelection ?? (source.kind === "match" ? [] : undefined);
    if (selection?.some(span => !values.some(value => value.pointer === span.pointer)))
      throw new Error("Asset evidence selection points to a missing source field");
    const records = values.flatMap(value => {
      if (!value.text.trim()) return [];
      const spans = selection?.filter(span => span.pointer === value.pointer) ?? [{ pointer: value.pointer }];
      return spans.flatMap(span => {
        const from = span.start ?? 0;
        const to = span.end ?? value.text.length;
        if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to > value.text.length || from >= to)
          throw new Error("Invalid asset evidence selection range");
        return [...segmenter.segment(value.text.slice(from, to))].flatMap(segment => {
          const text = segment.segment.trim();
          if (!text) return [];
          const start = from + segment.index + segment.segment.indexOf(text);
          const end = start + text.length;
          return [{ id: digest(JSON.stringify([source.id, sourceDigest, value.pointer, start, end])), sourceId: source.id, sourceDigest, sourceLabel: source.label, provenance: provenance(source.kind), pointer: value.pointer, start, end, text }];
        });
      });
    });
    return [...new Map(records.map(record => [record.id, record])).values()];
  });
};

export const ASSET_EVIDENCE_HEADINGS = ["Overview", "Opportunity", "Audience", "Offer", "Roles and responsibilities", "Positioning", "Talking points", "Discovery questions", "Proof and track record", "Commercial terms", "Distribution", "Timeline", "Success measures", "Risks and open decisions", "Next steps", "Contact", "Recommendation", "Baseline", "Decision", "Benefits", "Objection handling", "Objectives", "Progress", "Results", "Opening", "Resources", "Support", "Scope", "Investment", "Expected return", "Deliverables", "Background", "Lessons", "Announcement", "About", "Parties", "Purpose", "Confidentiality", "Exclusivity", "Non-binding status", "Signatures", "Term", "Intellectual property", "Termination"] as const;
const Text = z.string().trim().min(1).max(1200).refine(value => !/[\r\n<>]/u.test(value), "Use plain single-line text");
export const AssetEvidencePlanSchema = z.object({
  sections: z.array(z.object({
    heading: z.enum(ASSET_EVIDENCE_HEADINGS),
    blocks: z.array(z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("source"), evidenceId: z.string().min(1) }).strict(),
      z.object({ kind: z.literal("proposal"), text: Text }).strict(),
      z.object({ kind: z.literal("question"), text: Text }).strict(),
      z.object({ kind: z.literal("hypothetical"), text: Text }).strict(),
    ])).min(1).max(12),
  }).strict()).min(1).max(16),
  missingInputs: z.array(Text).max(20),
}).strict();
export type AssetEvidencePlan = z.infer<typeof AssetEvidencePlanSchema>;
export type AssetEvidenceDocument = {
  hypotheticalAllowed: boolean;
  version: 1;
  sourceDigest: string;
  plan: AssetEvidencePlan;
  citations: AssetEvidenceRecord[];
  markdownDigest: string;
};
const plain = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replace(/[\\`*_{}\[\]()#+.!|~-]/gu, "\\$&");
/** The caller's source snapshot is authoritative. Rebuild the ledger on every
 * render; a model-supplied citation object is never accepted. */
export const renderAssetEvidencePlan = (sources: readonly AssetEvidenceSource[], raw: unknown, hypotheticalAllowed = false) => {
  const plan = AssetEvidencePlanSchema.parse(raw);
  const ledger = new Map(buildAssetEvidence(sources).map(record => [record.id, record]));
  const citations = new Map<string, AssetEvidenceRecord>();
  const markdown = plan.sections.map(section => `## ${section.heading}\n\n${section.blocks.map(block => {
    if (block.kind === "hypothetical") {
      if (!hypotheticalAllowed) throw new Error("A fictional example requires explicit host authorization");
      return `**Hypothetical example (fictional, not an actual result):** ${plain(block.text)}`;
    }
    if (block.kind !== "source") return `**${block.kind === "proposal" ? "Proposed" : "To confirm"}:** ${plain(block.text)}`;
    const record = ledger.get(block.evidenceId);
    if (!record) throw new Error("Unknown or stale asset evidence reference");
    citations.set(record.id, record);
    return `> ${plain(record.text).replaceAll("\n", "\n> ")}\n\nSource: ${plain(record.sourceLabel)} · ${record.provenance} · ${plain(record.pointer || "source text")} · reference ${record.id.slice(0, 12)}`;
  }).join("\n\n")}`).join("\n\n") + (plan.missingInputs.length ? `\n\n## Operator inputs needed\n${plan.missingInputs.map(text => `- ${plain(text)}`).join("\n")}` : "");
  const evidenceDocument: AssetEvidenceDocument = { hypotheticalAllowed, version: 1, sourceDigest: digest(canonical(sources)), plan, citations: [...citations.values()], markdownDigest: digest(markdown) };
  return { markdown, evidenceDocument };
};
/** Verify persisted content, including after recovery and before export. */
export const validateAssetEvidenceDocument = (sources: readonly AssetEvidenceSource[], markdown: string, document: AssetEvidenceDocument) => {
  const rebuilt = renderAssetEvidencePlan(sources, document.plan, document.hypotheticalAllowed);
  if (document.version !== 1 || canonical(rebuilt.evidenceDocument) !== canonical(document) || rebuilt.markdown !== markdown)
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

/** Reader-facing references deliberately exclude storage paths, hashes and IDs.
 * The immutable construction above remains the audit contract. */
export type AssetPresentationSource = {
  number: number;
  label: string;
  provenance: string;
  excerpts: string[];
};
/** Remove conversational framing only through fixed, meaning-preserving prefixes.
 * Unrecognized statements stay verbatim; numbers, negation and qualifiers are never rewritten. */
const sourceStatement = (text: string) => {
  const rules: readonly [RegExp, string][] = [
    [/^My named dream partner is /u, "Target partner: "],
    [/^I am the founder of /u, "Business: "],
    [/^I am /u, "Background: "],
    [/^We sell /u, "Offer: "],
    [/^I want /u, "Goal: "],
    [/^I have done /u, "Track record: "],
    [/^I have (\d+(?:\.\d+)? hours? (?:per|a) week)/u, "Availability: $1"],
    [/^I will not /u, "Boundary: will not "],
    [/^My ([^.!?]+?) (?:is|are) /u, "$1: "],
    [/^Our /u, ""],
  ];
  for (const [pattern, replacement] of rules) {
    if (pattern.test(text)) {
      const statement = text.replace(pattern, replacement);
      return statement.charAt(0).toLocaleUpperCase() + statement.slice(1);
    }
  }
  return text;
};
export type AssetPresentationOptions = { assetType?: AssetFormatType };
export const presentAssetEvidenceDocument = (sources: readonly AssetEvidenceSource[], markdown: string, document: AssetEvidenceDocument, options: AssetPresentationOptions = {}) => {
  const validated = validateAssetEvidenceDocument(sources, markdown, document).evidenceDocument;
  const records = new Map(validated.citations.map(record => [record.id, record]));
  const references = new Map<string, AssetPresentationSource>();
  const format = options.assetType ? ASSET_FORMATS[options.assetType] : undefined;
  const seen = new Set<string>();
  const sections = validated.plan.sections.flatMap(section => {
    const blocks = section.blocks.flatMap(block => {
      const key = block.kind === "source" ? `source:${records.get(block.evidenceId)?.text}` : `${block.kind}:${block.text}`;
      if (seen.has(key)) return [];
      seen.add(key);
      if (block.kind !== "source") {
        const label = block.kind === "proposal" ? "Proposed" : block.kind === "question" ? "To confirm" : "Hypothetical example (fictional, not an actual result)";
        const text = block.kind === "proposal" ? block.text.replace(/^Propose (?:that )?/iu, "") : block.text;
        return format?.mode === "email" && block.kind === "proposal" ? plain(text) : `**${label}:** ${plain(text)}`;
      }
      const record = records.get(block.evidenceId);
      if (!record) throw new Error("Missing validated source record");
      let reference = references.get(record.sourceId);
      if (!reference) {
        reference = { number: references.size + 1, label: record.sourceLabel, provenance: record.provenance, excerpts: [] };
        references.set(record.sourceId, reference);
      }
      if (!reference.excerpts.includes(record.text)) reference.excerpts.push(record.text);
      return `${plain(format?.mode === "email" ? record.text : sourceStatement(record.text))} [${reference.number}]`;
    });
    if (!blocks.length) return [];
    return format?.mode === "email" || format?.mode === "announcement" ? blocks.join("\n\n") : `## ${section.heading}\n\n${blocks.join("\n\n")}`;
  });
  if (format?.mode === "email") sections.unshift("**Suggested email — review before sending.**");
  if (format?.mode === "legal") sections.unshift("**Non-binding draft — for negotiation and legal review.**");
  const publicSources = [...references.values()];
  if (publicSources.length) sections.push(`## Sources\n\n${publicSources.map(source => `[${source.number}] ${plain(source.label)} — ${plain(source.provenance)}`).join("\n\n")}`);
  return { markdown: sections.join("\n\n"), sources: publicSources, missingInputs: [...validated.plan.missingInputs] };
};
