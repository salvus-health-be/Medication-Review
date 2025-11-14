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
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';

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
  showInteractionNotesModal = false;
  selectedInteraction: any = null;
  selectedInteractionType: 'drug-drug' | 'drug-food' = 'drug-drug';
  showNoteOverviewModal = false;

  @ViewChild(TherapyAdherenceComponent) therapyAdherenceComponent?: TherapyAdherenceComponent;
  @ViewChild(InteractionsComponent) interactionsComponent?: InteractionsComponent;
  @ViewChild(ContraindicationsComponent) contraindicationsComponent?: ContraindicationsComponent;
  @ViewChild(PosologyComponent) posologyComponent?: PosologyComponent;
  @ViewChild(RenadaptorComponent) renadaptorComponent?: RenadaptorComponent;

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
    private transloco: TranslocoService
  ) {}

  ngOnInit() {
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
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSchemaValueChange(medication: Medication) {
    console.log('[AnalysisPage] Schema value changed for medication:', medication.name);
    this.schemaChangeSubject.next(medication);
  }

  private saveSchemaChanges(medication: Medication) {
    const medicationReviewId = this.stateService.medicationReviewId;
    if (!medicationReviewId) {
      console.error('[AnalysisPage] No medication review ID');
      return;
    }

    console.log('[AnalysisPage] Auto-saving schema changes for:', medication.name);

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

    console.log('[AnalysisPage] Update request payload:', JSON.stringify(updateData, null, 2));

    this.apiService.updateMedication(
      medicationReviewId,
      medication.medicationId,
      updateData
    ).subscribe({
      next: (response) => {
        console.log('[AnalysisPage] Schema changes saved for:', medication.name);
      },
      error: (error) => {
        console.error('[AnalysisPage] Failed to save schema changes:', error);
      }
    });
  }

  openNotesModal(medication: Medication | ApiMedication | undefined) {
    // Handle general notes (no medication)
    if (!medication) {
      console.log('[AnalysisPage] Opening general notes modal for therapy adherence');
      this.noteCategory = 'TherapyAdherence';
      this.selectedMedicationForNotes = null as any;
      this.showNotesModal = true;
      return;
    }
    
    console.log('[AnalysisPage] Opening notes modal for:', medication.name);
    
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
    this.selectedMedicationForNotes = displayMedication;
    this.showNotesModal = true;
  }

  onNotesModalClose() {
    this.showNotesModal = false;
    this.selectedMedicationForNotes = null;
  }

  openGeneralNotesModal(toolType: string) {
    console.log('[AnalysisPage] Opening general notes modal for tool:', toolType);
    this.noteCategory = this.getCategoryForTool(toolType as ToolType);
    this.selectedMedicationForNotes = null as any; // General note, no specific medication
    this.showNotesModal = true;
  }

  openInteractionNotesModal(data: { type: 'drug-drug' | 'drug-food' | 'general', interaction: any }) {
    console.log('[AnalysisPage] Opening interaction notes modal:', data);
    
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
    console.log('[AnalysisPage] Opening reference notes modal for:', toolType);
    
    // Create a pseudo-medication object with the tool name for context
    const toolNames = {
  'gheops': 'GheOPS Tool',
      'start-stop-nl': 'START-STOP Criteria (NL)'
    };
    
    // Set category based on reference tool type
    this.noteCategory = toolType === 'gheops' ? 'GheOPS' : 'START-STOP-NL';
    
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

  openQuestionnaireNotesModal() {
    console.log('[AnalysisPage] Opening questionnaire notes modal - general notes for Step 1');
    
    // Set category to map to Part 1 general questions in the actions page
    this.noteCategory = 'General';
    this.selectedMedicationForNotes = null as any; // General note, no specific medication
    this.showNotesModal = true;
  }

  openContraindicationNotesModal(data: { type: 'match' | 'product' | 'general', contraindication: any }) {
    console.log('[AnalysisPage] Opening contraindication notes modal:', data);
    
    // Handle general notes separately
    if (data.type === 'general' || !data.contraindication) {
      this.noteCategory = 'Contraindications';
      this.selectedMedicationForNotes = null as any; // General note, no specific medication
      this.showNotesModal = true;
      return;
    }
    
    // For specific contraindication notes, create a medication context
    const cnk = data.contraindication.medicationCnk || data.contraindication.cnk;
    const medName = data.contraindication.medication || data.contraindication.medicationName || 'Unknown Medication';
    
    this.noteCategory = 'Contraindications';
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
    const medicationReviewId = this.stateService.medicationReviewId;
    if (!medicationReviewId) {
      this.medications = [];
      return;
    }

    this.isLoading = true;
    console.log('[AnalysisPage] Loading medications for review:', medicationReviewId);
    
    this.apiService.getMedications(medicationReviewId).subscribe({
      next: (medications) => {
        console.log('[AnalysisPage] Received medications:', medications);
        
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
        console.error('[AnalysisPage] Failed to load medications:', error);
        this.medications = [];
        this.isLoading = false;
      }
    });
  }

  onToolSelected(tool: ToolType) {
    this.activeTool = tool;
    console.log('[AnalysisPage] Selected tool:', tool);
    
    // Refresh therapy adherence data when that tool is selected
    if (tool === 'therapy-adherence') {
      console.log('[AnalysisPage] Refreshing therapy adherence data');
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
    } else if (this.activeTool === 'posology' && this.posologyComponent) {
      this.posologyComponent.onMedicationClick(medication.medicationId);
    } else if (this.activeTool === 'renadapter' && this.renadaptorComponent) {
      this.renadaptorComponent.onMedicationClick(medication.medicationId);
    }
  }

  isSelectedForInteractions(medicationId: string): boolean {
    return this.interactionsComponent?.isMedicationSelected(medicationId) ?? false;
  }

  isSelectedForPosology(medicationId: string): boolean {
    return this.posologyComponent?.isMedicationSelected(medicationId) ?? false;
  }

  isSelectedForRenadaptor(medicationId: string): boolean {
    return this.renadaptorComponent?.isMedicationSelected(medicationId) ?? false;
  }

  onMedicationDeleted(medicationId: string) {
    console.log('[AnalysisPage] Medication deleted:', medicationId);
    this.medications = this.medications.filter(med => med.medicationId !== medicationId);
    
    // Refresh child components
    this.refreshChildComponents();
  }

  onEditRequested(medication: Medication) {
    console.log('[AnalysisPage] Edit requested for medication:', medication.name);
    this.editingMedication = medication;
    this.showSearchModal = true;
  }

  addMedication() {
    console.log('[AnalysisPage] Add medication clicked');
    this.editingMedication = null;
    this.showSearchModal = true;
  }

  onModalClose() {
    this.showSearchModal = false;
    this.editingMedication = null;
  }

  onMedicationSelected(medication: MedicationSearchResult) {
    const medicationReviewId = this.stateService.medicationReviewId;
    if (!medicationReviewId) {
      console.error('[AnalysisPage] No medication review ID');
      return;
    }

    // Check if we're editing an existing medication
    if (this.editingMedication) {
      console.log('[AnalysisPage] Replacing medication:', this.editingMedication.name, 'with:', medication.benaming);

      // Update the existing medication while preserving intake and indication
      this.apiService.updateMedication(
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
          console.log('[AnalysisPage] Medication updated:', response);
          this.showSearchModal = false;
          this.editingMedication = null;
          this.loadMedications();
          
          // Refresh child components after medication list updates
          setTimeout(() => this.refreshChildComponents(), 100);
        },
        error: (error) => {
          console.error('[AnalysisPage] Failed to update medication:', error);
          alert('Failed to update medication. Please try again.');
        }
      });
    } else {
      // Adding new medication
      console.log('[AnalysisPage] Adding medication:', medication);

      this.apiService.addMedication(
        medicationReviewId,
        {
          name: medication.benaming,
          cnk: parseInt(medication.cnk) || undefined,
          vmp: medication.vmp ? parseInt(medication.vmp) : undefined
        }
      ).subscribe({
        next: (response) => {
          console.log('[AnalysisPage] Medication added:', response);
          this.showSearchModal = false;
          this.loadMedications();
          
          // Refresh child components after medication list updates
          setTimeout(() => this.refreshChildComponents(), 100);
        },
        error: (error) => {
          console.error('[AnalysisPage] Failed to add medication:', error);
          alert('Failed to add medication. Please try again.');
        }
      });
    }
  }
  
  private refreshChildComponents() {
    console.log('[AnalysisPage] Refreshing child components');
    
    // Refresh therapy adherence component
    if (this.therapyAdherenceComponent) {
      this.therapyAdherenceComponent.refreshData();
    }
    
    // Refresh interactions component
    if (this.interactionsComponent) {
      this.interactionsComponent.refreshInteractions();
    }
    
    // Refresh contraindications component
    if (this.contraindicationsComponent) {
      this.contraindicationsComponent.refreshContraindications();
    }
  }

  openNoteOverview() {
    console.log('[AnalysisPage] Opening note overview modal');
    this.showNoteOverviewModal = true;
  }

  closeNoteOverview() {
    console.log('[AnalysisPage] Closing note overview modal');
    this.showNoteOverviewModal = false;
  }

  onCreatePatientConversation() {
    console.log('[AnalysisPage] Creating patient conversation - navigating to PDF preview');
    this.showNoteOverviewModal = false;
    this.router.navigate(['/pdf-preview']);
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
