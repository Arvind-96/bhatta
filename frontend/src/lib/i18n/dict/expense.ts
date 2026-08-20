import type { Locale } from "../translations";

// Translation keys for: pages/Expense.tsx + components/expense/*. Merged
// into the main dictionary by translations.ts. Total Paid/Total Due labels
// are intentionally shared with customer.totalPaidLabel/totalDueLabel
// (identical English/Hindi text, same "live balance" concept) rather than
// duplicated here.
export const expenseDict: Record<string, Record<Locale, string>> = {
  "expense.addExpenseButton": { en: "Add Expense", hi: "खर्च जोड़ें" },
  "expense.viewAllExpensesButton": { en: "View All Expenses", hi: "सभी खर्च देखें" },
  "expense.addExpenseTitle": { en: "Log expense", hi: "खर्च दर्ज करें" },
  "expense.editExpenseTitle": { en: "Edit expense", hi: "खर्च संपादित करें" },
  "expense.expenseTypePlaceholder": { en: "Expense type", hi: "खर्च का प्रकार" },
  "expense.addExpenseTypePlaceholder": { en: "Not in the list? Type a new expense type", hi: "सूची में नहीं है? नया खर्च प्रकार लिखें" },
  "expense.addExpenseTypeHint": {
    en: "Only fill this in if the expense type you need isn't in the dropdown above — it'll be added to the list automatically.",
    hi: "इसे तभी भरें जब आपको चाहिए खर्च प्रकार ऊपर की सूची में न हो — यह अपने आप सूची में जुड़ जाएगा।",
  },
  "expense.transactionDateLabel": { en: "Transaction date", hi: "लेन-देन की तारीख" },
  "expense.transactionDateHint": { en: "The actual date the payment was made", hi: "जिस तारीख को भुगतान किया गया" },
  "expense.systemEntryDateLabel": { en: "System entry date", hi: "सिस्टम प्रविष्टि तिथि" },
  "expense.systemEntryDateHint": { en: "Today — set automatically, cannot be changed", hi: "आज — स्वतः निर्धारित, बदला नहीं जा सकता" },
  "expense.amountPayingPlaceholder": { en: "Amount paying (₹)", hi: "भुगतान की जा रही राशि (₹)" },
  "expense.quantityPlaceholder": { en: "Number of cylinders", hi: "सिलेंडरों की संख्या" },
  "expense.newExpenseTypeBalanceHint": { en: "New expense type — no history yet", hi: "नया खर्च प्रकार — अभी तक कोई इतिहास नहीं" },
  "expense.saveExpense": { en: "Save expense", hi: "खर्च सहेजें" },
  "expense.expenseTypesHeading": { en: "Expense Types", hi: "खर्च के प्रकार" },
  "expense.searchExpenseTypesPlaceholder": { en: "Search expense types…", hi: "खर्च प्रकार खोजें…" },
  "expense.noExpenseTypesYet": { en: "No expense types yet.", hi: "अभी तक कोई खर्च प्रकार नहीं।" },
  "expense.backToExpense": { en: "Back to Expense", hi: "खर्च पर वापस" },
  "expense.backToExpenseTypes": { en: "Back to Expense Types", hi: "खर्च प्रकारों पर वापस" },
  "expense.searchExpensesPlaceholder": { en: "Search by date, month, or year…", hi: "तारीख, महीना, या वर्ष से खोजें…" },
  "expense.noExpensesYet": { en: "No expenses logged yet.", hi: "अभी तक कोई खर्च दर्ज नहीं हुआ।" },
  "expense.noExpensesMatchSearch": { en: "No expenses match your search.", hi: "आपकी खोज से कोई खर्च मेल नहीं खाता।" },
  "expense.confirmDeleteExpense": { en: "Delete this expense of ₹{amount}? This cannot be undone.", hi: "₹{amount} का यह खर्च हटाएं? इसे वापस नहीं लाया जा सकता।" },
  "expense.printExpense": { en: "Print", hi: "प्रिंट करें" },
  "expense.quantityLabel": { en: "Quantity", hi: "मात्रा" },
  "expense.notesPlaceholder": { en: "Notes (optional)", hi: "टिप्पणी (वैकल्पिक)" },
};
