import type {
  AttendanceStatus,
  DayAttendance,
  RosterEntry,
  SalarySlip,
  SalaryStatusEntry,
  SimplePaymentMode,
  BrickCategory,
  BrickCategoryName,
  BrickGrade,
  BrickLoadingDriverSummary,
  BrickLoadingEntry,
  BrickProductionEntry,
  BrickVehicleType,
  ChamberCostReport,
  ChamberGrading,
  ComplianceDocument,
  ComplianceDocumentType,
  ContractDailyMovement,
  CustomerCreditAging,
  DashboardStockSummary,
  DepthUnit,
  DieselPeriodTotals,
  Dispatch,
  DispatchTotals,
  Expense,
  ExpenseCategory,
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
  Gher,
  GherStatus,
  IncidentType,
  JcbWorkLog,
  KilnIncident,
  KilnVehicle,
  Land,
  LedgerCategory,
  LedgerEntry,
  LedgerPaymentMode,
  LoadingEntry,
  Machine,
  MachineFuelLog,
  MachineFuelType,
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
  PaymentDue,
  PaymentMode,
  PaymentReceipt,
  Person,
  PersonFullReport,
  PersonType,
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
  SupplierFuelBalance,
  TractorFleetEntry,
  StockPoint,
  VehicleDieselEntry,
  WastageLog,
  WorkEntry,
  WorkType,
  SoilArrival,
} from "@/types";
import { useAuthStore, type AuthUser, type UserKiln } from "@/store/auth.store";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

async function request<T>(path: string, options: RequestInit = {}, scoped = false): Promise<T> {
  const { token, activeKilnId } = useAuthStore.getState();
  const res = await fetch(`${API_URL}/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(scoped && activeKilnId ? { "X-Kiln-Id": activeKilnId } : {}),
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
    list: (days = 30) => get<Dispatch[]>(`/dispatch?days=${days}`, true),
    create: (input: {
      customerName: string;
      customerId?: string;
      grade?: BrickGrade;
      bricksCount: number;
      amount: number;
      driverId?: string;
      transportCost?: number;
      transportPaidBy?: "OWNER" | "CUSTOMER";
      paymentMode?: PaymentMode;
      cashAmount?: number;
      onlineAmount?: number;
      categoryId?: string;
      vehicleNumber?: string;
      vehicleType?: string;
      driverTipAmount?: number;
      discountAmount?: number;
    }) => post<Dispatch>("/dispatch", input, true),
    totals: (days = 7) => get<DispatchTotals>(`/dispatch/totals?days=${days}`, true),
    adjustment: (id: string, input: { breakageCount?: number; returnedCount?: number; returnReason?: string }) =>
      patch<Dispatch>(`/dispatch/${id}/adjustment`, input, true),
    update: (
      id: string,
      input: Partial<{
        customerName: string;
        customerId: string | null;
        grade: BrickGrade;
        bricksCount: number;
        amount: number;
        driverId: string | null;
        transportCost: number;
        transportPaidBy: "OWNER" | "CUSTOMER";
        paymentMode: PaymentMode;
        cashAmount: number;
        onlineAmount: number;
        categoryId: string | null;
        vehicleNumber: string;
        vehicleType: string;
        driverTipAmount: number;
        discountAmount: number;
      }>
    ) => patch<Dispatch>(`/dispatch/${id}`, input, true),
    remove: (id: string) => del<void>(`/dispatch/${id}`, true),
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
    updateSeason: (seasonStartMonth: number, seasonStartDay: number) =>
      patch("/kilns/season", { seasonStartMonth, seasonStartDay }, true),
    updateShiftTimes: (dayShiftStart: string, dayShiftEnd: string) =>
      patch("/kilns/shift-times", { dayShiftStart, dayShiftEnd }, true),
    updateProfile: (input: { name?: string; location?: string; phone?: string }) =>
      patch("/kilns/profile", input, true),
    updateGst: (gstNumber: string | null) => patch("/kilns/gst", { gstNumber }, true),
    completeOnboarding: () => post("/kilns/onboarding/complete", {}, true),
  },

  people: {
    list: (type?: PersonType) => get<Person[]>(`/people${type ? `?type=${type}` : ""}`, true),
    create: (input: Partial<Person> & { type: PersonType; name: string }) =>
      post<Person>("/people", input, true),
    update: (id: string, input: Partial<Person>) => patch<Person>(`/people/${id}`, input, true),
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
      }
    ) => post<LedgerEntry>(`/people/${id}/ledger`, input, true),
    listLedger: (id: string) => get<LedgerEntry[]>(`/people/${id}/ledger`, true),
    report: (id: string) => get<PersonFullReport>(`/people/${id}/report`, true),
    advances: () => get<OutstandingAdvance[]>("/people/advances", true),
    paymentsDue: () => get<PaymentDue[]>("/people/payments-due", true),
    creditAging: () => get<CustomerCreditAging[]>("/people/credit-aging", true),
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
    forPerson: (personId: string) => get<SalarySlip[]>(`/salary/for-person/${personId}`, true),
    pdfUrl: (slipId: string, lang: "en" | "hi") => `${API_URL}/api/salary/${slipId}/pdf?lang=${lang}`,
  },

  soilTrips: {
    list: () => get<SoilTrip[]>("/soil-trips", true),
    create: (input: {
      landownerId: string;
      driverId?: string;
      contractId?: string;
      landId?: string;
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
      input: Partial<{ name: string; status: Land["status"]; notes: string; latitude: number; longitude: number }>
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
      advanceAmount?: number;
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
      category: ExpenseCategory;
      amount: number;
      paymentMode?: SimplePaymentMode;
      hours?: number;
      notes?: string;
      soilTripId?: string;
      dispatchId?: string;
    }) => post<Expense>("/expenses", input, true),
    totals: (days = 30) => get<{ category: ExpenseCategory; amount: number }[]>(`/expenses/totals?days=${days}`, true),
  },

  molding: {
    list: (filter: { workerId?: string } = {}) =>
      get<MoldingEntry[]>(`/molding${filter.workerId ? `?workerId=${filter.workerId}` : ""}`, true),
    create: (input: {
      workerId: string;
      bricksCount: number;
      ratePerThousand: number;
      damagedCount?: number;
      washedOut?: boolean;
      notes?: string;
    }) => post<MoldingEntry>("/molding", input, true),
    today: () => get<{ total: number }>("/molding/today", true),
    periodTotals: () => get<MoldingPeriodTotals>("/molding/period-totals", true),
    contractorSummary: () => get<MoldingContractorSummary>("/molding/contractor-summary", true),
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
  },

  stacking: {
    list: (filter: { gangId?: string } = {}) =>
      get<StackingEntry[]>(`/stacking${filter.gangId ? `?gangId=${filter.gangId}` : ""}`, true),
    create: (input: {
      gherId: string;
      gangId: string;
      stage: StackingStage;
      bricksCount: number;
      damageCount?: number;
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
        bricksCount: number;
        damageCount: number;
        qualityRating: StackingEntry["qualityRating"];
        mode: StackingMode;
        tractorNumber: string;
        buggiCount: number;
        notes: string;
      }>
    ) => patch<StackingEntry>(`/stacking/${id}`, input, true),
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
    list: (filter: { gangId?: string } = {}) =>
      get<NikasiEntry[]>(`/nikasi${filter.gangId ? `?gangId=${filter.gangId}` : ""}`, true),
    create: (input: { gherId: string; gangId: string; bricksCount: number; damagedCount?: number; notes?: string }) =>
      post<NikasiEntry>("/nikasi", input, true),
    update: (id: string, input: Partial<{ bricksCount: number; damagedCount: number; notes: string }>) =>
      patch<NikasiEntry>(`/nikasi/${id}`, input, true),
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
      vehicleType: BrickVehicleType;
      vehicleNumber: string;
      driverId: string;
      bricksCount: number;
      tipAmount?: number;
      loadingCharge?: number;
      categoryId?: string;
      discountAmount?: number;
      dispatchId?: string;
      notes?: string;
    }) => post<BrickLoadingEntry>("/brick-loading", input, true),
    update: (
      id: string,
      input: Partial<{ vehicleType: BrickVehicleType; vehicleNumber: string; bricksCount: number; tipAmount: number; loadingCharge: number; notes: string }>
    ) => patch<BrickLoadingEntry>(`/brick-loading/${id}`, input, true),
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
  },

  soilArrivals: {
    list: (filter: { landownerId?: string; contractId?: string } = {}) => {
      const params = new URLSearchParams();
      if (filter.landownerId) params.set("landownerId", filter.landownerId);
      if (filter.contractId) params.set("contractId", filter.contractId);
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
      trolleyCount: number;
      depthFeet?: number;
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
        trolleyCount: number;
        depthFeet: number;
        paymentGiven: number;
        paymentPending: number;
        soilRemaining: number;
        notes: string;
      }>
    ) => patch<SoilArrival>(`/soil-arrivals/${id}`, input, true),
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
    create: (input: { name: string; type: string }) => post<KilnVehicle>("/kiln-vehicles", input, true),
    remove: (id: string) => del(`/kiln-vehicles/${id}`, true),
    listDiesel: (days = 60) => get<VehicleDieselEntry[]>(`/kiln-vehicles/diesel?days=${days}`, true),
    logDiesel: (input: { vehicleId: string; quantityLiters: number; costAmount?: number; paymentMode?: SimplePaymentMode; date?: string; notes?: string }) =>
      post<VehicleDieselEntry>("/kiln-vehicles/diesel", input, true),
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
  },

  fuelLogs: {
    list: (days = 14) => get<FuelLog[]>(`/fuel-logs?days=${days}`, true),
    create: (input: { gherId: string; fuelType: string; quantityKg: number; notes?: string }) =>
      post<FuelLog>("/fuel-logs", input, true),
    efficiency: (days = 7, baselineDays = 30) =>
      get<FuelEfficiency>(`/fuel-logs/efficiency?days=${days}&baselineDays=${baselineDays}`, true),
    periodTotals: () => get<FuelLogPeriodTotals>("/fuel-logs/period-totals", true),
  },

  chamberGradings: {
    list: (days = 60) => get<ChamberGrading[]>(`/chamber-gradings?days=${days}`, true),
    create: (input: {
      gherId: string;
      a1Count: number;
      jhamaCount?: number;
      pelaCount?: number;
      rodaCount?: number;
      notes?: string;
    }) => post<{ grading: ChamberGrading; recoveryPercent: number | null }>("/chamber-gradings", input, true),
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
    create: (input: { name: string; type: MachineType; identifier?: string; notes?: string }) =>
      post<Machine>("/machines", input, true),
    fuelLogs: {
      list: (days = 30) => get<MachineFuelLog[]>(`/machines/fuel-logs?days=${days}`, true),
      create: (input: { machineId: string; fuelType: MachineFuelType; quantity: number; hoursRun?: number; notes?: string }) =>
        post<{ log: MachineFuelLog; ratePerHour: number | null; baselineRatePerHour: number | null; consumptionAlert: boolean }>(
          "/machines/fuel-logs",
          input,
          true
        ),
    },
    maintenance: {
      list: (days = 90) => get<MachineMaintenanceLog[]>(`/machines/maintenance?days=${days}`, true),
      create: (input: { machineId: string; description: string; cost?: number; downtimeHours?: number; notes?: string }) =>
        post<MachineMaintenanceLog>("/machines/maintenance", input, true),
    },
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

  compare: {
    get: (module: CompareModule, rangeA: { from: string; to: string }, rangeB: { from: string; to: string }) =>
      get<SeasonYearResult[]>(
        `/compare/${module}?fromA=${rangeA.from}&toA=${rangeA.to}&fromB=${rangeB.from}&toB=${rangeB.to}`,
        true
      ),
  },
};
