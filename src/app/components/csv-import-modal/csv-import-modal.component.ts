import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { forkJoin } from 'rxjs';
import * as XLSX from 'xlsx';
import { ApiService } from '../../services/api.service';
import { StateService } from '../../services/state.service';
import { ImportMedicationsResponse, ImportedMedication, MedicationSearchRequest, ImportProgressEvent, ImportCompleteEvent } from '../../models/api.models';

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
  converting = false;
  originalFileName: string | null = null;
  importResults: ImportMedicationsResponse | null = null;
  errorMessage: string | null = null;

  // Progress tracking for SSE
  importProgress = {
    current: 0,
    total: 0,
    percentage: 0,
    message: ''
  };

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
    private stateService: StateService,
    private transloco: TranslocoService
  ) {}

  async onFileSelected(event: any) {
    const file: File = event.target.files[0];
    
    if (file) {
      const fileName = file.name.toLowerCase();
      const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
      const isCsv = fileName.endsWith('.csv');

      if (!isExcel && !isCsv) {
        this.errorMessage = this.transloco.translate('csv_import.error_invalid_file_type');
        this.selectedFile = null;
        this.originalFileName = null;
        return;
      }

      this.errorMessage = null;

      if (isExcel) {
        // Convert Excel to CSV
        this.converting = true;
        this.originalFileName = file.name;
        try {
          this.selectedFile = await this.convertExcelToCsv(file);
        } catch (error) {
          this.errorMessage = this.transloco.translate('csv_import.error_conversion_failed');
          this.selectedFile = null;
          this.originalFileName = null;
          console.error('Excel conversion error:', error);
        } finally {
          this.converting = false;
        }
      } else {
        this.selectedFile = file;
        this.originalFileName = null;
      }
    }
  }

  private async convertExcelToCsv(excelFile: File): Promise<File> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          
          // Parse the Excel file
          const workbook = XLSX.read(arrayBuffer, { 
            type: 'array',
            cellDates: true,
            cellNF: false,
            cellText: false
          });
          
          // Get the first sheet
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          
          // Convert to CSV
          const csvContent = XLSX.utils.sheet_to_csv(worksheet, {
            blankrows: false,
            skipHidden: true
          });
          
          // Create a new File object with the CSV content
          const csvFileName = excelFile.name.replace(/\.(xlsx|xls)$/i, '.csv');
          const csvFile = new File(
            [csvContent], 
            csvFileName, 
            { type: 'text/csv' }
          );
          
          resolve(csvFile);
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };
      
      reader.readAsArrayBuffer(excelFile);
    });
  }

  triggerFileInput() {
    const fileInput = document.getElementById('csvFileInput') as HTMLInputElement;
    fileInput?.click();
  }

  importMedications() {
    console.log('=== IMPORT MEDICATIONS CALLED ===');
    console.log('selectedFile:', this.selectedFile);
    
    if (!this.selectedFile) {
      this.errorMessage = this.transloco.translate('csv_import.error_select_file');
      return;
    }

    const apbNumber = this.stateService.apbNumber;
    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) {
      this.errorMessage = this.transloco.translate('csv_import.error_no_review');
      return;
    }

    console.log('[Component] Starting import:', {
      fileName: this.selectedFile.name,
      fileSize: this.selectedFile.size,
      fileType: this.selectedFile.type,
      apbNumber,
      reviewId
    });

    this.importing = true;
    this.errorMessage = null;
    this.importResults = null;
    this.importProgress = { current: 0, total: 0, percentage: 0, message: '' };

    console.log('[Component] Starting import with file:', this.selectedFile.name, 'size:', this.selectedFile.size);
    this.apiService.importMedicationsFromCsv(apbNumber, reviewId, this.selectedFile).subscribe({
      next: (event) => {
        console.log('[Component] Received event:', event.type, event);
        if (event.type === 'progress') {
          // Update progress bar
          this.importProgress = {
            current: event.current,
            total: event.total,
            percentage: event.percentage,
            message: event.message
          };
        } else if (event.type === 'complete') {
          // Import finished
          console.log('[Component] Import complete, medications:', event.medications);
          console.log('[Component] First medication:', event.medications?.[0]);
          
          this.importing = false;
          
          console.log('=== RECEIVED COMPLETE EVENT ===');
          console.log('event.medications:', JSON.stringify(event.medications, null, 2));
          
          this.importResults = {
            totalProcessed: event.totalProcessed,
            successful: event.successful,
            failed: event.failed,
            withMissingInformation: event.withMissingInformation,
            medications: event.medications
          };
          
          console.log('[Component] importResults set:', this.importResults);
          console.log('[Component] medications array:', this.importResults.medications);
          
          // Check each medication's success property
          if (this.importResults.medications) {
            this.importResults.medications.forEach((med, i) => {
              console.log(`[Component] Medication ${i}: success=${med.success}, name=${med.medicationName}, id=${med.medicationId}`);
            });
          }
          
          // Set all imported medications to "under_review" status
          if (this.importResults && this.importResults.medications) {
            console.log('[Component] Setting review status for', this.importResults.medications.length, 'medications');
            this.importResults.medications.forEach((med, index) => {
              console.log(`[Component] Med ${index}:`, med.medicationName, 'success:', med.success, 'missingInfo:', med.missingInformation);
              if (med.success) {
                med.reviewStatus = 'under_review';
              }
            });
            console.log('[Component] Final import results:', this.importResults);
          }
        }
      },
      error: (err) => {
        console.error('[Component] Import error:', err);
        console.error('[Component] Error details:', JSON.stringify(err, null, 2));
        this.importing = false;
        this.errorMessage = err.error?.error || err.error || this.transloco.translate('csv_import.error_import_failed');
      }
    });
  }

  shouldMarkRed(medication: ImportedMedication): boolean {
    return (medication.missingInformation?.length ?? 0) > 0;
  }

  getMedicationBoxClass(medication: ImportedMedication): string {
    console.log('=== GET BOX CLASS ===', {
      name: medication.medicationName,
      success: medication.success,
      successType: typeof medication.success,
      reviewStatus: medication.reviewStatus,
      missingInfo: medication.missingInformation
    });
    
    const result = !medication.success ? 'medication-box failed' :
                   medication.reviewStatus === 'approved' ? 'medication-box approved' :
                   this.shouldMarkRed(medication) ? 'medication-box incomplete' :
                   'medication-box under-review';
    
    console.log('Result class:', result);
    return result;
  }

  isCnkMissing(medication: ImportedMedication): boolean {
    return medication.missingInformation?.includes('CNK') ?? false;
  }

  isActiveIngredientMissing(medication: ImportedMedication): boolean {
    return medication.missingInformation?.includes('ActiveIngredient') ?? false;
  }

  isIndicationMissing(medication: ImportedMedication): boolean {
    return medication.missingInformation?.includes('Indication') ?? false;
  }

  isIntakeMomentsMissing(medication: ImportedMedication): boolean {
    return medication.missingInformation?.includes('IntakeMoments') ?? false;
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

    const apbNumber = this.stateService.apbNumber;
    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) return;

    let updateData: any = {};

    if (field === 'cnk') {
      const cnkNumber = parseInt(this.editValues['cnk']);
      if (isNaN(cnkNumber) || cnkNumber < 1000000 || cnkNumber > 9999999) {
        alert(this.transloco.translate('csv_import.error_invalid_cnk'));
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
    this.apiService.updateMedication(apbNumber, reviewId, medication.medicationId, updateData).subscribe({
      next: (response) => {
        // Update the display
        if (field === 'cnk') {
          medication.cnk = response.cnk ?? null;
          medication.activeIngredient = response.activeIngredient ?? null;
          medication.missingInformation = (medication.missingInformation || []).filter(m => m !== 'CNK');
          if (response.activeIngredient) {
            medication.missingInformation = (medication.missingInformation || []).filter(m => m !== 'ActiveIngredient');
          }
        } else if (field === 'activeIngredient') {
          medication.activeIngredient = response.activeIngredient ?? null;
          medication.missingInformation = (medication.missingInformation || []).filter(m => m !== 'ActiveIngredient');
        } else if (field === 'indication') {
          medication.indication = response.indication ?? null;
          medication.missingInformation = (medication.missingInformation || []).filter(m => m !== 'Indication');
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
          medication.missingInformation = (medication.missingInformation || []).filter(m => m !== 'IntakeMoments');
        }
        
        this.cancelEditing();
      },
      error: (err) => {
        alert(this.transloco.translate('csv_import.error_update_failed') + ': ' + (err.error?.error || 'Unknown error'));
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

    const confirmed = confirm(this.transloco.translate('csv_import.confirm_delete_medication', { name: medication.medicationName }));
    if (!confirmed) return;

    const apbNumber = this.stateService.apbNumber;
    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) return;

    this.apiService.deleteMedication(apbNumber, reviewId, medication.medicationId).subscribe({
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
          if ((medication.missingInformation?.length ?? 0) > 0) {
            this.importResults.withMissingInformation--;
          }
        }
        // Notify state service that medications changed
        this.stateService.notifyMedicationsChanged();
      },
      error: (err) => {
        alert(this.transloco.translate('csv_import.error_delete_failed') + ': ' + (err.error?.error || 'Unknown error'));
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
      const confirmed = confirm(this.transloco.translate('csv_import.confirm_cancel_import'));
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

    const apbNumber = this.stateService.apbNumber;
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
      this.apiService.deleteMedication(apbNumber, reviewId, med.medicationId!)
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

  isIntakeNotSpecified(medication: ImportedMedication): boolean {
    if (!medication.intakeMoments) return true;
    
    const moments = medication.intakeMoments;
    if (moments.asNeeded) return false;
    
    // Check if any intake moment has a value
    const hasIntake = (
      (moments.unitsBeforeBreakfast && moments.unitsBeforeBreakfast > 0) ||
      (moments.unitsDuringBreakfast && moments.unitsDuringBreakfast > 0) ||
      (moments.unitsBeforeLunch && moments.unitsBeforeLunch > 0) ||
      (moments.unitsDuringLunch && moments.unitsDuringLunch > 0) ||
      (moments.unitsBeforeDinner && moments.unitsBeforeDinner > 0) ||
      (moments.unitsDuringDinner && moments.unitsDuringDinner > 0) ||
      (moments.unitsAtBedtime && moments.unitsAtBedtime > 0)
    );
    
    return !hasIntake;
  }

  getIntakeDisplay(medication: ImportedMedication): string {
    if (!medication.intakeMoments) return this.transloco.translate('csv_import.no_intake_specified');
    
    const moments = medication.intakeMoments;
    if (moments.asNeeded) return this.transloco.translate('csv_import.as_needed');
    
    const parts: string[] = [];
    const morning = this.transloco.translate('csv_import.morning');
    const noon = this.transloco.translate('csv_import.noon');
    const evening = this.transloco.translate('csv_import.evening');
    const night = this.transloco.translate('csv_import.night');
    
    const breakfast = [moments.unitsBeforeBreakfast, moments.unitsDuringBreakfast]
      .filter(u => u && u > 0)
      .map(u => String(u))
      .join('+');
    if (breakfast) parts.push(`${morning}: ${breakfast}`);
    
    const lunch = [moments.unitsBeforeLunch, moments.unitsDuringLunch]
      .filter(u => u && u > 0)
      .map(u => String(u))
      .join('+');
    if (lunch) parts.push(`${noon}: ${lunch}`);
    
    const dinner = [moments.unitsBeforeDinner, moments.unitsDuringDinner]
      .filter(u => u && u > 0)
      .map(u => String(u))
      .join('+');
    if (dinner) parts.push(`${evening}: ${dinner}`);
    
    if (moments.unitsAtBedtime && moments.unitsAtBedtime > 0) {
      parts.push(`${night}: ${moments.unitsAtBedtime}`);
    }
    
    return parts.length > 0 ? parts.join(' | ') : this.transloco.translate('csv_import.no_intake_specified');
  }
}
