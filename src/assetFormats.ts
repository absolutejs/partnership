/** Per-format composition limits. These constrain the model, never trim output. */
export const ASSET_FORMATS = {
  one_pager: { maxWords: 300, maxSections: 5, maxBlocks: 12, mode: "sheet", headings: ["Overview", "Offer", "Audience", "Proof and track record", "Next steps"] },
  sell_sheet: { maxWords: 300, maxSections: 5, maxBlocks: 12, mode: "sheet", headings: ["Offer", "Audience", "Benefits", "Objection handling", "Next steps"] },
  executive_summary: { maxWords: 300, maxSections: 5, maxBlocks: 12, mode: "sheet", headings: ["Recommendation", "Opportunity", "Success measures", "Risks and open decisions", "Decision"] },
  pitch_deck: { maxWords: 850, maxSections: 12, maxBlocks: 36, mode: "deck", headings: ["Overview", "Opportunity", "Audience", "Offer", "Proof and track record", "Roles and responsibilities", "Commercial terms", "Timeline", "Next steps", "Contact"] },
  qbr: { maxWords: 650, maxSections: 8, maxBlocks: 28, mode: "deck", headings: ["Objectives", "Progress", "Results", "Risks and open decisions", "Next steps", "Decision"] },
  outreach_email: { maxWords: 180, maxSections: 4, maxBlocks: 6, mode: "email", headings: ["Opening", "Offer", "Next steps", "Contact"] },
  follow_up_email: { maxWords: 150, maxSections: 4, maxBlocks: 6, mode: "email", headings: ["Opening", "Progress", "Next steps", "Contact"] },
  partnership_faq: { maxWords: 800, maxSections: 8, maxBlocks: 24, mode: "document", headings: ["Offer", "Audience", "Roles and responsibilities", "Commercial terms", "Resources", "Support", "Next steps"] },
  enablement_guide: { maxWords: 1000, maxSections: 10, maxBlocks: 32, mode: "document", headings: ["Overview", "Offer", "Audience", "Positioning", "Talking points", "Objection handling", "Resources", "Roles and responsibilities", "Support", "Next steps"] },
  proposal: { maxWords: 900, maxSections: 10, maxBlocks: 32, mode: "document", headings: ["Overview", "Objectives", "Scope", "Roles and responsibilities", "Commercial terms", "Timeline", "Success measures", "Next steps"] },
  business_case: { maxWords: 800, maxSections: 8, maxBlocks: 28, mode: "document", headings: ["Recommendation", "Opportunity", "Investment", "Expected return", "Risks and open decisions", "Decision"] },
  deal_memo: { maxWords: 700, maxSections: 8, maxBlocks: 24, mode: "document", headings: ["Recommendation", "Offer", "Opportunity", "Commercial terms", "Risks and open decisions", "Decision", "Next steps"] },
  joint_value_prop: { maxWords: 500, maxSections: 6, maxBlocks: 18, mode: "document", headings: ["Overview", "Audience", "Offer", "Benefits", "Proof and track record", "Next steps"] },
  commitment_brief: { maxWords: 500, maxSections: 6, maxBlocks: 18, mode: "document", headings: ["Opportunity", "Scope", "Investment", "Expected return", "Decision"] },
  first_win_sprint: { maxWords: 750, maxSections: 8, maxBlocks: 28, mode: "document", headings: ["Objectives", "Timeline", "Roles and responsibilities", "Deliverables", "Success measures", "Risks and open decisions", "Next steps"] },
  case_study_outline: { maxWords: 650, maxSections: 7, maxBlocks: 24, mode: "document", headings: ["Background", "Objectives", "Scope", "Results", "Lessons", "Next steps"] },
  press_release: { maxWords: 500, maxSections: 6, maxBlocks: 18, mode: "announcement", headings: ["Announcement", "Background", "Offer", "About", "Contact"] },
  loi: { maxWords: 800, maxSections: 10, maxBlocks: 28, mode: "legal", headings: ["Parties", "Purpose", "Scope", "Commercial terms", "Confidentiality", "Exclusivity", "Non-binding status", "Signatures"] },
  mou: { maxWords: 900, maxSections: 10, maxBlocks: 32, mode: "legal", headings: ["Parties", "Background", "Purpose", "Scope", "Roles and responsibilities", "Term", "Non-binding status", "Signatures"] },
  term_sheet: { maxWords: 700, maxSections: 10, maxBlocks: 28, mode: "legal", headings: ["Parties", "Scope", "Commercial terms", "Term", "Exclusivity", "Roles and responsibilities", "Intellectual property", "Termination", "Non-binding status"] },
} as const;
export type AssetFormatType = keyof typeof ASSET_FORMATS;
