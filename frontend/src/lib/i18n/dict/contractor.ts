import type { Locale } from "../translations";

// Translation keys for: components/people/ContractorNetBalanceCard.tsx —
// shared across every contractor detail page (Thekedar, Pathai/Molding,
// Bharai/Stacking, Nikasi, Pakayi/Firing). Merged into the main dictionary
// by translations.ts.
export const contractorDict: Record<string, Record<Locale, string>> = {
  "contractor.netBalanceTitle": { en: "Net advance balance", hi: "शुद्ध एडवांस शेष" },
  "contractor.netBalanceDescription": {
    en: "Money paid straight to this contractor's own gang (Advance, Kharchi, Medical, Festival) counts against what the kiln has advanced the contractor — computed live, always up to date.",
    hi: "इस ठेकेदार के अपने मज़दूरों को सीधे दिया गया पैसा (एडवांस, खर्ची, मेडिकल, त्योहार) भट्टे द्वारा ठेकेदार को दिए गए एडवांस में गिना जाता है — यह लाइव गणना है, हमेशा अपडेट रहती है।",
  },
  "contractor.ownBalanceLabel": { en: "Contractor's own ledger", hi: "ठेकेदार का अपना बही खाता" },
  "contractor.gangDrawdownLabel": { en: "Paid to gang directly", hi: "सीधे मज़दूरों को भुगतान" },
  "contractor.netAdvanceOutstanding": { en: "Net advance outstanding", hi: "शुद्ध एडवांस बकाया" },
  "contractor.netOwedToContractor": { en: "Net owed to contractor", hi: "ठेकेदार को शुद्ध देय" },
  "contractor.netSettled": { en: "Net settled", hi: "शुद्ध निपटाया गया" },
};
