import * as XLSX from "xlsx";
import type { ReportColumn } from "@/types/reports";

// Builds a workbook straight from an already-fetched report's rows — no
// backend round-trip, works even if the report was loaded while briefly
// online and the admin has since gone offline. Mirrors printDocument.ts's
// house style for blob handling (build → use → let the browser clean up).
export function buildReportWorkbookBlob(
  columns: ReportColumn[],
  rows: Record<string, string | number | null>[],
  totals: Record<string, number> | undefined,
  columnLabels: Record<string, string>,
  sheetTitle: string
): Blob {
  const header = columns.map((c) => columnLabels[c.key] ?? c.key);
  const body = rows.map((row) => columns.map((c) => formatCellForExcel(row[c.key], c.format)));

  const aoa: (string | number | null)[][] = [header, ...body];
  if (totals) {
    const totalsRow = columns.map((c, i) => (i === 0 ? "Total" : c.key in totals ? round2(totals[c.key]) : ""));
    aoa.push(totalsRow);
  }

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  // Sheet names can't exceed 31 chars or contain []:*?/\ — trim/sanitize
  // defensively since report titles are free i18n text.
  const safeName = sheetTitle.replace(/[[\]:*?/\\]/g, " ").slice(0, 31) || "Report";
  XLSX.utils.book_append_sheet(workbook, worksheet, safeName);

  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function formatCellForExcel(value: string | number | null, format: ReportColumn["format"]): string | number {
  if (value == null) return "";
  if (format === "date" && typeof value === "string") {
    return new Date(value).toLocaleDateString("en-IN");
  }
  if (format === "currency" || format === "number") {
    return typeof value === "number" ? round2(value) : value;
  }
  return value;
}

export function downloadExcelFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Web Share API Level 2 (file sharing) is mobile-Chrome/Android-first and
// entirely absent on most desktop browsers — canShare with a files array
// is the correct feature check (navigator.share alone doesn't guarantee
// file support). Falls back to a plain download wherever it's unsupported.
export async function shareExcelFile(blob: Blob, filename: string): Promise<"shared" | "downloaded"> {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean; share?: (data: ShareData) => Promise<void> };
  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: filename });
      return "shared";
    } catch {
      // User cancelled the share sheet, or the browser refused — fall
      // through to a plain download so the admin still gets the file.
    }
  }
  downloadExcelFile(blob, filename);
  return "downloaded";
}
