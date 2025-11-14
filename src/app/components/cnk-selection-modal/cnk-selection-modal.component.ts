import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { MedicationSearchResult } from '../../models/api.models';

export interface MedicationWithMatches {
  medicationName: string;
  indication?: string;
  asNeeded?: boolean;
  unitsBeforeBreakfast?: number;
  unitsDuringBreakfast?: number;
  unitsBeforeLunch?: number;
  unitsDuringLunch?: number;
  unitsBeforeDinner?: number;
  unitsDuringDinner?: number;
  unitsAtBedtime?: number;
  matches: MedicationSearchResult[];
}

@Component({
  selector: 'app-cnk-selection-modal',
  standalone: true,
  imports: [CommonModule, TranslocoModule],
  templateUrl: './cnk-selection-modal.component.html',
  styleUrls: ['./cnk-selection-modal.component.scss']
})
export class CnkSelectionModalComponent {
  @Input() medication!: MedicationWithMatches;
  @Output() close = new EventEmitter<void>();
  @Output() medicationSelected = new EventEmitter<MedicationSearchResult>();
  @Output() skip = new EventEmitter<void>();

  selectMedication(match: MedicationSearchResult) {
    console.log('[CnkSelectionModal] Medication selected:', match);
    this.medicationSelected.emit(match);
  }

  skipMedication() {
    console.log('[CnkSelectionModal] Skip medication:', this.medication.medicationName);
    this.skip.emit();
  }

  onCancel() {
    this.close.emit();
  }
}
