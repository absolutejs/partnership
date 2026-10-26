import {expect,test} from 'bun:test';
import {buildAssetEvidence,renderAssetEvidencePlan,presentAssetEvidenceDocument,validateAssetEvidenceDocument} from '../src/assetEvidence';
const sources=[{id:'intake:private-id',kind:'intake',label:'Business intake',content:JSON.stringify({transcript:'We sold 41 tickets. Our revenue is USD 6200.'})}];
const facts=buildAssetEvidence(sources);
const plan={sections:[{heading:'Overview',blocks:[...facts.map(f=>({kind:'source',evidenceId:f.id})),{kind:'proposal',text:'Consider a joint workshop.'}]}],missingInputs:['Private operator question']};
test('one numbered source replaces repeated internal diagnostics without altering proof',()=>{
 const original=renderAssetEvidencePlan(sources,plan);
 const before=JSON.stringify(original);
 const display=presentAssetEvidenceDocument(sources,original.markdown,original.evidenceDocument);
 expect(display.markdown).toContain('We sold 41 tickets\\. [1]');
 expect(display.markdown).toContain('Our revenue is USD 6200\\. [1]');
 expect(display.markdown).toContain('1. Business intake');
 for(const internal of ['/transcript','reference ',facts[0]!.id,'intake:private-id','Private operator question'])expect(display.markdown).not.toContain(internal);
 expect(display.sources).toHaveLength(1);expect(display.sources[0]!.excerpts).toHaveLength(2);
 expect(display.missingInputs).toEqual(plan.missingInputs);
 expect(JSON.stringify(original)).toBe(before);
 expect(validateAssetEvidenceDocument(sources,original.markdown,original.evidenceDocument)).toEqual(original);
});
test('presentation cannot turn a tampered draft or forged citation into an export',()=>{
 const original=renderAssetEvidencePlan(sources,plan);
 expect(()=>presentAssetEvidenceDocument(sources,original.markdown+'extra',original.evidenceDocument)).toThrow();
 expect(()=>presentAssetEvidenceDocument(sources,original.markdown,{...original.evidenceDocument,citations:[]})).toThrow();
});
test('presentation preserves fictional and proposed labels and escapes hostile source markup',()=>{
 const original=renderAssetEvidencePlan(sources,{sections:[{heading:'Overview',blocks:[{kind:'hypothetical',text:'A fictional workshop.'},{kind:'question',text:'What should we confirm?'}]}],missingInputs:[]},true);
 const display=presentAssetEvidenceDocument(sources,original.markdown,original.evidenceDocument);
 expect(display.markdown).toContain('fictional, not an actual result');expect(display.markdown).toContain('**To confirm:**');
 expect(display.sources).toEqual([]);
});
