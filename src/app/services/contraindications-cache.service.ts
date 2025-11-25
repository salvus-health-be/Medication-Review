import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ApiService } from './api.service';
import { StateService } from './state.service';
import { Medication } from '../models/api.models';

export interface ContraindicationsCacheData {
  matchesResponse: any | null;
  productResponses: any[];
  medications: Medication[];
  patientContraindications: any[];
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
  productContraindicationsLoaded: boolean;
  loadingProductContraindications: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ContraindicationsCacheService {
  private cacheSubject = new BehaviorSubject<ContraindicationsCacheData>({
    matchesResponse: null,
    productResponses: [],
    medications: [],
    patientContraindications: [],
    loading: false,
    error: null,
    lastUpdated: null,
    productContraindicationsLoaded: false,
    loadingProductContraindications: false
  });

  public cache$: Observable<ContraindicationsCacheData> = this.cacheSubject.asObservable();
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

    // Subscribe to contraindication changes, but only refresh if enabled
    this.stateService.contraindicationsChanged$.subscribe(() => {
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

  private updateCache(partial: Partial<ContraindicationsCacheData>): void {
    this.cacheSubject.next({
      ...this.cacheSubject.value,
      ...partial
    });
  }

  refreshCache(): void {
    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) {
      this.updateCache({
        matchesResponse: null,
        productResponses: [],
        medications: [],
        patientContraindications: [],
        loading: false,
        error: null,
        lastUpdated: null,
        productContraindicationsLoaded: false,
        loadingProductContraindications: false
      });
      return;
    }

    this.updateCache({ loading: true, error: null });

    // Load medications and patient contraindications in parallel
    const apbNumber = this.stateService.apbNumber;
    forkJoin({
      medications: this.apiService.getMedications(apbNumber, reviewId),
      contraindications: this.apiService.getContraindications(apbNumber, reviewId)
    }).subscribe({
      next: ({ medications, contraindications }) => {

        const cnkCodes = medications
          .filter(med => med.cnk)
          .map(med => med.cnk!.toString().padStart(7, '0'));

        const conditionCodes = contraindications
          .filter(ci => ci.contraindicationCode)
          .map(ci => ci.contraindicationCode);

        if (cnkCodes.length === 0) {
          this.updateCache({
            matchesResponse: null,
            productResponses: [],
            medications,
            patientContraindications: contraindications,
            loading: false,
            lastUpdated: Date.now(),
            productContraindicationsLoaded: false,
            loadingProductContraindications: false
          });
          return;
        }

        // Check matches if we have both CNKs and conditions
        if (cnkCodes.length > 0 && conditionCodes.length > 0) {
          this.apiService.getContraindicationMatches({
            language: 'NL',
            participatingProductCodes: cnkCodes,
            participatingPhysioPathologicalConditionCodes: conditionCodes
          }).pipe(
            catchError(err => {
              return of(null);
            })
          ).subscribe({
            next: (matches) => {
              this.updateCache({
                matchesResponse: matches,
                medications,
                patientContraindications: contraindications,
                loading: false,
                lastUpdated: Date.now(),
                productContraindicationsLoaded: false,
                loadingProductContraindications: false
              });
            },
            error: (err) => {
              this.updateCache({
                medications,
                patientContraindications: contraindications,
                loading: false,
                error: 'Failed to check contraindications',
                lastUpdated: Date.now()
              });
            }
          });
        } else {
          this.updateCache({
            matchesResponse: null,
            medications,
            patientContraindications: contraindications,
            loading: false,
            lastUpdated: Date.now(),
            productContraindicationsLoaded: false,
            loadingProductContraindications: false
          });
        }
      },
      error: (err) => {
        this.updateCache({
          loading: false,
          error: 'Failed to load data'
        });
      }
    });
  }

  getCacheData(): ContraindicationsCacheData {
    return this.cacheSubject.value;
  }

  loadProductContraindications(): void {
    const currentCache = this.cacheSubject.value;
    
    if (currentCache.loadingProductContraindications || currentCache.productContraindicationsLoaded) {
      return;
    }

    const cnkCodes = currentCache.medications
      .filter(med => med.cnk)
      .map(med => med.cnk!.toString().padStart(7, '0'));

    if (cnkCodes.length === 0) {
      return;
    }

    this.updateCache({ loadingProductContraindications: true });

    // Get product contraindications for each medication
    const productObservables = cnkCodes.map(cnk =>
      this.apiService.getProductContraindications(cnk, 'NL').pipe(
        catchError(err => {
          return of(null);
        })
      )
    );

    forkJoin(productObservables).subscribe({
      next: (products) => {
        this.updateCache({
          productResponses: products.filter(p => p !== null),
          loadingProductContraindications: false,
          productContraindicationsLoaded: true
        });
      },
      error: (err) => {
        this.updateCache({
          loadingProductContraindications: false,
          error: 'Failed to load additional contraindications'
        });
      }
    });
  }

  clearCache(): void {
    this.updateCache({
      matchesResponse: null,
      productResponses: [],
      medications: [],
      patientContraindications: [],
      loading: false,
      error: null,
      lastUpdated: null,
      productContraindicationsLoaded: false,
      loadingProductContraindications: false
    });
  }
}
