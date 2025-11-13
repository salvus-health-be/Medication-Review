import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { TranslocoModule } from '@jsverse/transloco';
import { StateService } from '../../services/state.service';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-patient-details',
  imports: [FormsModule, TranslocoModule],
  templateUrl: './patient-details.component.html',
  styleUrls: ['./patient-details.component.scss']
})
export class PatientDetailsComponent implements OnInit, OnDestroy {
  firstName: string = '';
  lastName: string = '';
  dateOfBirth: string = '';
  sex: string = '';

  private destroy$ = new Subject<void>();
  private dateOfBirthChanged$ = new Subject<string>();
  private sexChanged$ = new Subject<string>();
  private firstNameChanged$ = new Subject<string>();
  private lastNameChanged$ = new Subject<string>();

  constructor(
    private stateService: StateService,
    private apiService: ApiService
  ) {}

  ngOnInit() {
    // Prepopulate from session data
    const sessionData = this.stateService.getSessionData();
    if (sessionData) {
      // Populate from review (first/last name)
      if (sessionData.review.firstNameAtTimeOfReview) {
        this.firstName = sessionData.review.firstNameAtTimeOfReview;
      }
      if (sessionData.review.lastNameAtTimeOfReview) {
        this.lastName = sessionData.review.lastNameAtTimeOfReview;
      }

      // Populate from patient (dateOfBirth, sex)
      if (sessionData.patient.dateOfBirth) {
        // Convert ISO 8601 to YYYY-MM-DD format for date input
        this.dateOfBirth = sessionData.patient.dateOfBirth.split('T')[0];
      }
      if (sessionData.patient.sex) {
        this.sex = sessionData.patient.sex;
      }
    }

    // Set up auto-save for dateOfBirth changes (debounced)
    this.dateOfBirthChanged$
      .pipe(
        debounceTime(1000), // Wait 1 second after user stops typing
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe(value => this.savePatientData());

    // Set up auto-save for sex changes (debounced)
    this.sexChanged$
      .pipe(
        debounceTime(1000),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe(value => this.savePatientData());

    // Set up auto-save for first name changes (debounced)
    this.firstNameChanged$
      .pipe(
        debounceTime(1000),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe(value => this.saveMedicationReviewData());

    // Set up auto-save for last name changes (debounced)
    this.lastNameChanged$
      .pipe(
        debounceTime(1000),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe(value => this.saveMedicationReviewData());
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onDateOfBirthChange() {
    this.dateOfBirthChanged$.next(this.dateOfBirth);
  }

  onSexChange() {
    this.sexChanged$.next(this.sex);
  }

  onFirstNameChange() {
    this.firstNameChanged$.next(this.firstName);
  }

  onLastNameChange() {
    this.lastNameChanged$.next(this.lastName);
  }

  private savePatientData() {
    const sessionData = this.stateService.getSessionData();
    if (!sessionData) {
      console.warn('[PatientDetails] No session data available, cannot save');
      return;
    }

    // Get APB number and patient ID from state service
    const apbNumber = this.stateService.apbNumber;
    const patientId = this.stateService.patientId;
    
    // Only update if we have valid data
    const request: any = {
      apbNumber: apbNumber,
      patientId: patientId
    };

    // Only include fields that have values
    if (this.dateOfBirth) {
      // Convert YYYY-MM-DD to ISO 8601 format
      request.dateOfBirth = `${this.dateOfBirth}T00:00:00Z`;
    }
    
    if (this.sex) {
      request.sex = this.sex;
    }

    // Only save if we have at least one field to update
    if (request.dateOfBirth || request.sex) {
      console.log('[PatientDetails] === SAVING PATIENT DATA ===');
      console.log('[PatientDetails] Request payload:', JSON.stringify(request, null, 2));
      
      this.apiService.updatePatient(request).subscribe({
        next: (response) => {
          console.log('[PatientDetails] ✓ Patient updated successfully');
          console.log('[PatientDetails] Response:', JSON.stringify(response, null, 2));
          // Update session data with new values
          if (sessionData.patient) {
            sessionData.patient.dateOfBirth = response.dateOfBirth;
            sessionData.patient.sex = response.sex;
            this.stateService.setSessionData(sessionData);
          }
        },
        error: (error) => {
          console.error('[PatientDetails] ✗ Failed to update patient');
          console.error('[PatientDetails] Error:', error);
          if (error.status === 404) {
            console.error('[PatientDetails] Patient not found in database - may not have been created during login');
            // Don't show error to user - this happens when patient doesn't exist yet
            // The login endpoint should have created the patient
          } else {
            // For other errors, you might want to show a user-friendly message
            console.error('[PatientDetails] Unexpected error updating patient');
          }
        }
      });
    }
  }

  private saveMedicationReviewData() {
    const sessionData = this.stateService.getSessionData();
    if (!sessionData) {
      console.warn('[PatientDetails] No session data available, cannot save review');
      return;
    }

    const apbNumber = this.stateService.apbNumber;
    const medicationReviewId = this.stateService.medicationReviewId;

    const request: any = {
      apbNumber: apbNumber,
      medicationReviewId: medicationReviewId
    };

    // Only include fields that have values
    if (this.firstName) {
      request.firstNameAtTimeOfReview = this.firstName;
    }

    if (this.lastName) {
      request.lastNameAtTimeOfReview = this.lastName;
    }

    // Only save if we have at least one field to update
    if (request.firstNameAtTimeOfReview || request.lastNameAtTimeOfReview) {
      console.log('[PatientDetails] === SAVING MEDICATION REVIEW DATA ===');
      console.log('[PatientDetails] Request payload:', JSON.stringify(request, null, 2));
      
      this.apiService.updateMedicationReview(request).subscribe({
        next: (response) => {
          console.log('[PatientDetails] ✓ Medication review updated successfully');
          console.log('[PatientDetails] Response:', JSON.stringify(response, null, 2));
          // Update session data with new values
          if (sessionData.review) {
            sessionData.review.firstNameAtTimeOfReview = response.firstNameAtTimeOfReview;
            sessionData.review.lastNameAtTimeOfReview = response.lastNameAtTimeOfReview;
            sessionData.review.reviewDate = response.reviewDate;
            this.stateService.setSessionData(sessionData);
          }
        },
        error: (error) => {
          console.error('[PatientDetails] ✗ Failed to update medication review');
          console.error('[PatientDetails] Error:', error);
          if (error.status === 404) {
            console.error('[PatientDetails] Medication review not found in database - may not have been created during login');
            // Don't show error to user - this happens when review doesn't exist yet
          } else if (error.status === 400) {
            console.error('[PatientDetails] Bad request - check if all required fields are present');
          } else {
            console.error('[PatientDetails] Unexpected error updating medication review');
          }
        }
      });
    }
  }
}
