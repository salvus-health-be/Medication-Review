import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ApiService } from '../../services/api.service';
import { StateService } from '../../services/state.service';
import { Medication } from '../../models/api.models';

interface RenadaptorData {
  medicationId: string;
  cnk: string;
  medicationName: string;
  url: string | null;
  safeUrl: SafeResourceUrl | null;
  loading: boolean;
  error: string | null;
  lastGenerated: Date | null;
}

@Component({
  selector: 'app-renadaptor',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslocoModule],
  templateUrl: './renadaptor.component.html',
  styleUrls: ['./renadaptor.component.scss']
})
export class RenadaptorComponent implements OnInit {
  @Output() openNotes = new EventEmitter<Medication>();
  
  medications: Medication[] = [];
  renadaptorData: Map<string, RenadaptorData> = new Map();
  selectedMedicationId: string | null = null;
  // Renal function stored as a textual summary per backend API
  renalFunction: string | null = null;
  loading = false;
  error: string | null = null;

  // URL expires after 5 minutes
  private readonly URL_EXPIRY_MS = 5 * 60 * 1000;

  constructor(
    private apiService: ApiService,
    private stateService: StateService,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit() {
    this.loadRenalFunction();
    this.loadMedications();
  }

  loadMedications() {
    const apbNumber = this.stateService.apbNumber;
    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) return;

    this.loading = true;
    this.error = null;

    this.apiService.getMedications(apbNumber, reviewId).subscribe({
      next: (medications) => {
        this.medications = medications.filter(m => m.cnk); // Only medications with CNK
        
        // Initialize renadaptor data map
        this.renadaptorData.clear();
        this.medications.forEach(med => {
          this.renadaptorData.set(med.medicationId, {
            medicationId: med.medicationId,
            cnk: med.cnk!.toString(),
            medicationName: med.name || `CNK ${med.cnk}`,
            url: null,
            safeUrl: null,
            loading: false,
            error: null,
            lastGenerated: null
          });
        });
        
        this.loading = false;
      },
      error: (err) => {
        this.error = 'Failed to load medications';
        this.loading = false;
      }
    });
  }

  onMedicationClick(medicationId: string) {
    
    if (this.selectedMedicationId === medicationId) {
      // Deselect if already selected
      this.selectedMedicationId = null;
      return;
    }
    
    this.selectedMedicationId = medicationId;
    
    // Load or refresh Renadaptor URL
    const data = this.renadaptorData.get(medicationId);
    if (data) {
      // Check if URL exists and is still valid (less than 5 minutes old)
      const needsRefresh = !data.url || 
                          !data.lastGenerated || 
                          (Date.now() - data.lastGenerated.getTime() > this.URL_EXPIRY_MS);
      
      if (needsRefresh) {
        this.loadRenadaptorUrl(data);
      }
    }
  }

  loadRenadaptorUrl(data: RenadaptorData) {
    data.loading = true;
    data.error = null;

    this.apiService.getProductRenadaptor(data.cnk, 'NL').subscribe({
      next: (response) => {
        data.url = response.url;
        data.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(response.url);
        data.lastGenerated = new Date();
        data.loading = false;
      },
      error: (err) => {
        data.error = 'Failed to load Renadaptor. Please try again.';
        data.loading = false;
      }
    });
  }

  refreshUrl() {
    const data = this.getSelectedRenadaptorData();
    if (data) {
      this.loadRenadaptorUrl(data);
    }
  }

  isMedicationSelected(medicationId: string): boolean {
    return this.selectedMedicationId === medicationId;
  }

  getSelectedRenadaptorData(): RenadaptorData | null {
    if (!this.selectedMedicationId) return null;
    return this.renadaptorData.get(this.selectedMedicationId) || null;
  }

  getSelectedMedication(): Medication | null {
    if (!this.selectedMedicationId) return null;
    return this.medications.find(m => m.medicationId === this.selectedMedicationId) || null;
  }

  openNotesModal() {
    const medication = this.getSelectedMedication();
    
    // If a medication is selected, attach note to it. Otherwise, treat as general note.
    if (medication) {
      this.openNotes.emit(medication);
    } else {
      this.openNotes.emit(null as any);
    }
  }

  getTimeRemaining(): string {
    const data = this.getSelectedRenadaptorData();
    if (!data || !data.lastGenerated) return '';

    const elapsed = Date.now() - data.lastGenerated.getTime();
    const remaining = this.URL_EXPIRY_MS - elapsed;

    if (remaining <= 0) return 'Expired';

    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  isUrlExpired(): boolean {
    const data = this.getSelectedRenadaptorData();
    if (!data || !data.lastGenerated) return true;

    const elapsed = Date.now() - data.lastGenerated.getTime();
    return elapsed > this.URL_EXPIRY_MS;
  }

  loadRenalFunction() {
    const sessionData = this.stateService.getSessionData();
    if (!sessionData) return;

    // RenalFunction is now stored in review (not patient)
    if (sessionData.review && sessionData.review.renalFunction !== undefined) {
      this.renalFunction = sessionData.review.renalFunction;
    }
  }

  onRenalFunctionChange() {
    this.saveRenalFunction();
  }

  private saveRenalFunction() {
    const sessionData = this.stateService.getSessionData();
    if (!sessionData) {
      return;
    }

    const apbNumber = this.stateService.apbNumber;
    const medicationReviewId = this.stateService.medicationReviewId;

    const request: any = {
      apbNumber: apbNumber,
      medicationReviewId: medicationReviewId,
      renalFunction: this.renalFunction
    };

    this.apiService.updateMedicationReview(request).subscribe({
      next: (response) => {
        // Update session data
        if (sessionData.review) {
          sessionData.review.renalFunction = response.renalFunction;
          this.stateService.setSessionData(sessionData);
        }
      },
      error: (error) => {
      }
    });
  }
}
