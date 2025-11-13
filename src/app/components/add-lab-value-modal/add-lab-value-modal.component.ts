import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';

export interface LabValueData {
  name: string;
  value: number;
  unit: string;
}

@Component({
  selector: 'app-add-lab-value-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslocoModule],
  templateUrl: './add-lab-value-modal.component.html',
  styleUrls: ['./add-lab-value-modal.component.scss']
})
export class AddLabValueModalComponent {
  @Output() close = new EventEmitter<void>();
  @Output() labValueAdded = new EventEmitter<LabValueData>();

  name = '';
  value: number | null = null;
  unit = '';
  errorMessage = '';

  onCancel() {
    this.close.emit();
  }

  onSubmit() {
    // Validation
    if (!this.name.trim()) {
      this.errorMessage = 'Please enter a name for the lab value.';
      return;
    }

    if (this.value === null || this.value === undefined) {
      this.errorMessage = 'Please enter a value.';
      return;
    }

    if (!this.unit.trim()) {
      this.errorMessage = 'Please enter a unit.';
      return;
    }

    // Emit the lab value data
    this.labValueAdded.emit({
      name: this.name.trim(),
      value: this.value,
      unit: this.unit.trim()
    });

    // Close modal
    this.close.emit();
  }
}
