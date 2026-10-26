# @absolutejs/partnership

In-house **partnership & relationship intelligence** for AbsoluteJS apps — AI
reasoning over the partnership lifecycle, so you don't pay a deal-copilot SaaS
per seat for the parts you can run yourself.

Each primitive is a **pure function of typed input + an injected AI call**. The
package owns the prompt, the JSON Schema, the tool contract, and the result
mapping. Your app supplies the generation call — and with it the provider,
billing/metering, timeouts, and any fallback. The package never imports a
provider and never touches your ledger.

## Install

```sh
bun add @absolutejs/partnership
```

## Wiring (one-time)

Bridge the package's `generateObject` to whatever you already use for structured
generation. If you use `@absolutejs/ai` (directly or behind a metering wrapper),
it's one line — the request shape is the subset of `generateObjectAI`'s options
the package controls, minus `provider` and your metering fields:

```ts
import type { GenerateObject } from "@absolutejs/partnership";
import { meteredGenerateObjectAI } from "./usage/meteredAI";
import { aiProvider } from "./integrations/aiProvider";

export const partnershipCtx = (userSub?: string | null) => ({
  generateObject: ((req) =>
    meteredGenerateObjectAI({ ...req, provider: aiProvider, userSub })) as GenerateObject,
});
```

The package passes its own `feature` tag through (`"trustFit"`, `"classifyMatch"`,
`"personConnection"`, `"verification"`), so your usage ledger keeps its existing
per-feature breakdown.

## Primitives (Wave 1A)

| Function | Returns |
| --- | --- |
| `scoreTrustFit(input, ctx)` | four 0–1 dimensions (audience overlap, capability, mutual value, credibility) + three per-score reasons |
| `classifyRelationship(input, ctx)` | relationship type, official name + domain, receptiveness, competitor out-serve play |
| `frameConnection(input, ctx)` | why-connect / shared-ground / mutual-value / conversation-starter for a specific person |
| `verifyPartner(input, ctx)` | structured Verification Dossier (credibility, track record, audience overlap, economics, open questions) |

```ts
import { scoreTrustFit } from "@absolutejs/partnership";

const { dimensions, reasons } = await scoreTrustFit(
  {
    member: { niche: "devtools", offer: "hosted CI", audienceSize: "10k" },
    partner: { company: companyData, person: personData, reasoning },
    priorScores: { theirReceptiveness: 0.4, yourFit: 0.9 },
  },
  partnershipCtx(userSub),
);
```

### Web-grounded primitives

`verifyPartner` optionally takes an injected `research` call (e.g. your
`@absolutejs/discover` web-research) on the context. Omit it and synthesis falls
back to knowledge-only:

```ts
await verifyPartner(input, {
  ...partnershipCtx(userSub),
  research: (system, user) => webResearch(system, user),
});
```

## Fallbacks

Primitives **throw** on a model or validation failure. Heuristic fallbacks (e.g.
deriving rough Trust & Fit dimensions from a match's existing signals) are
app-specific, so they stay in your wrapper — catch and degrade however your UI
needs.

## License

BSL 1.1 → Apache 2.0 on the Change Date (see `LICENSE`). You may build and ship
your own apps and SaaS on top of it; you may not offer it as a competing hosted
partnership-intelligence / deal-copilot service.

## Research evidence (0.1)

`ResearchFn` accepts structured research alongside legacy `string | null`. Verification, competitor analysis and meeting preparation retain `researchStatus`, sources, findings and limitations. `researchedAt` is empty when source-bound research was unavailable; `generatedAt` is always generation time. Existing string research remains explicitly unverified.

Structured research invokes a separate `researchEvidenceReview` generation through the host's `generateObject`, which must be budgeted and metered like the initial synthesis. `fieldEvidence` binds reviewed output paths to exact source excerpts, supplied input, proposed assessments or unresolved facts. Unsupported factual text becomes unresolved, and corporate affiliations are removed unless every textual field is source-supported. `analysisStatus` describes that review; numeric scores remain interpretations, not verified facts. A model's entailment judgment still requires human review for consequential decisions.

### Partner Revenue Pipeline

`calculatePartnerRevenuePipeline` (also in the browser-safe `@absolutejs/partnership/revenue` entry) computes company revenue divided by annual recurring pricing as **customer equivalents**, then multiplies by the client's annual pricing as a **theoretical annual revenue opportunity**. This assumes 100% conversion and is not a customer count or revenue forecast. Results retain evidence, assumptions, limitations, and low scenario confidence.

Supply `partnerAnnualRevenue`, `partnerPricing`, and `clientPricing` as `RevenueAmount` objects (or `null`). Each amount includes `amount`, ISO currency, `period` (`month` or `year`), billing `unit` (`company`, `customer`, or `seat`), and evidence (`basis`, `sourceTitle`, exact `quote`, ISO `observedAt`, confidence, and source URL for documented claims). Pricing units and currencies must align. Seat prices cannot be used as customer prices. Usage-based businesses require a sourced or client-reported yearly customer value with `pricingModel: "annual_customer_value"`; do not multiply a per-call price by twelve.

`researchPartnerRevenuePipeline(input, researchContext)` uses the host's injected, metered research and structured-generation calls. Wire Brave-backed research through the existing `ResearchContext.research` contract. Only structured, retained source quotes with matching numeric amounts can populate research inputs. Unknown revenue, incomparable business scope, missing prices and unsupported evidence remain unavailable. Research cannot guarantee a public revenue disclosure exists. No foreign-exchange conversion is implicit.

When `clientPricing` is missing, supply `clientName` and optionally `clientWebsite` to research the client's public recurring pricing alongside partner revenue and pricing (three query intents). Explicit client pricing always wins and skips the extra query. Usage-based prices remain unknown unless there is an explicit source-supported annual customer value.

### Source-backed asset construction (0.3)

`draftPartnershipAsset` and `editPartnershipAsset` return `evidenceDocument`
with the title and Markdown. Persist it with the immutable input sources.
Factual blocks select whole source records by content-addressed ID. The server
renders their exact text, source label, provenance, JSON pointer and reference.
`validateAssetEvidenceDocument(sources, markdown, evidenceDocument)` rejects
changed sources, citations, plans or output. Call it before publication/export.
Existing prose is editing context, never new evidence.

Source quotations are **reported information, not verified truth**. Intake
summaries can themselves contain AI errors. Hosts must distinguish primary
records from summaries and retain their source snapshots. Sources are escaped
as inert text; their content cannot choose its own provenance classification.

Proposal and question blocks remain model-authored, visibly labeled, and must
pass a host-side review rejecting any factual assertion or presupposition.
Construction alone cannot establish semantic truth or appropriate proposals.
`calculateAssetScenario` computes a labeled scenario from complete numeric
source fields, matching annual periods/currencies, and explicit assumptions;
it rejects invented amounts and never represents potential revenue as guaranteed.

### Evidence eligibility

A stored AI analysis is not primary evidence. Match sources are context-only by default. Hosts may set `evidenceSelection` to exact JSON-pointer fields and optional decoded-text `start`/`end` spans. Use it to select original user turns, supplied documents, or independently retained evidence; never grant eligibility to generated reasoning simply because it is stored. An empty selection produces no factual records. Selection metadata is included in the construction digest, and validation rejects old documents that used excluded records. Offsets still address the original immutable decoded source value. This establishes provenance, not the truth of a source or completeness of a model's selection.
