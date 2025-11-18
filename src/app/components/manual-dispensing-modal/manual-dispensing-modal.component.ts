import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';
import { ApiService } from '../../services/api.service';
import { StateService } from '../../services/state.service';
import { AddManualDispensingMomentRequest, AddManualDispensingMomentResponse, Medication } from '../../models/api.models';

interface DispensingMomentEntry {
  cnk: string;
  description: string;
  date: string;
  amount: number;
  errors?: {
    medication?: string;
    date?: string;
    amount?: string;
  };
}

@Component({
  selector: 'app-manual-dispensing-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslocoModule],
  templateUrl: './manual-dispensing-modal.component.html',
  styleUrls: ['./manual-dispensing-modal.component.scss']
})
export class ManualDispensingModalComponent implements OnInit {
  @Output() close = new EventEmitter<void>();
  @Output() momentsAdded = new EventEmitter<void>();

  medications: Medication[] = [];
  moments: DispensingMomentEntry[] = [];
  currentMoment: DispensingMomentEntry = this.createEmptyMoment();
  
  loading = false;
  submitting = false;
  error: string | null = null;
  successCount = 0;
  failureCount = 0;

  constructor(
    private apiService: ApiService,
    private stateService: StateService
  ) {}

  ngOnInit() {
    this.loadMedications();
    // Pre-fill with today's date
    this.currentMoment.date = new Date().toISOString().split('T')[0];
  }

  loadMedications() {
    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) return;

    this.loading = true;
    this.apiService.getMedications(reviewId).subscribe({
      next: (medications) => {
        // Only include medications with CNK codes
        this.medications = medications.filter(m => m.cnk);
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading medications:', err);
        this.loading = false;
        this.error = 'Failed to load medications';
      }
    });
  }

  createEmptyMoment(): DispensingMomentEntry {
    return {
      cnk: '',
      description: '',
      date: new Date().toISOString().split('T')[0],
      amount: 1
    };
  }

  onMedicationSelected(event: Event) {
    const select = event.target as HTMLSelectElement;
    const cnk = select.value;
    
    if (cnk) {
      const medication = this.medications.find(m => m.cnk?.toString() === cnk);
      if (medication) {
        this.currentMoment.description = medication.name || '';
        this.currentMoment.cnk = cnk; // Ensure CNK is set as string
      }
    } else {
      this.currentMoment.description = '';
      this.currentMoment.cnk = '';
    }
  }

  validateCurrentMoment(): boolean {
    this.currentMoment.errors = {};
    let isValid = true;

    // Validate medication selection
    if (!this.currentMoment.cnk || this.currentMoment.cnk.trim() === '') {
      this.currentMoment.errors.medication = 'Please select a medication';
      isValid = false;
    }

    // Validate date
    if (!this.currentMoment.date) {
      this.currentMoment.errors.date = 'Date is required';
      isValid = false;
    }

    // Validate amount
    if (!this.currentMoment.amount || this.currentMoment.amount < 1) {
      this.currentMoment.errors.amount = 'Amount must be at least 1';
      isValid = false;
    }

    return isValid;
  }

  addToList() {
    if (this.validateCurrentMoment()) {
      // Create a copy without errors property for the list
      const momentCopy: DispensingMomentEntry = {
        cnk: this.currentMoment.cnk,
        description: this.currentMoment.description,
        date: this.currentMoment.date,
        amount: this.currentMoment.amount
      };
      
      this.moments.push(momentCopy);
      
      // Reset only date and amount, keep the selected medication
      const selectedCnk = this.currentMoment.cnk;
      const selectedDescription = this.currentMoment.description;
      this.currentMoment.date = new Date().toISOString().split('T')[0];
      this.currentMoment.amount = 1;
      this.currentMoment.errors = {};
      
      // Preserve the medication selection
      this.currentMoment.cnk = selectedCnk;
      this.currentMoment.description = selectedDescription;
      
      this.error = null;
    }
  }

  removeFromList(index: number) {
    this.moments.splice(index, 1);
  }

  formatDate(isoDate: string): string {
    const date = new Date(isoDate);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  async submitAll() {
    if (this.moments.length === 0) {
      this.error = 'Please add at least one dispensing moment';
      return;
    }

    const apbNumber = this.stateService.apbNumber;
    const reviewId = this.stateService.medicationReviewId;

    if (!apbNumber || !reviewId) {
      this.error = 'Session data not available. Please log in again.';
      return;
    }

    this.submitting = true;
    this.successCount = 0;
    this.failureCount = 0;
    this.error = null;

    for (const moment of this.moments) {
      const request: AddManualDispensingMomentRequest = {
        cnk: moment.cnk.toString(), // Ensure CNK is string
        description: moment.description,
        date: moment.date, // Send as ISO format (YYYY-MM-DD)
        amount: moment.amount
      };

      try {
        await this.apiService.addManualDispensingMoment(apbNumber, reviewId, request).toPromise();
        this.successCount++;
      } catch (err: any) {
        this.failureCount++;
        console.error('Failed to add moment:', moment, err);
      }
    }

    this.submitting = false;

    if (this.failureCount === 0) {
      // All succeeded
      this.momentsAdded.emit();
      setTimeout(() => this.closeModal(), 1000); // Close after brief delay
    } else if (this.successCount > 0) {
      // Partial success
      this.error = `Added ${this.successCount} moments, but ${this.failureCount} failed`;
      this.moments = []; // Clear the list since some were added
      this.momentsAdded.emit(); // Refresh data even on partial success
    } else {
      // All failed
      this.error = 'Failed to add all dispensing moments. Please try again.';
    }
  }

  closeModal() {
    this.close.emit();
  }
}
