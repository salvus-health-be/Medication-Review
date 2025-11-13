import { Component, Input, Output, EventEmitter } from '@angular/core';
import { MedicationItemComponent, Medication } from '../medication-item/medication-item.component';

@Component({
  selector: 'app-analysis-medication-item',
  standalone: true,
  imports: [MedicationItemComponent],
  templateUrl: './analysis-medication-item.component.html',
  styleUrls: ['./analysis-medication-item.component.scss']
})
export class AnalysisMedicationItemComponent {
  @Input() medication!: Medication;
  @Output() medicationDeleted = new EventEmitter<string>();
  @Output() editRequested = new EventEmitter<Medication>();

  get dosesPerDay(): number {
    const doses = [
      this.medication.unitsBeforeBreakfast,
      this.medication.unitsDuringBreakfast,
      this.medication.unitsBeforeLunch,
      this.medication.unitsDuringLunch,
      this.medication.unitsBeforeDinner,
      this.medication.unitsDuringDinner,
      this.medication.unitsAtBedtime
    ];
    
    return doses.reduce((sum: number, dose) => sum + (dose ?? 0), 0);
  }

  onMedicationDeleted(medicationId: string) {
    this.medicationDeleted.emit(medicationId);
  }

  onEditRequested(medication: Medication) {
    this.editRequested.emit(medication);
  }
}
