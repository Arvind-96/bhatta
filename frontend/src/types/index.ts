export interface ProductionLog {
  _id: string;
  kilnId: string;
  batchNumber: string;
  bricksCount: number;
  qualityGrade: string;
  thekedarId?: string;
  producedOn: string;
}

export interface StockPoint {
  itemName: string;
  quantity: number;
}

export interface ProductionSeriesPoint {
  date: string;
  bricks: number;
}

export type BrickGrade = "A1" | "JHAMA" | "PELA";
export type PaymentMode = "CASH" | "BANK" | "UPI" | "GST_INVOICE" | "CASH_AND_ONLINE";

export interface Dispatch {
  _id: string;
  customerName: string;
  customerId?: { _id: string; name: string; phone?: string; address?: string; gstNumber?: string } | string;
  customerAddress?: string;
  customerPhone?: string;
  grade: BrickGrade;
  bricksCount: number;
  amount: number;
  driverId?: { _id: string; name: string; phone?: string } | string;
  driverName?: string;
  driverPhone?: string;
  slipNumber: string;
  invoiceNumber?: string;
  transportCost?: number;
  transportPaidBy?: "OWNER" | "CUSTOMER";
  breakageCount: number;
  returnedCount: number;
  returnReason?: string;
  paymentMode?: PaymentMode;
  cashAmount?: number;
  onlineAmount?: number;
  categoryId?: { _id: string; category: BrickCategoryName; grade?: string } | string;
  vehicleNumber?: string;
  vehicleType?: string;
  driverTipAmount?: number;
  discountAmount?: number;
  notes?: string;
  dispatchedOn: string;
  createdAt: string;
}

export interface DispatchTotals {
  days: number;
  bricksCount: number;
  amount: number;
  dispatchCount: number;
}

export type PersonType =
  | "DRIVER"
  | "LABOUR_CONTRACTOR"
  | "SUPPLIER"
  | "THEKEDAR"
  | "PARTNER"
  | "WORKER"
  | "HELPER"
  | "LANDOWNER"
  | "FITTER"
  | "CUSTOMER"
  | "MUNIM"
  | "CHOWKIDAR"
  | "SAND_CONTRACTOR";

export type PersonStatus = "ACTIVE" | "ABSCONDED";
export type PayType = "MONTHLY" | "PER_THOUSAND";
export type Sex = "MALE" | "FEMALE" | "OTHER";
export type WorkType =
  | "PATHAI" | "BHARAI_TRANSPORT" | "PAKAYI" | "NIKASI" | "LOADING" | "BHARAI_CHAMBER_STACKING"
  | "TUDI" | "RAWAS" | "BELDAR";

export interface Person {
  _id: string;
  kilnId: string;
  type: PersonType;
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
  status: PersonStatus;
  idNumber?: string;
  age?: number;
  sex?: Sex;
  workType?: WorkType;
  dailyWage?: number;
  ratePerThousand?: number;
  contractorId?: string;
  familyHeadId?: string;
  payType?: PayType;
  commissionPerThousand?: number;
  defaultRatePerThousand?: number;
  bharaiRatePerThousand?: number;
  monthlySalary?: number;
  stackingStage?: StackingStage;
  bharaiContractorId?: string;
  nikasiContractorId?: string;
  firingShiftAnchorDate?: string;
  firingShiftAnchorType?: ShiftType;
  vehicleNumber?: string;
  licenseNumber?: string;
  ratePerTrolley?: number;
  designation?: string;
  isOfficeStaff?: boolean;
  gstNumber?: string;
  contractRate?: number;
  contractUnit?: string;
  profitSharePercent?: number;
  khetArea?: number;
  khetAreaUnit?: string;
  khetLocation?: string;
  agreedDepthFeet?: number;
  agreedDepthUnit?: string;
  landownerSerial?: number;
  sandContractorSerial?: number;
  creditLimit?: number;
  nickname?: string;
  joiningDate?: string;
  photoPath?: string;
  identityProofPath?: string;
  active: boolean;
}

export type FamilyRelation = "SPOUSE" | "CHILD" | "PARENT" | "SIBLING" | "OTHER";

export interface FamilyMember {
  _id: string;
  headPersonId: string;
  name: string;
  relation: FamilyRelation;
  age?: number;
  sex?: Sex;
  isWorking: boolean;
  workerId?: { _id: string; name: string; status: PersonStatus } | string;
  notes?: string;
  createdAt: string;
}

export interface FamilyForPerson {
  head: Person | null;
  members: FamilyMember[];
}

export interface InventoryItem {
  _id: string;
  name: string;
  quantity: number;
  // Running total ever supplied out to labourers — always present on
  // list responses (computed, never stored).
  usedQuantity: number;
  unit: string;
  notes?: string;
  createdAt: string;
}

export interface SuppliedItem {
  _id: string;
  personId: string;
  itemId: { _id: string; name: string; unit: string } | string;
  quantity: number;
  date: string;
  notes?: string;
}

// Free-form, admin-defined — no longer a fixed vocabulary.
export type BrickCategoryName = string;

export interface BrickCategory {
  _id: string;
  category: BrickCategoryName;
  grade?: string;
  quantity: number;
  pricePerBrick: number;
  createdAt: string;
}

export interface BrickProductionEntry {
  _id: string;
  categoryId: { _id: string; category: BrickCategoryName; grade?: string } | string;
  bricksCount: number;
  date: string;
  notes?: string;
}

export interface StockLoadingEntry {
  _id: string;
  categoryId: { _id: string; category: BrickCategoryName; grade?: string } | string;
  bricksCount: number;
  date: string;
  notes?: string;
}

export interface KilnVehicle {
  _id: string;
  name: string;
  type: string;
  createdAt: string;
}

export interface VehicleDieselEntry {
  _id: string;
  vehicleId: { _id: string; name: string; type: string } | string;
  quantityLiters: number;
  costAmount?: number;
  paymentMode?: SimplePaymentMode;
  date: string;
  notes?: string;
}

export interface DieselPeriodBucket {
  total: number;
  byVehicle: Record<string, number>;
}

export interface DieselPeriodTotals {
  today: DieselPeriodBucket;
  week: DieselPeriodBucket;
  month: DieselPeriodBucket;
  year: DieselPeriodBucket;
}

export type LedgerPaymentMode = "CASH" | "BANK" | "UPI" | "CASH_AND_ONLINE";
// Expenses/fuel purchases/diesel entries aren't customer-facing bills, so
// they only ever carry one mode label — no split-amount support.
export type SimplePaymentMode = "CASH" | "BANK" | "UPI";
export type LedgerCategory =
  | "WAGE"
  | "COMMISSION"
  | "SALARY"
  | "TIP"
  | "ADVANCE"
  | "KHARCHI"
  | "MEDICAL"
  | "FESTIVAL"
  | "SALE"
  | "SOIL"
  | "SAND"
  | "FUEL"
  | "FARE"
  | "OTHER";

export interface LedgerEntry {
  _id: string;
  personId: string;
  direction: "DUE" | "PAID";
  amount: number;
  reason: string;
  category?: LedgerCategory;
  paymentMode?: LedgerPaymentMode;
  cashAmount?: number;
  onlineAmount?: number;
  contractId?: string;
  date: string;
  createdAt: string;
}

export interface OutstandingAdvance {
  person: Person;
  outstandingAdvance: number;
  daysPending: number;
}

export interface PaymentDue {
  person: { id: string; name: string; type: PersonType; phone: string | null };
  amountDue: number;
}

export interface PaymentReceipt {
  _id: string;
  personId: { _id: string; name: string; type: PersonType; phone?: string } | string;
  receiptNumber: string;
  amountPaid: number;
  totalAgreedAmount?: number;
  balanceBefore: number;
  balanceAfter: number;
  paymentMode?: LedgerPaymentMode;
  cashAmount?: number;
  onlineAmount?: number;
  notes?: string;
  date: string;
  createdAt: string;
}

export interface CustomerCreditAging {
  person: Person;
  outstandingCredit: number;
  daysPending: number;
  overLimit: boolean;
}

export interface SoilTrip {
  _id: string;
  landownerId: { _id: string; name: string } | string;
  driverId?: { _id: string; name: string } | string;
  contractId?: string;
  landId?: string;
  tractorNumber?: string;
  trolleyCount: number;
  receivedTrolleyCount?: number;
  ratePerTrolley: number;
  driverRatePerTrolley?: number;
  depthFeet?: number;
  status: "ARRIVED" | "WEATHERING" | "READY";
  date: string;
  notes?: string;
}

export interface JcbWorkLog {
  _id: string;
  landId: { _id: string; name: string; village?: string } | string;
  landownerId: { _id: string; name: string } | string;
  driverId: { _id: string; name: string } | string;
  machineId?: { _id: string; name: string; identifier?: string } | string;
  contractId?: string;
  hoursWorked: number;
  date: string;
  notes?: string;
}

export type LandStatus =
  | "AVAILABLE"
  | "UNDER_CONTRACT"
  | "EXCAVATION_IN_PROGRESS"
  | "EXHAUSTED"
  | "CONTRACT_COMPLETED"
  | "INACTIVE";

export interface Land {
  _id: string;
  landownerId: { _id: string; name: string; phone?: string } | string;
  name: string;
  village?: string;
  tehsil?: string;
  district?: string;
  state?: string;
  khasraNumber?: string;
  khataNumber?: string;
  latitude?: number;
  longitude?: number;
  area?: number;
  areaUnit?: string;
  soilType?: string;
  estimatedSoilQuantity?: number;
  status: LandStatus;
  notes?: string;
  excavatedQuantity: number;
}

export type SoilContractStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";
export type SoilContractRateType = "PER_TROLLEY" | "PER_BIGHA" | "PER_DEPTH" | "BOTH";
export type DepthUnit = "feet" | "meter";

interface PopulatedLandRef {
  _id: string;
  name: string;
  village?: string;
  tehsil?: string;
  district?: string;
  khasraNumber?: string;
  area?: number;
  areaUnit?: string;
  latitude?: number;
  longitude?: number;
}

interface PopulatedLandownerRef {
  _id: string;
  name: string;
  phone?: string;
  agreedDepthFeet?: number;
}

export interface SoilContract {
  _id: string;
  contractNumber: string;
  landId: PopulatedLandRef | string;
  landownerId: PopulatedLandownerRef | string;
  soilType?: string;
  rateType: SoilContractRateType;
  // PER_TROLLEY — contractedQuantity also doubles as an optional trolley
  // cap for any rateType, just not used for pricing unless PER_TROLLEY.
  contractedQuantity?: number;
  ratePerTrolley?: number;
  // PER_BIGHA
  contractedAreaBigha?: number;
  ratePerBigha?: number;
  // PER_DEPTH (priced depth — distinct from the agreedDepthFeet dispute
  // limit below, and may be in meters)
  contractedDepth?: number;
  depthUnit?: DepthUnit;
  ratePerDepthUnit?: number;
  totalContractValue: number;
  advanceAmount: number;
  startDate?: string;
  endDate?: string;
  agreedDepthFeet?: number;
  paymentTerms?: string;
  status: SoilContractStatus;
  notes?: string;
  createdAt: string;
  // Present on list/get responses — always computed, never stored.
  excavatedQuantity: number;
  remainingQuantity: number | null;
  percentUsed: number | null;
  overrun: boolean;
  ledgerBalance: number;
  isExpired: boolean;
  isExpiringSoon: boolean;
  // On list/get responses, agreedDepthFeet above is overwritten by the
  // computed *effective* value (falls back to the landowner's own
  // agreedDepthFeet when the contract didn't set its own) — see
  // soilContract.controller.ts's list handler merge order.
  depthUsedFeet: number;
  remainingDepthFeet?: number | null;
  depthExceeded: boolean;
  // Depth progress against the contract's own contractedDepth target —
  // distinct from remainingDepthFeet/depthExceeded above, which track the
  // landowner's agreed dig-depth *limit*, not this contract's target.
  contractedDepthRemaining: number | null;
  contractedDepthPercentUsed: number | null;
  contractedDepthOverrun: boolean;
}

export type SandContractRateType = "PER_TROLLEY" | "PER_THOUSAND_BRICKS";

export interface SandContract {
  _id: string;
  contractNumber: string;
  sandContractorId: { _id: string; name: string; phone?: string } | string;
  rateType: SandContractRateType;
  contractedTrolleys?: number;
  contractPrice?: number;
  totalContractValue: number;
  advanceAmount: number;
  startDate?: string;
  endDate?: string;
  createdAt: string;
}

export interface SandDeliveryTractorEntry {
  driverName?: string;
  driverPhone?: string;
  tractorNumber?: string;
}

export interface SandDelivery {
  _id: string;
  sandContractorId: { _id: string; name: string; phone?: string } | string;
  contractId?: string;
  tractorUsed: boolean;
  tractors?: SandDeliveryTractorEntry[];
  trolleyCount: number;
  paymentGiven: number;
  paymentPending: number;
  date: string;
  createdAt: string;
  notes?: string;
}

export interface SoilContractSummary {
  contract: SoilContract;
  excavatedQuantity: number;
  remainingQuantity: number | null;
  percentUsed: number | null;
  overrun: boolean;
  ledgerBalance: number;
  isExpired: boolean;
  isExpiringSoon: boolean;
  depthUsedFeet: number;
  agreedDepthFeet: number | null;
  remainingDepthFeet: number | null;
  depthExceeded: boolean;
  contractedDepthRemaining: number | null;
  contractedDepthPercentUsed: number | null;
  contractedDepthOverrun: boolean;
}

export interface ContractDailyMovement {
  date: string;
  tripCount: number;
  trolleyCount: number;
  receivedTrolleyCount: number;
  shortfall: number;
  depthFeet: number | null;
  tractors: string[];
  drivers: string[];
}

export interface SoilContractDashboard {
  statusCounts: Record<SoilContractStatus, number>;
  expiredCount: number;
  totalContracts: number;
  totalContractedQuantity: number;
  totalExcavatedQuantity: number;
  totalRemainingQuantity: number;
  totalContractValue: number;
  landAreaByUnit: { unit: string; total: number }[];
  alerts: {
    nearingCompletion: { contractId: string; contractNumber: string; percentUsed: number }[];
    depthExceeded: { contractId: string; contractNumber: string; depthUsedFeet: number; agreedDepthFeet: number }[];
  };
}

export type ExpenseCategory =
  | "JCB_RENTAL"
  | "ROYALTY_CHALLAN"
  | "TUBEWELL_DIESEL"
  | "TUBEWELL_ELECTRICITY"
  | "WATER"
  | "MOLD_SAND"
  | "TARPAULIN"
  | "LABOR_COLONY"
  | "LOCAL_CHANDA"
  | "PETTY_CASH"
  | "MACHINERY_REPAIR"
  | "DRIVER_BHATTA"
  | "POLICE_CHALLAN"
  | "COMMISSION_DALALI"
  | "TRANSIT_TAX"
  | "OTHER";

export interface Expense {
  _id: string;
  category: ExpenseCategory;
  amount: number;
  paymentMode?: SimplePaymentMode;
  hours?: number;
  date: string;
  createdAt: string;
  notes?: string;
  soilTripId?: string;
  dispatchId?: string;
}

export interface MoldingEntry {
  _id: string;
  workerId: { _id: string; name: string } | string;
  bricksCount: number;
  ratePerThousand: number;
  damagedCount?: number;
  date: string;
  washedOut: boolean;
  notes?: string;
}

export interface MoldingContractorGangWorker {
  id: string;
  name: string;
  bricksProduced: number;
  damagedCount: number;
}

export interface MoldingContractorEntry {
  contractor: {
    id: string;
    name: string;
    phone?: string;
    commissionPerThousand: number | null;
  };
  workers: MoldingContractorGangWorker[];
  totalBricksProduced: number;
  totalDamaged: number;
  totalDue: number;
  totalPaid: number;
  balance: number;
  advanceGivenToContractor: number;
  advanceDeductedForWorkers: number;
}

export interface MoldingContractorSummary {
  contractors: MoldingContractorEntry[];
  totalProductionAllContractors: number;
  totalDamagedAllContractors: number;
  unassignedWorkerCount: number;
  unassignedBricksProduced: number;
  unassignedDamaged: number;
}

export interface MoldingPeriodTotals {
  today: number;
  week: number;
  month: number;
  todayDamaged: number;
  weekDamaged: number;
  monthDamaged: number;
}

export type WastageType = "SOIL" | "KACCHI_BRICK";
export type WastageCause = "RAIN" | "TRANSPORT" | "OTHER";

export interface WastageLog {
  _id: string;
  type: WastageType;
  cause: WastageCause;
  quantity: number;
  unit: string;
  date: string;
  notes?: string;
}

export type GherStatus = "EMPTY" | "STACKING" | "FIRING" | "READY";

export interface Gher {
  _id: string;
  number: number;
  status: GherStatus;
  updatedAt: string;
}

export type StackingQuality = "GOOD" | "AVERAGE" | "POOR";

export type StackingMode = "BUGGI" | "TRACTOR";

// TRANSPORT = Stage 1: ground lifting & transport (yard -> outside chamber).
// CHAMBER_STACKING = Stage 2: chamber stacking (outside -> inside chamber).
export type StackingStage = "TRANSPORT" | "CHAMBER_STACKING";

export interface StackingEntry {
  _id: string;
  gherId: { _id: string; number: number } | string;
  gangId: { _id: string; name: string; type: PersonType } | string;
  stage?: StackingStage;
  bricksCount: number;
  damageCount: number;
  ratePerThousand?: number;
  qualityRating: StackingQuality;
  mode?: StackingMode;
  tractorNumber?: string;
  buggiCount?: number;
  date: string;
  notes?: string;
}

export interface StackingOperatorEntry {
  operator: {
    id: string;
    name: string;
    phone?: string;
    type: PersonType;
    monthlySalary: number | null;
    stackingStage: StackingStage | null;
  };
  totalBricksStacked: number;
  totalDamage: number;
  tripCount: number;
  tractorNumbers: string[];
  totalBuggiCount: number;
  totalDue: number;
  totalPaid: number;
  balance: number;
}

export interface StackingOperatorSummary {
  operators: StackingOperatorEntry[];
  totalBricksStackedAllOperators: number;
  totalDamagedAllOperators: number;
}

export interface TractorFleetEntry {
  tractorNumber: string;
  tripCount: number;
  totalBricksStacked: number;
  operators: string[];
}

export type StackingVehicleType = "TRACTOR" | "BUGGI";
export type StackingVehicleStatus = "ACTIVE" | "INACTIVE";

export interface StackingVehicle {
  _id: string;
  kilnId: string;
  contractorId: string;
  vehicleType: StackingVehicleType;
  vehicleNumber?: string;
  buggiCount?: number;
  driverName?: string;
  status: StackingVehicleStatus;
  notes?: string;
  createdAt: string;
}

export interface StackingContractorLaborer {
  id: string;
  name: string;
  phone?: string;
  monthlySalary: number | null;
  bricksStacked: number;
  damagedCount: number;
}

export interface StackingContractorVehicle {
  id: string;
  vehicleType: StackingVehicleType;
  vehicleNumber: string | null;
  buggiCount: number | null;
  driverName: string | null;
  status: StackingVehicleStatus;
}

export interface StackingContractorEntry {
  contractor: {
    id: string;
    name: string;
    phone?: string;
    monthlySalary: number | null;
    stackingStage: StackingStage | null;
  };
  laborers: StackingContractorLaborer[];
  vehicles: StackingContractorVehicle[];
  tractorCount: number;
  totalBuggiCount: number;
  totalBricksStacked: number;
  totalDamaged: number;
  totalDue: number;
  totalPaid: number;
  balance: number;
}

export interface StackingContractorSummary {
  contractors: StackingContractorEntry[];
  totalProductionAllContractors: number;
  totalDamagedAllContractors: number;
}

export interface NikasiEntry {
  _id: string;
  gherId: { _id: string; number: number } | string;
  gangId: { _id: string; name: string; type: PersonType } | string;
  bricksCount: number;
  damagedCount?: number;
  date: string;
  notes?: string;
}

export interface NikasiPeriodTotals {
  today: number;
  week: number;
  month: number;
  todayDamaged: number;
  weekDamaged: number;
  monthDamaged: number;
}

export interface NikasiOperatorEntry {
  operator: {
    id: string;
    name: string;
    phone?: string;
    type: PersonType;
    monthlySalary: number | null;
  };
  totalBricksUnloaded: number;
  totalDamaged: number;
  tripCount: number;
  totalDue: number;
  totalPaid: number;
  balance: number;
}

export interface NikasiOperatorSummary {
  operators: NikasiOperatorEntry[];
  totalBricksUnloadedAllOperators: number;
  totalDamagedAllOperators: number;
}

export interface NikasiContractorLaborer {
  id: string;
  name: string;
  phone?: string;
  monthlySalary: number | null;
  bricksUnloaded: number;
  damagedCount: number;
}

export interface NikasiContractorEntry {
  contractor: {
    id: string;
    name: string;
    phone?: string;
    monthlySalary: number | null;
  };
  laborers: NikasiContractorLaborer[];
  totalBricksUnloaded: number;
  totalDamaged: number;
  totalDue: number;
  totalPaid: number;
  balance: number;
}

export interface NikasiContractorSummary {
  contractors: NikasiContractorEntry[];
  totalProductionAllContractors: number;
  totalDamagedAllContractors: number;
}

export type BrickVehicleType = "TRUCK" | "TRACTOR";

export interface BrickLoadingEntry {
  _id: string;
  tripNumber?: string;
  vehicleType: BrickVehicleType;
  vehicleNumber: string;
  driverId?: { _id: string; name: string; type: PersonType } | string;
  bricksCount: number;
  tipAmount?: number;
  loadingCharge?: number;
  unloadingCharge?: number;
  discountAmount?: number;
  amount?: number;
  categoryId?: { _id: string; category: BrickCategoryName; grade?: string } | string;
  dispatchId?: { _id: string; slipNumber: string; customerName: string } | string;
  date: string;
  createdAt: string;
  notes?: string;
}

export interface BrickLoadingDriverEntry {
  driver: {
    id: string;
    name: string;
    phone?: string;
    vehicleNumber: string | null;
  };
  totalBricksLoaded: number;
  totalTips: number;
  tripCount: number;
  totalDue: number;
  totalPaid: number;
  balance: number;
}

export interface BrickLoadingDriverSummary {
  drivers: BrickLoadingDriverEntry[];
  totalBricksLoadedAllDrivers: number;
}

export interface WorkEntry {
  _id: string;
  personId: { _id: string; name: string; type: PersonType; contractorId?: string } | string;
  workType: WorkType;
  quantity: number;
  ratePerThousand: number;
  date: string;
  notes?: string;
}

export interface SoilArrivalTractorEntry {
  driverName?: string;
  driverPhone?: string;
  tractorNumber?: string;
}

export interface SoilArrival {
  _id: string;
  landownerId: { _id: string; name: string; phone?: string } | string;
  contractId?: string;
  jcbUsed: boolean;
  tractorUsed: boolean;
  jcbDriverId?: { _id: string; name: string } | string;
  tractorDriverId?: { _id: string; name: string } | string;
  tractors?: SoilArrivalTractorEntry[];
  trolleyCount: number;
  depthFeet?: number;
  paymentGiven: number;
  paymentPending: number;
  soilRemaining?: number;
  date: string;
  createdAt: string;
  notes?: string;
}

export interface Reconciliation {
  days: number;
  totalMolded: number;
  totalStacked: number;
  totalDamaged: number;
  totalWastage: number;
  fieldStock: number;
  mismatchPercent: number;
  alert: boolean;
  yardCapacityBricks: number | null;
  yardUtilizationPercent: number | null;
  yardFullWarning: boolean;
}

export interface DashboardStockSummary {
  rawBrickStock: number;
  totalDamage: number;
  damageBreakdown: {
    molding: number;
    stacking: number;
    nikasi: number;
  };
}

export type ComplianceDocumentType =
  | "PCB_CONSENT_TO_OPERATE"
  | "MINING_ROYALTY_LICENSE"
  | "ZIG_ZAG_CERTIFICATE"
  | "ENVIRONMENTAL_CLEARANCE"
  | "OTHER";

export interface ComplianceDocument {
  _id: string;
  documentType: ComplianceDocumentType;
  title: string;
  issueDate?: string;
  expiryDate: string;
  notes?: string;
  expired?: boolean;
}

export interface FuelType {
  _id: string;
  name: string;
  createdAt: string;
}

export interface FuelPurchase {
  _id: string;
  fuelType: string;
  supplierId?: { _id: string; name: string } | string;
  vehicleNumber?: string;
  invoicedWeightKg: number;
  actualWeightKg: number;
  amount: number;
  paidAmount?: number;
  paymentMode?: SimplePaymentMode;
  date: string;
  createdAt: string;
  notes?: string;
  shortfallKg?: number;
  variancePercent?: number;
  alert?: boolean;
}

export interface SupplierFuelBalance {
  supplier: { id: string; name: string; phone: string | null };
  purchaseCount: number;
  totalWeightKg: number;
  totalDue: number;
  totalPaid: number;
  balance: number;
}

export interface FuelLog {
  _id: string;
  gherId: { _id: string; number: number } | string;
  fuelType: string;
  quantityKg: number;
  date: string;
  createdAt: string;
  notes?: string;
}

export interface FuelLogPeriodBucket {
  total: number;
  byFuelType: Record<string, number>;
}

export interface FuelLogPeriodTotals {
  today: FuelLogPeriodBucket;
  week: FuelLogPeriodBucket;
  month: FuelLogPeriodBucket;
  year: FuelLogPeriodBucket;
}

export interface FuelEfficiency {
  days: number;
  baselineDays: number;
  recentFuelKg: number;
  recentA1Bricks: number;
  recentKgPer1000: number | null;
  baselineKgPer1000: number | null;
  highConsumptionAlert: boolean;
}

export interface FireRoundSpeed {
  days: number;
  chambersMoved: number;
  chambersPerDay: number;
  currentFireGherNumber: number | null;
  recentMovements: { gherNumber: number; startedAt: string }[];
}

export interface ChamberGrading {
  _id: string;
  gherId: { _id: string; number: number } | string;
  a1Count: number;
  jhamaCount: number;
  pelaCount: number;
  rodaCount: number;
  stackedCount?: number;
  recoveryPercent: number | null;
  date: string;
  notes?: string;
}

export type ShiftType = "DAY" | "NIGHT";

export interface FiringShift {
  _id: string;
  fitterId: { _id: string; name: string } | string;
  gherId?: { _id: string; number: number } | string;
  shiftType: ShiftType;
  handoverNotes?: string;
  overtimeHours: number;
  overtimeRate?: number;
  bonusAmount: number;
  date: string;
}

export interface FitterRosterEntry {
  fitter: {
    id: string;
    name: string;
    phone?: string;
    monthlySalary: number | null;
    firingShiftAnchorDate: string | null;
    firingShiftAnchorType: ShiftType | null;
  };
  scheduledShiftType: ShiftType | null;
  shiftCount: number;
  lastShiftDate: string | null;
  totalDue: number;
  totalPaid: number;
  balance: number;
}

export interface FitterRosterSummary {
  date: string;
  teamSize: number;
  targetTeamSize: number;
  dayShift: FitterRosterEntry[];
  nightShift: FitterRosterEntry[];
  unscheduled: FitterRosterEntry[];
}

export type IncidentType = "CRACK_LEAKAGE" | "WEATHER_FLOODING" | "ELECTRICAL_FAILURE" | "OTHER";

export interface KilnIncident {
  _id: string;
  gherId?: { _id: string; number: number } | string;
  type: IncidentType;
  description: string;
  repairCost: number;
  bricksLost: number;
  date: string;
  notes?: string;
}

export interface FinishedGoodsReconciliation {
  days: number;
  totalA1Produced: number;
  totalDispatched: number;
  currentStock: number;
  unaccounted: number;
  mismatchPercent: number;
  alert: boolean;
}

export interface LoadingEntry {
  _id: string;
  dispatchId?: { _id: string; slipNumber: string; bricksCount: number } | string;
  palledarId: { _id: string; name: string } | string;
  bricksCount: number;
  ratePerThousand: number;
  date: string;
  notes?: string;
  countMismatch?: boolean;
  dispatchBricksCount?: number | null;
}

export interface StockAudit {
  _id: string;
  itemName: string;
  registerCount: number;
  physicalCount: number;
  variance: number;
  date: string;
  notes?: string;
}

export type MachineType =
  | "TRACTOR"
  | "TRUCK"
  | "JCB"
  | "PUG_MILL"
  | "MOLDING_MACHINE"
  | "WEIGHBRIDGE"
  | "GENERATOR"
  | "PUMP"
  | "BLOWER"
  | "OTHER";

export interface Machine {
  _id: string;
  name: string;
  type: MachineType;
  identifier?: string;
  active: boolean;
  notes?: string;
}

export type MachineFuelType = "DIESEL" | "PETROL" | "ELECTRICITY";

export interface MachineFuelLog {
  _id: string;
  machineId: { _id: string; name: string; type: MachineType } | string;
  fuelType: MachineFuelType;
  quantity: number;
  hoursRun?: number;
  date: string;
  notes?: string;
  ratePerHour?: number | null;
  baselineRatePerHour?: number | null;
  consumptionAlert?: boolean;
}

export interface MachineMaintenanceLog {
  _id: string;
  machineId: { _id: string; name: string; type: MachineType } | string;
  description: string;
  cost: number;
  downtimeHours: number;
  date: string;
  notes?: string;
}

export interface SeasonFinancialSummary {
  days: number;
  revenue: number;
  expenseCosts: number;
  laborCosts: number;
  totalCosts: number;
  netProfit: number;
}

export interface PaymentMethodSplit {
  cash: number;
  online: number;
  total: number;
}

export interface FinancialFlow {
  moneyReceived: number;
  moneySpent: number;
  netCashFlow: number;
  bricksSold: number;
  fuelExpense: number;
  dieselExpense: number;
  breakdown: {
    expenses: number;
    fuel: number;
    diesel: number;
    otherPayments: number;
  };
  moneyIn: PaymentMethodSplit;
  moneyOut: PaymentMethodSplit;
}

export interface FinancialOverview {
  today: FinancialFlow;
  week: FinancialFlow;
  month: FinancialFlow;
  year: FinancialFlow;
  totalDues: number;
  totalOutstandingFromClients: number;
}

export interface ChamberCostReport {
  gherNumber: number;
  fuelCost: number;
  stackingCost: number;
  totalCost: number;
}

export type AttendanceStatus = "PRESENT" | "ABSENT" | "HALF_DAY" | "LATE";

export interface DayAttendance {
  date: string;
  status: AttendanceStatus;
  wageAmount: number | null;
  recorded: boolean;
}

export interface SalarySlip {
  _id: string;
  personId: string;
  month: string; // "YYYY-MM"
  daysPresent: number;
  daysAbsent: number;
  daysHalfDay: number;
  daysLate: number;
  grossSalary: number;
  deductions: number;
  netSalary: number;
  generatedAt: string;
}

export interface SalaryStatusEntry {
  person: { _id: string; name: string; designation: string; monthlySalary: number };
  slip: SalarySlip | null;
}

export interface RosterEntry {
  person: { _id: string; name: string; type: PersonType; designation: string | null };
  status: AttendanceStatus;
  recorded: boolean;
}

// Raw attendance row as returned by listAttendanceForPerson — exception
// rows only (a day with no row here is implicitly PRESENT), unlike
// DayAttendance which is already expanded to one entry per calendar day.
export interface AttendanceRecord {
  _id: string;
  personId: string;
  date: string;
  status: AttendanceStatus;
  wageAmount: number | null;
}

// The Reports page's "everything about this person" payload — `sections`
// only ever contains the keys relevant to this person's type/workType (see
// backend/src/services/report.service.ts), so every field here is
// optional and the page renders only whichever are actually present.
// Mirrors backend/src/services/compare.service.ts's COMPARE_MODULES.
export type CompareModule =
  | "financial" | "bricks" | "molding" | "stacking" | "nikasi" | "firing" | "brickLoading"
  | "dispatch" | "soil" | "diesel" | "fuel" | "expense" | "stock" | "attendance" | "salary" | "labor";

export interface SeasonYearResult {
  from: string;
  to: string;
  inProgress: boolean;
  metrics: Record<string, number | Record<string, number>>;
}

export interface PersonFullReport {
  person: Person;
  balance: number;
  sections: {
    ledger: LedgerEntry[];
    paymentReceipts: PaymentReceipt[];
    workEntries?: WorkEntry[];
    family?: FamilyForPerson;
    suppliedItems?: SuppliedItem[];
    salarySlips?: SalarySlip[];
    attendance?: AttendanceRecord[];
    stackingEntries?: StackingEntry[];
    nikasiEntries?: NikasiEntry[];
    moldingContractor?: MoldingContractorEntry | null;
    firingShifts?: FiringShift[];
    soilArrivals?: SoilArrival[];
    soilContracts?: SoilContract[];
    brickLoadingEntries?: BrickLoadingEntry[];
    dispatches?: Dispatch[];
  };
}
