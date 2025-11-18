import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { ApiService } from '../../services/api.service';
import { StateService } from '../../services/state.service';
import { Medication } from '../../models/api.models';
import { Output, EventEmitter } from '@angular/core';

// APB API Interfaces
interface Participant {
  id: string;
  type: 'produ';
  routeOfAdministrationCode?: string;
}

interface CodeDescription {
  code: string;
  description: string;
}

interface Substance {
  code: string;
  description: string;
  routeOfAdministrations?: CodeDescription[];
}

interface DrugDrugInteraction {
  interactionNumber: string;
  isFoodDrugInteraction: boolean;
  leftSubstance: Substance;
  rightSubstance: Substance;
  direction: CodeDescription;
  sourceAssessment: CodeDescription | null;
  leftParticipant: Participant;
  rightParticipant: Participant;
}

interface InteractionMatch {
  clinicalRelevance: CodeDescription;
  interactions: DrugDrugInteraction[];
}

interface DrugFoodInteractionInfo {
  interactionNumber: string;
  leftSubstance: Substance;
  rightSubstance: Substance;
  direction: CodeDescription;
  sourceAssessment: CodeDescription | null;
}

interface DrugFoodInteractionItem {
  side: string;
  interactionInformation: DrugFoodInteractionInfo;
}

interface DrugFoodInteractionGroup {
  clinicalRelevance: CodeDescription;
  interactions: DrugFoodInteractionItem[];
}

interface DrugFoodInteraction {
  participant: Participant;
  interactionGroups: DrugFoodInteractionGroup[];
}

interface InteractionsResult {
  interactionMatches: InteractionMatch[];
  drugFoodInteractions: DrugFoodInteraction[];
}

interface InteractionsResponse {
  language: string;
  participants: Participant[];
  result: InteractionsResult;
}

interface InteractionsRequest {
  language: string;
  participants: Participant[];
}

// Display Interfaces
interface DisplayDrugDrugInteraction {
  interactionNumber: string;
  severity: string;
  severityCode: string;
  leftMedication: string;
  rightMedication: string;
  leftSubstance: string;
  rightSubstance: string;
  direction: string;
  leftParticipantId: string;
  rightParticipantId: string;
}

interface DisplayDrugFoodInteraction {
  interactionNumber: string;
  severity: string;
  severityCode: string;
  medication: string;
  substance: string;
  food: string;
  direction: string;
  participantId: string;
}

@Component({
  selector: 'app-interactions',
  standalone: true,
  imports: [CommonModule, TranslocoModule],
  templateUrl: './interactions.component.html',
  styleUrls: ['./interactions.component.scss']
})
export class InteractionsComponent implements OnInit {
  @Output() openNotes = new EventEmitter<{ type: 'drug-drug' | 'drug-food' | 'general', interaction: any }>();
  
  medications: Medication[] = [];
  loading = false;
  error: string | null = null;
  
  selectedMedicationId: string | null = null;
  expandedInteraction: string | null = null;
  loadingDetails = false;
  interactionDetails: any = null;
  
  drugDrugInteractions: DisplayDrugDrugInteraction[] = [];
  drugFoodInteractions: DisplayDrugFoodInteraction[] = [];
  
  // Severity order for sorting (highest to lowest)
  private severityOrder: { [key: string]: number } = {
    '50': 1, // Ernstig
    '40': 2, // Matig ernstig
    '30': 3, // Gering
    '20': 4,
    '10': 5
  };

  constructor(
    private apiService: ApiService,
    private stateService: StateService
  ) {}

  ngOnInit() {
    this.loadMedications();
  }

  // Public method to refresh interactions when medications change
  refreshInteractions() {
    console.log('[Interactions] Refreshing interactions data');
    this.loadMedications();
  }

  loadMedications() {
    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) return;

    this.loading = true;
    this.error = null;

    this.apiService.getMedications(reviewId).subscribe({
      next: (medications) => {
        this.medications = medications;
        console.log('[Interactions] Loaded medications:', this.medications);
        
        if (medications.length > 0) {
          this.checkInteractions();
        }
      },
      error: (err) => {
        console.error('[Interactions] Error loading medications:', err);
        this.error = 'Failed to load medications';
        this.loading = false;
      }
    });
  }

  checkInteractions() {
    const cnks = this.medications
      .filter(med => med.cnk)
      .map(med => ({
        cnk: med.cnk!.toString().padStart(7, '0'),
        routeOfAdministrationCode: med.routeOfAdministration || 'OR'
      }));

    if (cnks.length === 0) {
      this.loading = false;
      return;
    }

    const request = {
      language: 'NL',
      cnks
    };

    console.log('[Interactions] Request:', request);

    this.apiService.checkInteractions(request).subscribe({
      next: (response) => {
        console.log('[Interactions] Response:', response);
        this.processInteractions(response);
        this.loading = false;
      },
      error: (err) => {
        console.error('[Interactions] Error checking interactions:', err);
        this.error = 'Failed to check interactions';
        this.loading = false;
      }
    });
  }

  processInteractions(response: InteractionsResponse) {
    // Process drug-drug interactions
    this.drugDrugInteractions = [];
    response.result.interactionMatches.forEach(match => {
      match.interactions.forEach(interaction => {
        const leftMed = this.getMedicationName(interaction.leftParticipant.id);
        const rightMed = this.getMedicationName(interaction.rightParticipant.id);
        
        this.drugDrugInteractions.push({
          interactionNumber: interaction.interactionNumber,
          severity: match.clinicalRelevance.description,
          severityCode: match.clinicalRelevance.code,
          leftMedication: leftMed,
          rightMedication: rightMed,
          leftSubstance: interaction.leftSubstance.description,
          rightSubstance: interaction.rightSubstance.description,
          direction: interaction.direction.description,
          leftParticipantId: interaction.leftParticipant.id,
          rightParticipantId: interaction.rightParticipant.id
        });
      });
    });

    // Sort by severity
    this.drugDrugInteractions.sort((a, b) => {
      return (this.severityOrder[a.severityCode] || 999) - (this.severityOrder[b.severityCode] || 999);
    });

    // Process drug-food interactions
    this.drugFoodInteractions = [];
    response.result.drugFoodInteractions.forEach(drugFood => {
      drugFood.interactionGroups.forEach(group => {
        group.interactions.forEach(interaction => {
          const med = this.getMedicationName(drugFood.participant.id);
          
          this.drugFoodInteractions.push({
            interactionNumber: interaction.interactionInformation.interactionNumber,
            severity: group.clinicalRelevance.description,
            severityCode: group.clinicalRelevance.code,
            medication: med,
            substance: interaction.interactionInformation.leftSubstance.description,
            food: interaction.interactionInformation.rightSubstance.description,
            direction: interaction.interactionInformation.direction.description,
            participantId: drugFood.participant.id
          });
        });
      });
    });

    // Sort by severity
    this.drugFoodInteractions.sort((a, b) => {
      return (this.severityOrder[a.severityCode] || 999) - (this.severityOrder[b.severityCode] || 999);
    });

    console.log('[Interactions] Processed drug-drug:', this.drugDrugInteractions);
    console.log('[Interactions] Processed drug-food:', this.drugFoodInteractions);
  }

  getMedicationName(cnkCode: string): string {
    const cnkNumber = parseInt(cnkCode);
    const med = this.medications.find(m => m.cnk === cnkNumber);
    return med?.name || cnkCode;
  }

  onMedicationClick(medicationId: string) {
    if (this.selectedMedicationId === medicationId) {
      // Deselect if already selected
      this.selectedMedicationId = null;
    } else {
      // Select medication
      this.selectedMedicationId = medicationId;
    }
  }

  toggleInteraction(interactionNumber: string) {
    if (this.expandedInteraction === interactionNumber) {
      // Collapse
      this.expandedInteraction = null;
      this.interactionDetails = null;
    } else {
      // Expand and fetch details
      this.expandedInteraction = interactionNumber;
      this.loadInteractionDetails(interactionNumber);
    }
  }

  loadInteractionDetails(interactionNumber: string): void {
    this.loadingDetails = true;
    this.interactionDetails = null;

    this.apiService.getInteractionDetails({
      language: 'NL',
      interactionNumber: interactionNumber
    }).subscribe({
      next: (response: any) => {
        console.log('[Interactions] Details response:', response);
        this.interactionDetails = response.result;
        this.loadingDetails = false;
      },
      error: (err: any) => {
        console.error('[Interactions] Error loading details:', err);
        this.loadingDetails = false;
      }
    });
  }

  isMedicationSelected(medicationId: string): boolean {
    return this.selectedMedicationId === medicationId;
  }

  getFilteredDrugDrugInteractions(): DisplayDrugDrugInteraction[] {
    if (!this.selectedMedicationId) {
      return this.drugDrugInteractions;
    }

    const selectedCnk = this.medications.find(m => m.medicationId === this.selectedMedicationId)?.cnk;
    if (!selectedCnk) return this.drugDrugInteractions;

    const selectedCnkStr = selectedCnk.toString().padStart(7, '0');

    return this.drugDrugInteractions.filter(interaction => 
      interaction.leftParticipantId === selectedCnkStr || 
      interaction.rightParticipantId === selectedCnkStr
    );
  }

  getFilteredDrugFoodInteractions(): DisplayDrugFoodInteraction[] {
    if (!this.selectedMedicationId) {
      return this.drugFoodInteractions;
    }

    const selectedCnk = this.medications.find(m => m.medicationId === this.selectedMedicationId)?.cnk;
    if (!selectedCnk) return this.drugFoodInteractions;

    const selectedCnkStr = selectedCnk.toString().padStart(7, '0');

    return this.drugFoodInteractions.filter(interaction => 
      interaction.participantId === selectedCnkStr
    );
  }

  getSeverityClass(severityCode: string): string {
    switch(severityCode) {
      case '50': return 'severity-high';
      case '40': return 'severity-medium';
      case '30': return 'severity-low';
      default: return 'severity-unknown';
    }
  }

  openNotesModal(interaction: any): void {
    console.log('[Interactions] Opening notes for interaction:', interaction);
    // Determine interaction type based on properties
    const type = 'leftMedication' in interaction ? 'drug-drug' : 'drug-food';
    this.openNotes.emit({ type, interaction });
  }

  openGeneralNotesModal(): void {
    console.log('[Interactions] Opening notes for general note (no interaction)');
    this.openNotes.emit({ type: 'general', interaction: null });
  }

  formatText(text: string): string {
    if (!text) return '';
    
    let formatted = text;
    
    // First, handle ~n as newline markers (before processing other ~ patterns)
    formatted = formatted.replace(/~n-?/g, '\n');
    
    // Replace ~text~ with <sub>text</sub> for subscript (but not single ~)
    formatted = formatted.replace(/~([^~\n]+)~/g, '<sub>$1</sub>');
    
    // Replace **text** with <strong>text</strong> for bold
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Extract and format literature section - improved detection
    const literatureMatch = formatted.match(/Literatuur[:.]?\s*(.*?)$/is);
    if (literatureMatch) {
      let literatureText = literatureMatch[1].trim();
      
      // Replace \n with actual newlines if they're escaped
      literatureText = literatureText.replace(/\\n/g, '\n');
      
      // Split by newline or by pattern like "Author et al." followed by journal info
      // This regex matches the pattern: Author(s) et al., Journal details (year)
      const refPattern = /([A-Z][a-zäöüß]+(?:,?\s+[A-Z]\.?)+\s+et\s+al\.|[A-Z][a-zäöüß]+\s+et\s+al\.|Fachinformation\s+[^,]+)[^n]*?(?:\([12]\d{3}\)|Stand\))/g;
      const references = literatureText.match(refPattern) || [];
      
      if (references.length > 0) {
        let formattedRefs = '<div class="literature-section"><strong>Literatuur:</strong><ol class="literature-list">';
        references.forEach(ref => {
          const cleanRef = ref.trim().replace(/^n/, ''); // Remove leading 'n' if present
          if (cleanRef && cleanRef.length > 10) { // Only add substantial references
            formattedRefs += `<li>${cleanRef}</li>`;
          }
        });
        formattedRefs += '</ol></div>';
        
        // Replace the original literature section with formatted version
        formatted = formatted.replace(/Literatuur[:.]?\s*.*$/is, formattedRefs);
      }
    }
    
    // Replace remaining line breaks with <br> tags
    formatted = formatted.replace(/\n/g, '<br>');
    
    // Format inline literature references (e.g., [1], [2-5])
    formatted = formatted.replace(/\[(\d+(?:-\d+)?(?:,\s*\d+(?:-\d+)?)*)\]/g, '<sup class="reference">[$1]</sup>');
    
    return formatted;
  }
}
