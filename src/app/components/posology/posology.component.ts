import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { ApiService } from '../../services/api.service';
import { StateService } from '../../services/state.service';
import { Medication } from '../../models/api.models';

interface DosageLine {
  content: string;
  keywords: Array<{
    externalFileName: string;
    description: string;
  }>;
}

interface DosageTextBlock {
  title: string;
  lines: DosageLine[];
}

interface MaximumDosageSection {
  title: string;
  lines: string[];
}

interface ProductDosageResponse {
  cnk: string;
  result?: {
    dosage?: {
      textBlocks?: DosageTextBlock[];
    };
    maximumDosage?: {
      adults?: MaximumDosageSection;
      children?: MaximumDosageSection;
      remarks?: MaximumDosageSection;
    };
  };
}

interface MedicationDosage {
  medicationId: string;
  cnk: string;
  medicationName: string;
  dosageInfo: ProductDosageResponse | null;
  loading: boolean;
  error: string | null;
}

@Component({
  selector: 'app-posology',
  standalone: true,
  imports: [CommonModule, TranslocoModule],
  templateUrl: './posology.component.html',
  styleUrls: ['./posology.component.scss']
})
export class PosologyComponent implements OnInit {
  @Output() openNotes = new EventEmitter<{ medication: Medication, dosageInfo: ProductDosageResponse | null }>();
  
  medications: Medication[] = [];
  medicationDosages: Map<string, MedicationDosage> = new Map();
  selectedMedicationId: string | null = null;
  loading = false;
  error: string | null = null;

  constructor(
    private apiService: ApiService,
    private stateService: StateService
  ) {}

  ngOnInit() {
    this.loadMedications();
  }

  loadMedications() {
    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) return;

    this.loading = true;
    this.error = null;

    this.apiService.getMedications(reviewId).subscribe({
      next: (medications) => {
        this.medications = medications.filter(m => m.cnk); // Only medications with CNK
        
        // Initialize dosage map
        this.medicationDosages.clear();
        this.medications.forEach(med => {
          this.medicationDosages.set(med.medicationId, {
            medicationId: med.medicationId,
            cnk: med.cnk!.toString(),
            medicationName: med.name || `CNK ${med.cnk}`,
            dosageInfo: null,
            loading: false,
            error: null
          });
        });
        
        this.loading = false;
        console.log('[Posology] Loaded medications:', this.medications);
      },
      error: (err) => {
        console.error('[Posology] Error loading medications:', err);
        this.error = 'Failed to load medications';
        this.loading = false;
      }
    });
  }

  onMedicationClick(medicationId: string) {
    console.log('[Posology] Medication clicked:', medicationId);
    
    if (this.selectedMedicationId === medicationId) {
      // Deselect if already selected
      this.selectedMedicationId = null;
      return;
    }
    
    this.selectedMedicationId = medicationId;
    
    // Load dosage info if not already loaded
    const medDosage = this.medicationDosages.get(medicationId);
    if (medDosage && !medDosage.dosageInfo && !medDosage.loading) {
      this.loadDosageInfo(medDosage);
    }
  }

  loadDosageInfo(medDosage: MedicationDosage) {
    medDosage.loading = true;
    medDosage.error = null;

    this.apiService.getProductDosage(medDosage.cnk, 'NL').subscribe({
      next: (response) => {
        medDosage.dosageInfo = response;
        medDosage.loading = false;
        console.log('[Posology] Loaded dosage info for CNK', medDosage.cnk, response);
      },
      error: (err) => {
        console.error('[Posology] Error loading dosage info:', err);
        medDosage.error = 'Failed to load dosage information';
        medDosage.loading = false;
      }
    });
  }

  isMedicationSelected(medicationId: string): boolean {
    return this.selectedMedicationId === medicationId;
  }

  getSelectedMedicationDosage(): MedicationDosage | null {
    if (!this.selectedMedicationId) return null;
    return this.medicationDosages.get(this.selectedMedicationId) || null;
  }

  getSelectedMedication(): Medication | null {
    if (!this.selectedMedicationId) return null;
    return this.medications.find(m => m.medicationId === this.selectedMedicationId) || null;
  }

  openNotesModal() {
    const medication = this.getSelectedMedication();
    const dosageData = this.getSelectedMedicationDosage();
    
    if (!medication) return;
    
    console.log('[Posology] Opening notes for medication:', medication);
    this.openNotes.emit({ 
      medication: medication, 
      dosageInfo: dosageData?.dosageInfo || null
    });
  }

  openGeneralNotesModal() {
    console.log('[Posology] Opening notes for general note (no medication)');
    this.openNotes.emit({ 
      medication: null as any, 
      dosageInfo: null
    });
  }
}
