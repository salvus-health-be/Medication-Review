import { Component, OnInit, ViewChild, QueryList, ViewChildren } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { MedicationItemComponent, Medication } from '../medication-item/medication-item.component';
import { MedicationSearchModalComponent } from '../medication-search-modal/medication-search-modal.component';
import { CnkSelectionModalComponent, MedicationWithMatches } from '../cnk-selection-modal/cnk-selection-modal.component';
import { ConfirmationModalComponent } from '../confirmation-modal/confirmation-modal.component';
import { MedicationSearchResult } from '../../models/api.models';
import { ApiService } from '../../services/api.service';
import { StateService } from '../../services/state.service';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

@Component({
  selector: 'app-medication-list',
  standalone: true,
  imports: [CommonModule, TranslocoModule, MedicationItemComponent, MedicationSearchModalComponent, CnkSelectionModalComponent, ConfirmationModalComponent],
  templateUrl: './medication-list.component.html',
  styleUrls: ['./medication-list.component.scss']
})
export class MedicationListComponent implements OnInit {
  medications: Medication[] = [];
  showSearchModal = false;
  showCnkSelectionModal = false;
  showDeleteAllModal = false;
  isLoading = false;
  editingMedication: Medication | null = null;
  
  // CNK matching state
  currentMedicationForCnkSelection: MedicationWithMatches | null = null;
  pendingMedicationsToSave: Array<Partial<Medication> & { searchResult?: MedicationSearchResult }> = [];
  currentMedicationIndex = 0;

  @ViewChild('medicationsScroll') medicationsScrollContainer: any;

  constructor(
    private apiService: ApiService,
    private stateService: StateService
  ) {}

  ngOnInit() {
    this.loadMedications();
  }

  loadMedications() {
    const medicationReviewId = this.stateService.medicationReviewId;
    if (!medicationReviewId) {
      this.medications = [];
      return;
    }

    this.isLoading = true;
    
    this.apiService.getMedications(medicationReviewId).subscribe({
      next: (medications) => {
        console.log('MedicationListComponent loadMedications - raw API response:', medications);
        
        this.medications = medications.map(med => {
          console.log(`Mapping medication ${med.name}: activeIngredient =`, med.activeIngredient);
          return {
            medicationId: med.medicationId,
            name: med.name || '',
            dosage: med.dosageMg ? `${med.dosageMg}mg` : '',
            route: med.routeOfAdministration || '',
            cnk: med.cnk ?? null,
            vmp: med.vmp ?? null,
            packageSize: med.packageSize ?? null,
            activeIngredient: med.activeIngredient ?? null,
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
          };
        });
        
        console.log('MedicationListComponent final medications array:', this.medications);
        
        this.isLoading = false;
      },
      error: (error) => {
        this.medications = [];
        this.isLoading = false;
      }
    });
  }

  importMedications() {
    // Create a hidden file input element
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv';
    fileInput.style.display = 'none';
    
    fileInput.onchange = (event: any) => {
      const file = event.target.files[0];
      if (file) {
        this.handleCsvImport(file);
      } else {
      }
      // Clean up
      try {
        document.body.removeChild(fileInput);
      } catch (err) {
        // ignore
      }
    };
    
    document.body.appendChild(fileInput);
    fileInput.click();
  }

  private handleCsvImport(file: File) {

    const reader = new FileReader();
    reader.onload = (e: any) => {
      const csvContent = e.target.result;
      // Log the first few hundred characters to help debug format issues

      const lines = String(csvContent).split(/\r?\n/).slice(0, 20);

      const medications = this.parseCsvContent(csvContent);

      if (medications.length > 0) {
        this.saveParsedMedications(medications);
      } else {
        alert('No medications found in the CSV file. Please check the file format or try a different export.');
      }
    };

    reader.onerror = (error) => {
      alert('Failed to read the CSV file. Please try again.');
    };

    reader.readAsText(file, 'UTF-8');
  }

  private parseCsvContent(csvContent: string): Partial<Medication>[] {
    // Normalize newlines and split
    const lines = String(csvContent).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const medications: Partial<Medication>[] = [];
    
    // Log a sample of lines to help diagnose structure
    for (let li = 0; li < Math.min(15, lines.length); li++) {
    }

    // Start at row 11 (index 10) - this is where medications begin
    let isAsNeeded = false;
    
    for (let i = 12; i < lines.length; i++) {
      const columns = lines[i].split(';');
      const columnA = columns[0]?.trim() || '';

      // Skip empty rows
      if (!columnA) {
        continue;
      }
      
      // Skip continuation/wrapped lines (these are part of multi-line cells from the previous row)
      // These typically start with keywords like "Gebruiksaanwijzing" or other instruction text
      if (columnA.toLowerCase().includes('gebruiksaanwijzing') || 
          columnA.toLowerCase().includes('opmerking') ||
          columnA.toLowerCase().startsWith('koel bewaren') ||
          columnA.toLowerCase().startsWith('bewaren')) {
        continue;
      }
      
      // Check for "Indien nodig" section marker
      if (columnA.toLowerCase().includes('indien nodig')) {
        isAsNeeded = true;
        continue;
      }
      
      // Parse this as a medication row
      const medication = this.parseMedicationRow(columns, isAsNeeded, i + 1);
      if (medication) {
        medications.push(medication);
      } else {
      }
    }
    
    return medications;
  }

  private parseMedicationRow(columns: string[], asNeeded: boolean, rowNumber: number): Partial<Medication> | null {
    // Column A (index 0) = medication name
    const medicationName = columns[0]?.trim();
    
    if (!medicationName || medicationName === '') {
      return null;
    }

    // Helper to parse numbers from various formats
    const parseNumber = (value: string | undefined): number | null => {
      if (!value || value.trim() === '') return null;
      let cleaned = value.trim().replace(',', '.').replace(/\u00A0/g, ' ').trim();

      // Map common Unicode vulgar fraction characters to decimals
      const unicodeFractions: Record<string, number> = {
        'Â¼': 0.25,
        'Â½': 0.5,
        'Â¾': 0.75,
        'â…“': 1 / 3,
        'â…”': 2 / 3,
        'â…›': 1 / 8,
        'â…œ': 3 / 8,
        'â…': 5 / 8,
        'â…ž': 7 / 8
      };

      // If the string is exactly a unicode fraction or a known replacement char
      if (cleaned.length === 1 && unicodeFractions[cleaned]) {
        return unicodeFractions[cleaned];
      }

      // Handle mixed numbers with unicode fraction like '1Â½' or '1 1/2'
      // e.g., '1Â½' => 1 + 0.5
      const mixedUnicodeMatch = cleaned.match(/^(\d+)\s*([Â¼Â½Â¾â…“â…”â…›â…œâ…â…ž])$/);
      if (mixedUnicodeMatch) {
        const whole = parseInt(mixedUnicodeMatch[1], 10);
        const frac = unicodeFractions[mixedUnicodeMatch[2]] || 0;
        return whole + frac;
      }

      // Handle simple fraction like '1/2' or mixed '1 1/2'
      const mixedMatch = cleaned.match(/^(\d+)\s+(\d+)\/(\d+)$/);
      if (mixedMatch) {
        const whole = parseInt(mixedMatch[1], 10);
        const num = parseFloat(mixedMatch[2]);
        const den = parseFloat(mixedMatch[3]);
        if (den === 0) return null;
        return whole + num / den;
      }

      const simpleFracMatch = cleaned.match(/^(\d+)\/(\d+)$/);
      if (simpleFracMatch) {
        const num = parseFloat(simpleFracMatch[1]);
        const den = parseFloat(simpleFracMatch[2]);
        if (den === 0) return null;
        return num / den;
      }

      // Replace any unicode fraction characters inside the string (e.g. '1Â½' where regex didn't match)
      let replaced = cleaned;
      Object.keys(unicodeFractions).forEach(u => {
        if (replaced.indexOf(u) !== -1) {
          replaced = replaced.replace(new RegExp(u, 'g'), `+${unicodeFractions[u]}`);
        }
      });
      // If replacement occurred and now contains a '+', evaluate it simply
      if (replaced.indexOf('+') !== -1) {
        // e.g. '1+0.5' or '1 +0.5' -> sum parts
        const parts = replaced.split('+').map(p => p.trim()).filter(Boolean);
        let sum = 0;
        for (const p of parts) {
          const n = parseFloat(p);
          if (isNaN(n)) return null;
          sum += n;
        }
        return sum;
      }

      // Fallback to parseFloat
      const num = parseFloat(cleaned);
      return isNaN(num) ? null : num;
    };
    
    // Fixed column positions (Excel columns converted to 0-based array indices):
    // Column O (index 14) = before breakfast
    // Column Q (index 16) = during breakfast
    // Column S (index 18) = after breakfast (add to during)
    // Column T (index 19) = before lunch
    // Column U (index 20) = during lunch
    // Column V (index 21) = after lunch (add to during)
    // Column W (index 22) = before dinner
    // Column X (index 23) = during dinner
    // Column Y (index 24) = after dinner (add to during)
    // Column AB (index 27) = sleep
    // Column AL (index 37) = indication
    
    // Column N (index 13) may contain a frequency that should be
    // interpreted as 'before breakfast' (edge case). Read it and merge
    // with the normal before-breakfast column (O, index 14).
    const colNBeforeBreakfast = parseNumber(columns[13]);
    const beforeBreakfastBase = parseNumber(columns[14]);
    const duringBreakfastBase = parseNumber(columns[16]);
    const afterBreakfast = parseNumber(columns[18]);
    
    const beforeLunch = parseNumber(columns[19]);
    const duringLunchBase = parseNumber(columns[20]);
    const afterLunch = parseNumber(columns[21]);
    
    const beforeDinner = parseNumber(columns[22]);
    const duringDinnerBase = parseNumber(columns[23]);
    const afterDinner = parseNumber(columns[24]);
    
    const atBedtime = parseNumber(columns[27]);
    
    // Combine column N (if present) into beforeBreakfast, and combine "after" into "during"
    const beforeBreakfast = ((colNBeforeBreakfast || 0) + (beforeBreakfastBase || 0)) || null;
    const duringBreakfast = (duringBreakfastBase || 0) + (afterBreakfast || 0) || null;
    const duringLunch = (duringLunchBase || 0) + (afterLunch || 0) || null;
    const duringDinner = (duringDinnerBase || 0) + (afterDinner || 0) || null;
    
    // Extract indication from column AL (index 37)
    let indication = columns[37]?.trim() || '';
    
    // Clean up indication - remove "Indicatie:" prefix if present
    if (indication.includes('Indicatie:')) {
      indication = indication.replace('Indicatie:', '').trim();
    }
    // Remove usage instructions if present
    if (indication.includes('Gebruiksaanwijzing:')) {
      indication = indication.split('Gebruiksaanwijzing:')[0].trim();
    }

    return {
      name: medicationName,
      indication: indication || undefined,
      asNeeded: asNeeded,
      unitsBeforeBreakfast: beforeBreakfast ?? undefined,
      unitsDuringBreakfast: duringBreakfast ?? undefined,
      unitsBeforeLunch: beforeLunch ?? undefined,
      unitsDuringLunch: duringLunch ?? undefined,
      unitsBeforeDinner: beforeDinner ?? undefined,
      unitsDuringDinner: duringDinner ?? undefined,
      unitsAtBedtime: atBedtime ?? undefined
    };
  }  private saveParsedMedications(medications: Partial<Medication>[]) {
    const medicationReviewId = this.stateService.medicationReviewId;
    if (!medicationReviewId) {
      alert('Please create or select a medication review first.');
      return;
    }
    
    this.isLoading = true;
    
    // Step 1: Search for CNK matches for all medications in parallel
    const searchObservables = medications.map(med => 
      this.apiService.searchMedications({ searchTerm: med.name || '', maxResults: 10 }).pipe(
        map(response => ({ medication: med, matches: response.results })),
        catchError(error => {
          return of({ medication: med, matches: [] });
        })
      )
    );
    
    forkJoin(searchObservables).subscribe({
      next: (searchResults) => {
        this.processCnkMatches(searchResults);
      },
      error: (error) => {
        this.isLoading = false;
        alert('Failed to match medications to CNK codes. Please try again.');
      }
    });
  }

  private processCnkMatches(searchResults: Array<{ medication: Partial<Medication>, matches: MedicationSearchResult[] }>) {
    this.pendingMedicationsToSave = [];
    
    for (const result of searchResults) {
      const { medication, matches } = result;
      
      if (matches.length === 0) {
        // No matches found - will save without CNK
        this.pendingMedicationsToSave.push(medication);
      } else if (matches.length === 1) {
        // Single match - auto-select it
        this.pendingMedicationsToSave.push({ ...medication, searchResult: matches[0] });
      } else {
        // Multiple matches - need user selection
        const bestMatch = this.findBestMatch(medication.name || '', matches);
        if (bestMatch && this.isCloseMatch(medication.name || '', bestMatch.benaming)) {
          // If there's a very close match (exact or near-exact), auto-select it
          this.pendingMedicationsToSave.push({ ...medication, searchResult: bestMatch });
        } else {
          // Ambiguous - need user selection
          this.pendingMedicationsToSave.push({ ...medication, needsUserSelection: true, matches } as any);
        }
      }
    }
    
    this.isLoading = false;
    this.currentMedicationIndex = 0;
    this.processNextMedication();
  }

  private findBestMatch(searchTerm: string, matches: MedicationSearchResult[]): MedicationSearchResult | null {
    if (matches.length === 0) return null;
    
    const normalizedSearch = searchTerm.toLowerCase().trim();
    
    // Try exact match first
    for (const match of matches) {
      if (match.benaming.toLowerCase().trim() === normalizedSearch) {
        return match;
      }
    }
    
    // Return the first match as best guess
    return matches[0];
  }

  private isCloseMatch(searchTerm: string, matchName: string): boolean {
    const normalizedSearch = searchTerm.toLowerCase().trim();
    const normalizedMatch = matchName.toLowerCase().trim();
    
    // Exact match
    if (normalizedSearch === normalizedMatch) return true;
    
    // One starts with the other
    if (normalizedMatch.startsWith(normalizedSearch) || normalizedSearch.startsWith(normalizedMatch)) {
      return true;
    }
    
    return false;
  }

  private processNextMedication() {
    if (this.currentMedicationIndex >= this.pendingMedicationsToSave.length) {
      // All medications processed - now save them
      this.saveAllMedicationsWithCnk();
      return;
    }
    
    const med = this.pendingMedicationsToSave[this.currentMedicationIndex] as any;
    
    if (med.needsUserSelection && med.matches && med.matches.length > 0) {
      // Show modal for user to select CNK
      this.currentMedicationForCnkSelection = {
        medicationName: med.name || '',
        indication: med.indication,
        asNeeded: med.asNeeded,
        unitsBeforeBreakfast: med.unitsBeforeBreakfast,
        unitsDuringBreakfast: med.unitsDuringBreakfast,
        unitsBeforeLunch: med.unitsBeforeLunch,
        unitsDuringLunch: med.unitsDuringLunch,
        unitsBeforeDinner: med.unitsBeforeDinner,
        unitsDuringDinner: med.unitsDuringDinner,
        unitsAtBedtime: med.unitsAtBedtime,
        matches: med.matches
      };
      this.showCnkSelectionModal = true;
    } else {
      // No user selection needed - move to next
      this.currentMedicationIndex++;
      this.processNextMedication();
    }
  }

  onCnkSelected(searchResult: MedicationSearchResult) {
    
    // Update the pending medication with the selected CNK
    const med = this.pendingMedicationsToSave[this.currentMedicationIndex] as any;
    med.searchResult = searchResult;
    delete med.needsUserSelection;
    delete med.matches;
    
    this.showCnkSelectionModal = false;
    this.currentMedicationForCnkSelection = null;
    this.currentMedicationIndex++;
    this.processNextMedication();
  }

  onCnkSkipped() {
    
    // Keep the medication without CNK
    const med = this.pendingMedicationsToSave[this.currentMedicationIndex] as any;
    delete med.needsUserSelection;
    delete med.matches;
    
    this.showCnkSelectionModal = false;
    this.currentMedicationForCnkSelection = null;
    this.currentMedicationIndex++;
    this.processNextMedication();
  }

  onCnkSelectionCancelled() {
    this.showCnkSelectionModal = false;
    this.currentMedicationForCnkSelection = null;
    this.pendingMedicationsToSave = [];
    this.currentMedicationIndex = 0;
  }

  private saveAllMedicationsWithCnk() {
    const medicationReviewId = this.stateService.medicationReviewId;
    if (!medicationReviewId) {
      return;
    }
    
    this.isLoading = true;
    
    let savedCount = 0;
    const saveNext = (index: number) => {
      if (index >= this.pendingMedicationsToSave.length) {
        this.isLoading = false;
        alert(`Successfully imported ${savedCount} medication(s).`);
        this.loadMedications();
        this.stateService.notifyMedicationsChanged();
        this.pendingMedicationsToSave = [];
        return;
      }
      
      const med = this.pendingMedicationsToSave[index] as any;
      const payload: any = {
        name: med.name || '',
        indication: med.indication,
        asNeeded: med.asNeeded,
        unitsBeforeBreakfast: med.unitsBeforeBreakfast,
        unitsDuringBreakfast: med.unitsDuringBreakfast,
        unitsBeforeLunch: med.unitsBeforeLunch,
        unitsDuringLunch: med.unitsDuringLunch,
        unitsBeforeDinner: med.unitsBeforeDinner,
        unitsDuringDinner: med.unitsDuringDinner,
        unitsAtBedtime: med.unitsAtBedtime
      };
      
      // Add CNK/VMP/packageSize if available
      if (med.searchResult) {
        payload.cnk = parseInt(med.searchResult.cnk) || undefined;
        payload.vmp = med.searchResult.vmp ? parseInt(med.searchResult.vmp) : undefined;
        payload.packageSize = med.searchResult.verpakking || undefined;
      }
      
      this.apiService.addMedication(medicationReviewId, payload).subscribe({
        next: (response) => {
          savedCount++;
          saveNext(index + 1);
        },
        error: (error) => {
          // Continue with next medication
          saveNext(index + 1);
        }
      });
    };
    
    saveNext(0);
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
    const medicationReviewId = this.stateService.medicationReviewId;
    if (!medicationReviewId) {
      return;
    }

    // Check if we're editing an existing medication
    if (this.editingMedication) {

      // Update the existing medication while preserving intake and indication
      this.apiService.updateMedication(
        medicationReviewId,
        this.editingMedication.medicationId,
        {
          name: medication.benaming,
          cnk: parseInt(medication.cnk) || undefined,
          vmp: medication.vmp ? parseInt(medication.vmp) : undefined,
          packageSize: medication.verpakking ?? undefined,
          // Preserve existing values
          indication: this.editingMedication.indication || undefined,
          specialFrequency: this.editingMedication.specialFrequency ?? undefined,
          specialDescription: this.editingMedication.specialDescription || undefined,
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
          this.stateService.notifyMedicationsChanged();
        },
        error: (error) => {
          alert('Failed to update medication. Please try again.');
        }
      });
    } else {
      // Adding new medication

      this.apiService.addMedication(
        medicationReviewId,
        {
          name: medication.benaming,
          cnk: parseInt(medication.cnk) || undefined,
          vmp: medication.vmp ? parseInt(medication.vmp) : undefined,
          packageSize: medication.verpakking ?? undefined
        }
      ).subscribe({
        next: (response) => {
          this.showSearchModal = false;
          this.loadMedications();
          this.stateService.notifyMedicationsChanged();
          
          // Mark as new and scroll to it after a brief delay to allow rendering
          setTimeout(() => {
            this.scrollToNewMedication();
          }, 100);
        },
        error: (error) => {
          alert('Failed to add medication. Please try again.');
        }
      });
    }
  }

  onMedicationDeleted(medicationId: string) {
    // Remove from local array
    this.medications = this.medications.filter(med => med.medicationId !== medicationId);
    this.stateService.notifyMedicationsChanged();
  }

  onEditRequested(medication: Medication) {
    this.editingMedication = medication;
    this.showSearchModal = true;
  }

  deleteAllMedications() {
    if (!this.medications || this.medications.length === 0) {
      alert('No medications to delete.');
      return;
    }

    // Show confirmation modal instead of browser confirm
    this.showDeleteAllModal = true;
  }

  onDeleteAllConfirmed() {
    this.showDeleteAllModal = false;

    const medicationReviewId = this.stateService.medicationReviewId;
    if (!medicationReviewId) {
      alert('Please create or select a medication review first.');
      return;
    }

    // Delete sequentially to avoid hitting backend limits
    const medsToDelete = [...this.medications];
    let deletedCount = 0;

    const deleteNext = (index: number) => {
      if (index >= medsToDelete.length) {
        alert(`Deleted ${deletedCount} medication(s).`);
        this.loadMedications();
        this.stateService.notifyMedicationsChanged();
        return;
      }

      const med = medsToDelete[index];
      if (!med.medicationId) {
        deleteNext(index + 1);
        return;
      }

      this.apiService.deleteMedication(medicationReviewId, med.medicationId).subscribe({
        next: () => {
          deletedCount++;
          deleteNext(index + 1);
        },
        error: (err) => {
          // continue with next
          deleteNext(index + 1);
        }
      });
    };

    deleteNext(0);
  }

  onDeleteAllCancelled() {
    this.showDeleteAllModal = false;
  }

  private scrollToNewMedication() {
    if (this.medications.length === 0) return;
    
    // Mark the last medication as new
    const lastMedication = this.medications[this.medications.length - 1];
    if (lastMedication) {
      (lastMedication as any).isNew = true;
      
      // Scroll to the last medication after rendering
      setTimeout(() => {
        const scrollContainer = this.medicationsScrollContainer?.nativeElement;
        if (scrollContainer) {
          // Get the last medication item element
          const lastItem = scrollContainer.lastElementChild;
          if (lastItem) {
            // Scroll the item into view smoothly
            lastItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }
      }, 50);

      // Remove the new flag after animation completes
      setTimeout(() => {
        (lastMedication as any).isNew = false;
      }, 2500);
    }
  }
}
