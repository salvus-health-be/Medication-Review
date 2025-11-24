import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ApiService } from './api.service';
import { StateService } from './state.service';
import { Medication } from '../models/api.models';

// APB Response Interfaces
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

export interface InteractionsResponse {
  language: string;
  participants: Participant[];
  result: InteractionsResult;
}

export interface InteractionsCacheData {
  response: InteractionsResponse | null;
  medications: Medication[];
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
}

@Injectable({
  providedIn: 'root'
})
export class InteractionsCacheService {
  private cacheSubject = new BehaviorSubject<InteractionsCacheData>({
    response: null,
    medications: [],
    loading: false,
    error: null,
    lastUpdated: null
  });

  public cache$: Observable<InteractionsCacheData> = this.cacheSubject.asObservable();
  private enabled = false;

  constructor(
    private apiService: ApiService,
    private stateService: StateService
  ) {
    // Subscribe to medication changes, but only refresh if enabled
    this.stateService.medicationsChanged$.subscribe(() => {
      if (this.enabled) {
        this.refreshCache();
      }
    });
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    // If enabling, refresh immediately
    if (enabled) {
      this.refreshCache();
    }
  }

  forceRefresh(): void {
    this.refreshCache();
  }

  private updateCache(partial: Partial<InteractionsCacheData>): void {
    this.cacheSubject.next({
      ...this.cacheSubject.value,
      ...partial
    });
  }

  refreshCache(): void {
    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) {
      this.updateCache({
        response: null,
        medications: [],
        loading: false,
        error: null,
        lastUpdated: null
      });
      return;
    }

    this.updateCache({ loading: true, error: null });

    // First load medications
    this.apiService.getMedications(reviewId).subscribe({
      next: (medications) => {
        
        // Check if we have any medications with CNKs
        const cnks = medications
          .filter(med => med.cnk)
          .map(med => ({
            cnk: med.cnk!.toString().padStart(7, '0'),
            routeOfAdministrationCode: med.routeOfAdministration || 'OR'
          }));

        if (cnks.length === 0) {
          this.updateCache({
            response: null,
            medications,
            loading: false,
            lastUpdated: Date.now()
          });
          return;
        }

        // Call interactions API
        const request = {
          language: 'NL',
          cnks
        };

        this.apiService.checkInteractions(request).subscribe({
          next: (response) => {
            this.updateCache({
              response,
              medications,
              loading: false,
              lastUpdated: Date.now()
            });
          },
          error: (err) => {
            this.updateCache({
              medications,
              loading: false,
              error: 'Failed to check interactions',
              lastUpdated: Date.now()
            });
          }
        });
      },
      error: (err) => {
        this.updateCache({
          loading: false,
          error: 'Failed to load medications'
        });
      }
    });
  }

  getCacheData(): InteractionsCacheData {
    return this.cacheSubject.value;
  }

  clearCache(): void {
    this.updateCache({
      response: null,
      medications: [],
      loading: false,
      error: null,
      lastUpdated: null
    });
  }
}
