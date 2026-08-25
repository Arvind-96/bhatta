import type { Locale } from "../translations";

// Translation keys for: pages/Suppliers.tsx + components/supplier/*.
// Merged into the main dictionary by translations.ts.
export const supplierDict: Record<string, Record<Locale, string>> = {
  "nav.suppliers": { en: "Supplier", hi: "आपूर्तिकर्ता" },
  "supplier.addSupplierButton": { en: "Add Supplier", hi: "आपूर्तिकर्ता जोड़ें" },
  "supplier.supplierListButton": { en: "Supplier List", hi: "आपूर्तिकर्ता सूची" },
  "supplier.supplyItemsButton": { en: "Supply Items", hi: "आपूर्ति सामग्री" },
  "supplier.addSupplierTitle": { en: "Add supplier", hi: "आपूर्तिकर्ता जोड़ें" },
  "supplier.editSupplierTitle": { en: "Edit supplier", hi: "आपूर्तिकर्ता संपादित करें" },
  "supplier.supplierNamePlaceholder": { en: "Supplier name", hi: "आपूर्तिकर्ता का नाम" },
  "supplier.phonePlaceholder": { en: "Supplier phone number", hi: "आपूर्तिकर्ता का फ़ोन नंबर" },
  "supplier.addressPlaceholder": { en: "Supplier address", hi: "आपूर्तिकर्ता का पता" },
  "supplier.suppliesListSection": { en: "Supplies List", hi: "आपूर्ति सूची" },
  "supplier.suppliesListHint": { en: "Tap a common item to add it, or add a custom one below.", hi: "किसी सामान्य सामग्री को जोड़ने के लिए टैप करें, या नीचे अपनी सामग्री जोड़ें।" },
  "supplier.itemNamePlaceholder": { en: "Item name", hi: "सामग्री का नाम" },
  "supplier.addCustomItem": { en: "Add custom item", hi: "अपनी सामग्री जोड़ें" },
  "supplier.noItemsAddedYet": { en: "No items added yet — tap a common item above or add a custom one.", hi: "अभी तक कोई सामग्री नहीं जोड़ी गई — ऊपर किसी सामान्य सामग्री पर टैप करें या अपनी जोड़ें।" },
  "supplier.saveSupplier": { en: "Save supplier", hi: "आपूर्तिकर्ता सहेजें" },
  "supplier.searchSuppliersPlaceholder": { en: "Search suppliers by name, phone, item…", hi: "नाम, फ़ोन, सामग्री से आपूर्तिकर्ता खोजें…" },
  "supplier.noSuppliersYet": { en: "No suppliers added yet.", hi: "अभी तक कोई आपूर्तिकर्ता नहीं जोड़ा गया।" },
  "supplier.confirmDeleteSupplier": { en: "Delete supplier {name}? This cannot be undone.", hi: "आपूर्तिकर्ता {name} हटाएं? इसे वापस नहीं लाया जा सकता।" },
  "supplier.suppliesCountLabel": { en: "{count} items supplied", hi: "{count} सामग्री आपूर्ति की जाती है" },
  "supplier.noSupplyItemsYet": { en: "No supply items recorded yet — add a supplier with a supplies list first.", hi: "अभी तक कोई आपूर्ति सामग्री दर्ज नहीं — पहले सूची के साथ एक आपूर्तिकर्ता जोड़ें।" },
  "supplier.suppliedByLabel": { en: "Supplied by", hi: "आपूर्तिकर्ता" },
  "supplier.unitKg": { en: "KG", hi: "किलो" },
  "supplier.unitPiece": { en: "Piece", hi: "नग" },
  "supplier.unitMeter": { en: "Meter", hi: "मीटर" },
};
