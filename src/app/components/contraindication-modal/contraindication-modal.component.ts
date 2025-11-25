import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { ApiService } from '../../services/api.service';
import { StateService } from '../../services/state.service';
import { APBContraindicationItem } from '../../models/api.models';
import { forkJoin } from 'rxjs';

interface ContraindicationSelection {
  code: string;
  name: string;
  category: 'hypersensitivity' | 'pathology' | 'physiologicalCondition';
  selected: boolean;
}

@Component({
  selector: 'app-contraindication-modal',
  standalone: true,
  imports: [CommonModule, TranslocoModule],
  templateUrl: './contraindication-modal.component.html',
  styleUrls: ['./contraindication-modal.component.scss']
})
export class ContraindicationModalComponent implements OnInit {
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  isLoading = true;
  isSaving = false;
  errorMessage = '';
  
  contraindications: ContraindicationSelection[] = [];
  filteredContraindications: ContraindicationSelection[] = [];
  searchTerm = '';
  selectedCategory: 'all' | 'hypersensitivity' | 'pathology' | 'physiologicalCondition' = 'all';

  constructor(
    private apiService: ApiService,
    private stateService: StateService
  ) {}

  ngOnInit() {
    this.loadContraindications();
  }

  loadContraindications() {
    this.isLoading = true;
    this.errorMessage = '';

    this.apiService.getAPBContraindications({ language: 'NL' }).subscribe({
      next: (response) => {
        const selections: ContraindicationSelection[] = [];

        response.result.hypersensitivities.list.forEach(item => {
          selections.push({
            code: item.code,
            name: item.description,
            category: 'hypersensitivity',
            selected: false
          });
        });

        response.result.pathologies.list.forEach(item => {
          selections.push({
            code: item.code,
            name: item.description,
            category: 'pathology',
            selected: false
          });
        });

        response.result.physiologicalConditions.list.forEach(item => {
          selections.push({
            code: item.code,
            name: item.description,
            category: 'physiologicalCondition',
            selected: false
          });
        });

        this.contraindications = selections;
        this.applyFilters();
        this.isLoading = false;
      },
      error: (error) => {
        this.errorMessage = 'Failed to load contraindications from APB. Please try again.';
        this.isLoading = false;
      }
    });
  }

  applyFilters() {
    let filtered = this.contraindications;

    // Filter by category
    if (this.selectedCategory !== 'all') {
      filtered = filtered.filter(c => c.category === this.selectedCategory);
    }

    // Filter by search term
    if (this.searchTerm.trim()) {
      const search = this.searchTerm.toLowerCase();
      filtered = filtered.filter(c => 
        c.name.toLowerCase().includes(search) || 
        c.code.toLowerCase().includes(search)
      );
    }

    this.filteredContraindications = filtered;
  }

  onSearchChange(event: Event) {
    this.searchTerm = (event.target as HTMLInputElement).value;
    this.applyFilters();
  }

  onCategoryChange(category: 'all' | 'hypersensitivity' | 'pathology' | 'physiologicalCondition') {
    this.selectedCategory = category;
    this.applyFilters();
  }

  toggleSelection(contraindication: ContraindicationSelection) {
    contraindication.selected = !contraindication.selected;
  }

  getSelectedCount(): number {
    return this.contraindications.filter(c => c.selected).length;
  }

  getCategoryLabel(category: string): string {
    switch(category) {
      case 'hypersensitivity': return 'Hypersensitivity';
      case 'pathology': return 'Pathology';
      case 'physiologicalCondition': return 'Physiological Condition';
      default: return category;
    }
  }

  onCancel() {
    this.close.emit();
  }

  onSave() {
    const selected = this.contraindications.filter(c => c.selected);
    
    if (selected.length === 0) {
      this.close.emit();
      return;
    }

    const apbNumber = this.stateService.apbNumber;
    const medicationReviewId = this.stateService.medicationReviewId;
    if (!medicationReviewId) {
      this.errorMessage = 'No medication review selected';
      return;
    }

    this.isSaving = true;
    this.errorMessage = '';

    // Create array of add requests
    const addRequests = selected.map(item => 
      this.apiService.addContraindication(
        apbNumber,
        medicationReviewId,
        {
          name: item.name,
          contraindicationCode: item.code
        }
      )
    );

    // Execute all requests in parallel
    forkJoin(addRequests).subscribe({
      next: (responses) => {
        this.isSaving = false;
        this.saved.emit();
        this.close.emit();
      },
      error: (error) => {
        this.errorMessage = 'Failed to save contraindications. Please try again.';
        this.isSaving = false;
      }
    });
  }
}
