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
   const block={kind:'source',evidenceId:'e1'};
   expect(()=>req.validate({sections:[{heading:format.headings[0],blocks:[block]},{heading:format.headings[0],blocks:[block]}],missingInputs:[]})).toThrow('only once');
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
 await expect(draftPartnershipAsset({assetType:'outreach_email',bounds:{markdownMin:1,markdownMax:50000,titleMin:1,titleMax:100},sources:[{id:'long',label:'Intake',content:'Words '.repeat(250)+'.'}],match:{},profile:{}},{generateObject:async req=>({object:req.validate({sections:[{heading:'Opening',blocks:[{kind:'source',evidenceId:'e1'}]}],missingInputs:[]})})})).rejects.toThrow('word limit');
});
