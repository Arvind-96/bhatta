import type { Locale } from "../translations";

// Translation keys for: pages/SalesAgents.tsx + components/salesAgent/*.
// Merged into the main dictionary by translations.ts.
export const salesAgentDict: Record<string, Record<Locale, string>> = {
  "nav.salesAgents": { en: "Sales Agent", hi: "बिक्री एजेंट" },
  "salesAgent.addAgentButton": { en: "Add Sales Agent", hi: "बिक्री एजेंट जोड़ें" },
  "salesAgent.editAgent": { en: "Edit sales agent", hi: "बिक्री एजेंट संपादित करें" },
  "salesAgent.namePlaceholder": { en: "Agent name", hi: "एजेंट का नाम" },
  "salesAgent.phonePlaceholder": { en: "Agent phone number", hi: "एजेंट का फ़ोन नंबर" },
  "salesAgent.basisPercentOfSale": { en: "% of sale amount", hi: "बिक्री राशि का %" },
  "salesAgent.basisPerThousand": { en: "₹ per 1,000 bricks", hi: "₹ प्रति 1,000 ईंट" },
  "salesAgent.commissionPercentPlaceholder": { en: "Commission (%)", hi: "कमीशन (%)" },
  "salesAgent.commissionPerThousandPlaceholder": { en: "Commission per 1,000 bricks (₹)", hi: "प्रति 1,000 ईंट कमीशन (₹)" },
  "salesAgent.commissionPercentOfSale": { en: "{percent}% of sale", hi: "बिक्री का {percent}%" },
  "salesAgent.commissionPerThousand": { en: "₹{rate} / 1,000 bricks", hi: "₹{rate} / 1,000 ईंट" },
  "salesAgent.searchPlaceholder": { en: "Search sales agents…", hi: "बिक्री एजेंट खोजें…" },
  "salesAgent.noAgentsYet": { en: "No sales agents added yet.", hi: "अभी तक कोई बिक्री एजेंट नहीं जोड़ा गया।" },
  "salesAgent.commissionHeader": { en: "Commission", hi: "कमीशन" },
  "salesAgent.customersHeader": { en: "Customers", hi: "ग्राहक" },
  "salesAgent.totalSalesHeader": { en: "Total sales", hi: "कुल बिक्री" },
  "salesAgent.balanceHeader": { en: "Balance", hi: "शेष" },
  "salesAgent.confirmDeactivate": { en: "Remove {name} from active sales agents?", hi: "क्या {name} को सक्रिय बिक्री एजेंटों से हटाएं?" },
  "salesAgent.commissionDue": { en: "Commission due", hi: "कमीशन बकाया" },
  "salesAgent.commissionOverpaid": { en: "Commission overpaid", hi: "कमीशन अधिक भुगतान" },
  "salesAgent.acrossInvoicesLabel": { en: "Across {count} invoices", hi: "{count} इनवॉइस में" },
  "salesAgent.uniqueCustomersLabel": { en: "Unique customers", hi: "अद्वितीय ग्राहक" },
  "salesAgent.customersSection": { en: "Customers via this agent", hi: "इस एजेंट के माध्यम से ग्राहक" },
  "salesAgent.noCustomersYet": { en: "No customers attributed to this agent yet.", hi: "अभी तक इस एजेंट से कोई ग्राहक जुड़ा नहीं है।" },
  "salesAgent.invoiceCountHeader": { en: "Invoices", hi: "इनवॉइस" },
  "salesAgent.lastSaleHeader": { en: "Last sale", hi: "आखिरी बिक्री" },
  "salesAgent.linkToAgentPlaceholder": { en: "Sold through Sales Agent (optional)", hi: "बिक्री एजेंट के माध्यम से बेचा (वैकल्पिक)" },
};
