import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { LabValueItemComponent } from '../lab-value-item/lab-value-item.component';
import { AddLabValueModalComponent, LabValueData } from '../add-lab-value-modal/add-lab-value-modal.component';
import { ApiService } from '../../services/api.service';
import { StateService } from '../../services/state.service';
import { LabValue } from '../../models/api.models';

@Component({
  selector: 'app-lab-values-list',
  standalone: true,
  imports: [CommonModule, TranslocoModule, LabValueItemComponent, AddLabValueModalComponent],
  templateUrl: './lab-values-list.component.html',
  styleUrls: ['./lab-values-list.component.scss']
})
export class LabValuesListComponent implements OnInit {
  labValues: LabValue[] = [];
  showAddModal = false;
  isLoading = false;

  constructor(
    private apiService: ApiService,
    private stateService: StateService,
    private transloco: TranslocoService
  ) {}

  ngOnInit() {
    this.loadLabValues();
  }

  loadLabValues() {
    const apbNumber = this.stateService.apbNumber;
    const medicationReviewId = this.stateService.medicationReviewId;
    if (!medicationReviewId) {
      this.labValues = [];
      return;
    }

    this.isLoading = true;
    this.apiService.getLabValues(apbNumber, medicationReviewId).subscribe({
      next: (labValues) => {
        this.labValues = labValues;
        this.isLoading = false;
      },
      error: (error) => {
        this.labValues = [];
        this.isLoading = false;
      }
    });
  }

  openAddModal() {
    this.showAddModal = true;
  }

  closeAddModal() {
    this.showAddModal = false;
  }

  onLabValueAdded(data: LabValueData) {
    const apbNumber = this.stateService.apbNumber;
    const medicationReviewId = this.stateService.medicationReviewId;
    if (!medicationReviewId) {
      return;
    }

    this.apiService.addLabValue(
      apbNumber,
      medicationReviewId,
      {
        name: data.name,
        value: data.value,
        unit: data.unit
      }
    ).subscribe({
      next: (response) => {
        this.loadLabValues();
      },
      error: (error) => {
        alert(this.transloco.translate('errors.failed_add_lab_value'));
      }
    });
  }

  onLabValueDeleted(labValueId: string) {
    const apbNumber = this.stateService.apbNumber;
    const medicationReviewId = this.stateService.medicationReviewId;
    if (!medicationReviewId) {
      return;
    }

    this.apiService.deleteLabValue(apbNumber, medicationReviewId, labValueId).subscribe({
      next: () => {
        this.labValues = this.labValues.filter(lv => lv.labValueId !== labValueId);
      },
      error: (error) => {
        alert(this.transloco.translate('errors.failed_delete_lab_value'));
      }
    });
  }
}
