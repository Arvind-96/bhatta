import type { Locale } from "../translations";

// Translation keys for: pages/ProfitLoss.tsx. Merged into the main
// dictionary by translations.ts.
export const profitLossDict: Record<string, Record<Locale, string>> = {
  "profitLoss.dateRangeHeading": { en: "Period", hi: "अवधि" },
  "profitLoss.overallProfit": { en: "Overall Profit", hi: "कुल लाभ" },
  "profitLoss.overallLoss": { en: "Overall Loss", hi: "कुल हानि" },
  "profitLoss.totalSales": { en: "Total Sales", hi: "कुल बिक्री" },
  "profitLoss.totalExpenses": { en: "Total Expenses", hi: "कुल खर्च" },
  "profitLoss.totalAdvancesGiven": { en: "Total Advances Given", hi: "कुल दिया गया एडवांस" },
  "profitLoss.cashReceived": { en: "Cash Received", hi: "प्राप्त नकद" },
  "profitLoss.cashGiven": { en: "Cash Given", hi: "दिया गया नकद" },
  "profitLoss.onlinePaymentsReceived": { en: "Online Payments Received", hi: "प्राप्त ऑनलाइन भुगतान" },
  "profitLoss.onlinePaymentsMade": { en: "Online Payments Made", hi: "किया गया ऑनलाइन भुगतान" },
  "profitLoss.moneyInUnspecified": { en: "Money In — Unspecified", hi: "प्राप्त राशि — अनिर्दिष्ट" },
  "profitLoss.moneyOutUnspecified": { en: "Money Out — Unspecified", hi: "भुगतान — अनिर्दिष्ट" },
  "profitLoss.unspecifiedHint": {
    en: "Cash + Online won't always add up to the total above — this is money whose payment mode was never recorded (e.g. a Challan-originated dispatch, or older data). It's still counted in Total Sales/Expenses.",
    hi: "नकद + ऑनलाइन हमेशा ऊपर की कुल राशि के बराबर नहीं होंगे — यह वह राशि है जिसका भुगतान माध्यम कभी दर्ज नहीं हुआ (जैसे चालान से बना डिस्पैच, या पुराना डेटा)। यह फिर भी कुल बिक्री/खर्च में गिना जाता है।",
  },
  "profitLoss.partnerShareHeading": { en: "Partner Profit Share", hi: "साझेदार लाभ हिस्सा" },
  "profitLoss.noPartnersYet": { en: "No partners added yet — add one from the People page.", hi: "अभी तक कोई साझेदार नहीं जोड़ा गया — लोग पेज से एक जोड़ें।" },
  "profitLoss.partnerColumn": { en: "Partner", hi: "साझेदार" },
  "profitLoss.sharePercentColumn": { en: "Share %", hi: "हिस्सा %" },
  "profitLoss.shareAmountColumn": { en: "Share Amount", hi: "हिस्सा राशि" },
  "profitLoss.unallocatedRow": { en: "Unallocated", hi: "अवितरित" },
  "profitLoss.disclaimer": {
    en: "Cash-basis figures for the selected period — money actually received/paid, not accrued sales or dues. Salary, for instance, only shows up here once it's separately paid out in cash — a generated salary slip alone (Salary page, or Compare's Salary module) is accrued/owed, not yet spent, so it won't match this page's Total Expenses until it's recorded as a payment. Partner shares apply each partner's Profit Share % (set on their People profile) against this period's net profit/loss.",
    hi: "चयनित अवधि के नकद-आधारित आंकड़े — वास्तव में प्राप्त/भुगतान की गई राशि, न कि उपार्जित बिक्री या बकाया। उदाहरण के लिए वेतन तभी यहाँ दिखेगा जब उसे अलग से नकद भुगतान के रूप में दर्ज किया जाए — केवल जनरेट की गई वेतन पर्ची (वेतन पेज, या तुलना के वेतन मॉड्यूल में) उपार्जित/बकाया है, अभी खर्च नहीं हुई, इसलिए जब तक भुगतान दर्ज न हो तब तक यह इस पेज के कुल खर्च से मेल नहीं खाएगी। साझेदार हिस्सा प्रत्येक साझेदार के प्रोफ़ाइल पर सेट लाभ हिस्सा % को इस अवधि के शुद्ध लाभ/हानि पर लागू करता है।",
  },
};
