import { expect, test } from 'bun:test';
import { calculatePartnerRevenuePipeline, PartnerRevenuePipelineSchema } from '../src/revenuePipeline';
test('provider profile survives schema and calculation without becoming revenue or customers',()=>{
 const companyProfile={provider:'apollo',providerRecordId:'test',domain:'example.com',sourceUrl:'https://example.com',observedAt:new Date().toISOString(),facts:[{label:'Active retail locations',value:'850'},{label:'Parent company',value:'Parent'}]};
 const result=PartnerRevenuePipelineSchema.parse(calculatePartnerRevenuePipeline({partnerAnnualRevenue:null,partnerPricing:null,clientPricing:null,companyProfile}));
 expect(result.companyProfile).toEqual(companyProfile);
 expect(result.inputs.companyProfile).toEqual(companyProfile);
 expect(result.customerEquivalents).toBeNull();
 expect(result.status).toBe('unavailable');
});
