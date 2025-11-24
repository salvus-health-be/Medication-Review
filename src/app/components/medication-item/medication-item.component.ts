import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, SimpleChanges, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
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
  specialFrequency?: number | null;
  specialDescription?: string | null;
  unitsBeforeBreakfast?: number | null;
  unitsDuringBreakfast?: number | null;
  unitsBeforeLunch?: number | null;
  unitsDuringLunch?: number | null;
  unitsBeforeDinner?: number | null;
  unitsDuringDinner?: number | null;
  unitsAtBedtime?: number | null;
  isNew?: boolean;
  activeIngredient?: string | null;
}

@Component({
  selector: 'app-medication-item',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslocoModule, ConfirmationModalComponent],
  templateUrl: './medication-item.component.html',
  styleUrls: ['./medication-item.component.scss']
})
export class MedicationItemComponent implements OnInit, OnDestroy, OnChanges, AfterViewInit {
  @Input() medication!: Medication;
  @Input() expandable: boolean = true; // New input to control if item can be expanded
  @Input() isNew: boolean = false; // Flag to indicate this is a newly added medication
  @Output() medicationDeleted = new EventEmitter<string>();
  @Output() editRequested = new EventEmitter<Medication>();
  @ViewChild('indicationInput') indicationInput?: ElementRef<HTMLInputElement>;
  
  isExpanded = false;
  showDeleteConfirmation = false;
  notDaily = false;
  activeIngredient: string | null = null;
  loadingActiveIngredient = false;

  private destroy$ = new Subject<void>();
  private valueChanged$ = new Subject<void>();

  constructor(
    private apiService: ApiService,
    private stateService: StateService
    , private transloco: TranslocoService
  ) {}

  ngOnChanges(changes: SimpleChanges) {
    // Detect when isNew changes to true and expand the box
    if (changes['isNew'] && changes['isNew'].currentValue === true) {
      this.isExpanded = true;
    }
  }

  ngOnInit() {
    console.log('MedicationItem ngOnInit - medication:', this.medication);
    
    // Initialize notDaily based on whether special frequency is set
    this.notDaily = !!(this.medication.specialFrequency || this.medication.specialDescription);
    
    // Ensure asNeeded is a boolean, not null/undefined
    if (this.medication.asNeeded === null || this.medication.asNeeded === undefined) {
      this.medication.asNeeded = false;
    }
    
    // Load active ingredient if we have a CNK
    if (this.medication.cnk) {
      console.log('CNK found, loading active ingredient');
      this.loadActiveIngredient();
    } else {
      console.log('No CNK found');
    }
    
    // Set up auto-save with debounce
    this.valueChanged$
      .pipe(
        debounceTime(1000),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.saveToBackend();
      });
  }

  ngAfterViewInit() {
    // Auto-focus indication field for newly created medications
    if (this.isNew && this.indicationInput) {
      setTimeout(() => {
        this.indicationInput?.nativeElement.focus();
      }, 0);
    }
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
    this.valueChanged$.next();
  }

  onNotDailyChange() {
    if (!this.notDaily) {
      // Clear special frequency fields when unchecked
      this.medication.specialFrequency = null;
      this.medication.specialDescription = null;
      this.onValueChange();
    } else {
      // Set default values when checked
      if (!this.medication.specialFrequency) {
        this.medication.specialFrequency = 1;
      }
      if (!this.medication.specialDescription) {
        this.medication.specialDescription = 'weekly';
      }
      this.onValueChange();
    }
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

  getLocalizedPeriod(): string {
    if (!this.medication.specialDescription) return '';
    const key = `medication.period_${this.medication.specialDescription}`;
    return this.transloco.translate(key);
  }

  saveToBackend() {
    const medicationReviewId = this.stateService.medicationReviewId;
    if (!medicationReviewId) {
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
      specialFrequency: parseNumber(this.medication.specialFrequency),
      specialDescription: this.medication.specialDescription || null,
      unitsBeforeBreakfast: parseNumber(this.medication.unitsBeforeBreakfast),
      unitsDuringBreakfast: parseNumber(this.medication.unitsDuringBreakfast),
      unitsBeforeLunch: parseNumber(this.medication.unitsBeforeLunch),
      unitsDuringLunch: parseNumber(this.medication.unitsDuringLunch),
      unitsBeforeDinner: parseNumber(this.medication.unitsBeforeDinner),
      unitsDuringDinner: parseNumber(this.medication.unitsDuringDinner),
      unitsAtBedtime: parseNumber(this.medication.unitsAtBedtime)
    };

    this.apiService.updateMedication(
      medicationReviewId,
      this.medication.medicationId,
      updateData
    ).subscribe({
      next: (response) => {
        this.stateService.notifyMedicationsChanged();
      },
      error: (error: any) => {
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
      return;
    }

    this.apiService.deleteMedication(medicationReviewId, this.medication.medicationId).subscribe({
      next: () => {
        // Emit event to parent component to remove from list
        this.medicationDeleted.emit(this.medication.medicationId);
      },
      error: (error: any) => {
        const msg = this.transloco.translate('messages.delete_lab_value_error');
        alert(msg);
      }
    });
  }

  onDeleteCancel() {
    this.showDeleteConfirmation = false;
  }

  loadActiveIngredient() {
    // Active ingredient is now automatically fetched by the backend when a medication is added
    // Simply use the activeIngredient property from the medication object
    console.log('loadActiveIngredient called for:', this.medication.name);
    console.log('Medication object:', this.medication);
    console.log('activeIngredient value:', this.medication.activeIngredient);
    if (this.medication.activeIngredient) {
      this.activeIngredient = this.medication.activeIngredient;
      console.log('Set activeIngredient to:', this.activeIngredient);
    } else {
      console.log('No activeIngredient found in medication object');
    }
  }
}
