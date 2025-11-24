import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { ContraindicationModalComponent } from '../contraindication-modal/contraindication-modal.component';
import { ApiService } from '../../services/api.service';
import { StateService } from '../../services/state.service';
import { Contraindication } from '../../models/api.models';

@Component({
  selector: 'app-contra-indications',
  standalone: true,
  imports: [CommonModule, ContraindicationModalComponent, TranslocoModule],
  templateUrl: './contra-indications.component.html',
  styleUrls: ['./contra-indications.component.scss']
})
export class ContraIndicationsComponent implements OnInit {
  contraIndications: Contraindication[] = [];
  showModal = false;
  isLoading = false;

  constructor(
    private apiService: ApiService,
    private stateService: StateService
  ) {}

  ngOnInit() {
    this.loadContraindications();
  }

  loadContraindications() {
    const medicationReviewId = this.stateService.medicationReviewId;
    if (!medicationReviewId) {
      this.contraIndications = [];
      return;
    }

    this.isLoading = true;
    this.apiService.getContraindications(medicationReviewId).subscribe({
      next: (contraindications) => {
        this.contraIndications = contraindications;
        this.isLoading = false;
      },
      error: (error) => {
        this.contraIndications = [];
        this.isLoading = false;
      }
    });
  }

  addContraIndication() {
    this.showModal = true;
  }

  onModalClose() {
    this.showModal = false;
  }

  onModalSaved() {
    // Reload contraindications after saving
    this.loadContraindications();
    // Notify other components
    this.stateService.notifyContraindicationsChanged();
  }

  deleteContraindication(contraindication: Contraindication) {
    const medicationReviewId = this.stateService.medicationReviewId;
    if (!medicationReviewId) {
      return;
    }
    
    this.apiService.deleteContraindication(medicationReviewId, contraindication.contraindicationId).subscribe({
      next: () => {
        this.loadContraindications();
        // Notify other components
        this.stateService.notifyContraindicationsChanged();
      },
      error: (error) => {
        alert('Failed to delete contraindication. Please try again.');
      }
    });
  }
}
