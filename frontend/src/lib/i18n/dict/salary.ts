import type { Locale } from "../translations";

// Translation keys for: pages/Salary.tsx + components/staff's attendance
// calendar and salary-slip-list sections (embedded in StaffDetailPage).
export const salaryDict: Record<string, Record<Locale, string>> = {
  "salary.pageTitle": { en: "Salary", hi: "वेतन" },
  "salary.pageSubtitle": {
    en: "Monthly staff salary slips, generated automatically on the 1st of every month from attendance",
    hi: "स्टाफ की मासिक वेतन पर्ची, हर महीने की 1 तारीख को हाज़िरी के आधार पर अपने आप बनती है",
  },
  "salary.generateNow": { en: "Generate now", hi: "अभी जनरेट करें" },
  "salary.generating": { en: "Generating…", hi: "जनरेट हो रहा है…" },
  "salary.generatedCount": { en: "{count} slip(s) generated", hi: "{count} पर्ची जनरेट हुई" },
  "salary.status.generated": { en: "Generated", hi: "जनरेट हो गई" },
  "salary.status.pending": { en: "Pending", hi: "लंबित" },
  "salary.viewEnglish": { en: "View (English)", hi: "देखें (अंग्रेज़ी)" },
  "salary.viewHindi": { en: "View (Hindi)", hi: "देखें (हिंदी)" },
  "salary.netSalary": { en: "Net Salary", hi: "कुल वेतन" },
  "salary.grossSalary": { en: "Gross Salary", hi: "सकल वेतन" },
  "salary.deductions": { en: "Deductions", hi: "कटौती" },
  "salary.daysPresent": { en: "Present", hi: "उपस्थित" },
  "salary.daysAbsent": { en: "Absent", hi: "अनुपस्थित" },
  "salary.daysHalfDay": { en: "Half-day", hi: "आधा दिन" },
  "salary.daysLate": { en: "Late", hi: "देर से" },
  "salary.noSalariedStaff": { en: "No staff with a monthly salary set yet.", hi: "अभी तक किसी स्टाफ का मासिक वेतन सेट नहीं है।" },
  "salary.slipHistory": { en: "Salary Slip History", hi: "वेतन पर्ची इतिहास" },
  "salary.noSlipsYet": { en: "No salary slips generated yet.", hi: "अभी तक कोई वेतन पर्ची जनरेट नहीं हुई।" },

  "calendar.title": { en: "Attendance Calendar", hi: "हाज़िरी कैलेंडर" },
  "calendar.present": { en: "Present", hi: "उपस्थित" },
  "calendar.absent": { en: "Absent", hi: "अनुपस्थित" },
  "calendar.halfDay": { en: "Half-day", hi: "आधा दिन" },
  "calendar.late": { en: "Late", hi: "देर से" },
  "calendar.markAttendance": { en: "Mark attendance", hi: "हाज़िरी दर्ज करें" },
  "calendar.markFor": { en: "Mark {date} as:", hi: "{date} को इस रूप में दर्ज करें:" },
  "calendar.resetToPresent": { en: "Reset to Present", hi: "उपस्थित पर वापस करें" },
  "calendar.defaultPresentNote": {
    en: "Every day is Present by default — only mark exceptions.",
    hi: "हर दिन डिफ़ॉल्ट रूप से उपस्थित माना जाता है — केवल अपवाद दर्ज करें।",
  },
};
