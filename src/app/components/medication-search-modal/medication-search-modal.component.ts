import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
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
export class MedicationSearchModalComponent implements AfterViewInit {
  @Input() isEditMode = false;
  @Output() close = new EventEmitter<void>();
  @Output() medicationSelected = new EventEmitter<MedicationSearchResult>();
  @ViewChild('searchInput') searchInput!: ElementRef;

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

  ngAfterViewInit() {
    // Focus the search input after the view is initialized
    if (this.searchInput) {
      setTimeout(() => {
        this.searchInput.nativeElement.focus();
      }, 100);
    }
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
        this.searchResults = response.results;
        this.isSearching = false;
      },
      error: (error) => {
        this.errorMessage = 'Search failed. Please try again.';
        this.searchResults = [];
        this.isSearching = false;
      }
    });
  }

  selectMedication(medication: MedicationSearchResult) {
    // Warn user if medication has no VMP
    if (!medication.vmp) {
      const confirmed = confirm(
        `WARNING: This medication does not have a VMP (Virtual Medicinal Product) code.\n\n` +
        `The Therapy Adherence tool will only work if the CNK code (${medication.cnk}) matches the dispensing history EXACTLY.\n\n` +
        `Different package sizes or brands of the same medication will NOT be linked unless they have matching VMP codes.\n\n` +
        `Do you want to continue adding this medication?`
      );
      if (!confirmed) {
        return;
      }
    }
    this.medicationSelected.emit(medication);
    this.onCancel();
  }

  hasVmp(medication: MedicationSearchResult): boolean {
    return !!medication.vmp;
  }

  onCancel() {
    this.close.emit();
  }
}
