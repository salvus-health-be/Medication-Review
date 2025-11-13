import { Component, OnInit, OnDestroy, Output, EventEmitter } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { filter, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { StateService } from '../../services/state.service';
import { ApiService } from '../../services/api.service';
import { SessionData, Contraindication } from '../../models/api.models';
import { ContraindicationModalComponent } from '../contraindication-modal/contraindication-modal.component';
import { ReviewNotesService } from '../../services/review-notes.service';

interface Step {
  number: number;
  label: string;
  route: string;
}

@Component({
  selector: 'app-header',
  imports: [CommonModule, TranslocoModule, ContraindicationModalComponent],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent implements OnInit, OnDestroy {
  @Output() openNoteOverview = new EventEmitter<void>();

  isLoginPage: boolean = false;
  isInputPage: boolean = false;
  isAnalysisPage: boolean = false;
  showPatientInfo: boolean = false;
  patientName: string = '';
  patientAge: number | null = null;
  patientSex: string = '';
  contraIndications: Contraindication[] = [];
  showContraIndicationsModal: boolean = false;
  notesCount: number = 0;
  animateNotes = false;
  private previousNotesCount = 0;
  
  // Step indicator
  currentStep: Step | null = null;
  steps: Step[] = [
    { number: 1, label: 'header.step_1', route: 'input' },
    { number: 2, label: 'header.step_2', route: 'analysis' },
    { number: 3, label: 'header.step_3', route: 'pdf-preview' },
    { number: 4, label: 'header.step_4', route: 'anamnesis' },
    { number: 5, label: 'header.step_5', route: 'report-generation' }
  ];
  
  private destroy$ = new Subject<void>();

  // Language selector
  supportedLangs = [
    { code: 'en', label: 'EN' },
    { code: 'nl', label: 'NL' },
    { code: 'fr', label: 'FR' }
  ];
  activeLang: string = 'en';
  langDropdownOpen: boolean = false;

  constructor(
    private router: Router,
    private stateService: StateService,
    private apiService: ApiService,
    private reviewNotesService: ReviewNotesService
    , private transloco: TranslocoService
  ) {
    // Check current route on initialization
    this.checkRoute(this.router.url);

    // Subscribe to route changes
    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe((event: any) => {
        this.checkRoute(event.url);
      });
  }

  ngOnInit() {
    // initialize active language for selector
    try {
      this.activeLang = this.transloco.getActiveLang() || (localStorage.getItem('selectedLang') || 'en');
    } catch (e) {
      // if transloco isn't ready yet, fallback to localStorage
      this.activeLang = localStorage.getItem('selectedLang') || 'en';
    }
    // Subscribe to session data changes
    this.stateService.sessionData$
      .pipe(takeUntil(this.destroy$))
      .subscribe(sessionData => {
        this.updatePatientInfo(sessionData);
        this.loadContraindications();
        this.loadReviewNotes();
      });

    // Subscribe to contraindication changes from other components
    this.stateService.contraindicationsChanged$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        console.log('[Header] Contraindications changed notification received');
        this.loadContraindications();
      });

    // Subscribe to notes count changes
    this.reviewNotesService.notesCount$
      .pipe(takeUntil(this.destroy$))
      .subscribe(count => {
        // Detect increases in notes count to trigger animation
        this.notesCount = count;
        console.log('[Header] Notes count updated:', count);
        if (count > this.previousNotesCount) {
          this.triggerNotesAnimation();
        }
        this.previousNotesCount = count;
      });
  }

  changeLanguage(lang: string) {
    if (!lang) return;
    try {
      localStorage.setItem('selectedLang', lang);
      this.transloco.setActiveLang(lang);
      this.activeLang = lang;
    } catch (e) {
      console.error('[Header] Failed to change language', e);
    }
  }

  toggleLangDropdown() {
    this.langDropdownOpen = !this.langDropdownOpen;
  }

  private triggerNotesAnimation() {
    this.animateNotes = true;
    // Clear animation after it finishes
    setTimeout(() => this.animateNotes = false, 600);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkRoute(url: string) {
    this.isLoginPage = url === '/login' || url === '/';
    this.isInputPage = url === '/input';
    this.isAnalysisPage = url === '/analysis';
    this.showPatientInfo = !this.isLoginPage && !this.isInputPage;
    
    // Update current step based on route
    this.updateCurrentStep(url);
    
    // Reload contraindications when navigating to a page that shows them
    if (this.showPatientInfo) {
      this.loadContraindications();
    }
  }

  private updateCurrentStep(url: string) {
    // Find matching step based on current route
    this.currentStep = this.steps.find(step => 
      url.includes(`/${step.route}`)
    ) || null;
  }

  isStepActive(step: Step): boolean {
    return this.currentStep?.number === step.number;
  }

  isStepCompleted(step: Step): boolean {
    if (!this.currentStep) return false;
    return step.number < this.currentStep.number;
  }

  navigateToStep(step: Step) {
    // Don't navigate if it's a future step (optional: remove this check to allow any navigation)
    // if (!this.currentStep || step.number > this.currentStep.number) return;
    
    this.router.navigate([`/${step.route}`]);
  }

  getStepIcon(stepNumber: number): string {
    const icons: { [key: number]: string } = {
      1: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', // Clipboard (Input)
      2: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', // Chart bars (Analysis)
      3: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z', // Chat (Conversation)
      4: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4', // Clipboard check (Actions)
      5: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' // Document (Documentation)
    };
    return icons[stepNumber] || '';
  }

  private updatePatientInfo(sessionData: SessionData | null) {
    if (!sessionData) {
      this.patientName = '';
      this.patientAge = null;
      this.patientSex = '';
      return;
    }

    // Build patient name from review data
    const firstName = sessionData.review?.firstNameAtTimeOfReview || '';
    const lastName = sessionData.review?.lastNameAtTimeOfReview || '';
    this.patientName = `${firstName} ${lastName}`.trim() || 'Unknown Patient';

    // Calculate age from date of birth
    if (sessionData.patient?.dateOfBirth) {
      this.patientAge = this.calculateAge(sessionData.patient.dateOfBirth);
    } else {
      this.patientAge = null;
    }

    // Get sex
    this.patientSex = sessionData.patient?.sex || '';
  }

  private calculateAge(dateOfBirth: string): number {
    const birthDate = new Date(dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age;
  }

  navigateHome() {
    this.router.navigate(['/login']);
  }

  save() {
    // Save functionality will be implemented later
    console.log('Save clicked');
  }

  openConversation() {
    console.log('[Header] Opening note overview modal');
    this.openNoteOverview.emit();
  }

  addContraIndication() {
    this.showContraIndicationsModal = true;
  }

  removeContraIndication(contraindication: Contraindication) {
    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) return;

    this.apiService.deleteContraindication(reviewId, contraindication.contraindicationId).subscribe({
      next: () => {
        console.log('[Header] Contraindication deleted:', contraindication.contraindicationId);
        this.loadContraindications();
        this.stateService.notifyContraindicationsChanged();
      },
      error: (error) => {
        console.error('[Header] Failed to delete contraindication:', error);
        alert('Failed to remove contra-indication. Please try again.');
      }
    });
  }

  closeContraIndicationsModal() {
    this.showContraIndicationsModal = false;
  }

  onContraIndicationsSaved() {
    this.showContraIndicationsModal = false;
    this.loadContraindications();
    this.stateService.notifyContraindicationsChanged();
  }

  private loadContraindications() {
    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) {
      this.contraIndications = [];
      return;
    }

    this.apiService.getContraindications(reviewId).subscribe({
      next: (contraindications) => {
        this.contraIndications = contraindications;
        console.log('[Header] Loaded contraindications:', contraindications);
      },
      error: (error) => {
        console.error('[Header] Failed to load contraindications:', error);
        this.contraIndications = [];
      }
    });
  }

  private loadReviewNotes() {
    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) {
      this.reviewNotesService.clearNotes();
      return;
    }

    this.reviewNotesService.loadReviewNotes(reviewId);
  }
}
