import {expect,test} from 'bun:test';
import {partnerRevenueResearchQueries,revenueResearchCoverage,RevenueResearchCoverageSchema} from '../src/revenueResearch';
import {calculatePartnerRevenuePipeline,PartnerRevenuePipelineSchema} from '../src/revenuePipeline';
test('bounded queries cover product details and direct audience evidence without repeating supplied client pricing',()=>{
 const queries=partnerRevenueResearchQueries({partnerName:'Example',partnerWebsite:'https://www.example.com',clientName:'Client',clientPricing:{}});
 expect(queries).toHaveLength(4);expect(queries.join(' ')).toContain('site:example.com store packages membership checkout');expect(queries.join(' ')).toContain('active customers locations');expect(queries.join(' ')).not.toContain('Client');
});
test('coverage retains checked sources without treating partial or absent research as complete',()=>{
 const research={status:'partial' as const,text:'',sources:[{id:'one',url:'https://example.com/pricing',title:'Plans'}],findings:[],limitations:['Page read limit reached'],generatedAt:new Date().toISOString()};
 const coverage=revenueResearchCoverage(research);expect(coverage.status).toBe('incomplete');expect(coverage.sources[0]?.url).toBe('https://example.com/pricing');expect(revenueResearchCoverage(null).status).toBe('failed');
 const pipeline=calculatePartnerRevenuePipeline({partnerAnnualRevenue:null,partnerPricing:null,clientPricing:null,researchCoverage:coverage});expect(PartnerRevenuePipelineSchema.parse(pipeline).researchCoverage).toEqual(coverage);expect(calculatePartnerRevenuePipeline(pipeline.inputs).researchCoverage).toEqual(coverage);expect(RevenueResearchCoverageSchema.safeParse({...coverage,sources:[{url:'javascript:alert(1)',title:'Bad'}]}).success).toBe(false);
});
