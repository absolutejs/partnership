import type { SearchSource } from "@absolutejs/search";
export type StructuredResearch = {
  status: "grounded" | "partial" | "empty" | "unavailable";
  text: string;
  sources: SearchSource[];
  findings: {
    claim: string;
    sourceId: string;
    quote: string;
    eventDate?: string;
  }[];
  limitations: string[];
  generatedAt: string;
};
export type ResearchMetadata = {
  analysisStatus?: "reviewed" | "partial" | "unverified";
  fieldEvidence?: import("./researchReview").FieldEvidence[];
  generatedAt: string;
  /** Legacy timestamp retained for compatibility; researchStatus determines availability. */
  researchedAt: string;
  researchStatus:
    | "grounded"
    | "partial"
    | "empty"
    | "unavailable"
    | "unverified";
  evidence: SearchSource[];
  researchFindings: StructuredResearch["findings"];
  researchLimitations: string[];
};
export const researchMetadata = (
  research: StructuredResearch | string | null,
): ResearchMetadata => ({
  generatedAt: new Date().toISOString(),
  researchedAt:
    typeof research === "object" && research ? research.generatedAt : "",
  researchStatus:
    typeof research === "string"
      ? "unverified"
      : (research?.status ?? "unavailable"),
  evidence: typeof research === "object" && research ? research.sources : [],
  researchFindings:
    typeof research === "object" && research ? research.findings : [],
  researchLimitations:
    typeof research === "object" && research
      ? research.limitations
      : [
          "Live source-bound research unavailable; this analysis is unverified.",
        ],
});
export const researchPromptData = (
  research: StructuredResearch | string | null,
) =>
  typeof research === "object" && research
    ? research
    : {
        status: research ? "unverified" : "unavailable",
        text: research ?? "",
        instructions:
          "No source-bound live research is available. Do not invent current facts, recency, source citations or verified findings. Mark unknowns explicitly. Use only supplied partner/member facts and label hypotheses.",
      };
