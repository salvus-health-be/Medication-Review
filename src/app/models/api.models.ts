export interface Patient {
  dateOfBirth: string | null;
  sex: string | null;
}

export interface MedicationReview {
  reviewDate: string | null;
  firstNameAtTimeOfReview: string | null;
  lastNameAtTimeOfReview: string | null;
  renalFunction?: string | null;
}

// Medication Search
export interface MedicationSearchRequest {
  searchTerm: string;
  maxResults?: number;
}

export interface MedicationSearchResult {
  benaming: string;
  cnk: string;
  verpakking: number;
  vmp: string | null;
}

export interface MedicationSearchResponse {
  searchTerm: string;
  count: number;
  results: MedicationSearchResult[];
}

export interface LoginRequest {
  apbNumber: string;
  medicationReviewId?: string;
}

export interface LoginResponse {
  patientCreated: boolean;
  reviewCreated: boolean;
  patientId: string;
  medicationReviewId: string;
  patient: Patient;
  review: MedicationReview;
}

export interface SessionData extends LoginResponse {
  apbNumber: string; // Store the APB number from login request
}

export interface UpdatePatientRequest {
  apbNumber: string;
  patientId: string;
  dateOfBirth?: string | null;
  sex?: string | null;
}

export interface UpdatePatientResponse {
  patientId: string;
  dateOfBirth: string | null;
  sex: string | null;
  updated: boolean;
}

export interface UpdateMedicationReviewRequest {
  apbNumber: string;
  medicationReviewId: string;
  patientId?: string;
  firstNameAtTimeOfReview?: string | null;
  lastNameAtTimeOfReview?: string | null;
  reviewDate?: string | null;
  renalFunction?: string | null;
}

export interface UpdateMedicationReviewResponse {
  medicationReviewId: string;
  firstNameAtTimeOfReview: string | null;
  lastNameAtTimeOfReview: string | null;
  reviewDate: string | null;
  renalFunction: string | null;
  updated: boolean;
}

// APB Contraindications
export interface APBContraindicationItem {
  code: string;
  description: string;
}

export interface APBContraindicationsRequest {
  language: 'NL' | 'FR' | 'EN';
}

export interface APBContraindicationsResponse {
  language: string;
  result: {
    hypersensitivities: {
      list: APBContraindicationItem[];
    };
    pathologies: {
      list: APBContraindicationItem[];
    };
    physiologicalConditions: {
      list: APBContraindicationItem[];
    };
  };
}

// Backend uses PascalCase, so add aliases
export interface APBContraindicationsResponseBackend {
  Language: string;
  Result: {
    Hypersensitivities: {
      List: APBContraindicationItem[];
    };
    Pathologies: {
      List: APBContraindicationItem[];
    };
    PhysiologicalConditions: {
      List: APBContraindicationItem[];
    };
  };
}

// Contraindication Management
export interface Contraindication {
  contraindicationId: string;
  name: string | null;
  contraindicationCode: string;
}

export interface AddContraindicationRequest {
  medicationReviewId: string;
  name: string;
  contraindicationCode: string;
}

export interface UpdateContraindicationRequest {
  medicationReviewId: string;
  contraindicationId: string;
  name?: string;
  contraindicationCode?: string;
}

export interface ContraindicationResponse {
  contraindicationId: string;
  name: string | null;
  contraindicationCode: string;
}

// Medication Management
export interface Medication {
  medicationId: string;
  name?: string | null;
  cnk?: number | null;
  vmp?: number | null;
  packageSize?: number | null;
  activeIngredient?: string | null;
  dosageMg?: number | null;
  routeOfAdministration?: string | null;
  indication?: string | null;
  asNeeded?: boolean | null;
  specialFrequency?: number | null;
  specialDescription?: string | null;
  unitsBeforeBreakfast?: number | null;
  unitsDuringBreakfast?: number | null;
  unitsBeforeLunch?: number | null;
  unitsDuringLunch?: number | null;
  unitsBeforeDinner?: number | null;
  unitsDuringDinner?: number | null;
  unitsAtBedtime?: number | null;
  timestamp?: string | null;
}

export interface AddMedicationRequest {
  medicationReviewId: string;
  medicationId?: string;
  name?: string;
  cnk?: number;
  vmp?: number;
  packageSize?: number;
  activeIngredient?: string;
  dosageMg?: number;
  routeOfAdministration?: string;
  indication?: string;
  asNeeded?: boolean;
  specialFrequency?: number;
  specialDescription?: string;
  unitsBeforeBreakfast?: number;
  unitsDuringBreakfast?: number;
  unitsBeforeLunch?: number;
  unitsDuringLunch?: number;
  unitsBeforeDinner?: number;
  unitsDuringDinner?: number;
  unitsAtBedtime?: number;
}

export interface UpdateMedicationRequest {
  medicationReviewId: string;
  medicationId: string;
  name?: string | null;
  cnk?: number | null;
  vmp?: number | null;
  packageSize?: number | null;
  activeIngredient?: string | null;
  dosageMg?: number | null;
  routeOfAdministration?: string | null;
  indication?: string | null;
  asNeeded?: boolean | null;
  specialFrequency?: number | null;
  specialDescription?: string | null;
  unitsBeforeBreakfast?: number | null;
  unitsDuringBreakfast?: number | null;
  unitsBeforeLunch?: number | null;
  unitsDuringLunch?: number | null;
  unitsBeforeDinner?: number | null;
  unitsDuringDinner?: number | null;
  unitsAtBedtime?: number | null;
}

export interface MedicationResponse {
  medicationId: string;
  name?: string | null;
  cnk?: number | null;
  vmp?: number | null;
  packageSize?: number | null;
  activeIngredient?: string | null;
  dosageMg?: number | null;
  routeOfAdministration?: string | null;
  indication?: string | null;
  asNeeded?: boolean | null;
  specialFrequency?: number | null;
  specialDescription?: string | null;
  unitsBeforeBreakfast?: number | null;
  unitsDuringBreakfast?: number | null;
  unitsBeforeLunch?: number | null;
  unitsDuringLunch?: number | null;
  unitsBeforeDinner?: number | null;
  unitsDuringDinner?: number | null;
  unitsAtBedtime?: number | null;
}

// Lab Value Management
export interface LabValue {
  labValueId: string;
  name?: string | null;
  value: number;
  unit?: string | null;
}

export interface AddLabValueRequest {
  medicationReviewId: string;
  labValueId?: string;
  name?: string;
  value: number;
  unit?: string;
}

export interface UpdateLabValueRequest {
  medicationReviewId: string;
  labValueId: string;
  name?: string;
  value: number;
  unit?: string;
}

export interface LabValueResponse {
  labValueId: string;
  name?: string | null;
  value: number;
  unit?: string | null;
}

// Dispensing History
export interface DispensingMoment {
  date: string;          // DD/MM/YYYY format
  amount: number;        // Quantity dispensed
  source?: 'csv' | 'manual'; // Source of the dispensing moment
  id?: string;           // Unique ID for manual moments (GUID)
}

export interface CnkDispensingData {
  cnk: string;           // CNK medication code
  description: string;   // Medication description
  dispensingMoments: DispensingMoment[];
}

export interface DispensingHistoryResponse {
  medicationReviewId: string;
  blobUri: string;
  totalCnkCodes: number;
  totalDispensingMoments: number;
  csvMoments?: number;
  manualMoments?: number;
  dispensingData: CnkDispensingData[];
}

// Manual Dispensing Moment
export interface AddManualDispensingMomentRequest {
  cnk: string;           // CNK medication code (7-digit)
  description: string;   // Human-readable medication name
  date: string;          // ISO 8601 date (YYYY-MM-DD)
  amount: number;        // Quantity dispensed (> 0)
}

export interface AddManualDispensingMomentResponse {
  id: string;
  apbNumber: string;
  medicationReviewId: string;
  cnk: string;
  description: string;
  date: string;
  amount: number;
  message: string;
}

// Question Answer Management
export interface QuestionAnswer {
  medicationReviewId: string;
  questionName: string;
  value?: string | null;
  shareWithPatient?: boolean;
  shareWithDoctor?: boolean;
}

export interface AddQuestionAnswerRequest {
  medicationReviewId: string;
  questionName: string;
  value?: string;
  shareWithPatient?: boolean;
  shareWithDoctor?: boolean;
}

export interface UpdateQuestionAnswerRequest {
  medicationReviewId: string;
  questionName: string;
  value?: string;
  shareWithPatient?: boolean;
  shareWithDoctor?: boolean;
}

export interface QuestionAnswerResponse {
  medicationReviewId: string;
  questionName: string;
  value?: string | null;
  shareWithPatient?: boolean;
  shareWithDoctor?: boolean;
}

// CSV Import
export interface IntakeMoments {
  unitsBeforeBreakfast?: number | null;
  unitsDuringBreakfast?: number | null;
  unitsBeforeLunch?: number | null;
  unitsDuringLunch?: number | null;
  unitsBeforeDinner?: number | null;
  unitsDuringDinner?: number | null;
  unitsAtBedtime?: number | null;
  asNeeded?: boolean | null;
}

export interface ImportedMedication {
  medicationName: string;
  success: boolean;
  medicationId: string | null;
  cnk: number | null;
  foundMedicationName: string | null;  // Medication name from geneesmiddeldatabank (for user verification)
  vmp: number | null;
  packageSize: number | null;
  activeIngredient: string | null;
  intakeMoments: IntakeMoments | null;
  indication: string | null;
  missingInformation: string[];  // Array of: "CNK", "ActiveIngredient", "Indication", "IntakeMoments"
  errorMessage: string | null;
  reviewStatus?: 'under_review' | 'approved';  // Add review status
}

export interface ImportMedicationsResponse {
  totalProcessed: number;
  successful: number;
  failed: number;
  withMissingInformation: number;
  medications: ImportedMedication[];
}
