import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { 
  LoginRequest, 
  LoginResponse, 
  UpdatePatientRequest, 
  UpdatePatientResponse, 
  UpdateMedicationReviewRequest, 
  UpdateMedicationReviewResponse,
  APBContraindicationsRequest,
  APBContraindicationsResponse,
  APBContraindicationsResponseBackend,
  Contraindication,
  AddContraindicationRequest,
  UpdateContraindicationRequest,
  ContraindicationResponse,
  MedicationSearchRequest,
  MedicationSearchResponse,
  Medication,
  AddMedicationRequest,
  MedicationResponse,
  UpdateMedicationRequest,
  LabValue,
  AddLabValueRequest,
  UpdateLabValueRequest,
  LabValueResponse,
  DispensingHistoryResponse,
  AddManualDispensingMomentRequest,
  AddManualDispensingMomentResponse,
  QuestionAnswer,
  AddQuestionAnswerRequest,
  UpdateQuestionAnswerRequest,
  QuestionAnswerResponse,
  ProductCompositionRequest,
  ProductCompositionResponse
} from '../models/api.models';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  // API base URL is now configured via environment files
  // Development: Uses '/api' with proxy to http://localhost:7071/api
  // Production: Update environment.prod.ts with the production API URL
  private readonly API_BASE_URL = environment.apiBaseUrl;
  private contraindicationsCache: Map<string, APBContraindicationsResponse> = new Map();

  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
  }

  login(request: LoginRequest): Observable<LoginResponse> {
    const headers = this.getHeaders();

    return this.http.post<any>(`${this.API_BASE_URL}/login`, request, { headers })
      .pipe(
        tap(rawResponse => console.log('[ApiService] RAW Login response:', rawResponse)),
        map(response => ({
          patientCreated: response.patientCreated ?? response.PatientCreated ?? false,
          reviewCreated: response.reviewCreated ?? response.ReviewCreated ?? false,
          patientId: response.patientId ?? response.PatientId ?? '',
          medicationReviewId: response.medicationReviewId ?? response.MedicationReviewId ?? '',
          patient: {
            dateOfBirth: response.patient?.dateOfBirth ?? response.patient?.DateOfBirth ?? response.Patient?.dateOfBirth ?? response.Patient?.DateOfBirth ?? null,
            sex: response.patient?.sex ?? response.patient?.Sex ?? response.Patient?.sex ?? response.Patient?.Sex ?? null,
            renalFunction: response.patient?.renalFunction ?? response.patient?.RenalFunction ?? response.Patient?.renalFunction ?? response.Patient?.RenalFunction ?? null
          },
          review: {
            reviewDate: response.review?.reviewDate ?? response.review?.ReviewDate ?? response.Review?.reviewDate ?? response.Review?.ReviewDate ?? null,
            firstNameAtTimeOfReview: response.review?.firstNameAtTimeOfReview ?? response.review?.FirstNameAtTimeOfReview ?? response.Review?.firstNameAtTimeOfReview ?? response.Review?.FirstNameAtTimeOfReview ?? null,
            lastNameAtTimeOfReview: response.review?.lastNameAtTimeOfReview ?? response.review?.LastNameAtTimeOfReview ?? response.Review?.lastNameAtTimeOfReview ?? response.Review?.LastNameAtTimeOfReview ?? null
          }
        })),
        tap(mappedResponse => console.log('[ApiService] Mapped Login response:', mappedResponse))
      );
  }

  updatePatient(request: UpdatePatientRequest): Observable<UpdatePatientResponse> {
    const headers = this.getHeaders();

    return this.http.put<UpdatePatientResponse>(`${this.API_BASE_URL}/update_patient`, request, { headers })
      .pipe(tap(response => console.log('[ApiService] Update patient response:', response)));
  }

  updateMedicationReview(request: UpdateMedicationReviewRequest): Observable<UpdateMedicationReviewResponse> {
    const headers = this.getHeaders();

    return this.http.put<UpdateMedicationReviewResponse>(`${this.API_BASE_URL}/update_medication_review`, request, { headers })
      .pipe(tap(response => console.log('[ApiService] Update review response:', response)));
  }

  // APB Contraindications
  getAPBContraindications(request: APBContraindicationsRequest): Observable<APBContraindicationsResponse> {
    const headers = this.getHeaders();
    const cacheKey = `contraindications-${request.language}`;

    // Check cache first
    if (this.contraindicationsCache.has(cacheKey)) {
      console.log('[ApiService] Returning cached contraindications for', request.language);
      return of(this.contraindicationsCache.get(cacheKey)!);
    }

    console.log('[ApiService] Fetching contraindications from API for', request.language);
    return this.http.post<APBContraindicationsResponseBackend>(`${this.API_BASE_URL}/get_apb_contraindications`, request, { headers })
      .pipe(
        map(backendResponse => {
          // Convert PascalCase to camelCase, including nested items
          const response: APBContraindicationsResponse = {
            language: backendResponse.Language,
            result: {
              hypersensitivities: {
                list: backendResponse.Result.Hypersensitivities.List.map(item => ({
                  code: (item as any).Code || item.code,
                  description: (item as any).Description || item.description
                }))
              },
              pathologies: {
                list: backendResponse.Result.Pathologies.List.map(item => ({
                  code: (item as any).Code || item.code,
                  description: (item as any).Description || item.description
                }))
              },
              physiologicalConditions: {
                list: backendResponse.Result.PhysiologicalConditions.List.map(item => ({
                  code: (item as any).Code || item.code,
                  description: (item as any).Description || item.description
                }))
              }
            }
          };
          // Cache the result
          this.contraindicationsCache.set(cacheKey, response);
          console.log('[ApiService] Cached contraindications for', request.language);
          return response;
        })
      );
  }

  // Clear contraindications cache (useful for testing or if data needs refresh)
  clearContraindicationsCache(): void {
    this.contraindicationsCache.clear();
    console.log('[ApiService] Contraindications cache cleared');
  }

  // Contraindication CRUD
  getContraindications(medicationReviewId: string): Observable<Contraindication[]> {
    return this.http.get<any[]>(`${this.API_BASE_URL}/manage_contraindications?medicationReviewId=${medicationReviewId}`, {
      headers: this.getHeaders()
    })
      .pipe(
        map(items => items.map(item => ({
          contraindicationId: item.rowKey || item.ContraindicationId || item.contraindicationId,
          name: item.name || item.Name,
          contraindicationCode: item.contraindicationCode || item.ContraindicationCode
        })))
      );
  }

  addContraindication(reviewId: string, contraindication: any): Observable<ContraindicationResponse> {
    const headers = this.getHeaders();

    const request = { medicationReviewId: reviewId, ...contraindication };

    return this.http.post<any>(`${this.API_BASE_URL}/manage_contraindications`, request, { headers })
      .pipe(
        map(item => ({
          contraindicationId: item.rowKey || item.ContraindicationId || item.contraindicationId,
          name: item.name || item.Name,
          contraindicationCode: item.contraindicationCode || item.ContraindicationCode
        }))
      );
  }

  updateContraindication(reviewId: string, contraindicationId: string, contraindication: any): Observable<ContraindicationResponse> {
    const headers = this.getHeaders();

    const request = { 
      medicationReviewId: reviewId, 
      contraindicationId, 
      ...contraindication 
    };

    return this.http.put<any>(`${this.API_BASE_URL}/manage_contraindications`, request, { headers })
      .pipe(
        map(item => ({
          contraindicationId: item.rowKey || item.ContraindicationId || item.contraindicationId,
          name: item.name || item.Name,
          contraindicationCode: item.contraindicationCode || item.ContraindicationCode
        }))
      );
  }

  deleteContraindication(medicationReviewId: string, contraindicationId: string): Observable<void> {
    return this.http.delete<void>(`${this.API_BASE_URL}/manage_contraindications?medicationReviewId=${medicationReviewId}&contraindicationId=${contraindicationId}`);
  }

  // Medication Search
  searchMedications(request: MedicationSearchRequest): Observable<MedicationSearchResponse> {
    const headers = this.getHeaders();

    return this.http.post<any>(`${this.API_BASE_URL}/search_medications`, request, { headers })
      .pipe(
        tap(rawResponse => console.log('[ApiService] RAW search_medications response:', JSON.stringify(rawResponse, null, 2))),
        map(backendResponse => ({
          searchTerm: backendResponse.searchTerm || backendResponse.SearchTerm,
          count: backendResponse.count || backendResponse.Count,
          results: (backendResponse.results || backendResponse.Results || []).map((item: any) => ({
            benaming: item.benaming || item.Benaming,
            cnk: item.cnk || item.CNK || item.Cnk,
            verpakking: item.verpakking || item.Verpakking,
            vmp: item.vmp || item.VMP || item.Vmp || null
          }))
        }))
      );
  }

  // Medication CRUD
  getMedications(medicationReviewId: string): Observable<Medication[]> {
    console.log('[ApiService] === GET MEDICATIONS ===');
    console.log('[ApiService] URL: GET', `${this.API_BASE_URL}/manage_medications?medicationReviewId=${medicationReviewId}`);
    
    return this.http.get<any[]>(`${this.API_BASE_URL}/manage_medications?medicationReviewId=${medicationReviewId}`, { 
      headers: this.getHeaders() 
    })
      .pipe(
        tap(rawResponse => {
          console.log('[ApiService] RAW backend response:', JSON.stringify(rawResponse, null, 2));
        }),
        map(items => {
          const mapped = items.map(item => ({
            medicationId: item.rowKey ?? item.MedicationId ?? item.medicationId,
            name: item.name ?? item.Name ?? null,
            cnk: item.cnk ?? item.CNK ?? item.Cnk ?? null,
            asNeeded: (item.asNeeded === true || item.asNeeded === 'true' || item.AsNeeded === true || item.AsNeeded === 'true') ? true : false,
            vmp: item.vmp ?? item.VMP ?? item.Vmp ?? null,
            packageSize: item.packageSize ?? item.PackageSize ?? null,
            activeIngredient: item.activeIngredient ?? item.ActiveIngredient ?? null,
            dosageMg: item.dosageMg ?? item.DosageMg ?? null,
            routeOfAdministration: item.routeOfAdministration ?? item.RouteOfAdministration ?? null,
            indication: item.indication ?? item.Indication ?? null,
            specialFrequency: item.specialFrequency ?? item.SpecialFrequency ?? null,
            specialDescription: item.specialDescription ?? item.SpecialDescription ?? null,
            unitsBeforeBreakfast: item.unitsBeforeBreakfast ?? item.UnitsBeforeBreakfast ?? null,
            unitsDuringBreakfast: item.unitsDuringBreakfast ?? item.UnitsDuringBreakfast ?? null,
            unitsBeforeLunch: item.unitsBeforeLunch ?? item.UnitsBeforeLunch ?? null,
            unitsDuringLunch: item.unitsDuringLunch ?? item.UnitsDuringLunch ?? null,
            unitsBeforeDinner: item.unitsBeforeDinner ?? item.UnitsBeforeDinner ?? null,
            unitsDuringDinner: item.unitsDuringDinner ?? item.UnitsDuringDinner ?? null,
            unitsAtBedtime: item.unitsAtBedtime ?? item.UnitsAtBedtime ?? null,
            timestamp: item.timestamp ?? item.Timestamp ?? null
          }));
          
          // Sort by timestamp (oldest first)
          mapped.sort((a, b) => {
            if (!a.timestamp && !b.timestamp) return 0;
            if (!a.timestamp) return 1;
            if (!b.timestamp) return -1;
            return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
          });
          
          console.log('[ApiService] Medications sorted by timestamp:', mapped.length);
          return mapped;
        })
      );
  }

  addMedication(reviewId: string, medication: any): Observable<MedicationResponse> {
    const headers = this.getHeaders();

    const request = { medicationReviewId: reviewId, ...medication };

    console.log('[ApiService] === ADD MEDICATION ===');
    console.log('[ApiService] Request:', JSON.stringify(request, null, 2));

    return this.http.post<any>(`${this.API_BASE_URL}/manage_medications`, request, { headers })
      .pipe(
        tap(rawResponse => {
          console.log('[ApiService] RAW add medication response:', JSON.stringify(rawResponse, null, 2));
        }),
        map(item => ({
          medicationId: item.rowKey ?? item.MedicationId ?? item.medicationId,
          name: item.name ?? item.Name ?? null,
          asNeeded: (item.asNeeded === true || item.asNeeded === 'true' || item.AsNeeded === true || item.AsNeeded === 'true') ? true : false,
          cnk: item.cnk ?? item.CNK ?? item.Cnk ?? null,
          vmp: item.vmp ?? item.VMP ?? item.Vmp ?? null,
          packageSize: item.packageSize ?? item.PackageSize ?? null,
          activeIngredient: item.activeIngredient ?? item.ActiveIngredient ?? null,
          dosageMg: item.dosageMg ?? item.DosageMg ?? null,
          routeOfAdministration: item.routeOfAdministration ?? item.RouteOfAdministration ?? null,
          indication: item.indication ?? item.Indication ?? null,
          specialFrequency: item.specialFrequency ?? item.SpecialFrequency ?? null,
          specialDescription: item.specialDescription ?? item.SpecialDescription ?? null,
          unitsBeforeBreakfast: item.unitsBeforeBreakfast ?? item.UnitsBeforeBreakfast ?? null,
          unitsDuringBreakfast: item.unitsDuringBreakfast ?? item.UnitsDuringBreakfast ?? null,
          unitsBeforeLunch: item.unitsBeforeLunch ?? item.UnitsBeforeLunch ?? null,
          unitsDuringLunch: item.unitsDuringLunch ?? item.UnitsDuringLunch ?? null,
          unitsBeforeDinner: item.unitsBeforeDinner ?? item.UnitsBeforeDinner ?? null,
          unitsDuringDinner: item.unitsDuringDinner ?? item.UnitsDuringDinner ?? null,
          unitsAtBedtime: item.unitsAtBedtime ?? item.UnitsAtBedtime ?? null
        }))
      );
  }

  updateMedication(reviewId: string, medicationId: string, medication: any): Observable<MedicationResponse> {
    const headers = this.getHeaders();

    const request = { 
      medicationReviewId: reviewId, 
      medicationId, 
      ...medication 
    };

    console.log('[ApiService] === UPDATE MEDICATION REQUEST ===');
    console.log('[ApiService] URL: PUT', `${this.API_BASE_URL}/manage_medications`);
    console.log('[ApiService] Request body:', JSON.stringify(request, null, 2));

    return this.http.put<any>(`${this.API_BASE_URL}/manage_medications`, request, { headers })
      .pipe(
        tap(rawResponse => {
          console.log('[ApiService] RAW backend response:', JSON.stringify(rawResponse, null, 2));
        }),
        map(item => ({
          medicationId: item.rowKey ?? item.MedicationId ?? item.medicationId,
          name: item.name ?? item.Name ?? null,
          asNeeded: (item.asNeeded === true || item.asNeeded === 'true' || item.AsNeeded === true || item.AsNeeded === 'true') ? true : false,
          cnk: item.cnk ?? item.CNK ?? item.Cnk ?? null,
          vmp: item.vmp ?? item.VMP ?? item.Vmp ?? null,
          packageSize: item.packageSize ?? item.PackageSize ?? null,
          activeIngredient: item.activeIngredient ?? item.ActiveIngredient ?? null,
          dosageMg: item.dosageMg ?? item.DosageMg ?? null,
          routeOfAdministration: item.routeOfAdministration ?? item.RouteOfAdministration ?? null,
          indication: item.indication ?? item.Indication ?? null,
          specialFrequency: item.specialFrequency ?? item.SpecialFrequency ?? null,
          specialDescription: item.specialDescription ?? item.SpecialDescription ?? null,
          unitsBeforeBreakfast: item.unitsBeforeBreakfast ?? item.UnitsBeforeBreakfast ?? null,
          unitsDuringBreakfast: item.unitsDuringBreakfast ?? item.UnitsDuringBreakfast ?? null,
          unitsBeforeLunch: item.unitsBeforeLunch ?? item.UnitsBeforeLunch ?? null,
          unitsDuringLunch: item.unitsDuringLunch ?? item.UnitsDuringLunch ?? null,
          unitsBeforeDinner: item.unitsBeforeDinner ?? item.UnitsBeforeDinner ?? null,
          unitsDuringDinner: item.unitsDuringDinner ?? item.UnitsDuringDinner ?? null,
          unitsAtBedtime: item.unitsAtBedtime ?? item.UnitsAtBedtime ?? null
        }))
      );
  }

  deleteMedication(medicationReviewId: string, medicationId: string): Observable<void> {
    return this.http.delete<void>(`${this.API_BASE_URL}/manage_medications?medicationReviewId=${medicationReviewId}&medicationId=${medicationId}`);
  }

  // Lab Value CRUD
  getLabValues(medicationReviewId: string): Observable<LabValue[]> {
    return this.http.get<any[]>(`${this.API_BASE_URL}/manage_lab_values?medicationReviewId=${medicationReviewId}`, {
      headers: this.getHeaders()
    })
      .pipe(
        map(items => items.map(item => ({
          labValueId: item.rowKey ?? item.LabValueId ?? item.labValueId,
          name: item.name ?? item.Name ?? null,
          value: item.value ?? item.Value ?? 0,
          unit: item.unit ?? item.Unit ?? null
        })))
      );
  }

  addLabValue(reviewId: string, labValue: any): Observable<LabValueResponse> {
    const headers = this.getHeaders();

    const request = { medicationReviewId: reviewId, ...labValue };

    return this.http.post<any>(`${this.API_BASE_URL}/manage_lab_values`, request, { headers })
      .pipe(
        map(item => ({
          labValueId: item.rowKey ?? item.LabValueId ?? item.labValueId,
          name: item.name ?? item.Name ?? null,
          value: item.value ?? item.Value ?? 0,
          unit: item.unit ?? item.Unit ?? null
        }))
      );
  }

  updateLabValue(reviewId: string, labValueId: string, labValue: any): Observable<LabValueResponse> {
    const headers = this.getHeaders();

    const request = { 
      medicationReviewId: reviewId, 
      labValueId, 
      ...labValue 
    };

    return this.http.put<any>(`${this.API_BASE_URL}/manage_lab_values`, request, { headers })
      .pipe(
        map(item => ({
          labValueId: item.rowKey ?? item.LabValueId ?? item.labValueId,
          name: item.name ?? item.Name ?? null,
          value: item.value ?? item.Value ?? 0,
          unit: item.unit ?? item.Unit ?? null
        }))
      );
  }

  deleteLabValue(medicationReviewId: string, labValueId: string): Observable<void> {
    return this.http.delete<void>(`${this.API_BASE_URL}/manage_lab_values?medicationReviewId=${medicationReviewId}&labValueId=${labValueId}`);
  }

  // Dispensing History
  uploadDispensingHistory(apbNumber: string, reviewId: string, file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    
    return this.http.post(
      `${this.API_BASE_URL}/upload_dispensing_history?apbNumber=${apbNumber}&medicationReviewId=${reviewId}`,
      formData
    ).pipe(tap(response => console.log('[ApiService] Upload dispensing history response:', response)));
  }

  queryDispensingHistory(apbNumber: string, reviewId: string): Observable<DispensingHistoryResponse> {
    return this.http.get<any>(
      `${this.API_BASE_URL}/query_dispensing_history?apbNumber=${apbNumber}&medicationReviewId=${reviewId}`
    ).pipe(
      tap(response => {
        console.log('[ApiService] Query dispensing history raw response:', JSON.stringify(response, null, 2));
        if (response.dispensingData?.[0]?.dispensingMoments?.[0]) {
          console.log('[ApiService] First raw moment:', response.dispensingData[0].dispensingMoments[0]);
        }
      }),
      map(response => ({
        medicationReviewId: response.medicationReviewId ?? response.MedicationReviewId,
        blobUri: response.blobUri ?? response.BlobUri,
        totalCnkCodes: response.totalCnkCodes ?? response.TotalCnkCodes,
        totalDispensingMoments: response.totalDispensingMoments ?? response.TotalDispensingMoments,
        csvMoments: response.csvMoments ?? response.CsvMoments,
        manualMoments: response.manualMoments ?? response.ManualMoments,
        dispensingData: (response.dispensingData ?? response.DispensingData ?? []).map((cnkGroup: any) => ({
          cnk: cnkGroup.cnk ?? cnkGroup.Cnk ?? cnkGroup.CNK,
          description: cnkGroup.description ?? cnkGroup.Description,
          dispensingMoments: (cnkGroup.dispensingMoments ?? cnkGroup.DispensingMoments ?? []).map((moment: any) => {
            const extractedId = moment.id ?? moment.Id ?? moment.rowKey ?? moment.RowKey;
            console.log('[ApiService] Extracting ID from moment:', { rawId: moment.id, rawId_PascalCase: moment.Id, rawRowKey: moment.rowKey, rawRowKey_PascalCase: moment.RowKey, extractedId });
            return {
              date: moment.date ?? moment.Date,
              amount: moment.amount ?? moment.Amount,
              source: moment.source ?? moment.Source,
              id: extractedId
            };
          })
        }))
      })),
      tap(response => {
        console.log('[ApiService] Query dispensing history mapped response:', JSON.stringify(response, null, 2));
        if (response.dispensingData?.[0]?.dispensingMoments?.[0]) {
          console.log('[ApiService] First mapped moment:', response.dispensingData[0].dispensingMoments[0]);
        }
      })
    );
  }

  addManualDispensingMoment(
    apbNumber: string, 
    reviewId: string, 
    moment: AddManualDispensingMomentRequest
  ): Observable<AddManualDispensingMomentResponse> {
    const headers = this.getHeaders();

    return this.http.post<AddManualDispensingMomentResponse>(
      `${this.API_BASE_URL}/add_manual_dispensing_moment?apbNumber=${apbNumber}&medicationReviewId=${reviewId}`,
      moment,
      { headers }
    ).pipe(tap(response => console.log('[ApiService] Add manual dispensing moment response:', response)));
  }

  deleteManualDispensingMoment(
    apbNumber: string,
    reviewId: string,
    id: string
  ): Observable<any> {
    return this.http.delete<any>(
      `${this.API_BASE_URL}/delete_manual_dispensing_moment?apbNumber=${apbNumber}&medicationReviewId=${reviewId}&id=${id}`
    ).pipe(tap(response => console.log('[ApiService] Delete manual dispensing moment response:', response)));
  }

  checkInteractions(request: any): Observable<any> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    return this.http.post<any>(
      `${this.API_BASE_URL}/get_interactions`,
      request,
      { headers }
    ).pipe(tap(response => console.log('[ApiService] Interactions response:', response)));
  }

  getInteractionDetails(request: any): Observable<any> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    return this.http.post<any>(
      `${this.API_BASE_URL}/get_interaction_details`,
      request,
      { headers }
    ).pipe(tap(response => console.log('[ApiService] Interaction details response:', response)));
  }

  // Contraindication Matching
  getContraindicationMatches(request: any): Observable<any> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    return this.http.post<any>(
      `${this.API_BASE_URL}/get_contraindication_matches`,
      request,
      { headers }
    ).pipe(tap(response => console.log('[ApiService] Contraindication matches response:', response)));
  }

  getProductContraindications(cnk: string, language?: string): Observable<any> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    return this.http.post<any>(
      `${this.API_BASE_URL}/get_product_contraindications`,
      { cnk, language: language || 'NL' },
      { headers }
    ).pipe(tap(response => console.log('[ApiService] Product contraindications response:', response)));
  }

  // Product Dosage (Posology)
  getProductDosage(cnk: string, language?: string): Observable<any> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    return this.http.post<any>(
      `${this.API_BASE_URL}/get_product_dosage`,
      { cnk, language: language || 'NL' },
      { headers }
    ).pipe(tap(response => console.log('[ApiService] Product dosage response:', response)));
  }

  // Product Renadaptor (Renal Dosing)
  getProductRenadaptor(cnk: string, language?: string): Observable<any> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    return this.http.post<any>(
      `${this.API_BASE_URL}/get_product_renadaptor`,
      { cnk, language: language || 'NL' },
      { headers }
    ).pipe(tap(response => console.log('[ApiService] Product renadaptor response:', response)));
  }

  // Reference Documents
  getReferenceDocumentUrl(type: 'gheops' | 'start-stop'): string {
    return `${this.API_BASE_URL}/get_reference_document?type=${type}`;
  }

  getReferenceDocument(type: 'gheops' | 'start-stop'): Observable<Blob> {
    return this.http.get(`${this.API_BASE_URL}/get_reference_document?type=${type}`, {
      responseType: 'blob'
    }).pipe(
      tap(() => console.log(`[ApiService] Retrieved reference document: ${type}`))
    );
  }

  // Review Notes CRUD
  getReviewNotes(medicationReviewId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.API_BASE_URL}/manage_review_notes?medicationReviewId=${medicationReviewId}`, {
      headers: this.getHeaders()
    }).pipe(
      tap(response => console.log('[ApiService] Get review notes response:', response))
    );
  }

  addReviewNote(reviewId: string, note: any): Observable<any> {
    const headers = this.getHeaders();
    const request = { medicationReviewId: reviewId, ...note };

    return this.http.post<any>(`${this.API_BASE_URL}/manage_review_notes`, request, { headers })
      .pipe(tap(response => console.log('[ApiService] Add review note response:', response)));
  }

  updateReviewNote(reviewId: string, reviewNoteId: string, updates: any): Observable<any> {
    const headers = this.getHeaders();
    const request = { 
      medicationReviewId: reviewId, 
      reviewNoteId, 
      ...updates 
    };

    return this.http.put<any>(`${this.API_BASE_URL}/manage_review_notes`, request, { headers })
      .pipe(tap(response => console.log('[ApiService] Update review note response:', response)));
  }

  deleteReviewNote(medicationReviewId: string, reviewNoteId: string): Observable<any> {
    return this.http.delete<any>(
      `${this.API_BASE_URL}/manage_review_notes?medicationReviewId=${medicationReviewId}&reviewNoteId=${reviewNoteId}`,
      { headers: this.getHeaders() }
    ).pipe(tap(response => console.log('[ApiService] Delete review note response:', response)));
  }

  // Question Answer CRUD
  getQuestionAnswers(medicationReviewId: string): Observable<QuestionAnswer[]> {
    return this.http.get<QuestionAnswer[]>(
      `${this.API_BASE_URL}/manage_question_answers?medicationReviewId=${medicationReviewId}`,
      { headers: this.getHeaders() }
    ).pipe(tap(response => console.log('[ApiService] Get question answers response:', response)));
  }

  getQuestionAnswer(medicationReviewId: string, questionName: string): Observable<QuestionAnswerResponse> {
    return this.http.get<QuestionAnswerResponse>(
      `${this.API_BASE_URL}/manage_question_answers?medicationReviewId=${medicationReviewId}&questionName=${questionName}`,
      { headers: this.getHeaders() }
    ).pipe(tap(response => console.log('[ApiService] Get question answer response:', response)));
  }

  addQuestionAnswer(request: AddQuestionAnswerRequest): Observable<QuestionAnswerResponse> {
    const headers = this.getHeaders();

    return this.http.post<QuestionAnswerResponse>(
      `${this.API_BASE_URL}/manage_question_answers`,
      request,
      { headers }
    ).pipe(tap(response => console.log('[ApiService] Add question answer response:', response)));
  }

  updateQuestionAnswer(request: UpdateQuestionAnswerRequest): Observable<QuestionAnswerResponse> {
    const headers = this.getHeaders();

    return this.http.put<QuestionAnswerResponse>(
      `${this.API_BASE_URL}/manage_question_answers`,
      request,
      { headers }
    ).pipe(tap(response => console.log('[ApiService] Update question answer response:', response)));
  }

  deleteQuestionAnswer(medicationReviewId: string, questionName: string): Observable<any> {
    return this.http.delete<any>(
      `${this.API_BASE_URL}/manage_question_answers?medicationReviewId=${medicationReviewId}&questionName=${questionName}`,
      { headers: this.getHeaders() }
    ).pipe(tap(response => console.log('[ApiService] Delete question answer response:', response)));
  }

  // Product Composition
  getProductComposition(cnk: string, language: string = 'NL'): Observable<ProductCompositionResponse> {
    const headers = this.getHeaders();
    const request: ProductCompositionRequest = {
      language,
      cnk
    };

    return this.http.post<ProductCompositionResponse>(
      `${this.API_BASE_URL}/get_product_composition`,
      request,
      { headers }
    ).pipe(
      tap(response => console.log('[ApiService] Product composition response:', response)),
      map(response => {
        // Cache the active ingredient name for easy access
        if (response.result && response.result.length > 0) {
          const activeIngredient = response.result[0].detailCompositions.find(
            (composition: any) => !composition.isExcipient
          );
          if (activeIngredient) {
            console.log('[ApiService] Active ingredient found:', activeIngredient.substanceName);
          }
        }
        return response;
      })
    );
  }
}

