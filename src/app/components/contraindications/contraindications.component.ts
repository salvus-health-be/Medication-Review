import { Component, OnInit, OnDestroy, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { StateService } from '../../services/state.service';
import { ContraindicationsCacheService } from '../../services/contraindications-cache.service';
import { Medication } from '../../models/api.models';

// API Interfaces
interface ContraindicationDetail {
  code: string;
  description: string;
}

// Display Interfaces
interface DisplayContraindicationMatch {
  appreciation: string;
  appreciationCode: string;
  medication: string;
  medicationCnk: string;
  condition: string;
  conditionCode: string;
  contraindications: ContraindicationDetail[]; // Array of contraindication details
}

interface DisplayProductContraindication {
  cnk: string;
  medicationName: string;
  appreciation: string;
  appreciationCode: string;
  condition: string;
  conditionCode: string;
  contraindications: ContraindicationDetail[]; // Array of contraindication details
}

@Component({
  selector: 'app-contraindications',
  standalone: true,
  imports: [CommonModule, TranslocoModule],
  templateUrl: './contraindications.component.html',
  styleUrls: ['./contraindications.component.scss']
})
export class ContraindicationsComponent implements OnInit, OnDestroy {
  @Output() openNotes = new EventEmitter<{ type: 'match' | 'product', contraindication: any }>();
  
  medications: Medication[] = [];
  patientContraindications: any[] = [];
  loading = false;
  error: string | null = null;
  
  selectedMedicationId: string | null = null;
  expandedContraindication: string | null = null;
  
  contraindicationMatches: DisplayContraindicationMatch[] = [];
  productContraindications: DisplayProductContraindication[] = [];
  
  private cacheSubscription?: Subscription;
  
  // Severity order for sorting (highest to lowest)
  private severityOrder: { [key: string]: number } = {
    'CI': 1, // Contraindication (absolute)
    'PR': 2  // Precaution
  };

  constructor(
    private apiService: ApiService,
    private stateService: StateService,
    private contraindicationsCache: ContraindicationsCacheService
  ) {}

  ngOnInit() {
    
    // Subscribe to cache updates
    this.cacheSubscription = this.contraindicationsCache.cache$.subscribe(cache => {

      this.medications = cache.medications;
      this.patientContraindications = cache.patientContraindications;
      this.loading = cache.loading;
      this.error = cache.error;
      
      if (cache.matchesResponse) {
        this.processContraindicationMatches(cache.matchesResponse);
      } else {
        this.contraindicationMatches = [];
      }
      
      if (cache.productResponses.length > 0) {
        this.processProductContraindications(cache.productResponses);
      } else {
        this.productContraindications = [];
      }
    });

    // Cache is managed by the service and refreshed automatically when medications/contraindications change
    // No need to trigger refresh here as analysis page already handles initial load
  }

  ngOnDestroy() {
    if (this.cacheSubscription) {
      this.cacheSubscription.unsubscribe();
    }
  }

  // Manual refresh to re-fetch contraindication data from APB API
  refreshContraindications() {
    this.contraindicationsCache.forceRefresh();
  }

  loadAdditionalContraindications() {
    this.contraindicationsCache.loadProductContraindications();
  }

  get productContraindicationsLoaded(): boolean {
    return this.contraindicationsCache.getCacheData().productContraindicationsLoaded;
  }

  get loadingProductContraindications(): boolean {
    return this.contraindicationsCache.getCacheData().loadingProductContraindications;
  }

  processContraindicationMatches(response: any) {
    this.contraindicationMatches = [];
    
    if (!response.result || response.result.length === 0) {
      return;
    }

    response.result.forEach((match: any) => {
      // Backend returns Code (capital C) not code (lowercase c)
      const cnkCode = match.product?.Code || match.product?.code;
      const medName = this.getMedicationName(cnkCode);
      
      // Map appreciation codes: '0' = absolute CI, '2'/'3' = precautions
      let appreciationText = 'Precaution';
      let appreciationCode = match.appreciation;
      
      if (match.appreciation === '0') {
        appreciationText = 'Contraindication';
        appreciationCode = 'CI';
      } else if (match.appreciation === '2') {
        appreciationText = 'Moderate Precaution';
        appreciationCode = 'PR';
      } else if (match.appreciation === '3') {
        appreciationText = 'Precaution';
        appreciationCode = 'PR';
      }
      
      this.contraindicationMatches.push({
        appreciation: appreciationText,
        appreciationCode: appreciationCode,
        medication: medName,
        medicationCnk: match.product?.Code || match.product?.code || 'Unknown',
        condition: match.physioPathologicalCondition?.Description || match.physioPathologicalCondition?.description || 'Unknown',
        conditionCode: match.physioPathologicalCondition?.Code || match.physioPathologicalCondition?.code || 'Unknown',
        contraindications: match.contraIndications || [] // Array of contraindication details
      });
    });

    // Sort by severity (CI before PR)
    this.contraindicationMatches.sort((a, b) => {
      return (this.severityOrder[a.appreciationCode] || 999) - (this.severityOrder[b.appreciationCode] || 999);
    });

  }

  processProductContraindications(results: any[]) {
    this.productContraindications = [];
    
    results.forEach(response => {
      if (!response || !response.result || response.result.length === 0) {
        return;
      }

      const cnk = response.cnk;
      const medName = this.getMedicationName(cnk);

      response.result.forEach((item: any) => {
        // Backend returns Code/Description with capital letters
        const conditionCode = item.physioPathologicalCondition?.Code || item.physioPathologicalCondition?.code;
        const conditionDesc = item.physioPathologicalCondition?.Description || item.physioPathologicalCondition?.description;
        
        // Only add if not already in patient contraindications
        const isInPatientList = this.patientContraindications.some(
          ci => ci.contraindicationCode === conditionCode
        );

        if (!isInPatientList) {
          // Map appreciation codes: '0' = absolute CI, '2'/'3' = precautions
          let appreciationText = 'Precaution';
          let appreciationCode = item.appreciation;
          
          if (item.appreciation === '0') {
            appreciationText = 'Contraindication';
            appreciationCode = 'CI';
          } else if (item.appreciation === '2') {
            appreciationText = 'Moderate Precaution';
            appreciationCode = 'PR';
          } else if (item.appreciation === '3') {
            appreciationText = 'Precaution';
            appreciationCode = 'PR';
          }
          
          this.productContraindications.push({
            cnk: cnk,
            medicationName: medName,
            appreciation: appreciationText,
            appreciationCode: appreciationCode,
            condition: conditionDesc || 'Unknown',
            conditionCode: conditionCode || 'Unknown',
            contraindications: item.contraIndications || [] // Array of contraindication details
          });
        }
      });
    });

    // Sort by severity
    this.productContraindications.sort((a, b) => {
      return (this.severityOrder[a.appreciationCode] || 999) - (this.severityOrder[b.appreciationCode] || 999);
    });

  }

  getMedicationName(cnkCode: string): string {
    const cnkNumber = parseInt(cnkCode);
    const med = this.medications.find(m => m.cnk === cnkNumber);
    return med?.name || `Unknown Medication (CNK: ${cnkCode})`;
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

  toggleContraindication(key: string) {
    if (this.expandedContraindication === key) {
      // Collapse
      this.expandedContraindication = null;
    } else {
      // Expand
      this.expandedContraindication = key;
    }
  }

  isMedicationSelected(medicationId: string): boolean {
    return this.selectedMedicationId === medicationId;
  }

  getFilteredMatches(): DisplayContraindicationMatch[] {
    if (!this.selectedMedicationId) {
      return this.contraindicationMatches;
    }

    const selectedCnk = this.medications.find(m => m.medicationId === this.selectedMedicationId)?.cnk;
    if (!selectedCnk) return this.contraindicationMatches;

    const selectedCnkStr = selectedCnk.toString().padStart(7, '0');

    return this.contraindicationMatches.filter(ci => 
      ci.medicationCnk === selectedCnkStr
    );
  }

  getFilteredProductContraindications(): DisplayProductContraindication[] {
    if (!this.selectedMedicationId) {
      return this.productContraindications;
    }

    const selectedCnk = this.medications.find(m => m.medicationId === this.selectedMedicationId)?.cnk;
    if (!selectedCnk) return this.productContraindications;

    const selectedCnkStr = selectedCnk.toString().padStart(7, '0');

    return this.productContraindications.filter(ci => 
      ci.cnk === selectedCnkStr
    );
  }

  getSeverityClass(appreciationCode: string): string {
    switch(appreciationCode) {
      case 'CI': return 'severity-high';
      case 'PR': return 'severity-medium';
      default: return 'severity-unknown';
    }
  }

  openNotesModal(contraindication: any, type: 'match' | 'product'): void {
    this.openNotes.emit({ type, contraindication });
  }

  openGeneralNotesModal(): void {
    this.openNotes.emit({ type: 'general' as any, contraindication: null });
  }

  getUniqueKey(ci: any, index: number): string {
    if ('medicationCnk' in ci) {
      return `match-${ci.medicationCnk}-${ci.conditionCode}-${index}`;
    } else {
      return `product-${ci.cnk}-${ci.conditionCode}-${index}`;
    }
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
    
    // Replace remaining line breaks with <br> tags
    formatted = formatted.replace(/\n/g, '<br>');
    
    // Format inline literature references (e.g., [1], [2-5])
    formatted = formatted.replace(/\[(\d+(?:-\d+)?(?:,\s*\d+(?:-\d+)?)*)\]/g, '<sup class="reference">[$1]</sup>');
    
    return formatted;
  }
}
