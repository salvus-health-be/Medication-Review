import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
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
    private stateService: StateService
  ) {}

  ngOnInit() {
    this.loadLabValues();
  }

  loadLabValues() {
    const medicationReviewId = this.stateService.medicationReviewId;
    if (!medicationReviewId) {
      this.labValues = [];
      return;
    }

    this.isLoading = true;
    this.apiService.getLabValues(medicationReviewId).subscribe({
      next: (labValues) => {
        this.labValues = labValues;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('[LabValuesList] Failed to load lab values:', error);
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
    const medicationReviewId = this.stateService.medicationReviewId;
    if (!medicationReviewId) {
      console.error('[LabValuesList] No medication review ID');
      return;
    }

    this.apiService.addLabValue(
      medicationReviewId,
      {
        name: data.name,
        value: data.value,
        unit: data.unit
      }
    ).subscribe({
      next: (response) => {
        console.log('[LabValuesList] Lab value added:', response);
        this.loadLabValues();
      },
      error: (error) => {
        console.error('[LabValuesList] Failed to add lab value:', error);
        alert('Failed to add lab value. Please try again.');
      }
    });
  }

  onLabValueDeleted(labValueId: string) {
    const medicationReviewId = this.stateService.medicationReviewId;
    if (!medicationReviewId) {
      console.error('[LabValuesList] No medication review ID');
      return;
    }

    this.apiService.deleteLabValue(medicationReviewId, labValueId).subscribe({
      next: () => {
        console.log('[LabValuesList] Lab value deleted:', labValueId);
        this.labValues = this.labValues.filter(lv => lv.labValueId !== labValueId);
      },
      error: (error) => {
        console.error('[LabValuesList] Failed to delete lab value:', error);
        alert('Failed to delete lab value. Please try again.');
      }
    });
  }
}
