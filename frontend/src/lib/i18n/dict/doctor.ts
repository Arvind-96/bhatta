import type { Locale } from "../translations";

// Translation keys for: pages/Doctor.tsx. Merged into the main dictionary
// by translations.ts.
export const doctorDict: Record<string, Record<Locale, string>> = {
  "doctor.rosterHeading": { en: "Doctors", hi: "डॉक्टर" },
  "doctor.addDoctor": { en: "Add Doctor", hi: "डॉक्टर जोड़ें" },
  "doctor.qualificationPlaceholder": { en: "Qualification (e.g. MBBS, RMP)", hi: "योग्यता (जैसे MBBS, RMP)" },
  "doctor.clinicAddressPlaceholder": { en: "Clinic address", hi: "क्लिनिक का पता" },
  "doctor.noDoctorsYet": { en: "No doctors added yet — add one above.", hi: "अभी तक कोई डॉक्टर नहीं जोड़ा गया — ऊपर से एक जोड़ें।" },
  "doctor.confirmRemoveDoctor": { en: "Remove {name} from the doctor roster?", hi: "{name} को डॉक्टर सूची से हटाएं?" },

  "doctor.visitLogHeading": { en: "Visit Log", hi: "इलाज रिकॉर्ड" },
  "doctor.logVisit": { en: "Log Visit", hi: "इलाज दर्ज करें" },
  "doctor.addDoctorFirstHint": { en: "Add a doctor above before logging a visit.", hi: "इलाज दर्ज करने से पहले ऊपर से एक डॉक्टर जोड़ें।" },
  "doctor.selectDoctorPlaceholder": { en: "Select doctor…", hi: "डॉक्टर चुनें…" },
  "doctor.selectTreatedPersonPlaceholder": { en: "Select person treated…", hi: "इलाज किए गए व्यक्ति को चुनें…" },
  "doctor.ailmentPlaceholder": { en: "Ailment / reason for visit (optional)", hi: "बीमारी / इलाज का कारण (वैकल्पिक)" },
  "doctor.medicineCostPlaceholder": { en: "Medicine cost (₹)", hi: "दवा का खर्च (₹)" },
  "doctor.consultationFeePlaceholder": { en: "Consultation fee (₹)", hi: "परामर्श शुल्क (₹)" },
  "doctor.saveVisit": { en: "Save Visit", hi: "इलाज सेव करें" },
  "doctor.noVisitsYet": { en: "No visits logged yet.", hi: "अभी तक कोई इलाज दर्ज नहीं हुआ।" },
  "doctor.confirmRemoveVisit": { en: "Delete this visit? This also removes its linked expense entry.", hi: "यह इलाज हटाएं? इससे जुड़ी खर्च एंट्री भी हट जाएगी।" },

  "doctor.doctorColumn": { en: "Doctor", hi: "डॉक्टर" },
  "doctor.treatedPersonColumn": { en: "Person Treated", hi: "इलाज किया गया व्यक्ति" },
  "doctor.ailmentColumn": { en: "Ailment", hi: "बीमारी" },
  "doctor.totalCostColumn": { en: "Total Cost", hi: "कुल खर्च" },
};
