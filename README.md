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
