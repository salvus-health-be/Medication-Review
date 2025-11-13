import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { MedicationItemComponent, Medication } from '../medication-item/medication-item.component';
import { MedicationSearchModalComponent } from '../medication-search-modal/medication-search-modal.component';
import { MedicationSearchResult } from '../../models/api.models';
import { ApiService } from '../../services/api.service';
import { StateService } from '../../services/state.service';

@Component({
  selector: 'app-medication-list',
  standalone: true,
  imports: [CommonModule, TranslocoModule, MedicationItemComponent, MedicationSearchModalComponent],
  templateUrl: './medication-list.component.html',
  styleUrls: ['./medication-list.component.scss']
})
export class MedicationListComponent implements OnInit {
  medications: Medication[] = [];
  showSearchModal = false;
  isLoading = false;
  editingMedication: Medication | null = null;

  constructor(
    private apiService: ApiService,
    private stateService: StateService
  ) {}

  ngOnInit() {
    this.loadMedications();
  }

  loadMedications() {
    const medicationReviewId = this.stateService.medicationReviewId;
    if (!medicationReviewId) {
      this.medications = [];
      return;
    }

    this.isLoading = true;
    console.log('[MedicationList] === LOADING MEDICATIONS ===');
    console.log('[MedicationList] medicationReviewId:', medicationReviewId);
    
    this.apiService.getMedications(medicationReviewId).subscribe({
      next: (medications) => {
        console.log('[MedicationList] Received medications from backend:', JSON.stringify(medications, null, 2));
        
        this.medications = medications.map(med => ({
          medicationId: med.medicationId,
          name: med.name || '',
          dosage: med.dosageMg ? `${med.dosageMg}mg` : '',
          route: med.routeOfAdministration || '',
          cnk: med.cnk ?? null,
          vmp: med.vmp ?? null,
          packageSize: med.packageSize ?? null,
          indication: med.indication ?? null,
          asNeeded: med.asNeeded ?? false,
          unitsBeforeBreakfast: med.unitsBeforeBreakfast ?? null,
          unitsDuringBreakfast: med.unitsDuringBreakfast ?? null,
          unitsBeforeLunch: med.unitsBeforeLunch ?? null,
          unitsDuringLunch: med.unitsDuringLunch ?? null,
          unitsBeforeDinner: med.unitsBeforeDinner ?? null,
          unitsDuringDinner: med.unitsDuringDinner ?? null,
          unitsAtBedtime: med.unitsAtBedtime ?? null
        }));
        
        console.log('[MedicationList] Mapped medications for display:', JSON.stringify(this.medications, null, 2));
        this.isLoading = false;
      },
      error: (error) => {
        console.error('[MedicationList] Failed to load:', error);
        this.medications = [];
        this.isLoading = false;
      }
    });
  }

  importMedications() {
    console.log('Import medications clicked');
  }

  addMedication() {
    this.editingMedication = null;
    this.showSearchModal = true;
  }

  onModalClose() {
    this.showSearchModal = false;
    this.editingMedication = null;
  }

  onMedicationSelected(medication: MedicationSearchResult) {
    const medicationReviewId = this.stateService.medicationReviewId;
    if (!medicationReviewId) {
      console.error('[MedicationList] No medication review ID');
      return;
    }

    // Check if we're editing an existing medication
    if (this.editingMedication) {
      console.log('[MedicationList] Replacing medication:', this.editingMedication.name, 'with:', medication.benaming);
      console.log('[MedicationList] New package size (verpakking):', medication.verpakking);
      console.log('[MedicationList] Old package size:', this.editingMedication.packageSize);

      // Update the existing medication while preserving intake and indication
      this.apiService.updateMedication(
        medicationReviewId,
        this.editingMedication.medicationId,
        {
          name: medication.benaming,
          cnk: parseInt(medication.cnk) || undefined,
          vmp: medication.vmp ? parseInt(medication.vmp) : undefined,
          packageSize: medication.verpakking ?? undefined,
          // Preserve existing values
          indication: this.editingMedication.indication || undefined,
          unitsBeforeBreakfast: this.editingMedication.unitsBeforeBreakfast ?? undefined,
          unitsDuringBreakfast: this.editingMedication.unitsDuringBreakfast ?? undefined,
          unitsBeforeLunch: this.editingMedication.unitsBeforeLunch ?? undefined,
          unitsDuringLunch: this.editingMedication.unitsDuringLunch ?? undefined,
          unitsBeforeDinner: this.editingMedication.unitsBeforeDinner ?? undefined,
          unitsDuringDinner: this.editingMedication.unitsDuringDinner ?? undefined,
          unitsAtBedtime: this.editingMedication.unitsAtBedtime ?? undefined
        }
      ).subscribe({
        next: (response) => {
          console.log('[MedicationList] Medication updated:', response);
          this.showSearchModal = false;
          this.editingMedication = null;
          this.loadMedications();
        },
        error: (error) => {
          console.error('[MedicationList] Failed to update medication:', error);
          alert('Failed to update medication. Please try again.');
        }
      });
    } else {
      // Adding new medication
      console.log('[MedicationList] Adding medication:', medication);
      console.log('[MedicationList] Package size (verpakking):', medication.verpakking);

      this.apiService.addMedication(
        medicationReviewId,
        {
          name: medication.benaming,
          cnk: parseInt(medication.cnk) || undefined,
          vmp: medication.vmp ? parseInt(medication.vmp) : undefined,
          packageSize: medication.verpakking ?? undefined
        }
      ).subscribe({
        next: (response) => {
          console.log('[MedicationList] Medication added:', response);
          this.showSearchModal = false;
          this.loadMedications();
        },
        error: (error) => {
          console.error('[MedicationList] Failed to add medication:', error);
          alert('Failed to add medication. Please try again.');
        }
      });
    }
  }

  onMedicationDeleted(medicationId: string) {
    console.log('[MedicationList] Medication deleted:', medicationId);
    // Remove from local array
    this.medications = this.medications.filter(med => med.medicationId !== medicationId);
  }

  onEditRequested(medication: Medication) {
    console.log('[MedicationList] Edit requested for medication:', medication.name);
    this.editingMedication = medication;
    this.showSearchModal = true;
  }
}
