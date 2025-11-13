import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { ApiService } from '../../services/api.service';
import { StateService } from '../../services/state.service';
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
export class ContraindicationsComponent implements OnInit {
  @Output() openNotes = new EventEmitter<{ type: 'match' | 'product', contraindication: any }>();
  
  medications: Medication[] = [];
  patientContraindications: any[] = [];
  loading = false;
  error: string | null = null;
  
  selectedMedicationId: string | null = null;
  expandedContraindication: string | null = null;
  
  contraindicationMatches: DisplayContraindicationMatch[] = [];
  productContraindications: DisplayProductContraindication[] = [];
  
  // Severity order for sorting (highest to lowest)
  private severityOrder: { [key: string]: number } = {
    'CI': 1, // Contraindication (absolute)
    'PR': 2  // Precaution
  };

  constructor(
    private apiService: ApiService,
    private stateService: StateService
  ) {}

  ngOnInit() {
    this.loadData();
    
    // Subscribe to contraindication changes
    this.stateService.contraindicationsChanged$.subscribe(() => {
      console.log('[Contraindications] Contraindications changed, reloading...');
      this.loadData();
    });
  }

  // Public method to refresh contraindications when medications or conditions change
  refreshContraindications() {
    console.log('[Contraindications] Refreshing contraindications data');
    this.loadData();
  }

  loadData() {
    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) return;

    this.loading = true;
    this.error = null;

    // Load medications and patient contraindications in parallel
    Promise.all([
      this.apiService.getMedications(reviewId).toPromise(),
      this.apiService.getContraindications(reviewId).toPromise()
    ])
      .then(([medications, contraindications]) => {
        this.medications = medications || [];
        this.patientContraindications = contraindications || [];
        
        console.log('[Contraindications] Loaded medications:', this.medications);
        console.log('[Contraindications] Loaded patient contraindications:', this.patientContraindications);
        
        if (this.medications.length > 0) {
          this.checkContraindications();
        } else {
          this.loading = false;
        }
      })
      .catch(err => {
        console.error('[Contraindications] Error loading data:', err);
        this.error = 'Failed to load data';
        this.loading = false;
      });
  }

  checkContraindications() {
    // Get CNK codes from medications
    const cnkCodes = this.medications
      .filter(med => med.cnk)
      .map(med => med.cnk!.toString().padStart(7, '0'));

    // Get condition codes from patient contraindications
    const conditionCodes = this.patientContraindications
      .filter(ci => ci.contraindicationCode)
      .map(ci => ci.contraindicationCode);

    console.log('[Contraindications] CNK codes:', cnkCodes);
    console.log('[Contraindications] Condition codes:', conditionCodes);

    // Check matches (Type 1: medications vs patient conditions)
    if (cnkCodes.length > 0 && conditionCodes.length > 0) {
      const matchRequest = {
        language: 'NL',
        participatingProductCodes: cnkCodes,
        participatingPhysioPathologicalConditionCodes: conditionCodes
      };

      this.apiService.getContraindicationMatches(matchRequest).subscribe({
        next: (response) => {
          console.log('[Contraindications] Matches response:', response);
          this.processContraindicationMatches(response);
        },
        error: (err) => {
          console.error('[Contraindications] Error checking matches:', err);
        }
      });
    }

    // Get product contraindications for each medication (Type 2: all contraindications per medication)
    if (cnkCodes.length > 0) {
      const productRequests = cnkCodes.map(cnk => 
        this.apiService.getProductContraindications(cnk, 'NL').toPromise()
          .catch(err => {
            console.error(`[Contraindications] Error getting contraindications for CNK ${cnk}:`, err);
            return null;
          })
      );

      Promise.all(productRequests)
        .then(results => {
          this.processProductContraindications(results.filter(r => r !== null));
          this.loading = false;
        })
        .catch(err => {
          console.error('[Contraindications] Error processing product contraindications:', err);
          this.loading = false;
        });
    } else {
      this.loading = false;
    }
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

    console.log('[Contraindications] Processed matches:', this.contraindicationMatches);
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

    console.log('[Contraindications] Processed product contraindications:', this.productContraindications);
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
    console.log('[Contraindications] Opening notes for contraindication:', contraindication);
    this.openNotes.emit({ type, contraindication });
  }

  openGeneralNotesModal(): void {
    console.log('[Contraindications] Opening notes for general note (no contraindication)');
    this.openNotes.emit({ type: 'general' as any, contraindication: null });
  }

  getUniqueKey(ci: any, index: number): string {
    if ('medicationCnk' in ci) {
      return `match-${ci.medicationCnk}-${ci.conditionCode}-${index}`;
    } else {
      return `product-${ci.cnk}-${ci.conditionCode}-${index}`;
    }
  }
}
