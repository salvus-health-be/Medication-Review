import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { StateService } from '../../services/state.service';
import { ImportMedicationsResponse, ImportedMedication, MedicationSearchRequest } from '../../models/api.models';

@Component({
  selector: 'app-csv-import-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslocoModule],
  templateUrl: './csv-import-modal.component.html',
  styleUrls: ['./csv-import-modal.component.scss']
})
export class CsvImportModalComponent {
  @Output() close = new EventEmitter<boolean>(); // Emit true if medications were imported

  selectedFile: File | null = null;
  importing = false;
  importResults: ImportMedicationsResponse | null = null;
  errorMessage: string | null = null;

  // Editing state
  editingMedicationId: string | null = null;
  editingField: string | null = null; // 'cnk', 'activeIngredient', 'indication', 'intakeMoments'
  
  // Edit values
  editValues: { [key: string]: any } = {};
  
  // CNK search
  cnkSearchResults: any[] = [];
  searchingCnk = false;

  constructor(
    private apiService: ApiService,
    private stateService: StateService
  ) {}

  onFileSelected(event: any) {
    const file: File = event.target.files[0];
    
    if (file) {
      if (!file.name.toLowerCase().endsWith('.csv')) {
        this.errorMessage = 'Please select a CSV file';
        this.selectedFile = null;
        return;
      }

      this.selectedFile = file;
      this.errorMessage = null;
    }
  }

  triggerFileInput() {
    const fileInput = document.getElementById('csvFileInput') as HTMLInputElement;
    fileInput?.click();
  }

  importMedications() {
    if (!this.selectedFile) {
      this.errorMessage = 'Please select a CSV file first';
      return;
    }

    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) {
      this.errorMessage = 'No medication review selected';
      return;
    }

    this.importing = true;
    this.errorMessage = null;
    this.importResults = null;

    this.apiService.importMedicationsFromCsv(reviewId, this.selectedFile).subscribe({
      next: (response) => {
        this.importing = false;
        this.importResults = response;
        
        // Set all imported medications to "under_review" status
        if (this.importResults && this.importResults.medications) {
          this.importResults.medications.forEach(med => {
            if (med.success) {
              med.reviewStatus = 'under_review';
            }
          });
        }
      },
      error: (err) => {
        this.importing = false;
        this.errorMessage = err.error?.error || 'Failed to import medications';
        console.error('Import error:', err);
      }
    });
  }

  shouldMarkRed(medication: ImportedMedication): boolean {
    return medication.missingInformation.length > 0;
  }

  getMedicationBoxClass(medication: ImportedMedication): string {
    if (!medication.success) {
      return 'medication-box failed';
    }
    if (medication.reviewStatus === 'approved') {
      return 'medication-box approved';
    }
    if (this.shouldMarkRed(medication)) {
      return 'medication-box incomplete';
    }
    return 'medication-box under-review';
  }

  isCnkMissing(medication: ImportedMedication): boolean {
    return medication.missingInformation.includes('CNK');
  }

  isActiveIngredientMissing(medication: ImportedMedication): boolean {
    return medication.missingInformation.includes('ActiveIngredient');
  }

  isIndicationMissing(medication: ImportedMedication): boolean {
    return medication.missingInformation.includes('Indication');
  }

  isIntakeMomentsMissing(medication: ImportedMedication): boolean {
    return medication.missingInformation.includes('IntakeMoments');
  }

  startEditing(medication: ImportedMedication, field: string) {
    this.editingMedicationId = medication.medicationId;
    this.editingField = field;
    
    // Initialize edit values
    if (field === 'cnk') {
      this.editValues['cnk'] = medication.cnk?.toString() || '';
    } else if (field === 'activeIngredient') {
      this.editValues['activeIngredient'] = medication.activeIngredient || '';
    } else if (field === 'indication') {
      this.editValues['indication'] = medication.indication || '';
    } else if (field === 'intakeMoments') {
      this.editValues['intakeMoments'] = {
        unitsBeforeBreakfast: medication.intakeMoments?.unitsBeforeBreakfast || 0,
        unitsDuringBreakfast: medication.intakeMoments?.unitsDuringBreakfast || 0,
        unitsBeforeLunch: medication.intakeMoments?.unitsBeforeLunch || 0,
        unitsDuringLunch: medication.intakeMoments?.unitsDuringLunch || 0,
        unitsBeforeDinner: medication.intakeMoments?.unitsBeforeDinner || 0,
        unitsDuringDinner: medication.intakeMoments?.unitsDuringDinner || 0,
        unitsAtBedtime: medication.intakeMoments?.unitsAtBedtime || 0,
        asNeeded: medication.intakeMoments?.asNeeded || false
      };
    }
  }

  cancelEditing() {
    this.editingMedicationId = null;
    this.editingField = null;
    this.editValues = {};
    this.cnkSearchResults = [];
    this.searchingCnk = false;
  }

  searchCnk(searchTerm: string) {
    if (!searchTerm || searchTerm.length < 3) {
      this.cnkSearchResults = [];
      return;
    }

    this.searchingCnk = true;
    this.apiService.searchMedications({ searchTerm }).subscribe({
      next: (response) => {
        this.cnkSearchResults = response.results || [];
        this.searchingCnk = false;
      },
      error: (err) => {
        console.error('CNK search error:', err);
        this.searchingCnk = false;
        this.cnkSearchResults = [];
      }
    });
  }

  selectCnkFromSearch(medication: ImportedMedication, result: any) {
    this.editValues['cnk'] = result.cnk.toString();
    this.cnkSearchResults = [];
    // Auto-save the CNK
    this.saveField(medication, 'cnk');
  }

  isEditing(medication: ImportedMedication, field: string): boolean {
    return this.editingMedicationId === medication.medicationId && this.editingField === field;
  }

  saveField(medication: ImportedMedication, field: string) {
    if (!medication.medicationId) return;

    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) return;

    let updateData: any = {};

    if (field === 'cnk') {
      const cnkNumber = parseInt(this.editValues['cnk']);
      if (isNaN(cnkNumber) || cnkNumber < 1000000 || cnkNumber > 9999999) {
        alert('Please enter a valid 7-digit CNK code');
        return;
      }
      updateData.cnk = cnkNumber;
    } else if (field === 'activeIngredient') {
      updateData.activeIngredient = this.editValues['activeIngredient'];
    } else if (field === 'indication') {
      updateData.indication = this.editValues['indication'];
    } else if (field === 'intakeMoments') {
      // Spread the intake moments as individual fields for the API
      const moments = this.editValues['intakeMoments'];
      updateData.asNeeded = moments.asNeeded;
      updateData.unitsBeforeBreakfast = moments.unitsBeforeBreakfast ?? null;
      updateData.unitsDuringBreakfast = moments.unitsDuringBreakfast ?? null;
      updateData.unitsBeforeLunch = moments.unitsBeforeLunch ?? null;
      updateData.unitsDuringLunch = moments.unitsDuringLunch ?? null;
      updateData.unitsBeforeDinner = moments.unitsBeforeDinner ?? null;
      updateData.unitsDuringDinner = moments.unitsDuringDinner ?? null;
      updateData.unitsAtBedtime = moments.unitsAtBedtime ?? null;
    }

    // Update medication
    this.apiService.updateMedication(reviewId, medication.medicationId, updateData).subscribe({
      next: (response) => {
        // Update the display
        if (field === 'cnk') {
          medication.cnk = response.cnk ?? null;
          medication.activeIngredient = response.activeIngredient ?? null;
          medication.missingInformation = medication.missingInformation.filter(m => m !== 'CNK');
          if (response.activeIngredient) {
            medication.missingInformation = medication.missingInformation.filter(m => m !== 'ActiveIngredient');
          }
        } else if (field === 'activeIngredient') {
          medication.activeIngredient = response.activeIngredient ?? null;
          medication.missingInformation = medication.missingInformation.filter(m => m !== 'ActiveIngredient');
        } else if (field === 'indication') {
          medication.indication = response.indication ?? null;
          medication.missingInformation = medication.missingInformation.filter(m => m !== 'Indication');
        } else if (field === 'intakeMoments') {
          // Reconstruct IntakeMoments from response
          medication.intakeMoments = {
            unitsBeforeBreakfast: response.unitsBeforeBreakfast ?? 0,
            unitsDuringBreakfast: response.unitsDuringBreakfast ?? 0,
            unitsBeforeLunch: response.unitsBeforeLunch ?? 0,
            unitsDuringLunch: response.unitsDuringLunch ?? 0,
            unitsBeforeDinner: response.unitsBeforeDinner ?? 0,
            unitsDuringDinner: response.unitsDuringDinner ?? 0,
            unitsAtBedtime: response.unitsAtBedtime ?? 0,
            asNeeded: response.asNeeded ?? false
          };
          medication.missingInformation = medication.missingInformation.filter(m => m !== 'IntakeMoments');
        }
        
        this.cancelEditing();
      },
      error: (err) => {
        alert('Failed to update medication: ' + (err.error?.error || 'Unknown error'));
        console.error('Update error:', err);
      }
    });
  }

  approveMedication(medication: ImportedMedication) {
    medication.reviewStatus = 'approved';
  }

  undoApproval(medication: ImportedMedication) {
    medication.reviewStatus = 'under_review';
  }

  deleteMedicationFromImport(medication: ImportedMedication) {
    if (!medication.medicationId) return;

    const confirmed = confirm(`Are you sure you want to delete ${medication.medicationName}?`);
    if (!confirmed) return;

    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) return;

    this.apiService.deleteMedication(reviewId, medication.medicationId).subscribe({
      next: () => {
        // Remove from the list
        if (this.importResults && this.importResults.medications) {
          const index = this.importResults.medications.indexOf(medication);
          if (index > -1) {
            this.importResults.medications.splice(index, 1);
          }
          // Update counts
          this.importResults.totalProcessed--;
          if (medication.reviewStatus === 'approved') {
            this.importResults.successful--;
          }
          if (medication.missingInformation.length > 0) {
            this.importResults.withMissingInformation--;
          }
        }
        // Notify state service that medications changed
        this.stateService.notifyMedicationsChanged();
      },
      error: (err) => {
        alert('Failed to delete medication: ' + (err.error?.error || 'Unknown error'));
        console.error('Delete error:', err);
      }
    });
  }

  canFinishImport(): boolean {
    if (!this.importResults || !this.importResults.medications) return false;
    
    return this.importResults.medications.length > 0 && 
           this.importResults.medications.every(m => m.reviewStatus === 'approved');
  }

  finishImport() {
    if (!this.canFinishImport()) return;
    
    // Notify state service that medications changed
    this.stateService.notifyMedicationsChanged();
    this.close.emit(true);
  }

  closeModal() {
    // Only allow closing if import is finished or cancelled
    if (this.importResults && !this.canFinishImport()) {
      const confirmed = confirm('You have unapproved medications. Are you sure you want to cancel the import?');
      if (!confirmed) return;
      
      // Delete all unapproved medications
      this.deleteUnapprovedMedications();
    } else {
      this.close.emit(false);
    }
  }

  deleteUnapprovedMedications() {
    if (!this.importResults || !this.importResults.medications) {
      this.close.emit(false);
      return;
    }

    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) {
      this.close.emit(false);
      return;
    }

    // Get all successfully imported but unapproved medications
    const unapprovedMeds = this.importResults.medications.filter(
      m => m.success && m.medicationId && m.reviewStatus !== 'approved'
    );

    if (unapprovedMeds.length === 0) {
      this.close.emit(false);
      return;
    }

    // Delete all unapproved medications
    const deleteObservables = unapprovedMeds.map(med => 
      this.apiService.deleteMedication(reviewId, med.medicationId!)
    );

    // Use forkJoin to wait for all deletions to complete
    forkJoin(deleteObservables).subscribe({
      next: () => {
        // Notify state service that medications changed
        this.stateService.notifyMedicationsChanged();
        this.close.emit(false);
      },
      error: (err) => {
        console.error('Error deleting unapproved medications:', err);
        // Still close the modal even if deletion fails
        this.stateService.notifyMedicationsChanged();
        this.close.emit(false);
      }
    });
  }

  getApprovedCount(): number {
    if (!this.importResults || !this.importResults.medications) return 0;
    return this.importResults.medications.filter(m => m.success && m.reviewStatus === 'approved').length;
  }

  getUnderReviewCount(): number {
    if (!this.importResults || !this.importResults.medications) return 0;
    return this.importResults.medications.filter(m => m.success && m.reviewStatus === 'under_review').length;
  }

  getIntakeDisplay(medication: ImportedMedication): string {
    if (!medication.intakeMoments) return 'Not specified';
    
    const moments = medication.intakeMoments;
    if (moments.asNeeded) return 'As needed';
    
    const parts: string[] = [];
    const breakfast = [moments.unitsBeforeBreakfast, moments.unitsDuringBreakfast]
      .filter(u => u && u > 0)
      .map(u => String(u))
      .join('+');
    if (breakfast) parts.push(`Morning: ${breakfast}`);
    
    const lunch = [moments.unitsBeforeLunch, moments.unitsDuringLunch]
      .filter(u => u && u > 0)
      .map(u => String(u))
      .join('+');
    if (lunch) parts.push(`Noon: ${lunch}`);
    
    const dinner = [moments.unitsBeforeDinner, moments.unitsDuringDinner]
      .filter(u => u && u > 0)
      .map(u => String(u))
      .join('+');
    if (dinner) parts.push(`Evening: ${dinner}`);
    
    if (moments.unitsAtBedtime && moments.unitsAtBedtime > 0) {
      parts.push(`Night: ${moments.unitsAtBedtime}`);
    }
    
    return parts.length > 0 ? parts.join(' | ') : 'No intake specified';
  }
}
