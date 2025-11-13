import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import { StateService } from '../../services/state.service';
import { ConfirmationModalComponent } from '../confirmation-modal/confirmation-modal.component';

export interface Medication {
  medicationId: string;
  name: string;
  dosage: string;
  route: string;
  cnk?: number | null;
  vmp?: number | null;
  packageSize?: number | null;
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

@Component({
  selector: 'app-medication-item',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslocoModule, ConfirmationModalComponent],
  templateUrl: './medication-item.component.html',
  styleUrls: ['./medication-item.component.scss']
})
export class MedicationItemComponent implements OnInit {
  @Input() medication!: Medication;
  @Input() expandable: boolean = true; // New input to control if item can be expanded
  @Output() medicationDeleted = new EventEmitter<string>();
  @Output() editRequested = new EventEmitter<Medication>();
  isExpanded = false;
  showDeleteConfirmation = false;

  private destroy$ = new Subject<void>();
  private valueChanged$ = new Subject<void>();

  constructor(
    private apiService: ApiService,
    private stateService: StateService
    , private transloco: TranslocoService
  ) {}

  ngOnInit() {
    // Set up auto-save with debounce
    this.valueChanged$
      .pipe(
        debounceTime(1000),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        console.log('[MedicationItem] Value changed, triggering save...');
        this.saveToBackend();
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggleExpand() {
    if (this.expandable) {
      this.isExpanded = !this.isExpanded;
    }
  }

  onValueChange() {
    console.log('[MedicationItem] onValueChange() called');
    this.valueChanged$.next();
  }

  get dosesPerDay(): number {
    if (!this.medication) return 0;
    const doses = [
      this.medication.unitsBeforeBreakfast,
      this.medication.unitsDuringBreakfast,
      this.medication.unitsBeforeLunch,
      this.medication.unitsDuringLunch,
      this.medication.unitsBeforeDinner,
      this.medication.unitsDuringDinner,
      this.medication.unitsAtBedtime
    ];
    return doses.reduce((sum: number, d) => sum + (d ?? 0), 0);
  }

  saveToBackend() {
    const medicationReviewId = this.stateService.medicationReviewId;
    if (!medicationReviewId) {
      console.error('[MedicationItem] No medicationReviewId available');
      return;
    }

    // Helper function to convert empty strings and undefined to null, keep valid numbers
    const parseNumber = (value: any): number | null => {
      if (value === '' || value === null || value === undefined) {
        return null;
      }
      const parsed = Number(value);
      return isNaN(parsed) ? null : parsed;
    };

    // Extract dosage number from dosage string (e.g., "500mg" -> 500)
    const parseDosage = (dosage: string): number | null => {
      if (!dosage) return null;
      const match = dosage.match(/(\d+\.?\d*)/);
      return match ? parseFloat(match[1]) : null;
    };

    const updateData = {
      name: this.medication.name || null,
      cnk: this.medication.cnk ?? null,
      vmp: this.medication.vmp ?? null,
      packageSize: this.medication.packageSize ?? null,
      dosageMg: parseDosage(this.medication.dosage),
      routeOfAdministration: this.medication.route || null,
      indication: this.medication.indication ? this.medication.indication : null,
      asNeeded: this.medication.asNeeded ?? false,
      unitsBeforeBreakfast: parseNumber(this.medication.unitsBeforeBreakfast),
      unitsDuringBreakfast: parseNumber(this.medication.unitsDuringBreakfast),
      unitsBeforeLunch: parseNumber(this.medication.unitsBeforeLunch),
      unitsDuringLunch: parseNumber(this.medication.unitsDuringLunch),
      unitsBeforeDinner: parseNumber(this.medication.unitsBeforeDinner),
      unitsDuringDinner: parseNumber(this.medication.unitsDuringDinner),
      unitsAtBedtime: parseNumber(this.medication.unitsAtBedtime)
    };

    console.log('[MedicationItem] === SAVING TO BACKEND ===');
    console.log('[MedicationItem] Medication:', this.medication.name);
    console.log('[MedicationItem] Package Size:', this.medication.packageSize);
    console.log('[MedicationItem] Current medication object:', JSON.stringify(this.medication, null, 2));
    console.log('[MedicationItem] Update request payload:', JSON.stringify(updateData, null, 2));

    this.apiService.updateMedication(
      medicationReviewId,
      this.medication.medicationId,
      updateData
    ).subscribe({
      next: (response) => {
        console.log('[MedicationItem] ✓ Save successful');
        console.log('[MedicationItem] Response:', JSON.stringify(response, null, 2));
      },
      error: (error: any) => {
        console.error('[MedicationItem] ✗ Save failed');
        console.error('[MedicationItem] Error:', error);
      }
    });
  }

  editMedication(event: Event) {
    // Prevent the header click from toggling expand
    event.stopPropagation();
    // Emit event to parent to open medication searcher
    this.editRequested.emit(this.medication);
  }

  deleteMedication(event: Event) {
    // Prevent the header click from toggling expand
    event.stopPropagation();
    // Show confirmation modal
    this.showDeleteConfirmation = true;
  }

  onDeleteConfirm() {
    this.showDeleteConfirmation = false;

    const medicationReviewId = this.stateService.medicationReviewId;
    if (!medicationReviewId) {
      console.error('[MedicationItem] No medicationReviewId available for deletion');
      return;
    }

    console.log('[MedicationItem] === DELETING MEDICATION ===');
    console.log('[MedicationItem] Medication:', this.medication.name);
    console.log('[MedicationItem] MedicationId:', this.medication.medicationId);

    this.apiService.deleteMedication(medicationReviewId, this.medication.medicationId).subscribe({
      next: () => {
        console.log('[MedicationItem] ✓ Delete successful');
        // Emit event to parent component to remove from list
        this.medicationDeleted.emit(this.medication.medicationId);
      },
      error: (error: any) => {
        console.error('[MedicationItem] ✗ Delete failed');
        console.error('[MedicationItem] Error:', error);
        const msg = this.transloco.translate('messages.delete_lab_value_error');
        alert(msg);
      }
    });
  }

  onDeleteCancel() {
    this.showDeleteConfirmation = false;
  }
}
