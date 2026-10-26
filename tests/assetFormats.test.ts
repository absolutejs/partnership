import { expect, test } from "bun:test";
import { ASSET_FORMATS } from "../src/assetFormats";
import { PARTNERSHIP_ASSET_TYPES, draftPartnershipAsset } from "../src/assets";
import { presentAssetEvidenceDocument } from "../src/assetEvidence";
const sources=[{id:'intake',label:'Intake',kind:'intake',content:'We sell workshops. We sold 41 tickets.'}];
for(const assetType of PARTNERSHIP_ASSET_TYPES){
 test(`${assetType} receives its own structure and preserves cited facts`,async()=>{
  const format=ASSET_FORMATS[assetType];
  const result=await draftPartnershipAsset({assetType,bounds:{markdownMin:1,markdownMax:10000,titleMin:1,titleMax:100},sources,profile:{},match:{}},{generateObject:async req=>{
   const payload=JSON.parse(req.messages[0]!.content);
   expect(payload.format).toEqual(format);
   expect(JSON.stringify(req.schema)).toContain(format.headings[0]);
   const block={kind:'source',evidenceId:'e1',use:'background'};
   const deduped=req.validate({sections:[{heading:format.headings[0],blocks:[block]},{heading:format.headings[0],blocks:[block]}],missingInputs:[]});
   expect(deduped.sections).toHaveLength(1);
   expect(deduped.sections[0].blocks).toHaveLength(1);
   const perSection=Math.max(1,Math.floor(format.maxBlocks/format.maxSections));
   expect(payload.compositionBudget.maxBlocksPerSection).toBe(perSection);
   expect(JSON.stringify(req.schema)).toContain('\"maxItems\":'+perSection);
   expect(()=>req.validate({sections:[{heading:format.headings[0],blocks:Array.from({length:perSection+1},()=>({kind:'proposal',text:'Consider a discovery conversation.'}))}],missingInputs:[]})).toThrow();
   return {object:req.validate({sections:[{heading:format.headings[0],blocks:[block]}],missingInputs:[]})};
  }});
  const display=presentAssetEvidenceDocument(sources,result.markdown,result.evidenceDocument,{assetType});
  expect(display.markdown).toContain(format.mode === 'email' ? 'We sell workshops' : 'Offer: workshops');
  expect(display.sources[0]!.excerpts).toEqual(['We sell workshops.']);
 });
}
test('short formats reject long content rather than silently truncating it',async()=>{
 await expect(draftPartnershipAsset({assetType:'outreach_email',bounds:{markdownMin:1,markdownMax:50000,titleMin:1,titleMax:100},sources:[{id:'long',label:'Intake',content:'Words '.repeat(250)+'.'}],match:{},profile:{}},{generateObject:async req=>({object:req.validate({sections:[{heading:'Opening',blocks:[{kind:'source',evidenceId:'e1',use:'background'}]}],missingInputs:[]})})})).rejects.toThrow('word limit');
});

test('legal generation delegates draft status to the renderer',()=>{
 for(const key of ['loi','mou','term_sheet'] as const)expect([...ASSET_FORMATS[key].headings]).not.toContain('Non-binding status');
});

test('legal construction cannot invent terms behind a proposed label',async()=>{
 for(const assetType of ['loi','mou','term_sheet'] as const){
 await expect(draftPartnershipAsset({assetType,bounds:{markdownMin:1,markdownMax:10000,titleMin:1,titleMax:100},sources,profile:{},match:{}},{generateObject:async req=>({object:req.validate({sections:[{heading:ASSET_FORMATS[assetType].headings[0],blocks:[{kind:'proposal',text:'Either party may terminate on 14 days notice.'}]}],missingInputs:[]})})})).rejects.toThrow();
 }
});
test('generation rejects semantic placement errors before rendering exact source records',async()=>{
 await draftPartnershipAsset({assetType:'qbr',bounds:{markdownMin:1,markdownMax:10000,titleMin:1,titleMax:100},sources,profile:{},match:{}},{generateObject:async req=>{
  const plan=(heading:string,use:string)=>({sections:[{heading,blocks:[{kind:'source',evidenceId:'e1',use}]}],missingInputs:[]});
  expect(()=>req.validate(plan('Results','objective'))).toThrow('achieved outcomes');
  expect(()=>req.validate(plan('Results','baseline'))).toThrow('achieved outcomes');
  expect(()=>req.validate(plan('Progress','background'))).toThrow('actual activity');
  expect(()=>req.validate(plan('Decision','superseded'))).toThrow('correction chatter');
  const accepted=req.validate(plan('Objectives','objective'));
  expect(accepted.sections[0]?.blocks[0]).not.toHaveProperty('use');
  return {object:accepted};
 }});
});
