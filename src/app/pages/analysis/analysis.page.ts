import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { Router } from '@angular/router';
import { Medication } from '../../components/medication-item/medication-item.component';
import { AnalysisMedicationItemComponent } from '../../components/analysis-medication-item/analysis-medication-item.component';
import { AnalysisToolbarComponent, ToolType } from '../../components/analysis-toolbar/analysis-toolbar.component';
import { MedicationSearchModalComponent } from '../../components/medication-search-modal/medication-search-modal.component';
import { MedicationNotesModalComponent } from '../../components/medication-notes-modal/medication-notes-modal.component';
import { InteractionNotesModalComponent } from '../../components/interaction-notes-modal/interaction-notes-modal.component';
import { NoteOverviewModalComponent } from '../../components/note-overview-modal/note-overview-modal.component';
import { TherapyAdherenceComponent } from '../../components/therapy-adherence/therapy-adherence.component';
import { InteractionsComponent } from '../../components/interactions/interactions.component';
import { ContraindicationsComponent } from '../../components/contraindications/contraindications.component';
import { PosologyComponent } from '../../components/posology/posology.component';
import { RenadaptorComponent } from '../../components/renadaptor/renadaptor.component';
import { GheopsComponent } from '../../components/gheops/gheops.component';
import { StartStopComponent } from '../../components/start-stop/start-stop.component';
import { QuestionnaireComponent } from '../../components/questionnaire/questionnaire.component';
import { MedicationSearchResult, Medication as ApiMedication } from '../../models/api.models';
import { ApiService } from '../../services/api.service';
import { StateService } from '../../services/state.service';
import { InteractionsCacheService } from '../../services/interactions-cache.service';
import { ContraindicationsCacheService } from '../../services/contraindications-cache.service';
import { Subject, forkJoin, of } from 'rxjs';
import { debounceTime, takeUntil, catchError } from 'rxjs/operators';

@Component({
  selector: 'app-analysis',
  imports: [CommonModule, FormsModule, TranslocoModule, AnalysisMedicationItemComponent, AnalysisToolbarComponent, MedicationSearchModalComponent, MedicationNotesModalComponent, InteractionNotesModalComponent, NoteOverviewModalComponent, TherapyAdherenceComponent, InteractionsComponent, ContraindicationsComponent, PosologyComponent, RenadaptorComponent, GheopsComponent, StartStopComponent, QuestionnaireComponent],
  templateUrl: './analysis.page.html',
  styleUrls: ['./analysis.page.scss']
})
export class AnalysisPage implements OnInit, OnDestroy {
  medications: Medication[] = [];
  isLoading = false;
  activeTool: ToolType | null = 'medication-schema'; // Default to medication schema
  showSearchModal = false;
  editingMedication: Medication | null = null;
  showNotesModal = false;
  selectedMedicationForNotes: Medication | null = null;
  noteCategory: string = 'General'; // Track category based on tool/source
  noteInitialText: string = ''; // Pre-filled note text
  showInteractionNotesModal = false;
  selectedInteraction: any = null;
  selectedInteractionType: 'drug-drug' | 'drug-food' = 'drug-drug';
  showNoteOverviewModal = false;
  interactionCount = 0;
  contraindicationCount = 0;
  gheopsWarningCount = 0;

  @ViewChild(TherapyAdherenceComponent) therapyAdherenceComponent?: TherapyAdherenceComponent;
  @ViewChild(InteractionsComponent) interactionsComponent?: InteractionsComponent;
  @ViewChild(ContraindicationsComponent) contraindicationsComponent?: ContraindicationsComponent;
  @ViewChild(PosologyComponent) posologyComponent?: PosologyComponent;
  @ViewChild(RenadaptorComponent) renadaptorComponent?: RenadaptorComponent;
  @ViewChild(GheopsComponent) gheopsComponent?: GheopsComponent;

  private schemaChangeSubject = new Subject<Medication>();
  private destroy$ = new Subject<void>();

  private toolTitles: Record<ToolType, string> = {
    'medication-schema': 'medication.medication_schema',
    'therapy-adherence': 'tools.therapy_adherence',
    'interactions': 'tools.interactions',
    'contra-indications': 'tools.contraindications',
    'posology': 'tools.posology',
    'renadapter': 'tools.renadaptor',
  'gheops': 'tools.gheops',
    'start-stop-nl': 'tools.start_stop',
    'questionnaire': 'Questionnaire'
  };

  constructor(
    private apiService: ApiService,
    private stateService: StateService,
    private router: Router,
    private transloco: TranslocoService,
    private interactionsCache: InteractionsCacheService,
    private contraindicationsCache: ContraindicationsCacheService
  ) {}

  ngOnInit() {
    // Enable cache services for this page
    this.interactionsCache.setEnabled(true);
    this.contraindicationsCache.setEnabled(true);
    
    this.loadMedications();
    
    // Set up debounced auto-save for schema changes
    this.schemaChangeSubject
      .pipe(
        debounceTime(1000),
        takeUntil(this.destroy$)
      )
      .subscribe(medication => {
        this.saveSchemaChanges(medication);
      });

    // Listen for note overview modal requests
    this.stateService.noteOverviewModal$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.openNoteOverview();
      });

    // Subscribe to interactions cache to update count badge
    this.interactionsCache.cache$
      .pipe(takeUntil(this.destroy$))
      .subscribe(cache => {
        if (cache.response && cache.response.result && cache.response.result.interactionMatches) {
          // Count total interactions across all matches
          this.interactionCount = cache.response.result.interactionMatches.reduce((total, match) => {
            return total + (match.interactions?.length || 0);
          }, 0);
        } else {
          this.interactionCount = 0;
        }
      });

    // Trigger initial cache load if not already loaded
    const currentCache = this.interactionsCache.getCacheData();
    if (!currentCache.lastUpdated && !currentCache.loading) {
      this.interactionsCache.refreshCache();
    }

    // Subscribe to contraindications cache to update count badge
    this.contraindicationsCache.cache$
      .pipe(takeUntil(this.destroy$))
      .subscribe(cache => {
        // Only count contraindication matches (patient contraindications), not product contraindications
        if (cache.matchesResponse && cache.matchesResponse.result) {
          this.contraindicationCount = cache.matchesResponse.result.length;
        } else if (cache.patientContraindications && cache.patientContraindications.length > 0 && !cache.loading) {
          // If we have patient contraindications but no matches response, it means either:
          // 1. No medications match the conditions (count = 0, correct)
          // 2. The API failed (we should still show 0, but log the issue)
          this.contraindicationCount = 0;
        } else {
          this.contraindicationCount = 0;
        }
      });

    // Trigger initial contraindications cache load if not already loaded
    const currentContraCache = this.contraindicationsCache.getCacheData();
    if (!currentContraCache.lastUpdated && !currentContraCache.loading) {
      this.contraindicationsCache.refreshCache();
    }

    // Load GheOPS warning count on page init
    this.loadGheopsWarningCount();
  }

  ngOnDestroy() {
    // Disable cache services when leaving this page
    this.interactionsCache.setEnabled(false);
    this.contraindicationsCache.setEnabled(false);
    
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSchemaValueChange(medication: Medication) {
    this.schemaChangeSubject.next(medication);
  }

  private saveSchemaChanges(medication: Medication) {
    const medicationReviewId = this.stateService.medicationReviewId;
    if (!medicationReviewId) {
      return;
    }

    // Helper function to convert empty strings and undefined to null, keep valid numbers
    const parseNumber = (value: any): number | null => {
      if (value === '' || value === null || value === undefined) {
        return null;
      }
      const parsed = Number(value);
      return isNaN(parsed) ? null : parsed;
    };

    // Extract dosage number from dosage string (e.g., "500mg" -> 500)
    const parseDosage = (dosage: string): number | null => {
      if (!dosage) return null;
      const match = dosage.match(/(\d+\.?\d*)/);
      return match ? parseFloat(match[1]) : null;
    };

    // Send complete medication data to prevent data loss
    const updateData = {
      name: medication.name || null,
      cnk: medication.cnk ?? null,
      vmp: medication.vmp ?? null,
      dosageMg: parseDosage(medication.dosage),
      routeOfAdministration: medication.route || null,
      indication: medication.indication ? medication.indication : null,
      asNeeded: medication.asNeeded ?? false,
      specialFrequency: parseNumber(medication.specialFrequency),
      specialDescription: medication.specialDescription || null,
      unitsBeforeBreakfast: parseNumber(medication.unitsBeforeBreakfast),
      unitsDuringBreakfast: parseNumber(medication.unitsDuringBreakfast),
      unitsBeforeLunch: parseNumber(medication.unitsBeforeLunch),
      unitsDuringLunch: parseNumber(medication.unitsDuringLunch),
      unitsBeforeDinner: parseNumber(medication.unitsBeforeDinner),
      unitsDuringDinner: parseNumber(medication.unitsDuringDinner),
      unitsAtBedtime: parseNumber(medication.unitsAtBedtime)
    };

    const apbNumber = this.stateService.apbNumber;
    this.apiService.updateMedication(
      apbNumber,
      medicationReviewId,
      medication.medicationId,
      updateData
    ).subscribe({
      next: (response) => {
        // Refresh therapy adherence if it's the active tool (intake changes affect daily usage)
        if (this.activeTool === 'therapy-adherence' && this.therapyAdherenceComponent) {
          this.therapyAdherenceComponent.refreshData();
        }
      },
      error: (error) => {
      }
    });
  }

  openNotesModal(medication: Medication | ApiMedication | undefined) {
    // Handle general notes (no medication)
    if (!medication) {
      this.noteCategory = 'TherapyAdherence';
      this.noteInitialText = '';
      this.selectedMedicationForNotes = null as any;
      this.showNotesModal = true;
      return;
    }
    
    // Convert ApiMedication to Medication format if needed
    let displayMedication: Medication;
    if ('dosage' in medication && 'route' in medication) {
      // Already in Medication format
      displayMedication = medication as Medication;
    } else {
      // Convert from ApiMedication to Medication
      const apiMed = medication as ApiMedication;
      displayMedication = {
        medicationId: apiMed.medicationId,
        name: apiMed.name || '',
        dosage: apiMed.dosageMg ? `${apiMed.dosageMg}mg` : '',
        route: apiMed.routeOfAdministration || '',
        cnk: apiMed.cnk || null,
        asNeeded: apiMed.asNeeded ?? false,
        vmp: apiMed.vmp || null,
        indication: apiMed.indication || ''
      };
    }
    
    // Set category based on active tool
    this.noteCategory = this.getCategoryForTool(this.activeTool);
    this.noteInitialText = '';
    this.selectedMedicationForNotes = displayMedication;
    this.showNotesModal = true;
  }

  onNotesModalClose() {
    this.showNotesModal = false;
    this.selectedMedicationForNotes = null;
    this.noteInitialText = '';
  }

  openGeneralNotesModal(toolType: string) {
    this.noteCategory = this.getCategoryForTool(toolType as ToolType);
    this.noteInitialText = '';
    this.selectedMedicationForNotes = null as any; // General note, no specific medication
    this.showNotesModal = true;
  }

  openInteractionNotesModal(data: { type: 'drug-drug' | 'drug-food' | 'general', interaction: any }) {
    // Handle general notes separately
    if (data.type === 'general') {
      this.noteCategory = 'Interactions';
      this.selectedMedicationForNotes = null as any; // General note, no specific medication
      this.showNotesModal = true;
      return;
    }
    
    this.selectedInteractionType = data.type;
    this.selectedInteraction = data.interaction;
    this.showInteractionNotesModal = true;
  }

  onInteractionNotesModalClose() {
    this.showInteractionNotesModal = false;
    this.selectedInteraction = null;
  }

  openReferenceNotesModal(toolType: 'gheops' | 'start-stop-nl') {
    // Create a pseudo-medication object with the tool name for context
    const toolNames = {
  'gheops': 'GheOPS Tool',
      'start-stop-nl': 'START-STOP Criteria (NL)'
    };
    
    // Set category based on reference tool type
    this.noteCategory = toolType === 'gheops' ? 'GheOPS' : 'START-STOP-NL';
    this.noteInitialText = ''; // No pre-filled text for general notes
    
    this.selectedMedicationForNotes = {
      medicationId: `ref-${toolType}`,
      name: toolNames[toolType],
      dosage: '',
      route: '',
      cnk: null,
      vmp: null,
      indication: 'Reference Document'
    };
    this.showNotesModal = true;
  }

  openGheopsNotesModal(event: { warning: any } | void) {
    this.noteCategory = 'GheOPS';
    
    if (!event || !event.warning) {
      // General GheOPS note (no specific warning)
      this.noteInitialText = '';
      this.selectedMedicationForNotes = {
        medicationId: 'ref-gheops',
        name: 'GheOPS Tool',
        dosage: '',
        route: '',
        cnk: null,
        vmp: null,
        indication: 'Reference Document'
      };
    } else {
      // Specific warning note - link to the medication
      const warning = event.warning;
      const cnk = warning.cnk ? parseInt(warning.cnk, 10) : null;
      
      // Find the actual medication from our list to get the medicationId
      const medication = this.medications.find(m => 
        m.cnk && String(m.cnk).padStart(7, '0') === warning.cnk
      );
      
      // Build the pre-filled note text
      const categoryLabel = this.getGheopsCategoryLabel(warning.category);
      this.noteInitialText = `[GheOPS - ${categoryLabel}]\n${warning.rationale || warning.criteria || ''}`;
      
      this.selectedMedicationForNotes = {
        medicationId: medication?.medicationId || `gheops-${warning.cnk}`,
        name: warning.medicationName || 'Unknown Medication',
        dosage: '',
        route: '',
        cnk: cnk,
        vmp: medication?.vmp || null,
        indication: categoryLabel
      };
    }
    
    this.showNotesModal = true;
  }

  private getGheopsCategoryLabel(categoryKey: string): string {
    const categoryLabels: Record<string, string> = {
      'lijst_1': this.transloco.translate('tools.gheops_lijst_1'),
      'lijst_2': this.transloco.translate('tools.gheops_lijst_2'),
      'lijst_3': this.transloco.translate('tools.gheops_lijst_3'),
      'lijst_4': this.transloco.translate('tools.gheops_lijst_4'),
      'lijst_5': this.transloco.translate('tools.gheops_lijst_5'),
      'anticholinergic': this.transloco.translate('tools.gheops_anticholinergic'),
      'medication_to_avoid': this.transloco.translate('tools.gheops_medication_to_avoid'),
      'fall_risk': this.transloco.translate('tools.gheops_fall_risk'),
      // Legacy keys for backwards compatibility
      'unfit_medication': this.transloco.translate('tools.gheops_lijst_1'),
      'unfit_medication_comorbidity': this.transloco.translate('tools.gheops_lijst_2'),
      'potentially_missing_medication': this.transloco.translate('tools.gheops_lijst_3'),
      'potential_interactions': this.transloco.translate('tools.gheops_lijst_4'),
      'potentially_ineffective_unsafe': this.transloco.translate('tools.gheops_lijst_5'),
      'special_care_medication': this.transloco.translate('tools.gheops_lijst_5'),
      'anticholinergic_drug': this.transloco.translate('tools.gheops_anticholinergic'),
      'fall_risk_drug': this.transloco.translate('tools.gheops_lijst_1')
    };
    return categoryLabels[categoryKey] || categoryKey;
  }

  openQuestionnaireNotesModal() {
    // Set category to map to Part 1 general questions in the actions page
    this.noteCategory = 'General';
    this.noteInitialText = '';
    this.selectedMedicationForNotes = null as any; // General note, no specific medication
    this.showNotesModal = true;
  }

  openContraindicationNotesModal(data: { type: 'match' | 'product' | 'general', contraindication: any }) {
    // Handle general notes separately
    if (data.type === 'general' || !data.contraindication) {
      this.noteCategory = 'Contraindications';
      this.noteInitialText = '';
      this.selectedMedicationForNotes = null as any; // General note, no specific medication
      this.showNotesModal = true;
      return;
    }
    
    // For specific contraindication notes, create a medication context
    const cnk = data.contraindication.medicationCnk || data.contraindication.cnk;
    const medName = data.contraindication.medication || data.contraindication.medicationName || 'Unknown Medication';
    
    this.noteCategory = 'Contraindications';
    this.noteInitialText = '';
    this.selectedMedicationForNotes = {
      medicationId: `contraindication-${cnk}`,
      name: `${medName} - ${data.contraindication.condition}`,
      dosage: '',
      route: '',
      cnk: cnk ? parseInt(cnk) : null,
      vmp: null,
      indication: data.contraindication.condition
    };
    this.showNotesModal = true;
  }

  loadMedications() {
    const apbNumber = this.stateService.apbNumber;
    const medicationReviewId = this.stateService.medicationReviewId;
    if (!medicationReviewId) {
      this.medications = [];
      return;
    }

    this.isLoading = true;
    
    this.apiService.getMedications(apbNumber, medicationReviewId).subscribe({
      next: (medications) => {
        this.medications = medications.map(med => ({
          medicationId: med.medicationId,
          name: med.name || '',
          dosage: med.dosageMg ? `${med.dosageMg}mg` : '',
          route: med.routeOfAdministration || '',
          cnk: med.cnk ?? null,
          vmp: med.vmp ?? null,
          packageSize: med.packageSize ?? null,
          indication: med.indication ?? null,
          asNeeded: med.asNeeded ?? false,
          specialFrequency: med.specialFrequency ?? null,
          specialDescription: med.specialDescription ?? null,
          unitsBeforeBreakfast: med.unitsBeforeBreakfast ?? null,
          unitsDuringBreakfast: med.unitsDuringBreakfast ?? null,
          unitsBeforeLunch: med.unitsBeforeLunch ?? null,
          unitsDuringLunch: med.unitsDuringLunch ?? null,
          unitsBeforeDinner: med.unitsBeforeDinner ?? null,
          unitsDuringDinner: med.unitsDuringDinner ?? null,
          unitsAtBedtime: med.unitsAtBedtime ?? null
        }));
        
        this.isLoading = false;
      },
      error: (error) => {
        this.medications = [];
        this.isLoading = false;
      }
    });
  }

  onToolSelected(tool: ToolType) {
    this.activeTool = tool;
    
    // Refresh therapy adherence data when that tool is selected
    if (tool === 'therapy-adherence') {
      setTimeout(() => {
        if (this.therapyAdherenceComponent) {
          this.therapyAdherenceComponent.refreshData();
        }
      }, 0);
    }
  }

  getToolTitle(): string {
    return this.activeTool ? this.transloco.translate(this.toolTitles[this.activeTool]) : '';
  }

  getLocalizedPeriod(specialDescription: string): string {
    if (!specialDescription) return '';
    const key = `medication.period_${specialDescription}`;
    return this.transloco.translate(key);
  }

  onMedicationBoxClick(medication: Medication) {
    // Handle clicks based on active tool
    if (this.activeTool === 'interactions' && this.interactionsComponent) {
      this.interactionsComponent.onMedicationClick(medication.medicationId);
    } else if (this.activeTool === 'contra-indications' && this.contraindicationsComponent) {
      this.contraindicationsComponent.onMedicationClick(medication.medicationId);
    } else if (this.activeTool === 'posology' && this.posologyComponent) {
      this.posologyComponent.onMedicationClick(medication.medicationId);
    } else if (this.activeTool === 'renadapter' && this.renadaptorComponent) {
      this.renadaptorComponent.onMedicationClick(medication.medicationId);
    }
  }

  isSelectedForInteractions(medicationId: string): boolean {
    return this.interactionsComponent?.isMedicationSelected(medicationId) ?? false;
  }

  isSelectedForContraindications(medicationId: string): boolean {
    return this.contraindicationsComponent?.isMedicationSelected(medicationId) ?? false;
  }

  isSelectedForPosology(medicationId: string): boolean {
    return this.posologyComponent?.isMedicationSelected(medicationId) ?? false;
  }

  isSelectedForRenadaptor(medicationId: string): boolean {
    return this.renadaptorComponent?.isMedicationSelected(medicationId) ?? false;
  }

  onMedicationDeleted(medicationId: string) {
    this.medications = this.medications.filter(med => med.medicationId !== medicationId);
    
    // Refresh child components
    this.refreshChildComponents();
  }

  onEditRequested(medication: Medication) {
    this.editingMedication = medication;
    this.showSearchModal = true;
  }

  addMedication() {
    this.editingMedication = null;
    this.showSearchModal = true;
  }

  onModalClose() {
    this.showSearchModal = false;
    this.editingMedication = null;
  }

  onMedicationSelected(medication: MedicationSearchResult) {
    const apbNumber = this.stateService.apbNumber;
    const medicationReviewId = this.stateService.medicationReviewId;
    if (!medicationReviewId) {
      return;
    }

    // Check if we're editing an existing medication
    if (this.editingMedication) {
      // Update the existing medication while preserving intake and indication
      this.apiService.updateMedication(
        apbNumber,
        medicationReviewId,
        this.editingMedication.medicationId,
        {
          name: medication.benaming,
          cnk: parseInt(medication.cnk) || undefined,
          vmp: medication.vmp ? parseInt(medication.vmp) : undefined,
          // Preserve existing values
          indication: this.editingMedication.indication || undefined,
          unitsBeforeBreakfast: this.editingMedication.unitsBeforeBreakfast ?? undefined,
          unitsDuringBreakfast: this.editingMedication.unitsDuringBreakfast ?? undefined,
          unitsBeforeLunch: this.editingMedication.unitsBeforeLunch ?? undefined,
          unitsDuringLunch: this.editingMedication.unitsDuringLunch ?? undefined,
          unitsBeforeDinner: this.editingMedication.unitsBeforeDinner ?? undefined,
          unitsDuringDinner: this.editingMedication.unitsDuringDinner ?? undefined,
          unitsAtBedtime: this.editingMedication.unitsAtBedtime ?? undefined
        }
      ).subscribe({
        next: (response) => {
          this.showSearchModal = false;
          this.editingMedication = null;
          this.loadMedications();
          
          // Refresh child components after medication list updates
          setTimeout(() => this.refreshChildComponents(), 100);
        },
        error: (error) => {
          alert('Failed to update medication. Please try again.');
        }
      });
    } else {
      // Adding new medication
      this.apiService.addMedication(
        apbNumber,
        medicationReviewId,
        {
          name: medication.benaming,
          cnk: parseInt(medication.cnk) || undefined,
          vmp: medication.vmp ? parseInt(medication.vmp) : undefined
        }
      ).subscribe({
        next: (response) => {
          this.showSearchModal = false;
          this.loadMedications();
          
          // Refresh child components after medication list updates
          setTimeout(() => this.refreshChildComponents(), 100);
        },
        error: (error) => {
          alert('Failed to add medication. Please try again.');
        }
      });
    }
  }
  
  private refreshChildComponents() {
    // Refresh therapy adherence component
    if (this.therapyAdherenceComponent) {
      this.therapyAdherenceComponent.refreshData();
    }
    
    // Note: Interactions and contraindications refresh automatically via cache services
    // when medications change, so no manual refresh needed here
  }

  openNoteOverview() {
    this.showNoteOverviewModal = true;
  }

  closeNoteOverview() {
    this.showNoteOverviewModal = false;
  }

  private loadGheopsWarningCount() {
    const apbNumber = this.stateService.apbNumber;
    const reviewId = this.stateService.medicationReviewId;

    if (!apbNumber || !reviewId) {
      this.gheopsWarningCount = 0;
      return;
    }

    // Get medications and then call GheOPS API to get warning count
    this.apiService.getMedications(apbNumber, reviewId).subscribe({
      next: (medications) => {
        const cnkCodes = medications
          .filter(m => m.cnk != null)
          .map(m => String(m.cnk).padStart(7, '0'));

        if (cnkCodes.length === 0) {
          this.gheopsWarningCount = 0;
          return;
        }

        // Call all APIs in parallel
        forkJoin({
          gheops: this.apiService.queryGheops(cnkCodes).pipe(
            catchError(() => of([]))
          ),
          anticholinergics: this.apiService.queryAnticholinergics(cnkCodes).pipe(
            catchError(() => of([]))
          ),
          medicationToAvoid: this.apiService.getMedicationToAvoid(cnkCodes).pipe(
            catchError(() => of([]))
          ),
          fallRisk: this.apiService.getFallRiskMedications(cnkCodes).pipe(
            catchError(() => of([]))
          )
        }).subscribe({
          next: (results) => {
            // Count unique warnings by criteria text (deduplicate)
            const seenCriteria = new Set<string>();
            
            // Count GheOPS warnings
            results.gheops.forEach(result => {
              if (result.entries && Array.isArray(result.entries)) {
                result.entries.forEach(entry => {
                  if (entry.criteria?.trim()) {
                    seenCriteria.add(entry.criteria.trim());
                  }
                });
              }
            });

            // Count anticholinergic medications (unique by CNK)
            const anticholinergicCount = results.anticholinergics.filter(r => r.isAnticholinergic).length;
            
            // Count medications to avoid (unique by CNK)
            const medicationToAvoidCount = results.medicationToAvoid.filter(r => r.shouldAvoid).length;
            
            // Count fall risk medications (unique by CNK)
            const fallRiskCount = results.fallRisk.filter(r => r.increasesRiskOfFalling).length;
            
            this.gheopsWarningCount = seenCriteria.size + anticholinergicCount + medicationToAvoidCount + fallRiskCount;
          },
          error: () => {
            this.gheopsWarningCount = 0;
          }
        });
      },
      error: () => {
        this.gheopsWarningCount = 0;
      }
    });
  }

  onGheopsWarningsLoaded(count: number) {
    this.gheopsWarningCount = count;
  }

  onCreatePatientConversation() {
    this.showNoteOverviewModal = false;
    this.router.navigate(['/anamnesis']);
  }

  private getCategoryForTool(tool: ToolType | null): string {
    const categoryMap: Record<ToolType, string> = {
      'medication-schema': 'MedicationSchema',
      'therapy-adherence': 'TherapyAdherence',
      'interactions': 'Interactions',
      'contra-indications': 'Contraindications',
      'posology': 'Posology',
      'renadapter': 'Renadapter',
      'gheops': 'GheOPS',
      'start-stop-nl': 'START-STOP-NL',
      'questionnaire': 'Questionnaire'
    };
    return tool ? categoryMap[tool] : 'General';
  }
}
