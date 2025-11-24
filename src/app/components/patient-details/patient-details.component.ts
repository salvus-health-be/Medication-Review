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
  // Renal function is stored as a textual summary per API docs (e.g., "eGFR: 45 mL/min/1.73m2")
  renalFunction: string | null = null;

  private destroy$ = new Subject<void>();
  private dateOfBirthChanged$ = new Subject<string>();
  private sexChanged$ = new Subject<string>();
  private firstNameChanged$ = new Subject<string>();
  private lastNameChanged$ = new Subject<string>();
  private renalFunctionChanged$ = new Subject<string | null>();

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

      // Populate from patient (dateOfBirth, sex, renalFunction)
      if (sessionData.patient.dateOfBirth) {
        // Convert ISO 8601 to YYYY-MM-DD format for date input
        this.dateOfBirth = sessionData.patient.dateOfBirth.split('T')[0];
      }
      if (sessionData.patient.sex) {
        this.sex = sessionData.patient.sex;
      }
      // renalFunction may be provided under sessionData.patient.renalFunction or at top-level sessionData.renalFunction
      let rf: any = undefined;
      let rfFound = false;
      if (sessionData.patient && sessionData.patient.renalFunction !== undefined) {
        rf = sessionData.patient.renalFunction;
        rfFound = true;
      } else if ((sessionData as any).renalFunction !== undefined) {
        rf = (sessionData as any).renalFunction;
        rfFound = true;
      }

      if (rfFound) {
        this.renalFunction = rf === null ? null : String(rf);
      } else {
      }
    } else {
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

    // Set up auto-save for renal function changes (debounced)
    this.renalFunctionChanged$
      .pipe(
        debounceTime(1000),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe(value => this.savePatientData());
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

  onRenalFunctionChange() {
    this.renalFunctionChanged$.next(this.renalFunction);
  }

  private savePatientData() {
    const sessionData = this.stateService.getSessionData();
    if (!sessionData) {
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
    
    // The API accepts renalFunction as string | null per documentation
    if (this.renalFunction !== null && this.renalFunction !== undefined) {
      request.renalFunction = this.renalFunction;
    }

    // Only save if we have at least one field to update
    // Save if at least one updatable field is present. Note: renalFunction may be an empty string to clear the field.
    if (request.dateOfBirth || request.sex || request.hasOwnProperty('renalFunction')) {
      
      this.apiService.updatePatient(request).subscribe({
        next: (response) => {
          // Update session data with new values
          if (sessionData.patient) {
            sessionData.patient.dateOfBirth = response.dateOfBirth;
            sessionData.patient.sex = response.sex;
            sessionData.patient.renalFunction = response.renalFunction ?? null;
            // Also set top-level renalFunction for compatibility with different session shapes
            (sessionData as any).renalFunction = response.renalFunction ?? null;
            this.stateService.setSessionData(sessionData);
          }
        },
        error: (error) => {
          if (error.status === 404) {
            // Don't show error to user - this happens when patient doesn't exist yet
            // The login endpoint should have created the patient
          } else {
            // For other errors, you might want to show a user-friendly message
          }
        }
      });
    }
  }

  private saveMedicationReviewData() {
    const sessionData = this.stateService.getSessionData();
    if (!sessionData) {
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
      
      this.apiService.updateMedicationReview(request).subscribe({
        next: (response) => {
          // Update session data with new values
          if (sessionData.review) {
            sessionData.review.firstNameAtTimeOfReview = response.firstNameAtTimeOfReview;
            sessionData.review.lastNameAtTimeOfReview = response.lastNameAtTimeOfReview;
            sessionData.review.reviewDate = response.reviewDate;
            this.stateService.setSessionData(sessionData);
          }
        },
        error: (error) => {
          if (error.status === 404) {
            // Don't show error to user - this happens when review doesn't exist yet
          } else if (error.status === 400) {
          } else {
          }
        }
      });
    }
  }
}
