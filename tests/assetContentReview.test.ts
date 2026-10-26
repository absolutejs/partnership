import {expect,test} from 'bun:test';
import {reviewAssetContent,assetContentIssues,ASSET_CONTENT_POLICY} from '../src/assetContentReview';
import {buildAssetEvidence,renderAssetEvidencePlan} from '../src/assetEvidence';
const sources=[{id:'intake',label:'Intake',content:'Our target is 137 new customers.'}];
const fact=buildAssetEvidence(sources)[0]!;
const rendered=renderAssetEvidencePlan(sources,{sections:[{heading:'Results',blocks:[{kind:'source',evidenceId:fact.id}]}],missingInputs:[]});
const input={assetType:'qbr' as const,sources,document:rendered.evidenceDocument,markdown:rendered.markdown};
test('reviews source-backed blocks in their section context and gates required inputs',async()=>{
 const review=await reviewAssetContent(input,{generateObject:async req=>{
  const data=JSON.parse(req.messages[0]!.content);
  expect(data).not.toHaveProperty('sources');
  expect(data).not.toHaveProperty('evidence');
  expect(data.blocks[0]).toMatchObject({heading:'Results',text:'Our target is 137 new customers.'});
  expect(req.systemPrompt).toContain('Results/Progress must not present goals');
  expect(()=>req.validate({blocks:[],documentIssues:[],requiredInputs:[]})).toThrow('every block');
  expect(()=>req.validate({blocks:[{index:1,issue:null}],documentIssues:[],requiredInputs:[]})).toThrow('every block');
  return {object:req.validate({blocks:[{index:0,issue:'Move the customer target to Objectives.'}],documentIssues:[],requiredInputs:['Provide the review period and actual partnership results.']})};
 }});
 expect(assetContentIssues(review)).toEqual(['Move the customer target to Objectives.','Provide the review period and actual partnership results.']);
});
test('changed evidence fails before paid content review',async()=>{
 let calls=0;
 await expect(reviewAssetContent({...input,markdown:'changed'},{generateObject:async()=>{calls++;throw Error('must not call');}})).rejects.toThrow('source-backed');
 expect(calls).toBe(0);
});
test('policy rejects operative defaults and unconfirmed announcements even when proposed',()=>{
 expect(ASSET_CONTENT_POLICY).toContain('even when labeled Proposed');
 expect(ASSET_CONTENT_POLICY).toContain('not a collection of intake fields');
 expect(ASSET_CONTENT_POLICY).toContain('stale correction chatter');
 expect(ASSET_CONTENT_POLICY).toContain('Never ask the member to rewrite');
 expect(ASSET_CONTENT_POLICY).toContain('A member-provided confirmation is sufficient');
});

test('unselected intake history is not sent to the paid reviewer',async()=>{
 const largeSources=[...sources,{id:'unselected',label:'Old conversation',content:'UNSELECTED_PRIVATE_CONTEXT '.repeat(10000)}];
 const doc=renderAssetEvidencePlan(largeSources,{sections:[{heading:'Results',blocks:[{kind:'source',evidenceId:fact.id}]}],missingInputs:[]});
 await reviewAssetContent({...input,sources:largeSources,document:doc.evidenceDocument,markdown:doc.markdown},{generateObject:async req=>{
  expect(req.messages[0]!.content).not.toContain('UNSELECTED_PRIVATE_CONTEXT');
  expect(req.messages[0]!.content.length).toBeLessThan(5000);
  return {object:req.validate({blocks:[{index:0,issue:null}],documentIssues:[],requiredInputs:[]})};
 }});
});

test('legacy legal proposals remain blocked even if the reviewer approves them',async()=>{
 const doc=renderAssetEvidencePlan([],{sections:[{heading:'Termination',blocks:[{kind:'proposal',text:'Either party may terminate on 14 days notice.'}]}],missingInputs:[]});
 const result=await reviewAssetContent({assetType:'term_sheet',sources:[],document:doc.evidenceDocument,markdown:doc.markdown},{generateObject:async req=>({object:req.validate({blocks:[{index:0,issue:null}],documentIssues:[],requiredInputs:[]})})});
 expect(assetContentIssues(result)[0]).toContain('was not supplied as a source');
});
