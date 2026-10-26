import { expect, test } from "bun:test";
import { buildAssetEvidence, renderAssetEvidencePlan, validateAssetEvidenceDocument, calculateAssetScenario } from "../src/assetEvidence";
const sources = [{ id: "intake:1", kind: "intake", label: "Founder intake", content: JSON.stringify({ actual: "We sold 41 tickets. We aim for 137 next quarter.", boundary: "No exclusivity.", revenue: 6200, price: 100, clientPrice: 200 }) }];
const records = buildAssetEvidence(sources);
const fact = records.find(record => record.text === "We sold 41 tickets.")!;
const plan = { sections: [{ heading: "Proof and track record", blocks: [{ kind: "source", evidenceId: fact.id }, { kind: "proposal", text: "Consider a workshop pilot." }] }], missingInputs: [] };
test("only exact server-owned evidence renders as factual content", () => {
 const result = renderAssetEvidencePlan(sources, plan);
 expect(result.markdown).toContain("> We sold 41 tickets\\.");
 expect(result.markdown).toContain("Recorded intake information");
 expect(result.markdown).toContain("**Proposed:** Consider a workshop pilot\\.");
 expect(result.evidenceDocument.citations[0]?.pointer).toBe("/actual");
 expect(validateAssetEvidenceDocument(sources, result.markdown, result.evidenceDocument)).toEqual(result);
});
test("invented IDs, model quotations and factual headings cannot bypass references", () => {
 expect(() => renderAssetEvidencePlan(sources, { ...plan, sections:[{heading:"Proof and track record",blocks:[{kind:"source",evidenceId:"made-up"}]}] })).toThrow();
 expect(() => renderAssetEvidencePlan(sources, { ...plan, sections:[{heading:"Proof and track record",blocks:[{kind:"source",evidenceId:fact.id,text:"We sold 999 tickets"}]}] })).toThrow();
 expect(() => renderAssetEvidencePlan(sources, { ...plan, sections:[{heading:"Guaranteed 999 sales",blocks:plan.sections[0]!.blocks}] })).toThrow();
});
test("source edits, metadata edits and document edits invalidate persisted proof", () => {
 const result=renderAssetEvidencePlan(sources,plan);
 expect(()=>validateAssetEvidenceDocument(sources,result.markdown+"\nGuaranteed results",result.evidenceDocument)).toThrow();
 expect(()=>validateAssetEvidenceDocument([{...sources[0]!,content:sources[0]!.content.replace("41","999")}],result.markdown,result.evidenceDocument)).toThrow();
 expect(()=>validateAssetEvidenceDocument(sources,result.markdown,{...result.evidenceDocument,citations:[{...fact,text:"999"}]})).toThrow();
});
test("duplicate source IDs fail rather than silently overwriting evidence",()=>expect(()=>buildAssetEvidence([...sources,...sources])).toThrow());
test("unverified research and hostile source formatting remain labeled inert text",()=>{
 const hostile=[{id:"research",label:"Research",kind:"match",content:"<script>alert(1)</script> [fake](https://example.com)"}];
 const evidence=buildAssetEvidence(hostile);
 const result=renderAssetEvidencePlan(hostile,{sections:[{heading:"Overview",blocks:[{kind:"source",evidenceId:evidence[0]!.id}]}],missingInputs:[]});
 expect(result.markdown).toContain("Unverified research / match record");
 expect(result.markdown).not.toContain("<script>");
 expect(result.markdown).not.toContain("[fake](");
});
test("scenario math is server-computed and rejects invented amounts or incompatible units",()=>{
 const amount=(pointer:string)=>({value:Number(records.find(record=>record.pointer===pointer)!.text),currency:"USD",period:"annual" as const,evidenceId:records.find(record=>record.pointer===pointer)!.id});
 const input={revenue:amount("/revenue"),partnerPrice:amount("/price"),clientPrice:amount("/clientPrice"),evidence:records,assumptions:["Same annual price across customers; scenario assumes every estimated customer converts."]};
 expect(calculateAssetScenario(input).potentialRevenue).toBe(12400);
 expect(()=>calculateAssetScenario({...input,partnerPrice:{...input.partnerPrice,value:1}})).toThrow();
 expect(()=>calculateAssetScenario({...input,clientPrice:{...input.clientPrice,currency:"EUR"}})).toThrow();
 expect(()=>calculateAssetScenario({...input,assumptions:[]})).toThrow();
});

test("JSONB key reordering preserves a valid construction record",()=>{
 const result=renderAssetEvidencePlan(sources,plan);
 const reordered=JSON.parse(JSON.stringify(result.evidenceDocument),(_key,value)=>value && !Array.isArray(value) && typeof value==='object' ? Object.fromEntries(Object.entries(value).reverse()) : value);
 const reorderedSources=sources.map(source=>({content:source.content,label:source.label,kind:source.kind,id:source.id}));
 expect(()=>validateAssetEvidenceDocument(reorderedSources,result.markdown,reordered)).not.toThrow();
});

test("draft request sends compact references rather than repeating integrity metadata", async()=>{
 const {draftPartnershipAsset}=await import("../src/assets");
 const result=await draftPartnershipAsset({assetType:"deal_memo",bounds:{markdownMin:1,markdownMax:10000,titleMin:1,titleMax:100},sources,match:{},profile:{}},{generateObject:async request=>{
   const payload=JSON.parse(request.messages[0]!.content);
   expect(payload.sources[0].records[0].reference).toBe("e1");
   expect(request.messages[0]!.content).not.toContain("sourceDigest");
   expect(()=>request.validate({sections:[{heading:"Overview",blocks:[{kind:"source",evidenceId:"e999999"}]}],missingInputs:[]})).toThrow();
   return {object:request.validate({sections:[{heading:"Overview",blocks:[{kind:"source",evidenceId:"e1"}]}],missingInputs:[]})};
 }});
 expect(result.evidenceDocument.citations[0]?.id).toBe(records[0]?.id);
});

test("an explicitly empty source snapshot is not replaced with synthetic sources",async()=>{
 const {editPartnershipAsset}=await import("../src/assets");
 const result=await editPartnershipAsset({assetType:"deal_memo",bounds:{markdownMin:1,markdownMax:10000,titleMin:1,titleMax:100},sources:[],currentMarkdown:"Old draft",currentTitle:"Memo",instructions:"Ask what is missing"},{generateObject:async request=>({object:request.validate({sections:[{heading:"Next steps",blocks:[{kind:"question",text:"What information can you provide?"}]}],missingInputs:[]})})});
 expect(()=>validateAssetEvidenceDocument([],result.markdown,result.evidenceDocument)).not.toThrow();
});
