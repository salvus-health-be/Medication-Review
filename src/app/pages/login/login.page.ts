import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { ApiService } from '../../services/api.service';
import { StateService } from '../../services/state.service';
import { LoginRequest } from '../../models/api.models';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule, TranslocoModule],
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss']
})
export class LoginPage {
  apbNumber: string = '';
  medicationReviewId: string = '';
  isLoading: boolean = false;
  errorMessage: string = '';

  availableLanguages = [
    { code: 'en', name: 'English' },
    { code: 'nl', name: 'Nederlands' },
    { code: 'fr', name: 'FranÃ§ais' }
  ];

  get currentLanguage(): string {
    return this.transloco.getActiveLang();
  }

  private transloco = inject(TranslocoService);
  constructor(
    private router: Router,
    private apiService: ApiService,
    private stateService: StateService
  ) {}

  changeLanguage(lang: string) {
    this.transloco.setActiveLang(lang);
  }

  get isFormValid(): boolean {
    return this.apbNumber.trim() !== '';
  }

  onSubmit() {
    if (!this.isFormValid || this.isLoading) {
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    const request: LoginRequest = {
      apbNumber: this.apbNumber.trim()
    };

    // Add optional medication review ID if provided
    if (this.medicationReviewId.trim()) {
      request.medicationReviewId = this.medicationReviewId.trim();
    }

    this.apiService.login(request).subscribe({
      next: (response) => {
        // Get existing session data to preserve values like renalFunction if backend didn't return them
        const existingSession = this.stateService.getSessionData();
        const newSession = {
          ...response,
          apbNumber: request.apbNumber
        };
        
        // Preserve renalFunction from existing session if backend returned null
        if (existingSession?.patient?.renalFunction && !newSession.patient.renalFunction) {
          newSession.patient.renalFunction = existingSession.patient.renalFunction;
        }
        
        this.stateService.setSessionData(newSession);
        this.router.navigate(['/disclaimer']);
      },
      error: (error) => {
        this.isLoading = false;
        const serverMsg = error.error?.message;
        this.errorMessage = serverMsg ? serverMsg : this.transloco.translate('login.login_failed');
      },
      complete: () => {
        this.isLoading = false;
      }
    });
  }
}
