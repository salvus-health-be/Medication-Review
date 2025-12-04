import { Component, Output, EventEmitter, OnInit, OnDestroy, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { ApiService, GheopsResult } from '../../services/api.service';
import { StateService } from '../../services/state.service';
import { Medication } from '../../models/api.models';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

type GheopsCategoryKey = 
  | 'unfit_medication' 
  | 'unfit_medication_comorbidity'
  | 'potentially_missing_medication'
  | 'potential_interactions'
  | 'potentially_ineffective_unsafe'
  | 'special_care_medication'
  | 'anticholinergic_drug'
  | 'fall_risk_drug';

interface GheopsWarning {
  id: string;
  cnk: string;
  atcCode: string | null;
  medicationName: string | null;
  warningText: string;
  category: GheopsCategoryKey;
}

interface GheopsCategory {
  key: GheopsCategoryKey;
  name: string;
  isExpanded: boolean;
  warnings: GheopsWarning[];
}

@Component({
  selector: 'app-gheops',
  standalone: true,
  imports: [CommonModule, TranslocoModule],
  templateUrl: './gheops.component.html',
  styleUrls: ['./gheops.component.scss']
})
export class GheopsComponent implements OnInit, OnDestroy {
  @Output() openNotes = new EventEmitter<{ warning: GheopsWarning } | void>();
  @Output() warningsLoaded = new EventEmitter<number>();
  @Input() medications: Medication[] = [];

  categories: GheopsCategory[] = [];
  isLoading = true;
  error: string | null = null;
  
  private destroy$ = new Subject<void>();

  constructor(
    private apiService: ApiService,
    private stateService: StateService,
    private transloco: TranslocoService
  ) {}

  ngOnInit() {
    // Subscribe to medications changes
    this.stateService.medicationsChanged$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadGheopsData();
      });

    // Initial load
    this.loadGheopsData();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadGheopsData() {
    this.isLoading = true;
    this.error = null;

    const apbNumber = this.stateService.apbNumber;
    const reviewId = this.stateService.medicationReviewId;

    if (!apbNumber || !reviewId) {
      this.error = 'Session data not available';
      this.isLoading = false;
      this.warningsLoaded.emit(0);
      return;
    }

    // Get medications first
    this.apiService.getMedications(apbNumber, reviewId).subscribe({
      next: (medications) => {
        this.medications = medications;
        
        // Extract CNK codes from medications, padded to 7 digits
        const cnkCodes = medications
          .filter(m => m.cnk != null)
          .map(m => String(m.cnk).padStart(7, '0'));

        console.log('GheOPS: Sending CNK codes:', cnkCodes);

        if (cnkCodes.length === 0) {
          this.categories = [];
          this.isLoading = false;
          this.warningsLoaded.emit(0);
          return;
        }

        // Call the GheOPS API
        this.apiService.readGheops(cnkCodes).subscribe({
          next: (results) => {
            console.log('GheOPS: Received results:', results);
            this.processGheopsResults(results);
          },
          error: (err) => {
            console.error('Failed to load GheOPS data:', err);
            this.error = this.transloco.translate('tools.gheops_load_error') || 'Failed to load GheOPS data';
            this.isLoading = false;
            this.warningsLoaded.emit(0);
          }
        });
      },
      error: (err) => {
        console.error('Failed to load medications:', err);
        this.error = this.transloco.translate('tools.gheops_load_error') || 'Failed to load medications';
        this.isLoading = false;
        this.warningsLoaded.emit(0);
      }
    });
  }

  private processGheopsResults(results: GheopsResult[]) {
    // Initialize arrays for each category
    const categoryWarnings: Record<GheopsCategoryKey, GheopsWarning[]> = {
      unfit_medication: [],
      unfit_medication_comorbidity: [],
      potentially_missing_medication: [],
      potential_interactions: [],
      potentially_ineffective_unsafe: [],
      special_care_medication: [],
      anticholinergic_drug: [],
      fall_risk_drug: []
    };
    
    // Track seen warning texts per category to avoid duplicates
    const seenTexts: Record<GheopsCategoryKey, Set<string>> = {
      unfit_medication: new Set(),
      unfit_medication_comorbidity: new Set(),
      potentially_missing_medication: new Set(),
      potential_interactions: new Set(),
      potentially_ineffective_unsafe: new Set(),
      special_care_medication: new Set(),
      anticholinergic_drug: new Set(),
      fall_risk_drug: new Set()
    };
    let warningIndex = 0;

    results.forEach(result => {
      // Find medication name for this CNK
      const med = this.medications.find(m => String(m.cnk).padStart(7, '0') === result.cnk);
      const medicationName = med?.name || null;

      // Helper to add warnings from an array to a category (only if text not already seen)
      const addWarnings = (texts: string[], category: GheopsCategoryKey) => {
        if (!texts || !Array.isArray(texts)) return;
        
        texts.forEach(text => {
          if (text && text.trim() !== '') {
            const normalizedText = text.trim();
            // Skip if we've already seen this exact text in this category
            if (seenTexts[category].has(normalizedText)) {
              return;
            }
            seenTexts[category].add(normalizedText);
            
            categoryWarnings[category].push({
              id: `gheops-warning-${warningIndex++}`,
              cnk: result.cnk,
              atcCode: result.atcCode,
              medicationName,
              warningText: normalizedText,
              category
            });
          }
        });
      };

      // Add warnings to each category (each field is now an array)
      addWarnings(result.unfitMedication, 'unfit_medication');
      addWarnings(result.unfitMedicationComorbidity, 'unfit_medication_comorbidity');
      addWarnings(result.potentiallyMissingMedication, 'potentially_missing_medication');
      addWarnings(result.potentialInteractions, 'potential_interactions');
      addWarnings(result.potentiallyIneffectiveUnsafe, 'potentially_ineffective_unsafe');
      addWarnings(result.specialCareMedication, 'special_care_medication');
      addWarnings(result.anticholinergicDrug, 'anticholinergic_drug');
      addWarnings(result.fallRiskDrug, 'fall_risk_drug');
    });

    // Category metadata with translation keys
    const categoryMeta: { key: GheopsCategoryKey; translationKey: string; fallback: string }[] = [
      { key: 'unfit_medication', translationKey: 'tools.gheops_unfit_medication', fallback: 'Potentially Inappropriate Medications' },
      { key: 'unfit_medication_comorbidity', translationKey: 'tools.gheops_unfit_medication_comorbidity', fallback: 'Inappropriate Medications (Comorbidity)' },
      { key: 'potentially_missing_medication', translationKey: 'tools.gheops_potentially_missing', fallback: 'Potentially Missing Medications' },
      { key: 'potential_interactions', translationKey: 'tools.gheops_potential_interactions', fallback: 'Potential Interactions' },
      { key: 'potentially_ineffective_unsafe', translationKey: 'tools.gheops_ineffective_unsafe', fallback: 'Potentially Ineffective/Unsafe' },
      { key: 'special_care_medication', translationKey: 'tools.gheops_special_care', fallback: 'Special Care Required' },
      { key: 'anticholinergic_drug', translationKey: 'tools.gheops_anticholinergic', fallback: 'Anticholinergic Medications' },
      { key: 'fall_risk_drug', translationKey: 'tools.gheops_fall_risk', fallback: 'Fall Risk Medications' }
    ];

    // Build categories array (only include non-empty categories)
    this.categories = categoryMeta
      .filter(meta => categoryWarnings[meta.key].length > 0)
      .map(meta => ({
        key: meta.key,
        name: this.transloco.translate(meta.translationKey) || meta.fallback,
        isExpanded: true,
        warnings: categoryWarnings[meta.key]
      }));

    this.isLoading = false;
    
    // Emit the total warning count
    this.warningsLoaded.emit(this.totalWarnings);
  }

  toggleCategory(category: GheopsCategory) {
    category.isExpanded = !category.isExpanded;
  }

  onAddNote(warning: GheopsWarning) {
    this.openNotes.emit({ warning });
  }

  onAddGeneralNote() {
    this.openNotes.emit();
  }

  refreshData() {
    this.loadGheopsData();
  }

  openFullPdf() {
    const pdfUrl = this.apiService.getReferenceDocumentUrl('gheops');
    window.open(pdfUrl, '_blank');
  }

  get hasWarnings(): boolean {
    return this.categories.some(c => c.warnings.length > 0);
  }

  get totalWarnings(): number {
    return this.categories.reduce((sum, c) => sum + c.warnings.length, 0);
  }
}