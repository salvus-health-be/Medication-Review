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

  constructor(
    private apiService: ApiService,
    private stateService: StateService
  ) {
    // Subscribe to medication changes
    this.stateService.medicationsChanged$.subscribe(() => {
      console.log('[ContraindicationsCache] Medications changed, refreshing cache');
      this.refreshCache();
    });

    // Subscribe to contraindication changes
    this.stateService.contraindicationsChanged$.subscribe(() => {
      console.log('[ContraindicationsCache] Contraindications changed, refreshing cache');
      this.refreshCache();
    });
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
      console.log('[ContraindicationsCache] No review ID, clearing cache');
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
    forkJoin({
      medications: this.apiService.getMedications(reviewId),
      contraindications: this.apiService.getContraindications(reviewId)
    }).subscribe({
      next: ({ medications, contraindications }) => {
        console.log('[ContraindicationsCache] Loaded medications:', medications.length);
        console.log('[ContraindicationsCache] Loaded patient contraindications:', contraindications.length);

        const cnkCodes = medications
          .filter(med => med.cnk)
          .map(med => med.cnk!.toString().padStart(7, '0'));

        const conditionCodes = contraindications
          .filter(ci => ci.contraindicationCode)
          .map(ci => ci.contraindicationCode);

        if (cnkCodes.length === 0) {
          console.log('[ContraindicationsCache] No CNKs found, clearing contraindications');
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
              console.error('[ContraindicationsCache] Error checking matches:', err);
              return of(null);
            })
          ).subscribe({
            next: (matches) => {
              console.log('[ContraindicationsCache] Received contraindication matches');
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
              console.error('[ContraindicationsCache] Error loading matches:', err);
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
          console.log('[ContraindicationsCache] No matches to check');
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
        console.error('[ContraindicationsCache] Error loading medications/contraindications:', err);
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
      console.log('[ContraindicationsCache] Product contraindications already loading or loaded');
      return;
    }

    const cnkCodes = currentCache.medications
      .filter(med => med.cnk)
      .map(med => med.cnk!.toString().padStart(7, '0'));

    if (cnkCodes.length === 0) {
      console.log('[ContraindicationsCache] No CNKs to load product contraindications for');
      return;
    }

    console.log('[ContraindicationsCache] Loading product contraindications for', cnkCodes.length, 'medications');
    this.updateCache({ loadingProductContraindications: true });

    // Get product contraindications for each medication
    const productObservables = cnkCodes.map(cnk =>
      this.apiService.getProductContraindications(cnk, 'NL').pipe(
        catchError(err => {
          console.error(`[ContraindicationsCache] Error getting contraindications for CNK ${cnk}:`, err);
          return of(null);
        })
      )
    );

    forkJoin(productObservables).subscribe({
      next: (products) => {
        console.log('[ContraindicationsCache] Received product contraindications');
        this.updateCache({
          productResponses: products.filter(p => p !== null),
          loadingProductContraindications: false,
          productContraindicationsLoaded: true
        });
      },
      error: (err) => {
        console.error('[ContraindicationsCache] Error loading product contraindications:', err);
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
