import { expect, test } from "bun:test";
import { ASSET_FORMATS } from "../src/assetFormats";
import { PARTNERSHIP_ASSET_TYPES, draftPartnershipAsset, editPartnershipAsset } from "../src/assets";
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

test('composition exposes expanded quotation costs and actionable repair feedback', async () => {
 await draftPartnershipAsset({assetType:'sell_sheet',bounds:{markdownMin:1,markdownMax:50000,titleMin:1,titleMax:100},sources:[{id:'facts',label:'Intake',content:'We sell workshops. '+ 'Detail '.repeat(310)+'.'}],match:{},profile:{}},{generateObject:async req=>{
  const payload=JSON.parse(req.messages[0]!.content);
  const records=payload.sources[0].records;
  expect(records[0].words).toBe(3);
  expect(records[1].words).toBeGreaterThan(300);
  expect(payload.compositionBudget.targetWords).toBeLessThan(300);
  expect(()=>req.validate({sections:[{heading:'Offer',blocks:[{kind:'source',evidenceId:records[1].reference,use:'background'}]}],missingInputs:[]})).toThrow('Rendered block costs:');
  return {object:req.validate({sections:[{heading:'Offer',blocks:[{kind:'source',evidenceId:records[0].reference,use:'background'}]}],missingInputs:[]})};
 }});
});

test('non-legal sheets can compose concise cited prose without changing their evidence',async()=>{
 const result=await draftPartnershipAsset({assetType:'sell_sheet',bounds:{markdownMin:1,markdownMax:10000,titleMin:1,titleMax:100},sources,profile:{},match:{}},{generateObject:async req=>{
  expect(()=>req.validate({sections:[{heading:'Offer',blocks:[{kind:'statement',text:'Workshops are available.',evidenceIds:['invented']}]}],missingInputs:[]})).toThrow('Unknown statement source');
  return {object:req.validate({sections:[{heading:'Offer',blocks:[{kind:'statement',text:'Workshops are available.',evidenceIds:['e1']}]}],missingInputs:[]})};
 }});
 expect(result.evidenceDocument?.citations[0]?.text).toBe('We sell workshops.');
 expect(result.markdown).toContain('Workshops are available');
 await expect(draftPartnershipAsset({assetType:'term_sheet',bounds:{markdownMin:1,markdownMax:10000,titleMin:1,titleMax:100},sources,profile:{},match:{}},{generateObject:async req=>({object:req.validate({sections:[{heading:'Scope',blocks:[{kind:'statement',text:'Workshops are available.',evidenceIds:['e1']}]}],missingInputs:[]})})})).rejects.toThrow();
});

 test('authored prose budgets are enforced in the provider schema without truncating citations',async()=>{
 await draftPartnershipAsset({assetType:'sell_sheet',bounds:{markdownMin:1,markdownMax:10000,titleMin:1,titleMax:100},sources,profile:{},match:{}},{generateObject:async req=>{
 const payload=JSON.parse(req.messages[0]!.content);
 expect(payload.compositionBudget.maxAuthoredBlockWords).toBe(25);
 expect(JSON.stringify(req.schema)).toContain('pattern');
 expect(req.systemPrompt).not.toContain('Only announcement documents');
 const plan=(text:string)=>({sections:[{heading:'Offer',blocks:[{kind:'statement',text,evidenceIds:['e1']}]}],missingInputs:[]});
 expect(()=>req.validate(plan('word '.repeat(26)))).toThrow('at most 25 words');
 return {object:req.validate(plan('We sell workshops.'))};
 }});
 });

test('bounded repairs preserve every untouched block and its exact citations',async()=>{
 const input={assetType:'sell_sheet' as const,bounds:{markdownMin:1,markdownMax:10000,titleMin:1,titleMax:100},sources,profile:{},match:{}};
 const original=await draftPartnershipAsset(input,{generateObject:async req=>({object:req.validate({sections:[
 {heading:'Offer',blocks:[{kind:'statement',text:'We sell workshops.',evidenceIds:['e1']}]},
 {heading:'Audience',blocks:[{kind:'statement',text:'Everyone buys workshops.',evidenceIds:['e1']}]},
 {heading:'Talking points',blocks:[{kind:'source',evidenceId:'e2',use:'past_result'}]},
 ],missingInputs:[]})})});
 const result=await editPartnershipAsset({...input,currentMarkdown:original.markdown,currentTitle:original.title,currentEvidenceDocument:original.evidenceDocument,instructions:'Correct the unsupported audience.'},{generateObject:async req=>{
 const patch={replacements:[{index:1,blocks:[{kind:'statement',text:'Workshop customers.',evidenceIds:['e1']}]}],additionalSections:[],missingInputs:[]};
 expect(JSON.parse(req.messages[0]!.content).current.blocks).toHaveLength(3);
 expect(()=>req.validate({...patch,replacements:[...patch.replacements,...patch.replacements]})).toThrow('only once');
 expect(()=>req.validate({...patch,replacements:[{...patch.replacements[0],index:99}]})).toThrow();
 expect(()=>req.validate({...patch,replacements:[{index:1,blocks:[{kind:'statement',text:'Unsupported.',evidenceIds:['invented']}]}]})).toThrow('Unknown statement source');
 return {object:req.validate(patch)};
 }});
 expect(result.evidenceDocument.plan.sections[0]).toEqual(original.evidenceDocument.plan.sections[0]);
 expect(result.evidenceDocument.plan.sections[2]).toEqual(original.evidenceDocument.plan.sections[2]);
 expect(result.evidenceDocument.citations).toEqual(original.evidenceDocument.citations);
 expect(result.markdown).not.toContain('Everyone');
 await expect(editPartnershipAsset({...input,currentMarkdown:original.markdown+'changed',currentTitle:original.title,currentEvidenceDocument:original.evidenceDocument,instructions:'Edit'}, {generateObject:async()=>{throw Error('Provider must not run');}})).rejects.not.toThrow('Provider must not run');
});

test('bounded repairs cannot carry proposal blocks into a legal document',async()=>{
 const input={assetType:'proposal' as const,bounds:{markdownMin:1,markdownMax:10000,titleMin:1,titleMax:100},sources,profile:{},match:{}};
 const original=await draftPartnershipAsset(input,{generateObject:async req=>({object:req.validate({sections:[{heading:'Scope',blocks:[{kind:'proposal',text:'Consider a workshop pilot.'}]}],missingInputs:[]})})});
 await expect(editPartnershipAsset({...input,assetType:'term_sheet',currentMarkdown:original.markdown,currentTitle:original.title,currentEvidenceDocument:original.evidenceDocument,instructions:'Keep the scope.'},{generateObject:async req=>({object:req.validate({replacements:[],additionalSections:[],missingInputs:[]})})})).rejects.toThrow('Legal documents may contain only');
});

test('rejected factual blocks can require exact evidence while preserving other content',async()=>{
 const input={assetType:'sell_sheet' as const,bounds:{markdownMin:1,markdownMax:10000,titleMin:1,titleMax:100},sources,profile:{},match:{}};
 const original=await draftPartnershipAsset(input,{generateObject:async req=>({object:req.validate({sections:[{heading:'Offer',blocks:[{kind:'statement',text:'Guaranteed workshop results.',evidenceIds:['e1']}]}],missingInputs:[]})})});
 const result=await editPartnershipAsset({...input,currentMarkdown:original.markdown,currentTitle:original.title,currentEvidenceDocument:original.evidenceDocument,sourceOnlyBlockIndexes:[0],instructions:'Correct the unsupported promise.'},{generateObject:async req=>{
 const patch=(blocks:unknown[])=>({replacements:[{index:0,blocks}],additionalSections:[],missingInputs:[]});
 expect(()=>req.validate(patch([{kind:'statement',text:'Different guaranteed results.',evidenceIds:['e1']}]))).toThrow('complete source references');
 expect(()=>req.validate(patch([{kind:'proposal',text:'We guarantee workshop results.'}]))).toThrow('complete source references');
 expect(JSON.parse(req.messages[0]!.content).current.blocks[0].sourceOnly).toBe(true);
 return {object:req.validate(patch([{kind:'source',evidenceId:'e1',use:'background'}]))};
 }});
 expect(result.evidenceDocument.plan.sections[0]?.blocks[0]?.kind).toBe('source');
 expect(result.evidenceDocument.citations[0]?.text).toBe('We sell workshops.');
});
