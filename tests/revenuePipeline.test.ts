import { describe, expect, test } from "bun:test";
import { calculatePartnerRevenuePipeline, researchPartnerRevenuePipeline, type RevenueAmount } from "../src/revenuePipeline";
const money = (amount: number): RevenueAmount => ({ amount, currency: "USD", period: "year", unit: "company", evidence: { basis: "documented", sourceUrl: "https://example.com/pricing", sourceTitle: "Official pricing", quote: "Annual pricing and revenue", observedAt: new Date().toISOString(), confidence: "high" } });
const input = () => ({ partnerAnnualRevenue: money(1200000), partnerPricing: money(1200), clientPricing: money(240) });
describe("partner revenue scenarios", () => {
 test("annualizes monthly pricing without rounding customer equivalents", () => { const i=input(); i.partnerPricing.amount=100; i.partnerPricing.period="month"; const r=calculatePartnerRevenuePipeline(i); expect(r.customerEquivalents).toBe(1000); expect(r.potentialPartnerRevenue).toBe(240000); expect(r.confidence).toBe("low"); expect(r.assumptions.join(" ")).toContain("100% conversion"); });
 test("missing client value never becomes zero or fabricated opportunity", () => {const r=calculatePartnerRevenuePipeline({...input(),clientPricing:null}); expect(r.status).toBe("unavailable"); expect(r.potentialPartnerRevenue).toBeNull(); });
 test.each([0,-1,Infinity,NaN])("invalid amount %s", amount => {const i=input();i.partnerPricing.amount=amount;expect(calculatePartnerRevenuePipeline(i).status).toBe("unavailable");});
 test("rejects currencies, seats, mixed units and overflow", () => {for(const mutate of [(i:ReturnType<typeof input>)=>i.clientPricing.currency="EUR",(i:ReturnType<typeof input>)=>i.partnerPricing.unit="seat",(i:ReturnType<typeof input>)=>i.clientPricing.unit="customer",(i:ReturnType<typeof input>)=>{i.partnerAnnualRevenue.amount=Number.MAX_VALUE;i.partnerAnnualRevenue.period="month"}]){const i=input();mutate(i);expect(calculatePartnerRevenuePipeline(i).status).toBe("unavailable");}});
 test("documented values require source; client reports preserve attribution", () => {const i=input();delete i.clientPricing.evidence.sourceUrl;expect(calculatePartnerRevenuePipeline(i).status).toBe("unavailable");i.clientPricing.evidence.basis="client_reported";expect(calculatePartnerRevenuePipeline(i).status).toBe("available");});
 test("explicit annual customer value cannot be monthly",()=>{const i=input();i.clientPricing.pricingModel="annual_customer_value";i.clientPricing.period="month";expect(calculatePartnerRevenuePipeline(i).status).toBe("unavailable");});
 test("future dates rejected, stale evidence surfaced",()=>{const i=input();i.partnerPricing.evidence.observedAt="2099-01-01T00:00:00.000Z";expect(calculatePartnerRevenuePipeline(i).status).toBe("unavailable");i.partnerPricing.evidence.observedAt="2020-01-01T00:00:00.000Z";expect(calculatePartnerRevenuePipeline(i).limitations.join()).toContain("over one year old");});
 test("unverified string research cannot manufacture revenue",async()=>{const r=await researchPartnerRevenuePipeline({partnerName:"Example"},{research:async()=>"$100m",generateObject:async()=>{throw Error("must not call")}});expect(r.status).toBe("unavailable");});
 test("extracted citation must match a retained source and quote",async()=>{const r=await researchPartnerRevenuePipeline({partnerName:"Example",clientPricing:money(240)},{research:async()=>({status:"grounded",text:"",sources:[],findings:[],limitations:[],generatedAt:new Date().toISOString()}),generateObject:async(req)=>({object:req.validate({partnerAnnualRevenue:money(1200000),partnerPricing:money(1200),assumptions:[]})})});expect(r.status).toBe("unavailable");expect(r.limitations.join()).toContain("retained source quote");});
});

describe("client pricing research", () => {
  const run = async (explicit?: RevenueAmount, extractedClient = money(240)) => {
    let prompt = "";
    const revenue = money(1200000), price = money(1200);
    revenue.evidence.quote = "Company annual revenue was USD 1.2 million.";
    price.evidence.quote = "Partner subscription costs USD 1200 per company per year.";
    extractedClient.evidence.quote = "Client subscription costs USD 240 per company per year.";
    extractedClient.evidence.sourceUrl = "https://client.example/pricing";
    const values = [revenue, price, extractedClient];
    const result = await researchPartnerRevenuePipeline({partnerName:"Partner",clientName:"Client",clientWebsite:"https://client.example",clientPricing:explicit}, {
      research: async (_system, user) => {prompt=user;return {status:"grounded",text:"",sources:values.map((v,i)=>({id:`s${i}`,url:v.evidence.sourceUrl!,title:v.evidence.sourceTitle})),findings:values.map((v,i)=>({claim:v.evidence.quote,quote:v.evidence.quote,sourceId:`s${i}`})),limitations:[],generatedAt:new Date().toISOString()};},
      generateObject: async(req)=>({object:req.validate({partnerAnnualRevenue:revenue,partnerPricing:price,clientPricing:extractedClient,assumptions:[]})}),
    });
    return {result,prompt:JSON.parse(prompt)};
  };
  test("researches and calculates sourced client subscription price",async()=>{const {result,prompt}=await run();expect(prompt.queries).toHaveLength(5);expect(prompt.queries[4]).toContain("client.example");expect(result.status).toBe("available");expect(result.potentialPartnerRevenue).toBe(240000);expect(result.inputs.clientPricing?.evidence.sourceUrl).toBe("https://client.example/pricing");});
  test("explicit client value wins and skips client search",async()=>{const explicit=money(480);explicit.evidence.basis="client_reported";const {result,prompt}=await run(explicit);expect(prompt.queries).toHaveLength(4);expect(result.inputs.clientPricing).toEqual(explicit);expect(result.potentialPartnerRevenue).toBe(480000);});
  test("client amount not supported by quote stays unavailable",async()=>{const {result}=await run(undefined,money(2400));expect(result.status).toBe("unavailable");expect(result.inputs.clientPricing).toBeNull();});
});


test("provider revenue is retained when compatible pricing is unavailable", async () => {
  const { PartnerRevenuePipelineSchema, calculatePartnerRevenuePipeline } = await import("../src/revenuePipeline");
  const result = calculatePartnerRevenuePipeline({ partnerAnnualRevenue: null, partnerPricing: null, clientPricing: null });
  result.companyRevenue = { provider: "apollo", providerRecordId: "org-1", domain: "example.com", amount: 1000000, display: "1M", currency: null, observedAt: new Date().toISOString(), basis: "provider_estimate" };
  result.inputs.companyRevenue = result.companyRevenue;
  const recalculated = calculatePartnerRevenuePipeline(result.inputs);
  expect(recalculated.companyRevenue).toEqual(result.companyRevenue);
  const parsed = PartnerRevenuePipelineSchema.parse(result);
  expect(parsed.companyRevenue?.amount).toBe(1000000);
  expect(parsed.potentialPartnerRevenue).toBeNull();
});


test("provider revenue can support a labeled estimate when pricing is compatible", () => {
  const pricing = { amount: 1000, currency: "USD", period: "year" as const, unit: "company" as const, evidence: { basis: "client_reported" as const, sourceTitle: "Explicit price", quote: "Annual company price USD 1000", observedAt: new Date().toISOString(), confidence: "medium" as const } };
  const result = calculatePartnerRevenuePipeline({
    partnerAnnualRevenue: null, partnerPricing: pricing, clientPricing: pricing,
    companyRevenue: { provider: "apollo", providerRecordId: "org-1", domain: "example.com", amount: 1000000, display: "1M", currency: "USD", observedAt: new Date().toISOString(), basis: "provider_estimate" },
  });
  expect(result.potentialPartnerRevenue).toBe(1000000);
  expect(result.confidence).toBe("low");
  expect(result.inputs.partnerAnnualRevenue?.evidence.basis).toBe("provider_estimate");
});


describe("verified financial quotation binding", () => {
  const extract = async (quote: string, sourceUrl = "https://partner.example/pricing", amount = 79) => {
    const price: RevenueAmount = { ...money(amount), period: "month", unit: "customer", pricingModel: "recurring", evidence: { ...money(amount).evidence, quote, sourceUrl } };
    return researchPartnerRevenuePipeline({ partnerName: "Partner" }, {
      research: async () => ({ status: "grounded", text: "UNREVIEWED_RAW_SENTINEL", sources: [{ id: "pricing", url: "https://partner.example/pricing", title: "Partner pricing", excerpts: ["UNREVIEWED_RAW_SENTINEL"] }], findings: [{ claim: "A recurring plan is available", quote: "Standard plan. USD 79 per customer\nper month. Cancel anytime.", sourceId: "pricing" }], limitations: [], generatedAt: new Date().toISOString() }),
      generateObject: async (request) => {
        expect(JSON.stringify(request.messages)).not.toContain("UNREVIEWED_RAW_SENTINEL");
        return { object: request.validate({ partnerAnnualRevenue: null, partnerPricing: price, assumptions: [] }) };
      },
    });
  };
  test("keeps exact shorter price quotations within a verified passage", async () => {
    const result = await extract("USD 79 per customer per month.");
    expect(result.inputs.partnerPricing?.amount).toBe(79);
    expect(result.inputs.partnerPricing?.period).toBe("month");
  });
  test("rejects fabricated quoted text, incorrect numeric values and wrong source attribution", async () => {
    expect((await extract("USD 89 per customer per month.", undefined, 89)).inputs.partnerPricing).toBeNull();
    expect((await extract("USD 79 per customer per month.", undefined, 790)).inputs.partnerPricing).toBeNull();
    expect((await extract("USD 79 per customer per month.", "https://other.example/pricing")).inputs.partnerPricing).toBeNull();
  });
});


test("financial source metadata comes from retained research, not model guesses", async () => {
  const recordedAt = "2026-10-28T14:00:00.000Z";
  const guessed = money(79);
  const result = await researchPartnerRevenuePipeline({ partnerName: "Partner" }, {
    research: async () => ({ status: "grounded", text: "", sources: [{ id: "s", url: guessed.evidence.sourceUrl!, title: "Recorded official title" }], findings: [{ claim: "Annual price", quote: "USD 79 per year", sourceId: "s" }], limitations: [], generatedAt: recordedAt }),
    generateObject: async (request) => ({ object: request.validate({ partnerAnnualRevenue: null, partnerPricing: { ...guessed, pricingModel: "recurring", evidence: { ...guessed.evidence, quote: "USD 79 per year", observedAt: "2025-01-01T00:00:00.000Z", sourceTitle: "Invented title" } }, assumptions: [] }) }),
  });
  expect(result.inputs.partnerPricing?.evidence.observedAt).toBe(recordedAt);
  expect(result.inputs.partnerPricing?.evidence.sourceTitle).toBe("Recorded official title");
});

describe("bounded financial figures", () => {
  test.each(["<$5 Million", "&lt;$5 Million", "≤ USD 5 million", "Less than $5 million", "Up to $5 million", "$1–5 million", "$1 million to $5 million", "Between $1 million and $5 million", "$5 million+", "Starting at $5 million"])("does not present %s as exact revenue", quote => {
    const value = money(5000000);
    value.evidence.quote = quote;
    const result = calculatePartnerRevenuePipeline({ ...input(), partnerAnnualRevenue: value });
    expect(result.inputs.partnerAnnualRevenue).toBeNull();
    expect(result.potentialPartnerRevenue).toBeNull();
    expect(result.limitations.join(" ")).toContain("bound, range, or starting amount");
    expect(value.evidence.quote).toBe(quote);
  });
  test("rejects starting pricing even when other inputs are available", () => {
    const i = input(); i.partnerPricing.evidence.quote = "Plans start from $1200 per year";
    expect(calculatePartnerRevenuePipeline(i).inputs.partnerPricing).toBeNull();
  });
  test.each(["$5 million annual revenue", "Annual revenue USD 5,000,000", "Annual revenue $5 million. More than 200 employees."])("preserves scalar %s without confusing unrelated quantities", quote => {
    const i=input(); i.partnerAnnualRevenue.amount=5000000; i.partnerAnnualRevenue.evidence.quote=quote;
    const result=calculatePartnerRevenuePipeline(i);
    expect(result.status).toBe("available");
  });
  test.each(["<$5 Million", "$5 Million"])("checks the full retained finding when extracted quote is %s", async quote => {
    const value = money(5000000); value.evidence.quote=quote;
    const result=await researchPartnerRevenuePipeline({partnerName:"REBOOT"},{
      research:async()=>({status:"grounded",text:"",sources:[{id:"s",url:value.evidence.sourceUrl!,title:"Company revenue"}],findings:[{sourceId:"s",claim:"Revenue bracket",quote:"### Revenue\n\n<$5 Million"}],limitations:[],generatedAt:new Date().toISOString()}),
      generateObject:async request=>({object:request.validate({partnerAnnualRevenue:value,partnerPricing:null,assumptions:[]})}),
    });
    expect(result.inputs.partnerAnnualRevenue).toBeNull();
    expect(result.limitations.join(" ")).toContain("bound, range, or starting amount");
  });
});
