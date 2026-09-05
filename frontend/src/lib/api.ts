import type {
  AttendanceStatus,
  DayAttendance,
  RosterEntry,
  SalarySlip,
  SalaryStatusEntry,
  SimplePaymentMode,
  LaborPaymentMode,
  BrickCategory,
  BrickCategoryName,
  BrickGrade,
  BrickLoadingDriverSummary,
  BrickLoadingEntry,
  BrickProductionEntry,
  BrickVehicleType,
  Challan,
  ChamberCostReport,
  ChamberGrading,
  ChamberOverviewEntry,
  ComplianceDocument,
  ComplianceDocumentType,
  ContractorNetBalance,
  ContractDailyMovement,
  Customer,
  CustomerCreditAging,
  CustomerDetail,
  DashboardStockSummary,
  DepthUnit,
  DieselPeriodTotals,
  Dispatch,
  Doctor,
  DoctorVisit,
  ProfitLossStatement,
  DispatchTotals,
  Expense,
  ExpenseCategory,
  ExpenseType,
  ExpenseTypeDetail,
  FamilyForPerson,
  FamilyMember,
  FamilyRelation,
  InventoryItem,
  SuppliedItem,
  FinancialFlow,
  FinancialOverview,
  FinishedGoodsReconciliation,
  FireRoundSpeed,
  FiringShift,
  FitterRosterSummary,
  FuelEfficiency,
  FuelLog,
  FuelLogPeriodTotals,
  FuelPurchase,
  FuelType,
  GatePassRecord,
  Gher,
  GherStatus,
  IncidentType,
  Invoice,
  JcbWorkLog,
  KilnIncident,
  KilnVehicle,
  LaborReportRun,
  LabourSessionSummary,
  Land,
  LedgerCategory,
  LedgerEntry,
  LedgerPaymentMode,
  LoadingEntry,
  Machine,
  MachineFuelLog,
  DamageFault,
  MachineFuelType,
  MachineInstallmentPayment,
  MachineMaintenanceLog,
  MachineType,
  MoldingContractorSummary,
  MoldingPeriodTotals,
  MoldingEntry,
  NikasiContractorSummary,
  NikasiEntry,
  NikasiOperatorSummary,
  NikasiPeriodTotals,
  OutstandingAdvance,
  PakayiContractorSummary,
  PakayiOperatorSummary,
  PaymentDue,
  PaymentMode,
  PartnerAsset,
  PartnerAssetType,
  PartnerDetail,
  PartnerProfitShare,
  PaymentReceipt,
  PathaiSite,
  PathaiSiteOverviewEntry,
  Person,
  PersonBalanceEntry,
  PersonFullReport,
  PersonType,
  SaltUsageLog,
  SalesAgentDetail,
  SalesAgentSummary,
  CompareModule,
  SeasonYearResult,
  ProductionLog,
  ProductionSeriesPoint,
  Reconciliation,
  SeasonFinancialSummary,
  Sex,
  ShiftType,
  SoilContract,
  SoilContractDashboard,
  SoilContractRateType,
  SoilContractStatus,
  SoilContractSummary,
  SoilTrip,
  StackingContractorSummary,
  StackingEntry,
  StackingMode,
  StackingOperatorSummary,
  StackingStage,
  StackingVehicle,
  StackingVehicleType,
  StockAudit,
  StockLoadingEntry,
  Supplier,
  SupplierDetail,
  SupplierFuelBalance,
  SupplierInvoice,
  SupplierInvoiceItem,
  SupplyListItem,
  TractorFleetEntry,
  StockPoint,
  VehicleDieselEntry,
  WastageLog,
  WorkEntry,
  WorkType,
  SoilArrival,
  SoilArrivalTractorEntry,
  SandContract,
  SandContractRateType,
  SandDelivery,
  SandDeliveryTractorEntry,
  SaleOrder,
  PurchaseOrder,
  OrderStatus,
  BankAccount,
  BankTransaction,
  BankTransactionDirection,
  BookEntry,
  BookEntryType,
  BankReconciliationSummary,
  BrickLineItem,
  LandLeaseContract,
  LandLeaseContractSummary,
  LandLeaseRateType,
  LandLeaseContractStatus,
} from "@/types";
import type { ReportResult, ReportRunParams, DashboardSummary } from "@/types/reports";
import { useAuthStore, type AuthUser, type UserKiln, type UserSeason } from "@/store/auth.store";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

// The write-shape of a BrickLineItem row — categoryId is always a plain
// id here (never the enriched object the read-shape `BrickLineItem` type
// carries), used across brickLoading/dispatch/challans/gatePasses/invoices
// create+update calls.
export interface LineItemInput {
  categoryId?: string;
  bricksCount: number;
  pricePerBrick?: number;
}

async function request<T>(path: string, options: RequestInit = {}, scoped = false): Promise<T> {
  const { token, activeKilnId, activeSeasonId } = useAuthStore.getState();
  const res = await fetch(`${API_URL}/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(scoped && activeKilnId ? { "X-Kiln-Id": activeKilnId } : {}),
      ...(scoped && activeSeasonId ? { "X-Season-Id": activeSeasonId } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    useAuthStore.getState().logout();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${path}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

const get = <T>(path: string, scoped = false) => request<T>(path, {}, scoped);
const post = <T>(path: string, body: unknown, scoped = false) =>
  request<T>(path, { method: "POST", body: JSON.stringify(body) }, scoped);
const del = <T>(path: string, scoped = false) => request<T>(path, { method: "DELETE" }, scoped);
const patch = <T>(path: string, body: unknown, scoped = false) =>
  request<T>(path, { method: "PATCH", body: JSON.stringify(body) }, scoped);

// Multipart upload — deliberately bypasses `request()`'s JSON Content-Type
// header (the browser sets its own multipart boundary header when given a
// FormData body directly), otherwise identical auth/kiln-scoping behavior.
async function postFile<T>(path: string, fieldName: string, file: File | Blob, scoped = true): Promise<T> {
  const { token, activeKilnId, activeSeasonId } = useAuthStore.getState();
  const formData = new FormData();
  formData.append(fieldName, file, file instanceof File ? file.name : "capture.jpg");
  const res = await fetch(`${API_URL}/api${path}`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(scoped && activeKilnId ? { "X-Kiln-Id": activeKilnId } : {}),
      ...(scoped && activeSeasonId ? { "X-Season-Id": activeSeasonId } : {}),
    },
    body: formData,
  });
  if (res.status === 401) useAuthStore.getState().logout();
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Upload failed: ${path}`);
  }
  return res.json();
}

// Shared by reports.run and reports.sendText so the two can never forward a
// different filter set for the same report — see reports.sendText's own
// comment for the bug this fixes.
function reportFilterQueryString(params: ReportRunParams): string {
  const q = new URLSearchParams();
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.groupBy) q.set("groupBy", params.groupBy);
  if (params.personId) q.set("personId", params.personId);
  if (params.personType) q.set("personType", params.personType);
  if (params.customerId) q.set("customerId", params.customerId);
  if (params.supplierId) q.set("supplierId", params.supplierId);
  if (params.doctorId) q.set("doctorId", params.doctorId);
  if (params.agentId) q.set("agentId", params.agentId);
  if (params.vehicleId) q.set("vehicleId", params.vehicleId);
  if (params.driverId) q.set("driverId", params.driverId);
  if (params.category) q.set("category", params.category);
  if (params.contractorId) q.set("contractorId", params.contractorId);
  if (params.categoryId) q.set("categoryId", params.categoryId);
  if (params.damageFault) q.set("damageFault", params.damageFault);
  if (params.damageThreshold != null) q.set("damageThreshold", String(params.damageThreshold));
  if (params.workType) q.set("workType", params.workType);
  if (params.status) q.set("status", params.status);
  return q.toString();
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
  kilns: UserKiln[];
}

export const api = {
  production: {
    today: () => get<ProductionLog[]>(`/production/today`, true),
    series: (days = 14) => get<ProductionSeriesPoint[]>(`/production/series?days=${days}`, true),
    create: (input: {
      batchNumber: string;
      bricksCount: number;
      qualityGrade?: string;
      thekedarId?: string;
    }) => post<ProductionLog>("/production", input, true),
  },

  stock: {
    snapshot: () => get<StockPoint[]>(`/stock/snapshot`, true),
    create: (input: { type: "RAW_MATERIAL" | "FINISHED_GOODS"; itemName: string; quantity: number; unit?: string }) =>
      post<StockPoint>("/stock", input, true),
  },

  dispatch: {
    list: (days?: number) => get<Dispatch[]>(`/dispatch${days ? `?days=${days}` : ""}`, true),
    create: (input: {
      customerName: string;
      customerId?: string;
      customerAddress?: string;
      customerPhone?: string;
      bricksCount?: number;
      amount?: number;
      items?: LineItemInput[];
      driverName?: string;
      driverPhone?: string;
      transportCost?: number;
      categoryId?: string;
      vehicleNumber?: string;
      vehicleType?: string;
      driverTipAmount?: number;
      driverTipPaymentMode?: LaborPaymentMode;
      driverTipCashAmount?: number;
      driverTipOnlineAmount?: number;
      discountAmount?: number;
      placeOfSupply?: string;
      notes?: string;
      loadingEntryId?: string;
      paymentMode?: PaymentMode;
      cashAmount?: number;
      onlineAmount?: number;
      dispatchedOn?: string;
    }) => post<Dispatch>("/dispatch", input, true),
    totals: (days = 7) => get<DispatchTotals>(`/dispatch/totals?days=${days}`, true),
    soldByCategory: () => get<{ categoryId: string; category: string; grade: string | null; bricksSold: number }[]>("/dispatch/sold-by-category", true),
    bySaleOrder: (saleOrderId: string) =>
      get<{ _id: string; slipNumber?: number; amount: number; bricksCount: number; dispatchedOn: string; cancelled: boolean }[]>(`/dispatch/by-sale-order/${saleOrderId}`, true),
    adjustment: (id: string, input: { breakageCount?: number; returnedCount?: number; returnReason?: string }) =>
      patch<Dispatch>(`/dispatch/${id}/adjustment`, input, true),
    update: (
      id: string,
      input: Partial<{
        customerName: string;
        customerId: string | null;
        customerAddress: string;
        customerPhone: string;
        grade: BrickGrade;
        bricksCount: number;
        amount: number;
        items: LineItemInput[];
        driverId: string | null;
        driverName: string;
        driverPhone: string;
        transportCost: number;
        transportPaidBy: "OWNER" | "CUSTOMER";
        paymentMode: PaymentMode;
        cashAmount: number;
        onlineAmount: number;
        categoryId: string | null;
        vehicleNumber: string;
        vehicleType: string;
        driverTipAmount: number;
        driverTipPaymentMode: LaborPaymentMode;
        driverTipCashAmount: number;
        driverTipOnlineAmount: number;
        discountAmount: number;
        placeOfSupply: string;
        notes: string;
        dispatchedOn: string;
      }>
    ) => patch<Dispatch>(`/dispatch/${id}`, input, true),
    remove: (id: string) => del<void>(`/dispatch/${id}`, true),
  },

  challans: {
    list: (dispatchId?: string) => get<Challan[]>(`/challans${dispatchId ? `?dispatchId=${dispatchId}` : ""}`, true),
    nextSequenceNumber: () => get<{ nextSequenceNumber: number }>("/challans/next-sequence-number", true),
    create: (input: {
      dispatchId: string;
      sequenceNumber?: number;
      vehicleNumber?: string;
      vehicleType?: string;
      driverName?: string;
      driverPhone?: string;
      customerName: string;
      customerAddress?: string;
      customerPhone?: string;
      categoryId?: string;
      bricksCount: number;
      items?: LineItemInput[];
      placeOfSupply?: string;
      challanDate: string;
      notes?: string;
    }) => post<Challan>("/challans", input, true),
    update: (
      id: string,
      input: Partial<{
        sequenceNumber: number;
        vehicleNumber: string;
        vehicleType: string;
        driverName: string;
        driverPhone: string;
        customerName: string;
        customerAddress: string;
        customerPhone: string;
        categoryId: string;
        bricksCount: number;
        items: LineItemInput[];
        placeOfSupply: string;
        challanDate: string;
        notes: string;
      }>
    ) => patch<Challan>(`/challans/${id}`, input, true),
    remove: (id: string) => del<void>(`/challans/${id}`, true),
  },

  gatePasses: {
    list: (dispatchId?: string) => get<GatePassRecord[]>(`/gate-passes${dispatchId ? `?dispatchId=${dispatchId}` : ""}`, true),
    nextSequenceNumber: () => get<{ nextSequenceNumber: number }>("/gate-passes/next-sequence-number", true),
    create: (input: {
      dispatchId: string;
      sequenceNumber?: number;
      vehicleNumber?: string;
      vehicleType?: string;
      driverName?: string;
      driverPhone?: string;
      customerName: string;
      categoryId?: string;
      bricksCount: number;
      items?: LineItemInput[];
      placeOfSupply?: string;
      gatePassDate: string;
      notes?: string;
    }) => post<GatePassRecord>("/gate-passes", input, true),
    update: (
      id: string,
      input: Partial<{
        sequenceNumber: number;
        vehicleNumber: string;
        vehicleType: string;
        driverName: string;
        driverPhone: string;
        customerName: string;
        categoryId: string;
        bricksCount: number;
        items: LineItemInput[];
        placeOfSupply: string;
        gatePassDate: string;
        notes: string;
      }>
    ) => patch<GatePassRecord>(`/gate-passes/${id}`, input, true),
    remove: (id: string) => del<void>(`/gate-passes/${id}`, true),
  },

  invoices: {
    list: (dispatchId?: string) => get<Invoice[]>(`/invoices${dispatchId ? `?dispatchId=${dispatchId}` : ""}`, true),
    nextSequenceNumber: () => get<{ nextSequenceNumber: number }>("/invoices/next-sequence-number", true),
    create: (input: {
      dispatchId?: string;
      sequenceNumber?: number;
      customerId?: string;
      partnerId?: string;
      agentId?: string;
      customerName: string;
      customerAddress?: string;
      customerPhone?: string;
      customerGstNumber?: string;
      categoryId?: string;
      bricksCount: number;
      items?: LineItemInput[];
      ratePerBrick?: number;
      grossAmount?: number;
      discountAmount?: number;
      netAmount: number;
      amountPaidNow?: number;
      paymentMode?: PaymentMode;
      cashAmount?: number;
      onlineAmount?: number;
      placeOfSupply?: string;
      invoiceDate: string;
      notes?: string;
    }) => post<Invoice>("/invoices", input, true),
    update: (
      id: string,
      input: Partial<{
        sequenceNumber: number;
        customerId: string;
        partnerId: string | null;
        agentId: string | null;
        customerName: string;
        customerAddress: string;
        customerPhone: string;
        customerGstNumber: string;
        categoryId: string;
        bricksCount: number;
        items: LineItemInput[];
        ratePerBrick: number;
        grossAmount: number;
        discountAmount: number;
        netAmount: number;
        amountPaidNow: number;
        paymentMode: PaymentMode;
        cashAmount: number;
        onlineAmount: number;
        placeOfSupply: string;
        invoiceDate: string;
        notes: string;
      }>
    ) => patch<Invoice>(`/invoices/${id}`, input, true),
    remove: (id: string) => del<void>(`/invoices/${id}`, true),
  },

  customers: {
    list: () => get<Customer[]>("/customers", true),
    detail: (id: string) => get<CustomerDetail>(`/customers/${id}`, true),
    create: (input: {
      name: string;
      phones?: string[];
      addresses?: string[];
      drivers?: { name: string; phone: string; address: string }[];
      vehicles?: { vehicleType: string; vehicleNumber: string }[];
      openingPaid?: number;
      openingDue?: number;
    }) => post<Customer>("/customers", input, true),
    update: (
      id: string,
      input: Partial<{
        name: string;
        phones: string[];
        addresses: string[];
        drivers: { name: string; phone: string; address: string }[];
        vehicles: { vehicleType: string; vehicleNumber: string }[];
        openingPaid: number;
        openingDue: number;
      }>
    ) => patch<Customer>(`/customers/${id}`, input, true),
    remove: (id: string) => del<void>(`/customers/${id}`, true),
  },

  suppliers: {
    list: () => get<Supplier[]>("/suppliers", true),
    detail: (id: string) => get<SupplierDetail>(`/suppliers/${id}`, true),
    create: (input: { name: string; phone?: string; address?: string; suppliesList?: SupplyListItem[]; dateAdded?: string }) =>
      post<Supplier>("/suppliers", input, true),
    update: (
      id: string,
      input: Partial<{ name: string; phone: string; address: string; suppliesList: SupplyListItem[]; dateAdded: string }>
    ) => patch<Supplier>(`/suppliers/${id}`, input, true),
    remove: (id: string) => del<void>(`/suppliers/${id}`, true),
  },

  partners: {
    detail: (id: string, days?: number) => get<PartnerDetail>(`/partners/${id}${days ? `?days=${days}` : ""}`, true),
    profitShare: (id: string, days?: number) => get<PartnerProfitShare>(`/partners/${id}/profit-share${days ? `?days=${days}` : ""}`, true),
  },

  partnerAssets: {
    list: (partnerId: string) => get<PartnerAsset[]>(`/partner-assets?partnerId=${partnerId}`, true),
    create: (input: {
      partnerId: string;
      assetType: PartnerAssetType;
      description: string;
      landAreaBigha?: number;
      rentalRate?: number;
      rentalRateUnit?: string;
      notes?: string;
    }) => post<PartnerAsset>("/partner-assets", input, true),
    update: (
      id: string,
      input: Partial<{
        assetType: PartnerAssetType;
        description: string;
        landAreaBigha: number | null;
        rentalRate: number | null;
        rentalRateUnit: string | null;
        notes: string | null;
      }>
    ) => patch<PartnerAsset>(`/partner-assets/${id}`, input, true),
    remove: (id: string) => del<void>(`/partner-assets/${id}`, true),
  },

  salesAgents: {
    list: () => get<SalesAgentSummary[]>("/sales-agents", true),
    detail: (id: string) => get<SalesAgentDetail>(`/sales-agents/${id}`, true),
  },

  supplierInvoices: {
    list: () => get<SupplierInvoice[]>("/supplier-invoices", true),
    create: (input: {
      supplierId: string;
      date?: string;
      itemsReceived?: SupplierInvoiceItem[];
      totalBillAmount: number;
      amountPaid?: number;
      paymentMode?: LaborPaymentMode;
      cashAmount?: number;
      onlineAmount?: number;
    }) => post<SupplierInvoice>("/supplier-invoices", input, true),
    update: (
      id: string,
      input: Partial<{
        supplierId: string;
        date: string;
        itemsReceived: SupplierInvoiceItem[];
        totalBillAmount: number;
        amountPaid: number;
        paymentMode: LaborPaymentMode;
        cashAmount: number;
        onlineAmount: number;
      }>
    ) => patch<SupplierInvoice>(`/supplier-invoices/${id}`, input, true),
    remove: (id: string) => del<void>(`/supplier-invoices/${id}`, true),
    byPurchaseOrder: (purchaseOrderId: string) =>
      get<{ _id: string; sequenceNumber?: number; totalBillAmount: number; amountPaid: number; date: string }[]>(`/supplier-invoices/by-purchase-order/${purchaseOrderId}`, true),
  },

  login: (email: string, password: string) => post<AuthResponse>("/auth/login", { email, password }),
  register: (input: {
    name: string;
    email: string;
    password: string;
    kilnName?: string;
    kilnLocation?: string;
    kilnId?: string;
    role?: "OWNER" | "MANAGER" | "MUNIM";
  }) => post<AuthResponse>("/auth/register", input),
  me: () => get<{ user: AuthUser; kilns: UserKiln[] }>("/auth/me"),
  changePassword: (currentPassword: string, newPassword: string) =>
    patch<{ ok: true }>("/auth/password", { currentPassword, newPassword }),

  kilns: {
    public: () => get<UserKiln>("/kilns/public"),
    list: () => get<UserKiln[]>("/kilns"),
    create: (name: string, location?: string) => post<UserKiln>("/kilns", { name, location }),
    updateGeofence: (latitude: number, longitude: number, radiusMeters?: number) =>
      patch("/kilns/geofence", { latitude, longitude, radiusMeters }, true),
    updateYardCapacity: (yardCapacityBricks: number) =>
      patch("/kilns/yard-capacity", { yardCapacityBricks }, true),
    updateShiftTimes: (dayShiftStart: string, dayShiftEnd: string) =>
      patch("/kilns/shift-times", { dayShiftStart, dayShiftEnd }, true),
    updateProfile: (input: { name?: string; location?: string; phone?: string }) =>
      patch("/kilns/profile", input, true),
    updateGst: (gstNumber: string | null) => patch("/kilns/gst", { gstNumber }, true),
    updateBilling: (input: {
      stateCode?: string | null;
      bankAccountNumber?: string | null;
      bankName?: string | null;
      bankIfscCode?: string | null;
      defaultTermsAndConditions?: string | null;
    }) => patch<UserKiln>("/kilns/billing", input, true),
    uploadSignature: (file: File | Blob) => postFile<UserKiln>("/kilns/signature", "signature", file),
    // Mirrors people.fetchIdentityProofBlob's authenticated-blob pattern —
    // a plain <img src> can't send the auth/X-Kiln-Id headers this route
    // needs, and printDocument.ts needs the bytes anyway (to embed as a
    // base64 data URI in the print window, which has no app auth context).
    fetchSignatureBlob: async (): Promise<Blob | null> => {
      const { token, activeKilnId } = useAuthStore.getState();
      const res = await fetch(`${API_URL}/api/kilns/signature`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(activeKilnId ? { "X-Kiln-Id": activeKilnId } : {}) },
      });
      if (!res.ok) return null;
      return res.blob();
    },
    // Every printInvoiceRecord caller needs the signature as a base64 data
    // URI (the print window is a standalone blob document with no app auth
    // context, so it can't load an authenticated <img src> directly) —
    // centralized here rather than re-implemented at each of the 4 call
    // sites (CreateInvoiceForm, InvoiceDetailPage, DispatchDetailPage,
    // AddCustomerPaymentModal).
    fetchSignatureDataUri: async (): Promise<string | undefined> => {
      const { activeKilnId, kilns } = useAuthStore.getState();
      const activeKiln = kilns.find((k) => k.kilnId === activeKilnId);
      if (!activeKiln?.signaturePath) return undefined;
      const blob = await api.kilns.fetchSignatureBlob();
      if (!blob) return undefined;
      return await new Promise<string | undefined>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : undefined);
        reader.onerror = () => resolve(undefined);
        reader.readAsDataURL(blob);
      });
    },
    completeOnboarding: () => post("/kilns/onboarding/complete", {}, true),
    getLaborReportSchedule: () => get<{ days: number[] }>("/kilns/labor-report-schedule", true),
    updateLaborReportSchedule: (days: number[]) => patch<UserKiln>("/kilns/labor-report-schedule", { days }, true),
    laborReportRuns: () => get<LaborReportRun[]>("/kilns/labor-report-runs", true),
  },

  seasons: {
    list: () => get<UserSeason[]>("/seasons", true),
    create: (input: { label: string; startDate: string }) => post<UserSeason>("/seasons", input, true),
  },

  people: {
    list: (type?: PersonType) => get<Person[]>(`/people${type ? `?type=${type}` : ""}`, true),
    create: (input: Partial<Person> & { type: PersonType; name: string }) =>
      post<Person>("/people", input, true),
    update: (id: string, input: Partial<Person>) => patch<Person>(`/people/${id}`, input, true),
    remove: (id: string) => del<void>(`/people/${id}`, true),
    get: (id: string) => get<{ person: Person; balance: number }>(`/people/${id}`, true),
    addLedger: (
      id: string,
      input: {
        direction: "DUE" | "PAID";
        amount: number;
        reason: string;
        paymentMode?: LedgerPaymentMode;
        cashAmount?: number;
        onlineAmount?: number;
        category?: LedgerCategory;
        date: string;
      }
    ) => post<LedgerEntry>(`/people/${id}/ledger`, input, true),
    listLedger: (id: string) => get<LedgerEntry[]>(`/people/${id}/ledger`, true),
    contractorBalance: (id: string) => get<ContractorNetBalance>(`/people/${id}/contractor-balance`, true),
    report: (id: string) => get<PersonFullReport>(`/people/${id}/report`, true),
    balances: () => get<PersonBalanceEntry[]>("/people/balances", true),
    advances: () => get<OutstandingAdvance[]>("/people/advances", true),
    paymentsDue: () => get<PaymentDue[]>("/people/payments-due", true),
    creditAging: () => get<CustomerCreditAging[]>("/people/credit-aging", true),
    mergeInto: (id: string, intoPersonId: string) => post<Person>(`/people/${id}/merge-into`, { intoPersonId }, true),
    uploadPhoto: (id: string, file: File | Blob) => postFile<Person>(`/people/${id}/photo`, "photo", file),
    uploadIdentityProof: (id: string, file: File | Blob) => postFile<Person>(`/people/${id}/identity-proof`, "document", file),
    // Photo/ID-proof routes are kiln-scoped and read the same auth/X-Kiln-Id
    // headers as every other request — a plain <img src="..."> can't send
    // those, so callers fetch the bytes through this (same header handling
    // as `request()`) and turn them into an object URL themselves. Returns
    // null on a 404 (nothing uploaded yet) rather than throwing, since "no
    // photo" is an expected, common state, not an error.
    fetchPhotoBlob: async (id: string): Promise<Blob | null> => {
      const { token, activeKilnId } = useAuthStore.getState();
      const res = await fetch(`${API_URL}/api/people/${id}/photo`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(activeKilnId ? { "X-Kiln-Id": activeKilnId } : {}) },
      });
      if (!res.ok) return null;
      return res.blob();
    },
    fetchIdentityProofBlob: async (id: string): Promise<Blob | null> => {
      const { token, activeKilnId } = useAuthStore.getState();
      const res = await fetch(`${API_URL}/api/people/${id}/identity-proof`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(activeKilnId ? { "X-Kiln-Id": activeKilnId } : {}) },
      });
      if (!res.ok) return null;
      return res.blob();
    },
  },

  ledger: {
    update: (
      id: string,
      input: {
        direction: "DUE" | "PAID";
        amount: number;
        reason: string;
        date?: string;
        paymentMode?: LedgerPaymentMode;
        cashAmount?: number;
        onlineAmount?: number;
        category?: LedgerCategory;
      }
    ) => patch<LedgerEntry>(`/ledger/${id}`, input, true),
    remove: (id: string) => del<void>(`/ledger/${id}`, true),
  },

  paymentReceipts: {
    list: (personId?: string) =>
      get<PaymentReceipt[]>(`/payment-receipts${personId ? `?personId=${personId}` : ""}`, true),
    get: (id: string) => get<PaymentReceipt>(`/payment-receipts/${id}`, true),
    create: (input: {
      personId: string;
      amountPaid: number;
      totalAgreedAmount?: number;
      paymentMode?: LedgerPaymentMode;
      cashAmount?: number;
      onlineAmount?: number;
      notes?: string;
      date?: string;
    }) => post<PaymentReceipt>("/payment-receipts", input, true),
    update: (
      id: string,
      input: {
        amountPaid?: number;
        totalAgreedAmount?: number;
        paymentMode?: LedgerPaymentMode;
        cashAmount?: number;
        onlineAmount?: number;
        notes?: string;
        date?: string;
      }
    ) => patch<PaymentReceipt>(`/payment-receipts/${id}`, input, true),
    remove: (id: string) => del<void>(`/payment-receipts/${id}`, true),
  },

  attendance: {
    mark: (input: { personId: string; date: string; status: AttendanceStatus }) =>
      post("/attendance", input, true),
    listForDay: (date: string) => get(`/attendance?date=${date}`, true),
    forPerson: (personId: string, month: string) =>
      get<DayAttendance[]>(`/attendance/for-person/${personId}?month=${month}`, true),
    roster: (date: string) => get<RosterEntry[]>(`/attendance/roster?date=${date}`, true),
  },

  salary: {
    status: (month: string) => get<SalaryStatusEntry[]>(`/salary?month=${month}`, true),
    generate: (month?: string) => post<{ month: string; generated: number; failed: unknown[] }>("/salary/generate", { month }, true),
    generateForPerson: (personId: string, month: string) => post<SalarySlip>(`/salary/generate/${personId}`, { month }, true),
    forPerson: (personId: string) => get<SalarySlip[]>(`/salary/for-person/${personId}`, true),
    update: (slipId: string, input: { deductions?: number; advanceDeducted?: number; netSalary?: number }) =>
      patch<SalarySlip>(`/salary/${slipId}`, input, true),
    remove: (slipId: string) => del(`/salary/${slipId}`, true),
    pdfUrl: (slipId: string, lang: "en" | "hi") => `${API_URL}/api/salary/${slipId}/pdf?lang=${lang}`,
  },

  soilTrips: {
    list: (filter: { siteId?: string } = {}) =>
      get<SoilTrip[]>(`/soil-trips${filter.siteId ? `?siteId=${filter.siteId}` : ""}`, true),
    create: (input: {
      landownerId: string;
      driverId?: string;
      contractId?: string;
      landId?: string;
      siteId?: string;
      tractorNumber?: string;
      trolleyCount?: number;
      receivedTrolleyCount?: number;
      ratePerTrolley: number;
      driverRatePerTrolley?: number;
      depthFeet?: number;
      notes?: string;
    }) => post<SoilTrip>("/soil-trips", input, true),
    updateStatus: (id: string, status: SoilTrip["status"]) =>
      patch<SoilTrip>(`/soil-trips/${id}/status`, { status }, true),
    totals: (days = 30) => get<{ totalTrolleys: number; readyTrolleys: number; tripCount: number }>(
      `/soil-trips/totals?days=${days}`,
      true
    ),
  },

  lands: {
    list: (landownerId?: string) => get<Land[]>(`/lands${landownerId ? `?landownerId=${landownerId}` : ""}`, true),
    get: (id: string) => get<Land>(`/lands/${id}`, true),
    create: (input: {
      landownerId: string;
      name: string;
      village?: string;
      khasraNumber?: string;
      latitude?: number;
      longitude?: number;
      area?: number;
      areaUnit?: string;
      soilType?: string;
      estimatedSoilQuantity?: number;
      notes?: string;
    }) => post<Land>("/lands", input, true),
    update: (
      id: string,
      input: Partial<{
        name: string;
        village: string;
        khasraNumber: string;
        area: number;
        areaUnit: string;
        status: Land["status"];
        notes: string;
        latitude: number;
        longitude: number;
      }>
    ) => patch<Land>(`/lands/${id}`, input, true),
  },

  soilContracts: {
    list: (filter: { landownerId?: string; landId?: string; status?: SoilContractStatus } = {}) => {
      const params = new URLSearchParams();
      if (filter.landownerId) params.set("landownerId", filter.landownerId);
      if (filter.landId) params.set("landId", filter.landId);
      if (filter.status) params.set("status", filter.status);
      const qs = params.toString();
      return get<SoilContract[]>(`/soil-contracts${qs ? `?${qs}` : ""}`, true);
    },
    get: (id: string) => get<SoilContractSummary>(`/soil-contracts/${id}`, true),
    create: (input: {
      landId: string;
      landownerId: string;
      soilType?: string;
      rateType?: SoilContractRateType;
      contractedQuantity?: number;
      ratePerTrolley?: number;
      contractedAreaBigha?: number;
      ratePerBigha?: number;
      contractedDepth?: number;
      depthUnit?: DepthUnit;
      ratePerDepthUnit?: number;
      totalContractValue?: number;
      advanceAmount?: number;
      paymentMode?: LedgerPaymentMode;
      cashAmount?: number;
      onlineAmount?: number;
      startDate?: string;
      endDate?: string;
      paymentTerms?: string;
      notes?: string;
    }) => post<SoilContract>("/soil-contracts", input, true),
    update: (
      id: string,
      input: Partial<{
        soilType: string;
        rateType: SoilContractRateType;
        contractedQuantity: number;
        ratePerTrolley: number;
        contractedAreaBigha: number;
        ratePerBigha: number;
        contractedDepth: number;
        depthUnit: DepthUnit;
        ratePerDepthUnit: number;
        totalContractValue: number;
        advanceAmount: number;
        paymentMode: LedgerPaymentMode;
        cashAmount: number;
        onlineAmount: number;
        startDate: string;
        endDate: string;
        paymentTerms: string;
        notes: string;
      }>
    ) => patch<SoilContract>(`/soil-contracts/${id}`, input, true),
    updateStatus: (id: string, status: SoilContractStatus) =>
      patch<SoilContract>(`/soil-contracts/${id}/status`, { status }, true),
    settle: (id: string) => post<SoilContractSummary>(`/soil-contracts/${id}/settle`, {}, true),
    remove: (id: string) => del(`/soil-contracts/${id}`, true),
    dashboard: () => get<SoilContractDashboard>("/soil-contracts/dashboard", true),
    dailyMovement: (id: string) => get<ContractDailyMovement[]>(`/soil-contracts/${id}/daily-movement`, true),
  },

  landLeaseContracts: {
    list: (filter: { landLeaseId?: string; landId?: string; status?: LandLeaseContractStatus } = {}) => {
      const params = new URLSearchParams();
      if (filter.landLeaseId) params.set("landLeaseId", filter.landLeaseId);
      if (filter.landId) params.set("landId", filter.landId);
      if (filter.status) params.set("status", filter.status);
      const qs = params.toString();
      return get<LandLeaseContract[]>(`/land-lease-contracts${qs ? `?${qs}` : ""}`, true);
    },
    get: (id: string) => get<LandLeaseContractSummary>(`/land-lease-contracts/${id}`, true),
    create: (input: {
      landId: string;
      landLeaseId: string;
      rateType?: LandLeaseRateType;
      contractedQuantity?: number;
      ratePerTrolley?: number;
      contractedAreaBigha?: number;
      ratePerBigha?: number;
      contractedDepth?: number;
      depthUnit?: DepthUnit;
      ratePerDepthUnit?: number;
      totalContractValue?: number;
      advanceAmount?: number;
      paymentMode?: LedgerPaymentMode;
      cashAmount?: number;
      onlineAmount?: number;
      startDate?: string;
      endDate?: string;
      paymentTerms?: string;
      notes?: string;
    }) => post<LandLeaseContract>("/land-lease-contracts", input, true),
    update: (
      id: string,
      input: Partial<{
        rateType: LandLeaseRateType;
        contractedQuantity: number;
        ratePerTrolley: number;
        contractedAreaBigha: number;
        ratePerBigha: number;
        contractedDepth: number;
        depthUnit: DepthUnit;
        ratePerDepthUnit: number;
        totalContractValue: number;
        advanceAmount: number;
        paymentMode: LedgerPaymentMode;
        cashAmount: number;
        onlineAmount: number;
        startDate: string;
        endDate: string;
        paymentTerms: string;
        notes: string;
      }>
    ) => patch<LandLeaseContract>(`/land-lease-contracts/${id}`, input, true),
    updateStatus: (id: string, status: LandLeaseContractStatus) =>
      patch<LandLeaseContract>(`/land-lease-contracts/${id}/status`, { status }, true),
    remove: (id: string) => del(`/land-lease-contracts/${id}`, true),
  },

  sandContracts: {
    list: (filter: { sandContractorId?: string } = {}) =>
      get<SandContract[]>(`/sand-contracts${filter.sandContractorId ? `?sandContractorId=${filter.sandContractorId}` : ""}`, true),
    create: (input: {
      sandContractorId: string;
      rateType?: SandContractRateType;
      contractedTrolleys?: number;
      contractPrice?: number;
      totalContractValue: number;
      advanceAmount?: number;
      paymentMode?: LedgerPaymentMode;
      cashAmount?: number;
      onlineAmount?: number;
      startDate?: string;
      endDate?: string;
    }) => post<SandContract>("/sand-contracts", input, true),
    update: (
      id: string,
      input: Partial<{
        rateType: SandContractRateType;
        contractedTrolleys: number;
        contractPrice: number;
        totalContractValue: number;
        advanceAmount: number;
        paymentMode: LedgerPaymentMode;
        cashAmount: number;
        onlineAmount: number;
        startDate: string;
        endDate: string;
      }>
    ) => patch<SandContract>(`/sand-contracts/${id}`, input, true),
    remove: (id: string) => del<void>(`/sand-contracts/${id}`, true),
  },

  sandDeliveries: {
    list: (filter: { sandContractorId?: string; contractId?: string } = {}) => {
      const params = new URLSearchParams();
      if (filter.sandContractorId) params.set("sandContractorId", filter.sandContractorId);
      if (filter.contractId) params.set("contractId", filter.contractId);
      const qs = params.toString();
      return get<SandDelivery[]>(`/sand-deliveries${qs ? `?${qs}` : ""}`, true);
    },
    create: (input: {
      sandContractorId: string;
      contractId?: string;
      tractorUsed?: boolean;
      tractors?: SandDeliveryTractorEntry[];
      trolleyCount: number;
      paymentGiven?: number;
      paymentPending?: number;
      date?: string;
      notes?: string;
    }) => post<SandDelivery>("/sand-deliveries", input, true),
    update: (
      id: string,
      input: Partial<{
        contractId: string;
        tractorUsed: boolean;
        tractors: SandDeliveryTractorEntry[];
        trolleyCount: number;
        paymentGiven: number;
        paymentPending: number;
        notes: string;
      }>
    ) => patch<SandDelivery>(`/sand-deliveries/${id}`, input, true),
    remove: (id: string) => del<void>(`/sand-deliveries/${id}`, true),
  },

  jcbWorkLogs: {
    list: (filter: { landId?: string; driverId?: string; contractId?: string } = {}) => {
      const params = new URLSearchParams();
      if (filter.landId) params.set("landId", filter.landId);
      if (filter.driverId) params.set("driverId", filter.driverId);
      if (filter.contractId) params.set("contractId", filter.contractId);
      const qs = params.toString();
      return get<JcbWorkLog[]>(`/jcb-work-logs${qs ? `?${qs}` : ""}`, true);
    },
    create: (input: {
      landId: string;
      landownerId: string;
      driverId: string;
      machineId?: string;
      contractId?: string;
      hoursWorked: number;
      notes?: string;
    }) => post<JcbWorkLog>("/jcb-work-logs", input, true),
  },

  expenses: {
    list: () => get<Expense[]>("/expenses", true),
    create: (input: {
      expenseTypeName: string;
      amount: number;
      quantity?: number;
      paymentMode?: LaborPaymentMode;
      cashAmount?: number;
      onlineAmount?: number;
      hours?: number;
      notes?: string;
      soilTripId?: string;
      dispatchId?: string;
      date?: string;
    }) => post<Expense>("/expenses", input, true),
    totals: (days = 30) => get<{ category: ExpenseCategory; amount: number }[]>(`/expenses/totals?days=${days}`, true),
    update: (
      id: string,
      input: Partial<{
        amount: number;
        quantity: number;
        paymentMode: LaborPaymentMode;
        cashAmount: number;
        onlineAmount: number;
        hours: number;
        notes: string;
        date: string;
      }>
    ) => patch<Expense>(`/expenses/${id}`, input, true),
    remove: (id: string) => del<void>(`/expenses/${id}`, true),
  },

  expenseTypes: {
    list: () => get<ExpenseType[]>("/expense-types", true),
    detail: (id: string) => get<ExpenseTypeDetail>(`/expense-types/${id}`, true),
    create: (input: { name: string; openingPaid?: number; openingDue?: number }) => post<ExpenseType>("/expense-types", input, true),
    update: (id: string, input: Partial<{ name: string; openingPaid: number; openingDue: number }>) =>
      patch<ExpenseType>(`/expense-types/${id}`, input, true),
    remove: (id: string) => del<void>(`/expense-types/${id}`, true),
  },

  molding: {
    list: (filter: { workerId?: string; siteId?: string } = {}) => {
      const params = new URLSearchParams();
      if (filter.workerId) params.set("workerId", filter.workerId);
      if (filter.siteId) params.set("siteId", filter.siteId);
      const qs = params.toString();
      return get<MoldingEntry[]>(`/molding${qs ? `?${qs}` : ""}`, true);
    },
    create: (input: {
      workerId: string;
      bricksCount: number;
      ratePerThousand: number;
      damagedCount?: number;
      damageFault?: DamageFault;
      washedOut?: boolean;
      siteId?: string;
      notes?: string;
    }) => post<MoldingEntry>("/molding", input, true),
    today: () => get<{ total: number }>("/molding/today", true),
    periodTotals: () => get<MoldingPeriodTotals>("/molding/period-totals", true),
    contractorSummary: () => get<MoldingContractorSummary>("/molding/contractor-summary", true),
    update: (
      id: string,
      input: Partial<{ bricksCount: number; ratePerThousand: number; damagedCount: number; damageFault: DamageFault; washedOut: boolean; siteId: string; notes: string }>
    ) => patch<MoldingEntry>(`/molding/${id}`, input, true),
    remove: (id: string) => del<void>(`/molding/${id}`, true),
  },

  labourSessions: {
    get: (contractorId: string) => get<LabourSessionSummary>(`/labour-sessions/${contractorId}`, true),
    save: (contractorId: string, input: { numberOfLaborers: number; farePerLaborer: number; advancePerLaborer: number }) =>
      patch<LabourSessionSummary>(`/labour-sessions/${contractorId}`, input, true),
    startNew: (contractorId: string, input: { numberOfLaborers: number; farePerLaborer: number; advancePerLaborer: number }) =>
      post<LabourSessionSummary>(`/labour-sessions/${contractorId}/start-new`, input, true),
  },

  wastage: {
    list: (days = 30) => get<WastageLog[]>(`/wastage?days=${days}`, true),
    create: (input: {
      type: WastageLog["type"];
      cause: WastageLog["cause"];
      quantity: number;
      unit?: string;
      notes?: string;
    }) => post<WastageLog>("/wastage", input, true),
  },

  ghers: {
    list: () => get<Gher[]>("/ghers", true),
    setup: (count: number) => post<Gher[]>("/ghers/setup", { count }, true),
    updateStatus: (id: string, status: GherStatus) => patch<Gher>(`/ghers/${id}/status`, { status }, true),
    overview: () => get<ChamberOverviewEntry[]>("/ghers/overview", true),
  },

  pathaiSites: {
    list: (includeInactive = false) =>
      get<PathaiSite[]>(`/pathai-sites${includeInactive ? "?includeInactive=true" : ""}`, true),
    create: (input: { name: string; distanceKm?: number; notes?: string }) =>
      post<PathaiSite>("/pathai-sites", input, true),
    update: (id: string, input: Partial<{ name: string; distanceKm: number; notes: string; active: boolean }>) =>
      patch<PathaiSite>(`/pathai-sites/${id}`, input, true),
    overview: () => get<PathaiSiteOverviewEntry[]>("/pathai-sites/overview", true),
  },

  saltUsageLogs: {
    list: (filter: { siteId?: string } = {}) =>
      get<SaltUsageLog[]>(`/salt-usage-logs${filter.siteId ? `?siteId=${filter.siteId}` : ""}`, true),
    create: (input: { siteId: string; quantityKg: number; date?: string; notes?: string }) =>
      post<SaltUsageLog>("/salt-usage-logs", input, true),
    remove: (id: string) => del<void>(`/salt-usage-logs/${id}`, true),
  },

  stacking: {
    list: (filter: { gangId?: string; gherId?: string; siteId?: string } = {}) => {
      const params = new URLSearchParams();
      if (filter.gangId) params.set("gangId", filter.gangId);
      if (filter.gherId) params.set("gherId", filter.gherId);
      if (filter.siteId) params.set("siteId", filter.siteId);
      const qs = params.toString();
      return get<StackingEntry[]>(`/stacking${qs ? `?${qs}` : ""}`, true);
    },
    create: (input: {
      gherId: string;
      gangId: string;
      stage: StackingStage;
      siteId?: string;
      bricksCount: number;
      damageCount?: number;
      damageFault?: DamageFault;
      qualityRating?: StackingEntry["qualityRating"];
      mode?: StackingMode;
      tractorNumber?: string;
      buggiCount?: number;
      notes?: string;
    }) => post<StackingEntry>("/stacking", input, true),
    update: (
      id: string,
      input: Partial<{
        stage: StackingStage;
        siteId: string;
        bricksCount: number;
        damageCount: number;
        damageFault: DamageFault;
        qualityRating: StackingEntry["qualityRating"];
        mode: StackingMode;
        tractorNumber: string;
        buggiCount: number;
        notes: string;
      }>
    ) => patch<StackingEntry>(`/stacking/${id}`, input, true),
    remove: (id: string) => del<void>(`/stacking/${id}`, true),
    operatorSummary: () => get<StackingOperatorSummary>("/stacking/operator-summary", true),
    contractorSummary: () => get<StackingContractorSummary>("/stacking/contractor-summary", true),
    tractorFleet: () => get<TractorFleetEntry[]>("/stacking/tractor-fleet", true),
  },

  stackingVehicles: {
    list: (contractorId?: string) =>
      get<StackingVehicle[]>(`/stacking-vehicles${contractorId ? `?contractorId=${contractorId}` : ""}`, true),
    create: (input: {
      contractorId: string;
      vehicleType: StackingVehicleType;
      vehicleNumber?: string;
      buggiCount?: number;
      driverName?: string;
      notes?: string;
    }) => post<StackingVehicle>("/stacking-vehicles", input, true),
    update: (
      id: string,
      input: Partial<{
        vehicleType: StackingVehicleType;
        vehicleNumber: string;
        buggiCount: number;
        driverName: string;
        status: StackingVehicle["status"];
        notes: string;
      }>
    ) => patch<StackingVehicle>(`/stacking-vehicles/${id}`, input, true),
  },

  nikasi: {
    list: (filter: { gangId?: string; gherId?: string } = {}) => {
      const params = new URLSearchParams();
      if (filter.gangId) params.set("gangId", filter.gangId);
      if (filter.gherId) params.set("gherId", filter.gherId);
      const qs = params.toString();
      return get<NikasiEntry[]>(`/nikasi${qs ? `?${qs}` : ""}`, true);
    },
    create: (input: { gherId: string; gangId: string; bricksCount: number; damagedCount?: number; damageFault?: DamageFault; notes?: string }) =>
      post<NikasiEntry>("/nikasi", input, true),
    update: (id: string, input: Partial<{ bricksCount: number; damagedCount: number; damageFault: DamageFault; notes: string }>) =>
      patch<NikasiEntry>(`/nikasi/${id}`, input, true),
    remove: (id: string) => del<void>(`/nikasi/${id}`, true),
    operatorSummary: () => get<NikasiOperatorSummary>("/nikasi/operator-summary", true),
    contractorSummary: () => get<NikasiContractorSummary>("/nikasi/contractor-summary", true),
    periodTotals: () => get<NikasiPeriodTotals>("/nikasi/period-totals", true),
  },

  brickLoading: {
    list: (filter: { driverId?: string; days?: number } = {}) => {
      const params = new URLSearchParams();
      if (filter.driverId) params.set("driverId", filter.driverId);
      if (filter.days) params.set("days", String(filter.days));
      const qs = params.toString();
      return get<BrickLoadingEntry[]>(`/brick-loading${qs ? `?${qs}` : ""}`, true);
    },
    create: (input: {
      customerName?: string;
      customerPhone?: string;
      customerAddress?: string;
      driverName?: string;
      driverPhone?: string;
      tipAmount?: number;
      tipPaymentMode?: LaborPaymentMode;
      tipCashAmount?: number;
      tipOnlineAmount?: number;
      vehicleType: BrickVehicleType;
      vehicleNumber: string;
      items: LineItemInput[];
      unloadedBricksCount?: number;
      loadingRatePerThousand?: number;
      loadingPaymentMode?: LaborPaymentMode;
      loadingCashAmount?: number;
      loadingOnlineAmount?: number;
      unloadingRatePerThousand?: number;
      unloadingPaymentMode?: LaborPaymentMode;
      unloadingCashAmount?: number;
      unloadingOnlineAmount?: number;
      placeOfSupply?: string;
      date?: string;
      unloadingDate?: string;
    }) => post<BrickLoadingEntry>("/brick-loading", input, true),
    update: (
      id: string,
      input: Partial<{
        customerName: string;
        customerPhone: string;
        customerAddress: string;
        driverName: string;
        driverPhone: string;
        vehicleType: BrickVehicleType;
        vehicleNumber: string;
        items: LineItemInput[];
        bricksCount: number;
        unloadedBricksCount: number;
        loadingRatePerThousand: number;
        unloadingRatePerThousand: number;
        pricePerBrick: number;
        tipAmount: number;
        tipPaymentMode: LaborPaymentMode;
        tipCashAmount: number;
        tipOnlineAmount: number;
        loadingPaymentMode: LaborPaymentMode;
        loadingCashAmount: number;
        loadingOnlineAmount: number;
        unloadingPaymentMode: LaborPaymentMode;
        unloadingCashAmount: number;
        unloadingOnlineAmount: number;
        placeOfSupply: string;
        date: string;
        unloadingDate: string;
        notes: string;
      }>
    ) => patch<BrickLoadingEntry>(`/brick-loading/${id}`, input, true),
    remove: (id: string) => del<void>(`/brick-loading/${id}`, true),
    driverSummary: () => get<BrickLoadingDriverSummary>("/brick-loading/driver-summary", true),
  },

  workEntries: {
    list: (filter: { personId?: string; workType?: WorkType } = {}) => {
      const params = new URLSearchParams();
      if (filter.personId) params.set("personId", filter.personId);
      if (filter.workType) params.set("workType", filter.workType);
      const qs = params.toString();
      return get<WorkEntry[]>(`/work-entries${qs ? `?${qs}` : ""}`, true);
    },
    create: (input: { personId: string; workType: WorkType; quantity: number; ratePerThousand: number; notes?: string }) =>
      post<WorkEntry>("/work-entries", input, true),
    update: (
      id: string,
      input: Partial<{ workType: WorkType; quantity: number; ratePerThousand: number; notes: string }>
    ) => patch<WorkEntry>(`/work-entries/${id}`, input, true),
    remove: (id: string) => del<void>(`/work-entries/${id}`, true),
    pakayiOperatorSummary: () => get<PakayiOperatorSummary>("/work-entries/pakayi-operator-summary", true),
    pakayiContractorSummary: () => get<PakayiContractorSummary>("/work-entries/pakayi-contractor-summary", true),
  },

  soilArrivals: {
    list: (filter: { landownerId?: string; contractId?: string; siteId?: string } = {}) => {
      const params = new URLSearchParams();
      if (filter.landownerId) params.set("landownerId", filter.landownerId);
      if (filter.contractId) params.set("contractId", filter.contractId);
      if (filter.siteId) params.set("siteId", filter.siteId);
      const qs = params.toString();
      return get<SoilArrival[]>(`/soil-arrivals${qs ? `?${qs}` : ""}`, true);
    },
    create: (input: {
      landownerId: string;
      contractId?: string;
      jcbUsed?: boolean;
      tractorUsed?: boolean;
      jcbDriverId?: string;
      tractorDriverId?: string;
      tractors?: SoilArrivalTractorEntry[];
      trolleyCount: number;
      depthFeet?: number;
      siteId?: string;
      paymentGiven?: number;
      paymentPending?: number;
      soilRemaining?: number;
      notes?: string;
    }) => post<SoilArrival>("/soil-arrivals", input, true),
    update: (
      id: string,
      input: Partial<{
        contractId: string;
        jcbUsed: boolean;
        tractorUsed: boolean;
        jcbDriverId: string;
        tractorDriverId: string;
        tractors: SoilArrivalTractorEntry[];
        trolleyCount: number;
        depthFeet: number;
        siteId: string;
        paymentGiven: number;
        paymentPending: number;
        soilRemaining: number;
        notes: string;
      }>
    ) => patch<SoilArrival>(`/soil-arrivals/${id}`, input, true),
    remove: (id: string) => del<void>(`/soil-arrivals/${id}`, true),
  },

  familyMembers: {
    list: (headPersonId: string) => get<FamilyMember[]>(`/family-members?headPersonId=${headPersonId}`, true),
    forPerson: (personId: string) => get<FamilyForPerson>(`/family-members/for-person/${personId}`, true),
    create: (input: {
      headPersonId: string;
      name: string;
      relation: FamilyRelation;
      age?: number;
      sex?: Sex;
      isWorking?: boolean;
      notes?: string;
    }) => post<FamilyMember>("/family-members", input, true),
    update: (
      id: string,
      input: Partial<{ name: string; relation: FamilyRelation; age: number; sex: Sex; isWorking: boolean; notes: string }>
    ) => patch<FamilyMember>(`/family-members/${id}`, input, true),
    remove: (id: string) => del(`/family-members/${id}`, true),
  },

  inventory: {
    list: () => get<InventoryItem[]>("/inventory", true),
    create: (input: { name: string; quantity?: number; unit?: string; notes?: string }) =>
      post<InventoryItem>("/inventory", input, true),
    update: (id: string, input: Partial<{ name: string; quantity: number; unit: string; notes: string }>) =>
      patch<InventoryItem>(`/inventory/${id}`, input, true),
    remove: (id: string) => del(`/inventory/${id}`, true),
  },

  suppliedItems: {
    list: (personId: string) => get<SuppliedItem[]>(`/supplied-items?personId=${personId}`, true),
    create: (input: { personId: string; itemId: string; quantity: number; notes?: string }) =>
      post<SuppliedItem>("/supplied-items", input, true),
    remove: (id: string) => del(`/supplied-items/${id}`, true),
  },

  brickCategories: {
    list: () => get<BrickCategory[]>("/brick-categories", true),
    create: (category: BrickCategoryName, pricePerBrick?: number, grade?: string) =>
      post<BrickCategory>("/brick-categories", { category, pricePerBrick, grade }, true),
    update: (id: string, input: Partial<{ category: string; grade: string | null; quantity: number; pricePerBrick: number }>) =>
      patch<BrickCategory>(`/brick-categories/${id}`, input, true),
    remove: (id: string) => del(`/brick-categories/${id}`, true),
    listProduction: (days = 60) => get<BrickProductionEntry[]>(`/brick-categories/production?days=${days}`, true),
    logProduction: (input: { categoryId: string; bricksCount: number; date?: string; notes?: string }) =>
      post<BrickProductionEntry>("/brick-categories/production", input, true),
    removeProduction: (id: string) => del(`/brick-categories/production/${id}`, true),
    listLoading: (days = 60) => get<StockLoadingEntry[]>(`/brick-categories/loading?days=${days}`, true),
    logLoading: (input: { categoryId: string; bricksCount: number; date?: string; notes?: string }) =>
      post<StockLoadingEntry>("/brick-categories/loading", input, true),
    removeLoading: (id: string) => del(`/brick-categories/loading/${id}`, true),
  },

  kilnVehicles: {
    list: () => get<KilnVehicle[]>("/kiln-vehicles", true),
    create: (input: { name: string; type: string; initialMeterReading?: number; oilTankCapacity?: number; notes?: string }) =>
      post<KilnVehicle>("/kiln-vehicles", input, true),
    remove: (id: string) => del(`/kiln-vehicles/${id}`, true),
    listDiesel: (filter: { days?: number; driverId?: string } = {}) => {
      const params = new URLSearchParams();
      if (filter.days) params.set("days", String(filter.days));
      if (filter.driverId) params.set("driverId", filter.driverId);
      const qs = params.toString();
      return get<VehicleDieselEntry[]>(`/kiln-vehicles/diesel${qs ? `?${qs}` : ""}`, true);
    },
    logDiesel: (input: {
      vehicleId: string;
      quantityLiters: number;
      initialMeterReading?: number;
      driverId?: string;
      costAmount?: number;
      paymentMode?: SimplePaymentMode;
      date?: string;
      notes?: string;
    }) => post<VehicleDieselEntry>("/kiln-vehicles/diesel", input, true),
    updateDiesel: (
      id: string,
      input: Partial<{
        vehicleId: string;
        quantityLiters: number;
        initialMeterReading: number;
        driverId: string | null;
        costAmount: number;
        paymentMode: SimplePaymentMode;
        date: string;
        notes: string;
      }>
    ) => patch<VehicleDieselEntry>(`/kiln-vehicles/diesel/${id}`, input, true),
    removeDiesel: (id: string) => del(`/kiln-vehicles/diesel/${id}`, true),
    dieselPeriodTotals: () => get<DieselPeriodTotals>("/kiln-vehicles/diesel/period-totals", true),
  },

  reconciliation: {
    get: (days = 30) => get<Reconciliation>(`/reconciliation?days=${days}`, true),
    dashboardStock: () => get<DashboardStockSummary>("/reconciliation/dashboard-stock", true),
  },

  compliance: {
    list: () => get<ComplianceDocument[]>("/compliance", true),
    create: (input: {
      documentType: ComplianceDocumentType;
      title: string;
      issueDate?: string;
      expiryDate: string;
      notes?: string;
    }) => post<ComplianceDocument>("/compliance", input, true),
    expiringSoon: (withinDays = 30) =>
      get<ComplianceDocument[]>(`/compliance/expiring-soon?withinDays=${withinDays}`, true),
  },

  fuelTypes: {
    list: () => get<FuelType[]>("/fuel-types", true),
    create: (name: string) => post<FuelType>("/fuel-types", { name }, true),
    remove: (id: string) => del(`/fuel-types/${id}`, true),
  },

  fuelPurchases: {
    list: (days = 30) => get<FuelPurchase[]>(`/fuel-purchases?days=${days}`, true),
    create: (input: {
      fuelType: string;
      supplierId?: string;
      vehicleNumber?: string;
      invoicedWeightKg: number;
      actualWeightKg: number;
      amount: number;
      paidAmount?: number;
      paymentMode?: SimplePaymentMode;
      notes?: string;
    }) => post<FuelPurchase>("/fuel-purchases", input, true),
    stockBalance: () => get<Record<string, number>>("/fuel-purchases/stock-balance", true),
    supplierBalances: () => get<SupplierFuelBalance[]>("/fuel-purchases/supplier-balances", true),
    update: (
      id: string,
      input: Partial<{
        fuelType: string;
        vehicleNumber: string;
        invoicedWeightKg: number;
        actualWeightKg: number;
        amount: number;
        paidAmount: number;
        paymentMode: SimplePaymentMode;
        notes: string;
      }>
    ) => patch<FuelPurchase>(`/fuel-purchases/${id}`, input, true),
    remove: (id: string) => del<void>(`/fuel-purchases/${id}`, true),
  },

  fuelLogs: {
    list: (days = 14) => get<FuelLog[]>(`/fuel-logs?days=${days}`, true),
    create: (input: { gherId: string; fuelType: string; quantityKg: number; notes?: string }) =>
      post<FuelLog>("/fuel-logs", input, true),
    efficiency: (days = 7, baselineDays = 30) =>
      get<FuelEfficiency>(`/fuel-logs/efficiency?days=${days}&baselineDays=${baselineDays}`, true),
    periodTotals: () => get<FuelLogPeriodTotals>("/fuel-logs/period-totals", true),
    update: (id: string, input: Partial<{ gherId: string; fuelType: string; quantityKg: number; notes: string }>) =>
      patch<FuelLog>(`/fuel-logs/${id}`, input, true),
    remove: (id: string) => del<void>(`/fuel-logs/${id}`, true),
  },

  chamberGradings: {
    list: (days = 60) => get<ChamberGrading[]>(`/chamber-gradings?days=${days}`, true),
    create: (input: {
      gherId: string;
      items: { categoryId: string; bricksCount: number }[];
      date?: string;
      notes?: string;
    }) => post<{ grading: ChamberGrading; totalOutput: number; recoveryPercent: number | null }>("/chamber-gradings", input, true),
  },

  firingShifts: {
    list: (filter: { days?: number; fitterId?: string } = {}) => {
      const params = new URLSearchParams();
      if (filter.days) params.set("days", String(filter.days));
      if (filter.fitterId) params.set("fitterId", filter.fitterId);
      const qs = params.toString();
      return get<FiringShift[]>(`/firing-shifts${qs ? `?${qs}` : ""}`, true);
    },
    create: (input: {
      fitterId: string;
      gherId?: string;
      shiftType: ShiftType;
      handoverNotes?: string;
      overtimeHours?: number;
      overtimeRate?: number;
      bonusAmount?: number;
    }) => post<FiringShift>("/firing-shifts", input, true),
    roster: (date?: string) => get<FitterRosterSummary>(`/firing-shifts/roster${date ? `?date=${date}` : ""}`, true),
    remove: (id: string) => del<void>(`/firing-shifts/${id}`, true),
  },

  incidents: {
    list: (days = 90) => get<KilnIncident[]>(`/incidents?days=${days}`, true),
    create: (input: {
      gherId?: string;
      type: IncidentType;
      description: string;
      repairCost?: number;
      bricksLost?: number;
      notes?: string;
    }) => post<KilnIncident>("/incidents", input, true),
  },

  gherRoundSpeed: (days = 14) => get<FireRoundSpeed>(`/ghers/round-speed?days=${days}`, true),

  finishedGoodsReconciliation: (days = 30) =>
    get<FinishedGoodsReconciliation>(`/reconciliation/finished-goods?days=${days}`, true),

  loadingEntries: {
    list: (days = 30) => get<LoadingEntry[]>(`/loading-entries?days=${days}`, true),
    create: (input: { dispatchId?: string; palledarId: string; bricksCount: number; ratePerThousand: number; notes?: string }) =>
      post<{ entry: LoadingEntry; countMismatch: boolean; dispatchBricksCount: number | null }>(
        "/loading-entries",
        input,
        true
      ),
  },

  stockAudits: {
    list: (days = 365) => get<StockAudit[]>(`/stock-audits?days=${days}`, true),
    create: (input: { itemName: string; physicalCount: number; notes?: string }) =>
      post<StockAudit>("/stock-audits", input, true),
  },

  machines: {
    list: () => get<Machine[]>("/machines", true),
    get: (id: string) => get<Machine>(`/machines/${id}`, true),
    create: (input: {
      name: string;
      type: MachineType;
      identifier?: string;
      purchaseDate?: string;
      price?: number;
      purchasedByName?: string;
      purchasedByPhone?: string;
      warrantyDetails?: string;
      totalPaid?: number;
      tenureMonths?: number;
      notes?: string;
    }) => post<Machine>("/machines", input, true),
    update: (
      id: string,
      input: Partial<{
        name: string;
        type: MachineType;
        identifier: string;
        purchaseDate: string;
        price: number;
        purchasedByName: string;
        purchasedByPhone: string;
        warrantyDetails: string;
        tenureMonths: number;
        notes: string;
        active: boolean;
      }>
    ) => patch<Machine>(`/machines/${id}`, input, true),
    remove: (id: string) => del(`/machines/${id}`, true),
    installments: {
      list: (machineId: string) => get<MachineInstallmentPayment[]>(`/machines/${machineId}/installments`, true),
      create: (machineId: string, input: { amount: number; date?: string; notes?: string }) =>
        post<{ payment: MachineInstallmentPayment; machine: Machine }>(`/machines/${machineId}/installments`, input, true),
      remove: (machineId: string, paymentId: string) => del(`/machines/${machineId}/installments/${paymentId}`, true),
    },
    fuelLogs: {
      list: (days = 30) => get<MachineFuelLog[]>(`/machines/fuel-logs?days=${days}`, true),
      create: (input: { machineId: string; fuelType: MachineFuelType; quantity: number; hoursRun?: number; notes?: string }) =>
        post<{ log: MachineFuelLog; ratePerHour: number | null; baselineRatePerHour: number | null; consumptionAlert: boolean }>(
          "/machines/fuel-logs",
          input,
          true
        ),
      remove: (id: string) => del(`/machines/fuel-logs/${id}`, true),
    },
    maintenance: {
      list: (days = 90) => get<MachineMaintenanceLog[]>(`/machines/maintenance?days=${days}`, true),
      create: (input: { machineId: string; description: string; cost?: number; downtimeHours?: number; notes?: string }) =>
        post<MachineMaintenanceLog>("/machines/maintenance", input, true),
      remove: (id: string) => del(`/machines/maintenance/${id}`, true),
    },
  },

  doctors: {
    list: () => get<Doctor[]>("/doctors", true),
    create: (input: { name: string; phone?: string; qualification?: string; clinicAddress?: string; notes?: string }) =>
      post<Doctor>("/doctors", input, true),
    update: (id: string, input: Partial<{ name: string; phone: string; qualification: string; clinicAddress: string; notes: string; active: boolean }>) =>
      patch<Doctor>(`/doctors/${id}`, input, true),
    remove: (id: string) => del(`/doctors/${id}`, true),
  },

  doctorVisits: {
    list: (filter: { doctorId?: string; personId?: string } = {}) => {
      const params = new URLSearchParams();
      if (filter.doctorId) params.set("doctorId", filter.doctorId);
      if (filter.personId) params.set("personId", filter.personId);
      const qs = params.toString();
      return get<DoctorVisit[]>(`/doctor-visits${qs ? `?${qs}` : ""}`, true);
    },
    create: (input: {
      doctorId: string;
      personId: string;
      ailment?: string;
      medicineCost?: number;
      consultationFee?: number;
      paymentMode?: LaborPaymentMode;
      cashAmount?: number;
      onlineAmount?: number;
      date?: string;
      notes?: string;
    }) => post<DoctorVisit>("/doctor-visits", input, true),
    update: (
      id: string,
      input: Partial<{
        doctorId: string;
        personId: string;
        ailment: string;
        medicineCost: number;
        consultationFee: number;
        paymentMode: LaborPaymentMode;
        cashAmount: number;
        onlineAmount: number;
        date: string;
        notes: string;
      }>
    ) => patch<DoctorVisit>(`/doctor-visits/${id}`, input, true),
    remove: (id: string) => del(`/doctor-visits/${id}`, true),
  },

  financialReports: {
    summary: (days = 30) => get<SeasonFinancialSummary>(`/financial-reports/summary?days=${days}`, true),
    chamberCost: (gherId: string) => get<ChamberCostReport>(`/financial-reports/chamber-cost/${gherId}`, true),
  },

  financialOverview: {
    get: () => get<FinancialOverview>("/financial-overview", true),
    customRange: (from: string, to: string) =>
      get<FinancialFlow>(`/financial-overview/custom-range?from=${from}&to=${to}`, true),
  },

  profitLoss: {
    get: (range?: { from: string; to: string }) => {
      const qs = range ? `?from=${range.from}&to=${range.to}` : "";
      return get<ProfitLossStatement>(`/profit-loss${qs}`, true);
    },
  },

  compare: {
    get: (module: CompareModule, rangeA: { from: string; to: string }, rangeB: { from: string; to: string }) =>
      get<SeasonYearResult[]>(
        `/compare/${module}?fromA=${rangeA.from}&toA=${rangeA.to}&fromB=${rangeB.from}&toB=${rangeB.to}`,
        true
      ),
  },

  reports: {
    run: (key: string, params: ReportRunParams = {}) => {
      const qs = reportFilterQueryString(params);
      return get<ReportResult>(`/reports/${key}${qs ? `?${qs}` : ""}`, true);
    },
    dashboardSummary: () => get<DashboardSummary>("/reports/dashboard-summary", true),
    // Bug fix: this used to forward only from/to, silently dropping every
    // other filter (customer/agent/vehicle/category/damageFault/groupBy/
    // etc.) the admin had actually picked on screen — the WhatsApp text
    // came out as the kiln-wide, unfiltered report while the on-screen
    // table (via `run` above, which already forwarded every filter)
    // showed the correctly narrowed one. Reuses the exact same
    // query-string builder as `run` so the two can never diverge again.
    sendText: (key: string, to: string, params: ReportRunParams = {}) => {
      const qs = reportFilterQueryString(params);
      return post<{ sent: boolean }>(`/reports/${key}/send-text${qs ? `?${qs}` : ""}`, { to }, true);
    },
  },

  saleOrders: {
    list: (filter: { status?: string; customerId?: string } = {}) => {
      const q = new URLSearchParams();
      if (filter.status) q.set("status", filter.status);
      if (filter.customerId) q.set("customerId", filter.customerId);
      const qs = q.toString();
      return get<SaleOrder[]>(`/sale-orders${qs ? `?${qs}` : ""}`, true);
    },
    detail: (id: string) => get<SaleOrder>(`/sale-orders/${id}`, true),
    create: (input: {
      customerId?: string;
      customerName: string;
      customerAddress?: string;
      customerPhone?: string;
      categoryId?: string;
      items?: BrickLineItem[];
      bricksCount?: number;
      ratePerBrick?: number;
      estimatedAmount?: number;
      orderDate?: string;
      expectedDeliveryDate?: string;
      notes?: string;
    }) => post<SaleOrder>("/sale-orders", input, true),
    cancel: (id: string) => post<SaleOrder>(`/sale-orders/${id}/cancel`, {}, true),
    fulfill: (
      id: string,
      input: {
        bricksCount: number;
        amount: number;
        driverId?: string;
        driverName?: string;
        driverPhone?: string;
        vehicleNumber?: string;
        vehicleType?: string;
        paymentMode?: PaymentMode;
        cashAmount?: number;
        onlineAmount?: number;
        dispatchedOn?: string;
        notes?: string;
      }
    ) => post<{ order: SaleOrder; dispatch: unknown }>(`/sale-orders/${id}/fulfill`, input, true),
  },

  purchaseOrders: {
    list: (filter: { status?: string; supplierId?: string } = {}) => {
      const q = new URLSearchParams();
      if (filter.status) q.set("status", filter.status);
      if (filter.supplierId) q.set("supplierId", filter.supplierId);
      const qs = q.toString();
      return get<PurchaseOrder[]>(`/purchase-orders${qs ? `?${qs}` : ""}`, true);
    },
    detail: (id: string) => get<PurchaseOrder>(`/purchase-orders/${id}`, true),
    create: (input: {
      supplierId: string;
      items?: SupplierInvoiceItem[];
      expectedAmount?: number;
      orderDate?: string;
      expectedDeliveryDate?: string;
      notes?: string;
    }) => post<PurchaseOrder>("/purchase-orders", input, true),
    cancel: (id: string) => post<PurchaseOrder>(`/purchase-orders/${id}/cancel`, {}, true),
    fulfill: (
      id: string,
      input: {
        itemsReceived?: SupplierInvoiceItem[];
        totalBillAmount: number;
        amountPaid?: number;
        paymentMode?: LaborPaymentMode;
        cashAmount?: number;
        onlineAmount?: number;
        date?: string;
        markFulfilled?: boolean;
      }
    ) => post<{ order: PurchaseOrder; invoice: SupplierInvoice }>(`/purchase-orders/${id}/fulfill`, input, true),
  },

  bankAccounts: {
    list: () => get<BankAccount[]>("/bank-accounts", true),
    create: (input: { bankName: string; accountLabel?: string; accountNumberLast4?: string; openingBalance?: number; openingBalanceDate?: string }) =>
      post<BankAccount>("/bank-accounts", input, true),
    update: (id: string, input: Partial<{ bankName: string; accountLabel: string; accountNumberLast4: string; openingBalance: number; openingBalanceDate: string }>) =>
      patch<BankAccount>(`/bank-accounts/${id}`, input, true),
  },

  bankTransactions: {
    list: (bankAccountId: string, filter: { reconciled?: boolean; from?: string; to?: string } = {}) => {
      const q = new URLSearchParams({ bankAccountId });
      if (filter.reconciled !== undefined) q.set("reconciled", String(filter.reconciled));
      if (filter.from) q.set("from", filter.from);
      if (filter.to) q.set("to", filter.to);
      return get<BankTransaction[]>(`/bank-transactions?${q.toString()}`, true);
    },
    create: (input: { bankAccountId: string; date?: string; description?: string; amount: number; direction: BankTransactionDirection; notes?: string }) =>
      post<BankTransaction>("/bank-transactions", input, true),
    bulkCreate: (bankAccountId: string, rows: { date?: string; description?: string; amount: number; direction: BankTransactionDirection; notes?: string }[]) =>
      post<BankTransaction[]>("/bank-transactions/bulk", { bankAccountId, rows }, true),
    unmatchedBookEntries: (from: string, to: string) => get<BookEntry[]>(`/bank-transactions/unmatched-book-entries?from=${from}&to=${to}`, true),
    match: (id: string, entryType: BookEntryType, entryId: string) => post<BankTransaction>(`/bank-transactions/${id}/match`, { entryType, entryId }, true),
    unmatch: (id: string) => post<BankTransaction>(`/bank-transactions/${id}/unmatch`, {}, true),
    summary: (bankAccountId: string, from?: string, to?: string) => {
      const q = new URLSearchParams({ bankAccountId });
      if (from) q.set("from", from);
      if (to) q.set("to", to);
      return get<BankReconciliationSummary>(`/bank-transactions/summary?${q.toString()}`, true);
    },
  },
};
