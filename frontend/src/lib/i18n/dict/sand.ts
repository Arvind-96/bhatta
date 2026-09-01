import type { Locale } from "../translations";

// Translation keys for: components/people/AddSandContractorModal,
// SandContractorDetailPage, components/sand/* (AddSandDeliveryModal,
// EditSandDeliveryModal, EditSandContractModal). Merged into the main
// dictionary by translations.ts.
export const sandDict: Record<string, Record<Locale, string>> = {
  "people.sandContractor": { en: "Sand Contractor", hi: "रेत ठेकेदार" },
  "people.addSandContractor": { en: "Add Sand Contractor", hi: "रेत ठेकेदार जोड़ें" },
  "people.noSandContractorsYet": { en: "No sand contractors added yet.", hi: "अभी तक कोई रेत ठेकेदार नहीं जोड़ा गया।" },
  "people.addSandContractorModalTitle": { en: "Add Sand Contractor", hi: "रेत ठेकेदार जोड़ें" },
  "people.confirmDeleteSandContractorProfile": {
    en: "Delete {name}'s profile? Their contracts and payment records are kept, but they'll no longer appear in any list.",
    hi: "{name} की प्रोफ़ाइल हटाएं? उनके अनुबंध और भुगतान रिकॉर्ड सुरक्षित रहेंगे, लेकिन वे अब किसी सूची में नहीं दिखेंगे।",
  },

  "sand.perTrolley": { en: "Per Trolley", hi: "प्रति ट्रॉली" },
  "sand.perThousandBricks": { en: "Per 1000 Bricks", hi: "प्रति 1000 ईंट" },
  "sand.contractType": { en: "Contract type", hi: "अनुबंध प्रकार" },
  "sand.contractDetailsOptional": { en: "Contract details (optional)", hi: "अनुबंध विवरण (वैकल्पिक)" },
  "sand.numberOfTrolleysContract": { en: "Number of trolleys (contract)", hi: "ट्रॉलियों की संख्या (अनुबंध)" },
  "sand.contractPrice": { en: "Contract price", hi: "अनुबंध मूल्य" },
  "sand.pricePerTrolley": { en: "Price per trolley (₹)", hi: "प्रति ट्रॉली मूल्य (₹)" },
  "sand.pricePerThousandBricks": { en: "Price per 1000 bricks (₹)", hi: "प्रति 1000 ईंट मूल्य (₹)" },
  "sand.contractStartDate": { en: "Contract start date", hi: "अनुबंध शुरू होने की तारीख" },
  "sand.contractEndDate": { en: "Contract end date", hi: "अनुबंध समाप्ति तारीख" },
  "sand.advanceAmountPaid": { en: "Advance amount paid", hi: "दी गई पेशगी राशि" },
  "sand.totalContractAmount": { en: "Total contract amount", hi: "कुल अनुबंध राशि" },
  "sand.remainingDueAmount": { en: "Remaining due amount", hi: "बकाया राशि" },
  "sand.contractNeedsAmountError": { en: "Enter the total contract amount to save a contract.", hi: "अनुबंध सहेजने के लिए कुल राशि दर्ज करें।" },
  "sand.contractFieldsRequiredError": { en: "Enter the number of trolleys for a Per Trolley contract.", hi: "प्रति ट्रॉली अनुबंध के लिए ट्रॉलियों की संख्या दर्ज करें।" },

  "sand.contractPaymentSummary": { en: "Contract Payment Summary", hi: "अनुबंध भुगतान सारांश" },
  "sand.totalContractPayment": { en: "Total contract payment", hi: "कुल अनुबंध भुगतान" },
  "sand.paidSoFar": { en: "Paid so far", hi: "अभी तक भुगतान" },
  "sand.remainingDue": { en: "Remaining due", hi: "बकाया राशि" },
  "sand.advanceOutstanding": { en: "Advance outstanding", hi: "बकाया पेशगी" },
  "sand.netDueLedger": { en: "Net due", hi: "कुल बकाया" },

  "sand.deliveries": { en: "Sand Deliveries", hi: "रेत आपूर्ति" },
  "sand.logDelivery": { en: "Log delivery", hi: "आपूर्ति दर्ज करें" },
  "sand.noDeliveriesYet": { en: "No sand deliveries logged yet.", hi: "अभी तक कोई रेत आपूर्ति दर्ज नहीं हुई।" },
  "sand.logSandDelivery": { en: "Log sand delivery", hi: "रेत आपूर्ति दर्ज करें" },
  "sand.deliverySubtitle": { en: "Trolleys delivered by the sand contractor", hi: "रेत ठेकेदार द्वारा दी गई ट्रॉलियां" },
  "sand.selectSandContractor": { en: "Select sand contractor…", hi: "रेत ठेकेदार चुनें…" },
  "sand.trolleysDelivered": { en: "Trolleys delivered", hi: "आपूर्ति की गई ट्रॉलियां" },
  "sand.trolleysDeliveredAllTime": { en: "trolleys delivered (all time)", hi: "अभी तक आपूर्ति की गई ट्रॉलियां (कुल)" },
  "sand.tabDeliveries": { en: "Deliveries", hi: "आपूर्ति" },
  "sand.contractorsNoContractYet": { en: "Sand contractors without a contract yet — tap to add one", hi: "बिना ठेके वाले रेत ठेकेदार — जोड़ने के लिए टैप करें" },
  "sand.againstContract": { en: "Against contract", hi: "किस अनुबंध के तहत" },
  "sand.noContractNotTracked": { en: "No contract (not tracked against a contract)", hi: "कोई अनुबंध नहीं (किसी अनुबंध से नहीं जुड़ा)" },
  "sand.editDelivery": { en: "Edit sand delivery", hi: "रेत आपूर्ति संपादित करें" },
  "sand.confirmDeleteDelivery": {
    en: "Delete this sand delivery? Its payment entries will be reversed and this cannot be undone.",
    hi: "यह रेत आपूर्ति हटाएं? इसके भुगतान एंट्री उलट दी जाएंगी और इसे वापस नहीं लाया जा सकता।",
  },
  "sand.saveDelivery": { en: "Save delivery", hi: "आपूर्ति सहेजें" },

  "sand.paymentHistory": { en: "Payment History", hi: "भुगतान इतिहास" },
  "sand.noLedgerEntriesYet": { en: "No payment entries yet.", hi: "अभी तक कोई भुगतान एंट्री नहीं।" },

  "sand.newContractModalTitle": { en: "New contract", hi: "नया अनुबंध" },
  "sand.saveContract": { en: "Save contract", hi: "अनुबंध सहेजें" },
  "sand.editContractTitle": { en: "Edit contract {contractNumber}", hi: "अनुबंध {contractNumber} संपादित करें" },
  "sand.confirmDeleteContract": {
    en: "Delete contract {contractNumber}? Its payment history is kept but will no longer be linked to a contract.",
    hi: "अनुबंध {contractNumber} हटाएं? इसका भुगतान इतिहास सुरक्षित रहेगा लेकिन अब किसी अनुबंध से नहीं जुड़ा होगा।",
  },
};
