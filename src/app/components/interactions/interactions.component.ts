import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { ApiService } from '../../services/api.service';
import { StateService } from '../../services/state.service';
import { InteractionsCacheService, InteractionsResponse } from '../../services/interactions-cache.service';
import { Medication } from '../../models/api.models';
import { Output, EventEmitter } from '@angular/core';
import { Subscription } from 'rxjs';

// APB Response Interfaces (returned by backend)
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
export class InteractionsComponent implements OnInit, OnDestroy {
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
  
  private cacheSubscription?: Subscription;
  
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
    private stateService: StateService,
    private interactionsCache: InteractionsCacheService
  ) {}

  ngOnInit() {
    
    // Subscribe to cache updates
    this.cacheSubscription = this.interactionsCache.cache$.subscribe(cache => {

      this.medications = cache.medications;
      this.loading = cache.loading;
      this.error = cache.error;
      
      if (cache.response) {
        this.processInteractions(cache.response);
      } else {
        // Clear interactions if no response
        this.drugDrugInteractions = [];
        this.drugFoodInteractions = [];
      }
    });

    // Cache is managed by the service and refreshed automatically when medications change
    // No need to trigger refresh here as analysis page already handles initial load
  }

  ngOnDestroy() {
    if (this.cacheSubscription) {
      this.cacheSubscription.unsubscribe();
    }
  }

  // Manual refresh to re-fetch interaction data from APB API
  refreshInteractions() {
    this.interactionsCache.forceRefresh();
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
        this.interactionDetails = response.result;
        this.loadingDetails = false;
      },
      error: (err: any) => {
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
    // Determine interaction type based on properties
    const type = 'leftMedication' in interaction ? 'drug-drug' : 'drug-food';
    this.openNotes.emit({ type, interaction });
  }

  openGeneralNotesModal(): void {
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
      const refPattern = /([A-Z][a-zÃ¤Ã¶Ã¼ÃŸ]+(?:,?\s+[A-Z]\.?)+\s+et\s+al\.|[A-Z][a-zÃ¤Ã¶Ã¼ÃŸ]+\s+et\s+al\.|Fachinformation\s+[^,]+)[^n]*?(?:\([12]\d{3}\)|Stand\))/g;
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
