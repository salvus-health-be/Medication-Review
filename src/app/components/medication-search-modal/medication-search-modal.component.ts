import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import { MedicationSearchResult } from '../../models/api.models';

@Component({
  selector: 'app-medication-search-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslocoModule],
  templateUrl: './medication-search-modal.component.html',
  styleUrls: ['./medication-search-modal.component.scss']
})
export class MedicationSearchModalComponent {
  @Input() isEditMode = false;
  @Output() close = new EventEmitter<void>();
  @Output() medicationSelected = new EventEmitter<MedicationSearchResult>();

  searchTerm = '';
  searchResults: MedicationSearchResult[] = [];
  isSearching = false;
  errorMessage = '';
  
  private searchSubject = new Subject<string>();

  constructor(private apiService: ApiService) {
    // Set up debounced search
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(term => {
      if (term.trim().length >= 2) {
        this.performSearch(term);
      } else {
        this.searchResults = [];
      }
    });
  }

  onSearchInput(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.searchTerm = value;
    this.searchSubject.next(value);
  }

  performSearch(term: string) {
    this.isSearching = true;
    this.errorMessage = '';

    this.apiService.searchMedications({ searchTerm: term, maxResults: 20 }).subscribe({
      next: (response) => {
        console.log('[MedicationSearchModal] RAW BACKEND RESPONSE:', JSON.stringify(response, null, 2));
        this.searchResults = response.results;
        this.isSearching = false;
      },
      error: (error) => {
        console.error('[MedicationSearchModal] Search failed:', error);
        this.errorMessage = 'Search failed. Please try again.';
        this.searchResults = [];
        this.isSearching = false;
      }
    });
  }

  selectMedication(medication: MedicationSearchResult) {
    console.log('[MedicationSearchModal] Medication selected:', medication);
    this.medicationSelected.emit(medication);
    this.onCancel();
  }

  onCancel() {
    this.close.emit();
  }
}
