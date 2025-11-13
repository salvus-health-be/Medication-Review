import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { LabValue } from '../../models/api.models';
import { ConfirmationModalComponent } from '../confirmation-modal/confirmation-modal.component';

@Component({
  selector: 'app-lab-value-item',
  standalone: true,
  imports: [CommonModule, ConfirmationModalComponent, TranslocoModule],
  templateUrl: './lab-value-item.component.html',
  styleUrls: ['./lab-value-item.component.scss']
})
export class LabValueItemComponent {
  @Input() labValue!: LabValue;
  @Output() delete = new EventEmitter<string>();
  showDeleteConfirmation = false;

  onDelete() {
    this.showDeleteConfirmation = true;
  }

  onDeleteConfirm() {
    this.showDeleteConfirmation = false;
    this.delete.emit(this.labValue.labValueId);
  }

  onDeleteCancel() {
    this.showDeleteConfirmation = false;
  }
}
