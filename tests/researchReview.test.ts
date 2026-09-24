import { expect, test } from "bun:test";
import { reviewResearchAnalysis } from "../src/researchReview";
import type { StructuredResearch } from "../src/researchEvidence";
const research: StructuredResearch = {
  status: "grounded",
  text: "Acme builds software.",
  sources: [
    {
      id: "s",
      url: "https://acme.com",
      title: "Acme",
      retrievedAt: "2026-09-24",
      excerpts: ["Acme builds partner software."],
    },
  ],
  findings: [],
  limitations: [],
  generatedAt: "2026-09-24",
};
test("field bindings reject invented quotations and leave unsupported facts unresolved", async () => {
  const result = await reviewResearchAnalysis(
    {
      summary: "Acme builds partner software.",
      trackRecord: ["Acme raised $20M."],
      affiliations: [
        { name: "Parent", domains: ["parent.com"], relationship: "owned by" },
      ],
    },
    research,
    {},
    {
      generateObject: async (request) => ({
        object: request.validate({
          fields: [
            {
              path: "summary",
              verdict: "supported",
              sourceId: "s",
              quote: "Acme builds partner software.",
              reason: "Explicit source statement",
            },
            {
              path: "trackRecord.0",
              verdict: "supported",
              sourceId: "s",
              quote: "Acme raised $20M.",
              reason: "Invented quote",
            },
          ],
        }),
      }),
    },
  );
  expect(result.summary).toBe("Acme builds partner software.");
  expect(result.trackRecord).toEqual([
    "Not established by the available evidence.",
  ]);
  expect(result.affiliations).toEqual([]);
  expect(result.analysisStatus).toBe("partial");
  expect(result.fieldEvidence?.[0]?.sourceId).toBe("s");
});
test("knowledge-only input is explicitly unverified and has no fresh research timestamp", async () => {
  const result = await reviewResearchAnalysis(
    { summary: "Legacy analysis" },
    null,
    {},
    {
      generateObject: async () => {
        throw Error("must not review without evidence");
      },
    },
  );
  expect(result.analysisStatus).toBe("unverified");
  expect(result.researchedAt).toBe("");
  expect(result.fieldEvidence?.[0]?.verdict).toBe("unresolved");
});
