export interface Patient {
  dateOfBirth: string | null;
  sex: string | null;
}

export interface MedicationReview {
  reviewDate: string | null;
  firstNameAtTimeOfReview: string | null;
  lastNameAtTimeOfReview: string | null;
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
}

export interface UpdateMedicationReviewResponse {
  medicationReviewId: string;
  firstNameAtTimeOfReview: string | null;
  lastNameAtTimeOfReview: string | null;
  reviewDate: string | null;
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
  dosageMg?: number | null;
  routeOfAdministration?: string | null;
  indication?: string | null;
  asNeeded?: boolean | null;
  unitsBeforeBreakfast?: number | null;
  unitsDuringBreakfast?: number | null;
  unitsBeforeLunch?: number | null;
  unitsDuringLunch?: number | null;
  unitsBeforeDinner?: number | null;
  unitsDuringDinner?: number | null;
  unitsAtBedtime?: number | null;
}

export interface AddMedicationRequest {
  medicationReviewId: string;
  medicationId?: string;
  name?: string;
  cnk?: number;
  vmp?: number;
  packageSize?: number;
  dosageMg?: number;
  routeOfAdministration?: string;
  indication?: string;
  asNeeded?: boolean;
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
  dosageMg?: number | null;
  routeOfAdministration?: string | null;
  indication?: string | null;
  asNeeded?: boolean | null;
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
  dosageMg?: number | null;
  routeOfAdministration?: string | null;
  indication?: string | null;
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
  dispensingData: CnkDispensingData[];
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
