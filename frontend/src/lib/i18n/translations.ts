// Lightweight, dependency-free i18n: a flat key → { en, hi } dictionary
// instead of a library like i18next, since the app only needs a handful of
// locales and this keeps the main bundle from picking up an i18n runtime
// (see the frontend "keep it light" note in docs). Extending to a third
// language is just adding a column here; extending coverage to a new
// screen is wrapping its strings in t("namespace.key").
export const SUPPORTED_LOCALES = ["en", "hi"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  hi: "हिंदी",
};

// Per-module dictionaries (one file per app section, see lib/i18n/dict/) are
// merged in below rather than all living in this one file — with dozens of
// screens each needing translation coverage, a single growing object here
// would become an unreadable, hard-to-diff wall of keys. Each dict file
// owns exactly the keys used by its own set of pages/components.
import { peopleCoreDict } from "./dict/people-core";
import { peopleDetailDict } from "./dict/people-detail";
import { soilDict } from "./dict/soil";
import { moldingStackingDict } from "./dict/molding-stacking";
import { firingNikasiDict } from "./dict/firing-nikasi";
import { logisticsDict } from "./dict/logistics";
import { operationsDict } from "./dict/operations";
import { staffDict } from "./dict/staff";
import { overviewDict } from "./dict/overview";
import { salaryDict } from "./dict/salary";

const coreDict: Record<string, Record<Locale, string>> = {
  "app.name": { en: "Bhatta Cloud", hi: "भट्टा क्लाउड" },

  "nav.overview": { en: "Overview", hi: "अवलोकन" },
  "nav.financialOverview": { en: "Financial Overview", hi: "वित्तीय विवरण" },
  "nav.people": { en: "People", hi: "लोग" },
  "nav.soil": { en: "Soil", hi: "मिट्टी" },
  "nav.molding": { en: "Molding (Pathai)", hi: "पथाई (ढलाई)" },
  "nav.stacking": { en: "Stacking (Bharai)", hi: "भराई (स्टैकिंग)" },
  "nav.firing": { en: "Firing (Pakayi)", hi: "पकाई (जलाई)" },
  "nav.nikasi": { en: "Unloading (Nikasi)", hi: "निकासी (उतराई)" },
  "nav.brickLoading": { en: "Brick Loading", hi: "ईंट लदाई" },
  "nav.dispatch": { en: "Dispatch", hi: "डिस्पैच" },
  "nav.gatePass": { en: "Gate Pass & Challan", hi: "गेट पास व चालान" },
  "nav.billing": { en: "Billing & Invoice", hi: "बिलिंग व इनवॉइस" },
  "nav.expense": { en: "Expense", hi: "खर्च" },
  "nav.fuel": { en: "Fuel", hi: "ईंधन" },
  "nav.inventory": { en: "Inventory", hi: "इन्वेंटरी" },
  "nav.stock": { en: "Stock", hi: "स्टॉक" },
  "nav.fleet": { en: "Fleet & Machines", hi: "वाहन व मशीन" },
  "nav.staff": { en: "Staff", hi: "स्टाफ" },
  "nav.salary": { en: "Salary", hi: "वेतन" },
  "nav.kiosk": { en: "Attendance", hi: "हाज़िरी" },
  "nav.settings": { en: "Settings", hi: "सेटिंग्स" },

  "topbar.kilnOverview": { en: "Kiln Overview", hi: "भट्टा अवलोकन" },
  "topbar.live": { en: "Live", hi: "लाइव" },
  "topbar.connecting": { en: "Connecting", hi: "कनेक्ट हो रहा है" },
  "topbar.offline": { en: "Offline — syncing on reconnect", hi: "ऑफ़लाइन — दोबारा जुड़ने पर सिंक होगा" },
  "topbar.searchPlaceholder": { en: "Search pages…", hi: "पेज खोजें…" },
  "topbar.noPagesFound": { en: "No pages found", hi: "कोई पेज नहीं मिला" },
  "topbar.logout": { en: "Log out", hi: "लॉग आउट करें" },
  "topbar.quickActions": { en: "Quick actions", hi: "त्वरित कार्रवाई" },
  "topbar.logProduction": { en: "Log production", hi: "उत्पादन दर्ज करें" },
  "topbar.newReceipt": { en: "New payment receipt", hi: "नई भुगतान रसीद" },
  "topbar.newSoilTrip": { en: "Log soil trip", hi: "मिट्टी की ट्रिप दर्ज करें" },

  "nav.group.dashboard": { en: "Dashboard", hi: "डैशबोर्ड" },
  "nav.group.production": { en: "Production", hi: "उत्पादन" },
  "nav.group.trade": { en: "Trade & Billing", hi: "व्यापार व बिलिंग" },
  "nav.group.resources": { en: "Resources", hi: "संसाधन" },
  "nav.group.admin": { en: "Admin", hi: "प्रशासन" },

  "setup.welcomeTitle": { en: "Welcome to Bhatta Cloud", hi: "भट्टा क्लाउड में आपका स्वागत है" },
  "setup.welcomeSubtitle": { en: "Let's set up your bhatta — this takes about a minute.", hi: "आइए आपका भट्टा सेट करें — इसमें लगभग एक मिनट लगेगा।" },
  "setup.stepOf": { en: "Step {current} of {total}", hi: "चरण {current} / {total}" },
  "setup.stepProfileTitle": { en: "Your bhatta", hi: "आपका भट्टा" },
  "setup.stepProfileSubtitle": { en: "Basic details about your kiln", hi: "आपके भट्टे की बुनियादी जानकारी" },
  "setup.stepChambersTitle": { en: "Kiln chambers", hi: "भट्टे के चैंबर" },
  "setup.stepChambersSubtitle": { en: "How many chambers does your kiln have? You can change this later in Settings.", hi: "आपके भट्टे में कितने चैंबर हैं? इसे बाद में सेटिंग्स में बदला जा सकता है।" },
  "setup.stepYardTitle": { en: "Drying yard capacity", hi: "सुखाने के यार्ड की क्षमता" },
  "setup.stepYardSubtitle": { en: "How many kacchi bricks can your patheri/drying yard hold at once? You can change this later too.", hi: "आपका पथेरी/सुखाने का यार्ड एक बार में कितनी कच्ची ईंटें रख सकता है? इसे भी बाद में बदला जा सकता है।" },
  "setup.stepDoneTitle": { en: "You're all set", hi: "सब तैयार है" },
  "setup.stepDoneSubtitle": { en: "Your bhatta is ready. You can fine-tune everything anytime from Settings.", hi: "आपका भट्टा तैयार है। आप कभी भी सेटिंग्स से सब कुछ ठीक कर सकते हैं।" },
  "setup.kilnName": { en: "Bhatta name", hi: "भट्टे का नाम" },
  "setup.kilnLocation": { en: "Location (village, district)", hi: "स्थान (गाँव, ज़िला)" },
  "setup.kilnPhone": { en: "Contact phone", hi: "संपर्क फ़ोन" },
  "setup.next": { en: "Continue", hi: "आगे बढ़ें" },
  "setup.back": { en: "Back", hi: "पीछे" },
  "setup.skipForNow": { en: "Skip for now", hi: "अभी छोड़ें" },
  "setup.goToDashboard": { en: "Go to dashboard", hi: "डैशबोर्ड पर जाएं" },
  "setup.chambersOptional": { en: "Leave blank if you're not sure yet", hi: "अगर अभी पक्का नहीं है तो खाली छोड़ें" },

  "auth.signIn": { en: "Sign in", hi: "साइन इन करें" },
  "auth.signInSubtitle": { en: "Sign in to your kiln dashboard", hi: "अपने भट्टा डैशबोर्ड में साइन इन करें" },
  "auth.setupSubtitle": { en: "Set up your bhatta", hi: "अपना भट्टा सेट करें" },
  "auth.yourName": { en: "Your name", hi: "आपका नाम" },
  "auth.kilnName": { en: "Kiln name (e.g. Ramgarh Bhatta)", hi: "भट्टे का नाम (जैसे रामगढ़ भट्टा)" },
  "auth.email": { en: "Email", hi: "ईमेल" },
  "auth.password": { en: "Password", hi: "पासवर्ड" },
  "auth.createKiln": { en: "Create bhatta", hi: "भट्टा बनाएं" },
  "auth.newBhatta": { en: "New bhatta? Set one up", hi: "नया भट्टा? यहाँ बनाएं" },
  "auth.haveAccount": { en: "Already have an account? Sign in", hi: "पहले से खाता है? साइन इन करें" },

  "common.add": { en: "Add", hi: "जोड़ें" },
  "common.save": { en: "Save", hi: "सहेजें" },
  "common.saveChanges": { en: "Save changes", hi: "बदलाव सहेजें" },
  "common.cancel": { en: "Cancel", hi: "रद्द करें" },
  "common.loading": { en: "Loading…", hi: "लोड हो रहा है…" },
  "common.name": { en: "Name", hi: "नाम" },
  "common.phone": { en: "Phone", hi: "फ़ोन" },
  "common.type": { en: "Type", hi: "प्रकार" },
  "common.date": { en: "Date", hi: "तारीख" },
  "common.amount": { en: "Amount", hi: "राशि" },
  "common.all": { en: "All", hi: "सभी" },
  "common.edit": { en: "Edit", hi: "संपादित करें" },
  "common.delete": { en: "Delete", hi: "हटाएं" },
  "common.remove": { en: "Remove", hi: "हटाएं" },
  "common.search": { en: "Search", hi: "खोजें" },
  "common.status": { en: "Status", hi: "स्थिति" },
  "common.active": { en: "Active", hi: "सक्रिय" },
  "common.inactive": { en: "Inactive", hi: "निष्क्रिय" },
  "common.yes": { en: "Yes", hi: "हाँ" },
  "common.no": { en: "No", hi: "नहीं" },
  "common.notes": { en: "Notes", hi: "टिप्पणी" },
  "common.notesOptional": { en: "Notes (optional)", hi: "टिप्पणी (वैकल्पिक)" },
  "common.optional": { en: "optional", hi: "वैकल्पिक" },
  "common.total": { en: "Total", hi: "कुल" },
  "common.balance": { en: "Balance", hi: "बकाया" },
  "common.today": { en: "Today", hi: "आज" },
  "common.thisWeek": { en: "This week", hi: "इस सप्ताह" },
  "common.thisMonth": { en: "This month", hi: "इस महीने" },
  "common.thisYear": { en: "This year", hi: "इस वर्ष" },
  "common.close": { en: "Close", hi: "बंद करें" },
  "common.back": { en: "Back", hi: "वापस" },
  "common.confirm": { en: "Confirm", hi: "पुष्टि करें" },
  "common.view": { en: "View", hi: "देखें" },
  "common.print": { en: "Print", hi: "प्रिंट करें" },
  "common.select": { en: "Select…", hi: "चुनें…" },
  "common.none": { en: "None", hi: "कोई नहीं" },
  "common.actions": { en: "Actions", hi: "कार्रवाई" },
  "common.details": { en: "Details", hi: "विवरण" },
  "common.notSet": { en: "Not set", hi: "सेट नहीं" },
  "common.quantity": { en: "Quantity", hi: "मात्रा" },
  "common.rate": { en: "Rate", hi: "दर" },
  "common.vehicle": { en: "Vehicle", hi: "वाहन" },
  "common.driver": { en: "Driver", hi: "ड्राइवर" },
  "common.paymentMode": { en: "Payment mode", hi: "भुगतान का तरीका" },
  "common.paymentModeCashAndOnline": { en: "Cash + Online", hi: "नकद + ऑनलाइन" },
  "payment.cashAmount": { en: "Cash amount", hi: "नकद राशि" },
  "payment.onlineAmount": { en: "Online amount", hi: "ऑनलाइन राशि" },
  "payment.splitMismatch": { en: "Cash + Online must add up to ₹{total}", hi: "नकद + ऑनलाइन का योग ₹{total} होना चाहिए" },
  "common.new": { en: "New", hi: "नया" },
  "common.noneAddedYet": { en: "None added yet.", hi: "अभी तक कुछ नहीं जोड़ा गया।" },
  "common.paginationRange": { en: "{start}–{end} of {total}", hi: "{total} में से {start}–{end}" },

  "common.personType.DRIVER": { en: "Driver", hi: "ड्राइवर" },
  "common.personType.LABOUR_CONTRACTOR": { en: "Labour Contractor (Thekedar)", hi: "ठेकेदार (लेबर)" },
  "common.personType.SUPPLIER": { en: "Supplier", hi: "आपूर्तिकर्ता" },
  "common.personType.THEKEDAR": { en: "Thekedar", hi: "ठेकेदार" },
  "common.personType.PARTNER": { en: "Partner", hi: "साझेदार" },
  "common.personType.WORKER": { en: "Worker", hi: "मज़दूर" },
  "common.personType.HELPER": { en: "Helper", hi: "सहायक" },
  "common.personType.LANDOWNER": { en: "Landowner (Khet Malik)", hi: "खेत मालिक" },
  "common.personType.FITTER": { en: "Fitter (Ostad/Jalayee)", hi: "फिटर (उस्ताद/जलाई)" },
  "common.personType.CUSTOMER": { en: "Customer", hi: "ग्राहक" },
  "common.personType.MUNIM": { en: "Munim (Accountant)", hi: "मुनीम" },
  "common.personType.CHOWKIDAR": { en: "Chowkidar (Watchman)", hi: "चौकीदार" },

  "overview.bricksToday": { en: "Bricks Today", hi: "आज की ईंटें" },
  "overview.finishedStock": { en: "Finished Stock", hi: "तैयार स्टॉक" },
  "overview.dispatched7d": { en: "Dispatched (7d)", hi: "डिस्पैच (7 दिन)" },
  "overview.avgDailyOutput": { en: "Avg. Daily Output", hi: "औसत दैनिक उत्पादन" },
  "overview.dailyProduction": { en: "Daily Production", hi: "दैनिक उत्पादन" },
  "overview.stockLevels": { en: "Stock Levels", hi: "स्टॉक स्तर" },
  "overview.liveActivity": { en: "Live Activity", hi: "लाइव गतिविधि" },

  "people.addPerson": { en: "Add person", hi: "व्यक्ति जोड़ें" },
  "people.ledger": { en: "Ledger", hi: "खाता-बही" },
  "people.balanceDue": { en: "Balance due", hi: "बकाया राशि" },
  "people.enroll": { en: "Enroll", hi: "पंजीकृत करें" },
  "people.reenroll": { en: "Re-enroll", hi: "फिर से पंजीकृत करें" },
};

export const translations: Record<string, Record<Locale, string>> = {
  ...coreDict,
  ...peopleCoreDict,
  ...peopleDetailDict,
  ...soilDict,
  ...moldingStackingDict,
  ...firingNikasiDict,
  ...logisticsDict,
  ...operationsDict,
  ...staffDict,
  ...overviewDict,
  ...salaryDict,
};

// params supports simple {name}-style interpolation for strings that embed
// a dynamic value (a person's name, a count, an amount) — the dictionary
// stays a flat string map instead of needing a template-function per key.
export function translate(locale: Locale, key: string, params?: Record<string, string | number>): string {
  let str = translations[key]?.[locale] ?? translations[key]?.en ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${name}\\}`, "g"), String(value));
    }
  }
  return str;
}
