import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';
import { ApiService } from '../../services/api.service';
import { StateService } from '../../services/state.service';
import { DispensingHistoryResponse, DispensingMoment } from '../../models/api.models';

@Component({
  selector: 'app-manage-moments-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslocoModule],
  templateUrl: './manage-moments-modal.component.html',
  styleUrls: ['./manage-moments-modal.component.scss']
})
export class ManageMomentsModalComponent implements OnInit {
  @Output() close = new EventEmitter<void>();
  @Output() momentsDeleted = new EventEmitter<void>();

  dispensingHistory: DispensingHistoryResponse | null = null;
  selectedCnk: string = '';
  filteredMoments: DispensingMoment[] = [];
  deletingIds = new Set<string>();
  
  loading = false;
  error: string | null = null;

  constructor(
    private apiService: ApiService,
    private stateService: StateService
  ) {}

  ngOnInit() {
    this.loadDispensingHistory();
  }

  loadDispensingHistory() {
    const apbNumber = this.stateService.apbNumber;
    const reviewId = this.stateService.medicationReviewId;

    if (!apbNumber || !reviewId) {
      this.error = 'Session data not available. Please log in again.';
      return;
    }

    this.loading = true;
    this.error = null;

    this.apiService.queryDispensingHistory(apbNumber, reviewId).subscribe({
      next: (response) => {
        this.dispensingHistory = response;
        this.loading = false;
        
        // Auto-select first medication if available
        if (response.dispensingData && response.dispensingData.length > 0) {
          this.selectedCnk = response.dispensingData[0].cnk;
          this.onMedicationSelected();
        }
      },
      error: (err) => {
        console.error('Error loading dispensing history:', err);
        this.loading = false;
        this.error = err.status === 404 
          ? 'No dispensing history found. Please upload a CSV file or add manual moments first.'
          : 'Failed to load dispensing history';
      }
    });
  }

  onMedicationSelected() {
    if (!this.dispensingHistory || !this.selectedCnk) {
      this.filteredMoments = [];
      return;
    }

    const cnkGroup = this.dispensingHistory.dispensingData.find(
      group => group.cnk === this.selectedCnk
    );

    if (cnkGroup) {
      // Only show manual moments (can be deleted)
      this.filteredMoments = cnkGroup.dispensingMoments.filter(
        moment => moment.source === 'manual'
      );
    } else {
      this.filteredMoments = [];
    }
  }

  getMedicationName(cnk: string): string {
    if (!this.dispensingHistory) return cnk;
    
    const cnkGroup = this.dispensingHistory.dispensingData.find(
      group => group.cnk === cnk
    );
    
    return cnkGroup ? cnkGroup.description : cnk;
  }

  formatDate(isoDate: string): string {
    // Handle both DD/MM/YYYY and YYYY-MM-DD formats
    if (isoDate.includes('/')) {
      return isoDate; // Already in DD/MM/YYYY format
    }
    
    const date = new Date(isoDate);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  deleteMoment(moment: DispensingMoment) {
    if (!moment.id) {
      this.error = 'Cannot delete: moment ID is missing';
      return;
    }

    const confirmed = confirm(
      `Delete this dispensing moment?\n\n` +
      `Date: ${this.formatDate(moment.date)}\n` +
      `Amount: ${moment.amount}`
    );

    if (!confirmed) {
      return;
    }

    const apbNumber = this.stateService.apbNumber;
    const reviewId = this.stateService.medicationReviewId;

    if (!apbNumber || !reviewId) {
      this.error = 'Session data not available. Please log in again.';
      return;
    }

    this.deletingIds.add(moment.id);
    this.error = null;

    this.apiService.deleteManualDispensingMoment(apbNumber, reviewId, moment.id).subscribe({
      next: (response) => {
        console.log('Deleted manual dispensing moment:', response);
        this.deletingIds.delete(moment.id!);
        
        // Remove from local data
        this.removeFromLocalData(moment.id!);
        
        // Notify parent to refresh
        this.momentsDeleted.emit();
      },
      error: (err) => {
        this.deletingIds.delete(moment.id!);
        
        if (err.status === 404) {
          // Already deleted, remove from local data
          this.removeFromLocalData(moment.id!);
          this.momentsDeleted.emit();
        } else {
          this.error = err.error?.error || 'Failed to delete dispensing moment';
        }
        
        console.error('Delete manual dispensing moment failed:', err);
      }
    });
  }

  private removeFromLocalData(id: string) {
    if (!this.dispensingHistory) return;

    for (const cnkGroup of this.dispensingHistory.dispensingData) {
      const momentIndex = cnkGroup.dispensingMoments.findIndex(m => m.id === id);
      if (momentIndex !== -1) {
        cnkGroup.dispensingMoments.splice(momentIndex, 1);
        if (this.dispensingHistory.manualMoments !== undefined) {
          this.dispensingHistory.manualMoments--;
        }
        this.dispensingHistory.totalDispensingMoments--;
        
        // Refresh filtered moments
        this.onMedicationSelected();
        
        // If CNK group is now empty, remove it
        if (cnkGroup.dispensingMoments.length === 0) {
          const cnkIndex = this.dispensingHistory.dispensingData.indexOf(cnkGroup);
          this.dispensingHistory.dispensingData.splice(cnkIndex, 1);
          this.dispensingHistory.totalCnkCodes--;
          
          // Select first remaining medication or clear selection
          if (this.dispensingHistory.dispensingData.length > 0) {
            this.selectedCnk = this.dispensingHistory.dispensingData[0].cnk;
            this.onMedicationSelected();
          } else {
            this.selectedCnk = '';
            this.filteredMoments = [];
          }
        }
        
        break;
      }
    }
  }

  isDeleting(id: string | undefined): boolean {
    return id ? this.deletingIds.has(id) : false;
  }

  closeModal() {
    this.close.emit();
  }
}
