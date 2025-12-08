import { Component, Output, EventEmitter, OnInit, OnDestroy, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { ApiService, GheopsToolResult, AnticholinergicResult, MedicationToAvoidResult, FallRiskResult } from '../../services/api.service';
import { StateService } from '../../services/state.service';
import { Medication } from '../../models/api.models';
import { Subject, forkJoin, of } from 'rxjs';
import { takeUntil, catchError } from 'rxjs/operators';

// Category keys based on the type field from the API (lijst_1, lijst_2, etc.) plus special categories
type GheopsCategoryKey = 'lijst_1' | 'lijst_2' | 'lijst_3' | 'lijst_4' | 'lijst_5' | 'anticholinergic' | 'medication_to_avoid' | 'fall_risk';

interface GheopsWarning {
  id: string;
  cnk: string;
  atcCode: string | null;
  medicationName: string | null;
  criteria: string;
  rationale: string;
  alternative: string;
  category: GheopsCategoryKey;
  isExpanded: boolean;
  strength?: 'H' | 'L' | 'A' | null; // For anticholinergic medications
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

        // Call all APIs in parallel
        forkJoin({
          gheops: this.apiService.queryGheops(cnkCodes).pipe(
            catchError(err => {
              console.error('GheOPS API error:', err);
              return of([] as GheopsToolResult[]);
            })
          ),
          anticholinergics: this.apiService.queryAnticholinergics(cnkCodes).pipe(
            catchError(err => {
              console.error('Anticholinergics API error:', err);
              return of([] as AnticholinergicResult[]);
            })
          ),
          medicationToAvoid: this.apiService.getMedicationToAvoid(cnkCodes).pipe(
            catchError(err => {
              console.error('Medication to avoid API error:', err);
              return of([] as MedicationToAvoidResult[]);
            })
          ),
          fallRisk: this.apiService.getFallRiskMedications(cnkCodes).pipe(
            catchError(err => {
              console.error('Fall risk API error:', err);
              return of([] as FallRiskResult[]);
            })
          )
        }).subscribe({
          next: (results) => {
            console.log('GheOPS: Received results:', results.gheops);
            console.log('Anticholinergics: Received results:', results.anticholinergics);
            console.log('Medication to avoid: Received results:', results.medicationToAvoid);
            console.log('Fall risk: Received results:', results.fallRisk);
            this.processGheopsResults(results.gheops, results.anticholinergics, results.medicationToAvoid, results.fallRisk);
          },
          error: (err) => {
            console.error('Failed to load data:', err);
            this.error = this.transloco.translate('tools.gheops_load_error') || 'Failed to load data';
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

  private processGheopsResults(results: GheopsToolResult[], anticholinergics: AnticholinergicResult[], medicationToAvoid: MedicationToAvoidResult[], fallRisk: FallRiskResult[]) {
    // Initialize arrays for each category
    const categoryWarnings: Record<GheopsCategoryKey, GheopsWarning[]> = {
      lijst_1: [],
      lijst_2: [],
      lijst_3: [],
      lijst_4: [],
      lijst_5: [],
      anticholinergic: [],
      medication_to_avoid: [],
      fall_risk: []
    };
    
    // Track seen entries per category to avoid duplicates (by criteria + rationale combo)
    const seenEntries: Record<GheopsCategoryKey, Set<string>> = {
      lijst_1: new Set(),
      lijst_2: new Set(),
      lijst_3: new Set(),
      lijst_4: new Set(),
      lijst_5: new Set(),
      anticholinergic: new Set(),
      medication_to_avoid: new Set(),
      fall_risk: new Set()
    };
    
    let warningIndex = 0;

    results.forEach(result => {
      // Find medication name for this CNK
      const med = this.medications.find(m => String(m.cnk).padStart(7, '0') === result.cnk);
      const medicationName = med?.name || null;

      // Process each entry for this CNK
      result.entries.forEach(entry => {
        // Normalize the type to our category key format
        const categoryKey = this.normalizeType(entry.type);
        if (!categoryKey) return;

        // Create a unique key for deduplication
        const uniqueKey = `${entry.criteria}|${entry.rationale}`;
        if (seenEntries[categoryKey].has(uniqueKey)) {
          return;
        }
        seenEntries[categoryKey].add(uniqueKey);

        categoryWarnings[categoryKey].push({
          id: `gheops-warning-${warningIndex++}`,
          cnk: result.cnk,
          atcCode: result.atcCode,
          medicationName,
          criteria: entry.criteria || '',
          rationale: entry.rationale || '',
          alternative: entry.alternative || '',
          category: categoryKey,
          isExpanded: false
        });
      });
    });

    // Category metadata with translation keys
    const categoryMeta: { key: GheopsCategoryKey; translationKey: string }[] = [
      { key: 'lijst_1', translationKey: 'tools.gheops_lijst_1' },
      { key: 'lijst_2', translationKey: 'tools.gheops_lijst_2' },
      { key: 'lijst_3', translationKey: 'tools.gheops_lijst_3' },
      { key: 'lijst_4', translationKey: 'tools.gheops_lijst_4' },
      { key: 'lijst_5', translationKey: 'tools.gheops_lijst_5' },
      { key: 'anticholinergic', translationKey: 'tools.gheops_anticholinergic' },
      { key: 'medication_to_avoid', translationKey: 'tools.gheops_medication_to_avoid' },
      { key: 'fall_risk', translationKey: 'tools.gheops_fall_risk' }
    ];

    // Process fall risk results
    fallRisk.forEach(result => {
      if (!result.increasesRiskOfFalling) return;

      // Find medication name for this CNK
      const med = this.medications.find(m => String(m.cnk).padStart(7, '0') === result.cnk);
      const medicationName = med?.name || null;

      // Deduplicate by CNK (only one entry per medication)
      if (seenEntries.fall_risk.has(result.cnk)) return;
      seenEntries.fall_risk.add(result.cnk);

      categoryWarnings.fall_risk.push({
        id: `gheops-warning-${warningIndex++}`,
        cnk: result.cnk,
        atcCode: result.atcCode,
        medicationName,
        criteria: this.transloco.translate('tools.gheops_fall_risk_label'),
        rationale: this.transloco.translate('tools.gheops_fall_risk_rationale'),
        alternative: '',
        category: 'fall_risk',
        isExpanded: false
      });
    });

    // Process medication to avoid results
    medicationToAvoid.forEach(result => {
      if (!result.shouldAvoid) return;

      // Find medication name for this CNK
      const med = this.medications.find(m => String(m.cnk).padStart(7, '0') === result.cnk);
      const medicationName = med?.name || null;

      // Deduplicate by CNK (only one entry per medication)
      if (seenEntries.medication_to_avoid.has(result.cnk)) return;
      seenEntries.medication_to_avoid.add(result.cnk);

      categoryWarnings.medication_to_avoid.push({
        id: `gheops-warning-${warningIndex++}`,
        cnk: result.cnk,
        atcCode: result.atcCode,
        medicationName,
        criteria: this.transloco.translate('tools.gheops_medication_to_avoid_label'),
        rationale: '',
        alternative: '',
        category: 'medication_to_avoid',
        isExpanded: false
      });
    });

    // Process anticholinergic results
    anticholinergics.forEach(result => {
      if (!result.isAnticholinergic) return;

      // Find medication name for this CNK
      const med = this.medications.find(m => String(m.cnk).padStart(7, '0') === result.cnk);
      const medicationName = med?.name || null;

      // Deduplicate by CNK (only one entry per medication for anticholinergics)
      if (seenEntries.anticholinergic.has(result.cnk)) return;
      seenEntries.anticholinergic.add(result.cnk);

      const strengthLabel = this.getStrengthLabel(result.strength);
      const strengthRationale = this.getStrengthRationale(result.strength);

      categoryWarnings.anticholinergic.push({
        id: `gheops-warning-${warningIndex++}`,
        cnk: result.cnk,
        atcCode: result.atcCode,
        medicationName,
        criteria: strengthLabel,
        rationale: strengthRationale,
        alternative: '',
        category: 'anticholinergic',
        isExpanded: false,
        strength: result.strength
      });
    });

    // Build categories array (only include non-empty categories)
    this.categories = categoryMeta
      .filter(meta => categoryWarnings[meta.key].length > 0)
      .map(meta => ({
        key: meta.key,
        name: this.transloco.translate(meta.translationKey),
        isExpanded: true,
        warnings: categoryWarnings[meta.key]
      }));

    this.isLoading = false;
    
    // Emit the total warning count
    this.warningsLoaded.emit(this.totalWarnings);
  }

  private normalizeType(type: string): GheopsCategoryKey | null {
    if (!type) return null;
    
    // Handle various formats: "lijst_1", "Lijst_1", "LIJST_1", "lijst 1", etc.
    const normalized = type.toLowerCase().replace(/\s+/g, '_').trim();
    
    if (normalized === 'lijst_1' || normalized === 'lijst1') return 'lijst_1';
    if (normalized === 'lijst_2' || normalized === 'lijst2') return 'lijst_2';
    if (normalized === 'lijst_3' || normalized === 'lijst3') return 'lijst_3';
    if (normalized === 'lijst_4' || normalized === 'lijst4') return 'lijst_4';
    if (normalized === 'lijst_5' || normalized === 'lijst5') return 'lijst_5';
    
    return null;
  }

  toggleCategory(category: GheopsCategory) {
    category.isExpanded = !category.isExpanded;
  }

  toggleWarning(warning: GheopsWarning, event: Event) {
    event.stopPropagation();
    warning.isExpanded = !warning.isExpanded;
  }

  onAddNote(warning: GheopsWarning, event: Event) {
    event.stopPropagation();
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

  private getStrengthLabel(strength: 'H' | 'L' | 'A' | null): string {
    switch (strength) {
      case 'H':
        return this.transloco.translate('tools.gheops_anticholinergic_high');
      case 'L':
        return this.transloco.translate('tools.gheops_anticholinergic_low');
      case 'A':
        return this.transloco.translate('tools.gheops_anticholinergic_additional');
      default:
        return '';
    }
  }

  private getStrengthRationale(strength: 'H' | 'L' | 'A' | null): string {
    switch (strength) {
      case 'H':
        return this.transloco.translate('tools.gheops_anticholinergic_high_rationale');
      case 'L':
        return this.transloco.translate('tools.gheops_anticholinergic_low_rationale');
      case 'A':
        return this.transloco.translate('tools.gheops_anticholinergic_additional_rationale');
      default:
        return '';
    }
  }
}