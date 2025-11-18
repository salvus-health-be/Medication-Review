import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged, groupBy, mergeMap } from 'rxjs/operators';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { ReviewNotesService, ReviewNote } from '../../services/review-notes.service';
import { StateService } from '../../services/state.service';
import { ApiService } from '../../services/api.service';
import { QuestionAnswer } from '../../models/api.models';
import { AnamnesisePdfService } from '../../services/anamnesis-pdf.service';

interface Question {
  name: string;
  text: string;
  type: 'text' | 'textarea' | 'checkbox' | 'number' | 'date' | 'radio';
  value: any;
  options?: (string | boolean)[]; // For radio button options - can be strings or booleans
  hidden?: boolean; // To conditionally show/hide questions
  originallyHidden?: boolean; // Original hidden state (never changes for PDF filtering)
  shareWithPatient?: boolean; // For pharmacist notes - share with patient
  shareWithDoctor?: boolean; // For pharmacist notes - share with doctor
}

interface QuestionBox {
  id: string;
  title: string;
  description?: string;
  questions: Question[];
}

@Component({
  selector: 'app-anamnesis',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslocoModule],
  templateUrl: './anamnesis.page.html',
  styleUrls: ['./anamnesis.page.scss']
})
export class AnamnesisPage implements OnInit, OnDestroy {
  allQuestionBoxes: { part1: QuestionBox[], part2: QuestionBox[], part3: QuestionBox[] } = {
    part1: [],
    part2: [],
    part3: []
  };
  currentPart: 'part1' | 'part2' | 'part3' = 'part1';
  questionBoxes: QuestionBox[] = [];
  selectedBox: QuestionBox | null = null;
  questionAnswers: Map<string, QuestionAnswer> = new Map();
  medications: any[] = [];
  notes: ReviewNote[] = [];
  
  private destroy$ = new Subject<void>();
  private saveQueue$ = new Subject<{ questionName: string; value: any }>();

  private transloco = inject(TranslocoService);

  constructor(
    private reviewNotesService: ReviewNotesService,
    private stateService: StateService,
    private router: Router,
    private apiService: ApiService,
    private anamnesisePdfService: AnamnesisePdfService
  ) {}

  goToDocumentation() {
    this.router.navigate(['/report-generation']);
  }

  ngOnInit() {
    // Immediately verify session; if missing, redirect to home/login
    if (!this.stateService.medicationReviewId) {
      console.warn('[Anamnesis] No medicationReviewId in session - redirecting to home');
      this.router.navigate(['/']);
      return;
    }

    // Listen for window focus to handle session loss while user navigates away
    window.addEventListener('focus', this.handleWindowFocus);
    // Also listen for storage events so changes in other tabs can be detected
    window.addEventListener('storage', this.handleStorageEvent);

    this.initializeQuestionBoxes();
    this.loadMedications();
    this.loadNotes();
    this.loadQuestionAnswers();
    this.setupAutoSave();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();

    // Cleanup listeners
    window.removeEventListener('focus', this.handleWindowFocus);
    window.removeEventListener('storage', this.handleStorageEvent);
  }

  // Use class properties with arrow functions so `this` is lexical when used as listener
  private handleWindowFocus = () => {
    // If session has been cleared, redirect to home/login
    if (!this.stateService.medicationReviewId) {
      console.warn('[Anamnesis] Session lost on window focus - redirecting to home');
      this.router.navigate(['/']);
    }
  };

  private handleStorageEvent = (event: StorageEvent) => {
    // If session storage was cleared in another tab, redirect
    if (event.key === null || event.key === 'medicationReviewId' || event.key === 'sessionData') {
      if (!this.stateService.medicationReviewId) {
        console.warn('[Anamnesis] Session change detected via storage event - redirecting to home');
        this.router.navigate(['/']);
      }
    }
  };

  private loadMedications() {
    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) return;

    this.apiService.getMedications(reviewId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (meds) => {
          this.medications = meds || [];
          this.updatePart2And3QuestionBoxes();
          // Re-apply loaded answers to the newly created medication boxes
          this.applyLoadedAnswersToParts(['part2', 'part3']);
        },
        error: (err) => {
          console.error('[Anamnesis] Failed to load medications:', err);
        }
      });
  }

  private loadNotes() {
    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) return;

    this.reviewNotesService.notes$
      .pipe(takeUntil(this.destroy$))
      .subscribe(notes => {
        this.notes = notes.filter(note => note.discussWithPatient === true);
        this.updatePart2And3QuestionBoxes();
        // Re-apply loaded answers when notes change
        this.applyLoadedAnswersToParts(['part2', 'part3']);
      });

    if (this.reviewNotesService.getNotesCount() === 0) {
      this.reviewNotesService.loadReviewNotes(reviewId);
    }
  }

  private updatePart2And3QuestionBoxes() {
    // Rebuild part 2 and 3 with medication-specific boxes
    this.initializePart2QuestionBoxes();
    this.initializePart3QuestionBoxes();
    
    // Refresh current view if on part 2 or 3
    if (this.currentPart === 'part2') {
      this.questionBoxes = this.allQuestionBoxes.part2;
    } else if (this.currentPart === 'part3') {
      this.questionBoxes = this.allQuestionBoxes.part3;
    }
  }

  private initializeQuestionBoxes() {
    // Part 1: General Questions
    this.allQuestionBoxes.part1 = [
      {
        id: 'concerns',
        title: this.transloco.translate('anamnesis.categories.concerns') || 'Bezorgdheden/Ervaringen',
        description: this.transloco.translate('anamnesis.general_questions') || 'Patient concerns and experiences with medication',
        questions: [
          { name: 'p1_concerns_tooMany', text: this.transloco.translate('pdf.patient_concern_tooMany') || 'Ervaart de patient de geneesmiddelen als te veel?', type: 'radio', options: [true, false], value: null },
          { name: 'p1_concerns_tooManyAction', text: this.transloco.translate('anamnesis_dynamic.pharmacist_action'), type: 'textarea', value: '', hidden: true, originallyHidden: true },
          { name: 'p1_concerns_financialBurden', text: this.transloco.translate('pdf.patient_concern_financialBurden') || 'Ervaart de patient financiële last?', type: 'radio', options: [true, false], value: null },
          { name: 'p1_concerns_financialBurdenAction', text: this.transloco.translate('anamnesis_dynamic.pharmacist_action'), type: 'textarea', value: '', hidden: true, originallyHidden: true },
          { name: 'p1_concerns_anxiety', text: this.transloco.translate('anamnesis.questions.anxiety') || 'Ervaart de patient angst?', type: 'radio', options: [true, false], value: null },
          { name: 'p1_concerns_anxietyAction', text: this.transloco.translate('anamnesis_dynamic.pharmacist_action'), type: 'textarea', value: '', hidden: true, originallyHidden: true },
          { name: 'p1_concerns_untreatedComplaints', text: this.transloco.translate('pdf.patient_concern_untreatedComplaints') || 'Ervaart de patient onvoldoende of niet behandelde klachten?', type: 'radio', options: [true, false], value: null },
          { name: 'p1_concerns_untreatedComplaintsAction', text: this.transloco.translate('anamnesis_dynamic.pharmacist_action'), type: 'textarea', value: '', hidden: true, originallyHidden: true },
          { name: 'p1_concerns_other', text: this.transloco.translate('pdf.patient_concern_other') || 'Zijn er andere bezorgdheden?', type: 'radio', options: [true, false], value: null },
          { name: 'p1_concerns_otherAction', text: this.transloco.translate('anamnesis_dynamic.pharmacist_action'), type: 'textarea', value: '', hidden: true, originallyHidden: true }
        ]
      },
      {
        id: 'medication_help',
        title: this.transloco.translate('anamnesis_dynamic.medication_help_title'),
        description: 'Assistance with medication intake',
        questions: [
          { name: 'p1_help_hasAssistance', text: this.transloco.translate('anamnesis_dynamic.what_problems') || 'Heeft de patient hulp bij inname, bijvoorbeeld een pillendoos of partner/familielid?', type: 'radio', options: [true, false], value: null },
          { name: 'p1_help_additionalNeededQuestion', text: this.transloco.translate('pdf.medication_help_additionalNeeded') || 'Is extra hulp wenselijk voor de patient?', type: 'radio', options: [true, false], value: null, hidden: true, originallyHidden: true },
          { name: 'p1_help_additionalNeededAction', text: this.transloco.translate('anamnesis_dynamic.pharmacist_action'), type: 'textarea', value: '', hidden: true, originallyHidden: true }
        ]
      },
      {
        id: 'practical_problems',
        title: this.transloco.translate('anamnesis.categories.practical_problems') || 'Praktische problemen',
        description: this.transloco.translate('pdf.practical_problems') || 'Practical issues affecting medication use',
        questions: [
          { name: 'p1_practical_swallowing', text: this.transloco.translate('pdf.practical_problem_swallowing') || 'Heeft de patient slikproblemen?', type: 'radio', options: [true, false], value: null },
          { name: 'p1_practical_swallowingAction', text: this.transloco.translate('anamnesis_dynamic.pharmacist_action'), type: 'textarea', value: '', hidden: true, originallyHidden: true },
          { name: 'p1_practical_movement', text: this.transloco.translate('pdf.practical_problem_movement') || 'Heeft de patient beweegstoornissen?', type: 'radio', options: [true, false], value: null },
          { name: 'p1_practical_movementAction', text: this.transloco.translate('anamnesis_dynamic.pharmacist_action'), type: 'textarea', value: '', hidden: true, originallyHidden: true },
          { name: 'p1_practical_vision', text: this.transloco.translate('pdf.practical_problem_vision') || 'Heeft de patient visusstoornissen?', type: 'radio', options: [true, false], value: null },
          { name: 'p1_practical_visionAction', text: this.transloco.translate('anamnesis_dynamic.pharmacist_action'), type: 'textarea', value: '', hidden: true, originallyHidden: true },
          { name: 'p1_practical_hearing', text: this.transloco.translate('pdf.practical_problem_hearing') || 'Heeft de patient gehoorstoornissen?', type: 'radio', options: [true, false], value: null },
          { name: 'p1_practical_hearingAction', text: this.transloco.translate('anamnesis_dynamic.pharmacist_action'), type: 'textarea', value: '', hidden: true, originallyHidden: true },
          { name: 'p1_practical_cognitive', text: this.transloco.translate('pdf.practical_problem_cognitive') || 'Heeft de patient cognitieve problemen?', type: 'radio', options: [true, false], value: null },
          { name: 'p1_practical_cognitiveAction', text: this.transloco.translate('anamnesis_dynamic.pharmacist_action'), type: 'textarea', value: '', hidden: true, originallyHidden: true },
          { name: 'p1_practical_dexterity', text: this.transloco.translate('pdf.practical_problem_dexterity') || 'Heeft de patient problemen met handvaardigheid?', type: 'radio', options: [true, false], value: null },
          { name: 'p1_practical_dexterityAction', text: this.transloco.translate('anamnesis_dynamic.pharmacist_action'), type: 'textarea', value: '', hidden: true, originallyHidden: true },
          { name: 'p1_practical_other', text: this.transloco.translate('pdf.practical_problem_other') || 'Zijn er andere praktische problemen?', type: 'radio', options: [true, false], value: null },
          { name: 'p1_practical_otherAction', text: this.transloco.translate('anamnesis_dynamic.pharmacist_action'), type: 'textarea', value: '', hidden: true, originallyHidden: true }
        ]
      },
      {
        id: 'incidents',
        title: this.transloco.translate('anamnesis.categories.incidents') || 'Incidenten',
        description: this.transloco.translate('pdf.incidents') || 'Falls and hospitalizations',
        questions: [
          { name: 'p1_incidents_falls', text: this.transloco.translate('anamnesis.questions.falls') || 'Hoe vaak is de patient in de afgelopen 6 maanden gevallen?', type: 'number', value: 0 },
          { name: 'p1_incidents_hospitalizations', text: this.transloco.translate('anamnesis.questions.hospitalizations') || 'Hoe vaak is de patient gehospitaliseerd in het afgelopen jaar?', type: 'number', value: 0 },
          { name: 'p1_incidents_actionNeeded', text: this.transloco.translate('pdf.incidents_actionNeeded') || 'Is action needed?', type: 'radio', value: null, options: [true, false] },
          { name: 'p1_incidents_action', text: this.transloco.translate('anamnesis_dynamic.pharmacist_action'), type: 'textarea', value: '', hidden: true, originallyHidden: true }
        ]
      },
      {
        id: 'followup',
        title: this.transloco.translate('anamnesis.categories.follow_up') || 'Opvolging/monitoring',
        description: this.transloco.translate('pdf.follow_up_monitoring') || 'Care providers and parameter monitoring',
        questions: [
          { name: 'p1_followup_careProviders', text: this.transloco.translate('anamnesis.questions.care_providers') || 'Door welke hulpverleners wordt de patient opgevolgd?', type: 'textarea', value: '' },
          { name: 'p1_followup_parameterMonitoring', text: this.transloco.translate('anamnesis.questions.parameter_monitoring') || 'Door welke hulpverleners worden de parameters opgevolgd?', type: 'textarea', value: '' },
          { name: 'p1_followup_actionNeeded', text: this.transloco.translate('pdf.followup_actionNeeded') || 'Is action needed?', type: 'radio', value: null, options: [true, false] },
          { name: 'p1_followup_action', text: this.transloco.translate('anamnesis_dynamic.pharmacist_action'), type: 'textarea', value: '', hidden: true, originallyHidden: true }
        ]
      }
    ];

    // Initialize part 2 and 3 (will be populated when medications load)
    this.initializePart2QuestionBoxes();
    this.initializePart3QuestionBoxes();

    // Set initial question boxes to part 1
    this.questionBoxes = this.allQuestionBoxes.part1;
  }

  private initializePart2QuestionBoxes() {
    const boxes: QuestionBox[] = [];

    // Add general notes section if there are any general adherence notes
    const generalAdherenceNotes = this.notes.filter(note => 
      !note.linkedCnk && (note.category === 'TherapyAdherence' || note.category === 'MedicationSchema')
    );

    if (generalAdherenceNotes.length > 0) {
      boxes.push({
        id: 'p2_general_notes',
        title: this.transloco.translate('tools.general_notes') || 'General Notes',
        description: `${generalAdherenceNotes.length} ${this.transloco.translate('tools.general_notes') || 'general adherence note(s)'}`,
        questions: [
          
        ]
      });
    }

    // Add a box for each medication
    this.medications.forEach(med => {
      const cnk = med.cnk != null ? String(med.cnk) : 'uncategorized';
      const medicationNotes = this.notes.filter(note => 
        String(note.linkedCnk) === cnk && (note.category === 'TherapyAdherence' || note.category === 'MedicationSchema')
      );

      boxes.push({
        id: `p2_med_${cnk}`,
        title: med.name || this.transloco.translate('pdf.no_medication') || 'Unnamed medication',
        description: `${this.transloco.translate('medication.cnk') || 'CNK'}: ${med.cnk || '—'} | ${medicationNotes.length} ${this.transloco.translate('notes.existing_notes') || 'note(s)'}`,
        questions: [
          { name: `p2_med_${cnk}_adherence`, text: this.transloco.translate('anamnesis_dynamic.takes_as_prescribed') || 'Takes as prescribed?', type: 'radio', value: null, options: [true, false] },
          { name: `p2_med_${cnk}_notes`, text: this.transloco.translate('anamnesis_dynamic.pharmacist_notes') || 'Pharmacist notes', type: 'textarea', value: '', hidden: true }
        ]
      });
    });

    this.allQuestionBoxes.part2 = boxes;
  }

  private initializePart3QuestionBoxes() {
    const boxes: QuestionBox[] = [];

    // Add general notes section if there are any general effectiveness notes
    const generalEffectivenessNotes = this.notes.filter(note => 
      !note.linkedCnk && note.category !== 'TherapyAdherence' && note.category !== 'MedicationSchema'
    );

    if (generalEffectivenessNotes.length > 0) {
      boxes.push({
        id: 'p3_general_notes',
        title: this.transloco.translate('tools.general_notes') || 'General Notes',
        description: `${generalEffectivenessNotes.length} ${this.transloco.translate('tools.general_notes') || 'general effectiveness note(s)'}`,
        questions: [
          
        ]
      });
    }

    // Add a box for each medication
    this.medications.forEach(med => {
      const cnk = med.cnk != null ? String(med.cnk) : 'uncategorized';
      const medicationNotes = this.notes.filter(note => 
        String(note.linkedCnk) === cnk && note.category !== 'TherapyAdherence' && note.category !== 'MedicationSchema'
      );

      boxes.push({
        id: `p3_med_${cnk}`,
        title: med.name || this.transloco.translate('pdf.no_medication') || 'Unnamed medication',
        description: `${this.transloco.translate('medication.cnk') || 'CNK'}: ${med.cnk || '—'} | ${medicationNotes.length} ${this.transloco.translate('notes.existing_notes') || 'note(s)'}`,
        questions: [
          { name: `p3_med_${cnk}_effective`, text: this.transloco.translate('anamnesis_dynamic.medication_effective_question') || 'Is this medication effective for the patient?', type: 'radio', value: null, options: [true, false] },
          { name: `p3_med_${cnk}_effectiveAction`, text: this.transloco.translate('anamnesis_dynamic.action_if_not_effective') || 'Action if not effective', type: 'textarea', value: '', hidden: true },
          { name: `p3_med_${cnk}_hasSideEffects`, text: this.transloco.translate('anamnesis_dynamic.side_effects_question') || 'Is the patient experiencing side effects?', type: 'radio', value: null, options: [true, false] },
          { name: `p3_med_${cnk}_sideEffectsAction`, text: this.transloco.translate('anamnesis_dynamic.action_for_side_effects') || 'Action for side effects', type: 'textarea', value: '', hidden: true }
        ]
      });
    });

    this.allQuestionBoxes.part3 = boxes;
  }

  private loadQuestionAnswers() {
    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) return;

    this.apiService.getQuestionAnswers(reviewId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (answers) => {
          // Store answers in map (includes both regular questions and note comments)
          answers.forEach(answer => {
            this.questionAnswers.set(answer.questionName, answer);
          });

          // Apply answers to all parts
          this.applyLoadedAnswersToParts(['part1', 'part2', 'part3']);
        },
        error: (err) => {
          console.error('[Anamnesis] Failed to load question answers:', err);
        }
      });
  }

  private applyLoadedAnswersToParts(parts: ('part1' | 'part2' | 'part3')[]) {
    let loadedCount = 0;
    
    parts.forEach(part => {
      this.allQuestionBoxes[part].forEach(box => {
        box.questions.forEach(q => {
          const savedAnswer = this.questionAnswers.get(q.name);
          if (savedAnswer && savedAnswer.value !== null && savedAnswer.value !== undefined) {
            // Convert string values to appropriate types
            if (q.type === 'checkbox') {
              q.value = savedAnswer.value === 'true';
              console.log('[Anamnesis] Loaded checkbox:', q.name, 'from:', savedAnswer.value, 'to:', q.value);
              loadedCount++;
            } else if (q.type === 'number') {
              q.value = Number(savedAnswer.value) || 0;
              console.log('[Anamnesis] Loaded number:', q.name, '=', q.value);
              loadedCount++;
            } else if (q.type === 'radio') {
              // For boolean radio buttons, convert string to boolean
              if (q.options && q.options.length > 0 && typeof q.options[0] === 'boolean') {
                q.value = savedAnswer.value === 'true';
                console.log('[Anamnesis] Loaded boolean radio:', q.name, 'from:', savedAnswer.value, 'to:', q.value);
              } else {
                q.value = savedAnswer.value;
                console.log('[Anamnesis] Loaded string radio:', q.name, '=', q.value);
              }
              loadedCount++;
            } else {
              q.value = savedAnswer.value;
              if (savedAnswer.value) {
                console.log('[Anamnesis] Loaded', q.type, ':', q.name, '=', q.value?.substring(0, 50));
                loadedCount++;
              }
            }

            // Load share flags for pharmacist notes
            if (savedAnswer.shareWithPatient !== undefined) {
              q.shareWithPatient = savedAnswer.shareWithPatient;
            }
            if (savedAnswer.shareWithDoctor !== undefined) {
              q.shareWithDoctor = savedAnswer.shareWithDoctor;
            }
            
            // For Part 1 concern questions, update visibility of action fields
            if (part === 'part1') {
              if (q.name.startsWith('p1_concerns_')) {
                this.updatePart1ConcernsVisibility(q.name);
              } else if (q.name.startsWith('p1_help_')) {
                this.updatePart1MedicationHelpVisibility(q.name);
              } else if (q.name.startsWith('p1_practical_')) {
                this.updatePart1PracticalProblemsVisibility(q.name);
              } else if (q.name === 'p1_incidents_actionNeeded') {
                this.updatePart1IncidentsVisibility(q.value);
              } else if (q.name === 'p1_followup_actionNeeded') {
                this.updatePart1FollowupVisibility(q.value);
              }
            }
            
            // For Part 2 adherence questions, update visibility of follow-up questions
            if (q.name.includes('_adherence') && part === 'part2') {
              this.updatePart2QuestionVisibility(q.name, q.value);
            }
            
            // For Part 3 effectiveness and side effects questions, update visibility
            if (part === 'part3') {
              if (q.name.includes('_effective')) {
                this.updatePart3EffectivenessVisibility(q.name, q.value);
              } else if (q.name.includes('_hasSideEffects')) {
                this.updatePart3SideEffectsVisibility(q.name, q.value);
              }
            }
          }
        });
      });
    });

    if (loadedCount > 0) {
      console.log('[Anamnesis] ✓ Applied', loadedCount, 'question answers to parts:', parts.join(', '));
    }
  }

  private setupAutoSave() {
    // Group by questionName so each question has its own debounce stream
    // This ensures rapid clicks on different checkboxes all get saved
    this.saveQueue$
      .pipe(
        takeUntil(this.destroy$),
        groupBy(item => item.questionName),
        mergeMap(group => 
          group.pipe(
            debounceTime(800),
            distinctUntilChanged((prev, curr) => prev.value === curr.value)
          )
        )
      )
      .subscribe(({ questionName, value }) => {
        this.saveQuestionAnswer(questionName, value);
      });
  }

  private saveQuestionAnswer(questionName: string, value: any, forceShareFlagsUpdate: boolean = false) {
    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) {
      console.warn('[Anamnesis] Cannot save - no medicationReviewId');
      return;
    }

    // Find the question object to get share flags
    let question: Question | undefined;
    for (const part of ['part1', 'part2', 'part3'] as ('part1' | 'part2' | 'part3')[]) {
      for (const box of this.allQuestionBoxes[part]) {
        const found = box.questions.find(q => q.name === questionName);
        if (found) {
          question = found;
          break;
        }
      }
      if (question) break;
    }

    // Convert value to string for storage
    const stringValue = String(value);

    console.log('[Anamnesis] Saving question:', questionName, 'value:', stringValue, 'type:', typeof value);

    // Check if answer already exists
    const existingAnswer = this.questionAnswers.get(questionName);

    if (existingAnswer) {
      // Check if share flags changed
      const shareFlagsChanged = forceShareFlagsUpdate || 
        existingAnswer.shareWithPatient !== question?.shareWithPatient ||
        existingAnswer.shareWithDoctor !== question?.shareWithDoctor;

      // Don't save if the value hasn't changed AND share flags haven't changed
      if (existingAnswer.value === stringValue && !shareFlagsChanged) {
        console.log('[Anamnesis] Skipping save - value and share flags unchanged:', questionName, stringValue);
        return;
      }

      console.log('[Anamnesis] Updating existing answer:', questionName, 'old:', existingAnswer.value, 'new:', stringValue, 'shareFlags changed:', shareFlagsChanged);
      
      // Update existing answer
      this.apiService.updateQuestionAnswer({
        medicationReviewId: reviewId,
        questionName,
        value: stringValue,
        shareWithPatient: question?.shareWithPatient,
        shareWithDoctor: question?.shareWithDoctor
      }).pipe(takeUntil(this.destroy$)).subscribe({
        next: (response) => {
          this.questionAnswers.set(questionName, response);
          console.log('[Anamnesis] ✓ Updated question answer:', questionName, '=', stringValue);
        },
        error: (err) => {
          console.error('[Anamnesis] ✗ Failed to update question answer:', questionName, err);
        }
      });
    } else {
      console.log('[Anamnesis] Creating new answer:', questionName, '=', stringValue);
      
      // Create new answer
      this.apiService.addQuestionAnswer({
        medicationReviewId: reviewId,
        questionName,
        value: stringValue,
        shareWithPatient: question?.shareWithPatient,
        shareWithDoctor: question?.shareWithDoctor
      }).pipe(takeUntil(this.destroy$)).subscribe({
        next: (response) => {
          this.questionAnswers.set(questionName, response);
          console.log('[Anamnesis] ✓ Added question answer:', questionName, '=', stringValue);
        },
        error: (err) => {
          console.error('[Anamnesis] ✗ Failed to add question answer:', questionName, err);
        }
      });
    }
  }

  selectBox(box: QuestionBox) {
    this.selectedBox = box;
  }

  onShareCheckboxChange(questionName: string) {
    // Immediately save when share checkbox changes
    // Find the question object across all parts
    let question: Question | undefined;
    for (const part of ['part1', 'part2', 'part3'] as ('part1' | 'part2' | 'part3')[]) {
      for (const box of this.allQuestionBoxes[part]) {
        const found = box.questions.find(q => q.name === questionName);
        if (found) {
          question = found;
          break;
        }
      }
      if (question) break;
    }
    
    if (question) {
      // Force update of share flags even if value hasn't changed
      this.saveQuestionAnswer(questionName, question.value, true);
    }
  }

  onQuestionChange(questionName: string, value: any) {
    this.saveQueue$.next({ questionName, value });
    
    // For Part 1 concern questions, show/hide action fields
    if (this.currentPart === 'part1') {
      if (questionName.startsWith('p1_concerns_')) {
        this.updatePart1ConcernsVisibility(questionName);
      } else if (questionName.startsWith('p1_help_')) {
        this.updatePart1MedicationHelpVisibility(questionName);
      } else if (questionName.startsWith('p1_practical_')) {
        this.updatePart1PracticalProblemsVisibility(questionName);
      } else if (questionName === 'p1_incidents_actionNeeded') {
        this.updatePart1IncidentsVisibility(value);
      } else if (questionName === 'p1_followup_actionNeeded') {
        this.updatePart1FollowupVisibility(value);
      }
    }
    
    // For Part 2 adherence questions, show/hide follow-up questions based on answer
    if (questionName.includes('_adherence') && this.currentPart === 'part2') {
      this.updatePart2QuestionVisibility(questionName, value);
    }
    
    // For Part 3 effectiveness and side effects questions, show/hide action fields
    if (this.currentPart === 'part3') {
      if (questionName.includes('_effective')) {
        this.updatePart3EffectivenessVisibility(questionName, value);
      } else if (questionName.includes('_hasSideEffects')) {
        this.updatePart3SideEffectsVisibility(questionName, value);
      }
    }
  }

  private updatePart2QuestionVisibility(adherenceQuestionName: string, value: any) {
    // Extract CNK from question name (e.g., "p2_med_12345_adherence" -> "12345")
    const cnkMatch = adherenceQuestionName.match(/p2_med_(.+)_adherence/);
    if (!cnkMatch) return;

    const cnk = cnkMatch[1];
    // Find the medication box
    const box = this.allQuestionBoxes.part2.find(b => b.id === `p2_med_${cnk}`);
    if (!box) return;

    // Derive the current adherence value from the adherence question in the box (more robust)
    const adherenceQ = box.questions.find(q => q.name.includes('_adherence'));
    const adherenceValue = adherenceQ ? adherenceQ.value : null;
    // Show follow-up questions when adherence is false (No)
    const showFollowUpQuestions = adherenceValue === false;

    console.log('[Anamnesis] updatePart2QuestionVisibility for', cnk, 'adherenceValue=', adherenceValue, '-> showFollowUp=', showFollowUpQuestions);

    box.questions.forEach(q => {
      if (q.name.includes('_notes')) {
        q.hidden = !showFollowUpQuestions;
      }
    });
  }

  private updatePart3EffectivenessVisibility(effectiveQuestionName: string, value: any) {
    // Extract CNK from question name (e.g., "p3_med_12345_effective" -> "12345")
    const cnkMatch = effectiveQuestionName.match(/p3_med_(.+)_effective/);
    if (!cnkMatch) return;

    const cnk = cnkMatch[1];
    const box = this.allQuestionBoxes.part3.find(b => b.id === `p3_med_${cnk}`);
    if (!box) return;

    // Derive current value from the corresponding radio question (robust against timing)
    const effectiveQ = box.questions.find(q => q.name.includes('_effective'));
    const effectiveValue = effectiveQ ? effectiveQ.value : null;
    const showActionField = effectiveValue === false;

    console.log('[Anamnesis] updatePart3EffectivenessVisibility for', cnk, 'effectiveValue=', effectiveValue, '-> showAction=', showActionField);

    const actionField = box.questions.find(q => q.name.includes('_effectiveAction'));
    if (actionField) {
      actionField.hidden = !showActionField;
    }
  }

  private updatePart3SideEffectsVisibility(sideEffectsQuestionName: string, value: any) {
    // Extract CNK from question name (e.g., "p3_med_12345_hasSideEffects" -> "12345")
    const cnkMatch = sideEffectsQuestionName.match(/p3_med_(.+)_hasSideEffects/);
    if (!cnkMatch) return;

    const cnk = cnkMatch[1];
    const box = this.allQuestionBoxes.part3.find(b => b.id === `p3_med_${cnk}`);
    if (!box) return;

    // Derive current value from the corresponding radio question
    const sideQ = box.questions.find(q => q.name.includes('_hasSideEffects'));
    const sideValue = sideQ ? sideQ.value : null;
    const showActionField = sideValue === true;

    console.log('[Anamnesis] updatePart3SideEffectsVisibility for', cnk, 'sideValue=', sideValue, '-> showAction=', showActionField);

    const actionField = box.questions.find(q => q.name.includes('_sideEffectsAction'));
    if (actionField) {
      actionField.hidden = !showActionField;
    }
  }

  private updatePart1ConcernsVisibility(questionName: string) {
    const box = this.allQuestionBoxes.part1.find(b => b.id === 'concerns');
    if (!box) return;

    // Extract field name from question name (e.g., "p1_concerns_tooMany" -> "tooMany")
    const fieldMatch = questionName.match(/p1_concerns_(\w+)/);
    if (!fieldMatch) return;
    
    const field = fieldMatch[1];
    const concernQ = box.questions.find(q => q.name === `p1_concerns_${field}`);
    const actionQ = box.questions.find(q => q.name === `p1_concerns_${field}Action`);
    
    if (concernQ && actionQ) {
      const showAction = concernQ.value === true;
      actionQ.hidden = !showAction;
      
      // If hiding, clear the field and its share flags, then save
      if (!showAction && (actionQ.value || actionQ.shareWithPatient || actionQ.shareWithDoctor)) {
        actionQ.value = '';
        actionQ.shareWithPatient = false;
        actionQ.shareWithDoctor = false;
        this.saveQuestionAnswer(`p1_concerns_${field}Action`, '', true);
      }
      
      console.log('[Anamnesis] updatePart1ConcernsVisibility:', field, 'value=', concernQ.value, '-> showAction=', showAction);
    }
  }

  private updatePart1MedicationHelpVisibility(questionName: string) {
    const box = this.allQuestionBoxes.part1.find(b => b.id === 'medication_help');
    if (!box) return;

    const hasAssistanceQ = box.questions.find(q => q.name === 'p1_help_hasAssistance');
    const additionalNeededQ = box.questions.find(q => q.name === 'p1_help_additionalNeededQuestion');
    const actionQ = box.questions.find(q => q.name === 'p1_help_additionalNeededAction');

    if (!hasAssistanceQ || !additionalNeededQ || !actionQ) return;

    // Show "Is extra hulp wenselijk" question when hasAssistance is false (No)
    const showNestedQuestion = hasAssistanceQ.value === false;
    additionalNeededQ.hidden = !showNestedQuestion;
    
    // If hiding the nested question, also clear it
    if (!showNestedQuestion && (additionalNeededQ.value !== null || actionQ.value)) {
      additionalNeededQ.value = null;
    }

    // Show action field when nested question is true (Yes) AND it's visible
    const showAction = additionalNeededQ.value === true && showNestedQuestion;
    actionQ.hidden = !showAction;
    
    // If hiding action field, clear it and its share flags, then save
    if (!showAction && (actionQ.value || actionQ.shareWithPatient || actionQ.shareWithDoctor)) {
      actionQ.value = '';
      actionQ.shareWithPatient = false;
      actionQ.shareWithDoctor = false;
      this.saveQuestionAnswer('p1_help_additionalNeededAction', '', true);
    }

    console.log('[Anamnesis] updatePart1MedicationHelpVisibility: hasAssistance=', hasAssistanceQ.value, 
                'additionalNeeded=', additionalNeededQ.value, '-> showNestedQ=', showNestedQuestion, 'showAction=', showAction);
  }

  private updatePart1PracticalProblemsVisibility(questionName: string) {
    const box = this.allQuestionBoxes.part1.find(b => b.id === 'practical_problems');
    if (!box) return;

    // Extract field name from question name (e.g., "p1_practical_swallowing" -> "swallowing")
    const fieldMatch = questionName.match(/p1_practical_(\w+)/);
    if (!fieldMatch) return;
    
    const field = fieldMatch[1];
    const problemQ = box.questions.find(q => q.name === `p1_practical_${field}`);
    const actionQ = box.questions.find(q => q.name === `p1_practical_${field}Action`);
    
    if (problemQ && actionQ) {
      const showAction = problemQ.value === true;
      actionQ.hidden = !showAction;
      
      // If hiding, clear the field and its share flags, then save
      if (!showAction && (actionQ.value || actionQ.shareWithPatient || actionQ.shareWithDoctor)) {
        actionQ.value = '';
        actionQ.shareWithPatient = false;
        actionQ.shareWithDoctor = false;
        this.saveQuestionAnswer(`p1_practical_${field}Action`, '', true);
      }
      
      console.log('[Anamnesis] updatePart1PracticalProblemsVisibility:', field, 'value=', problemQ.value, '-> showAction=', showAction);
    }
  }

  private updatePart1IncidentsVisibility(value: any) {
    const box = this.allQuestionBoxes.part1.find(b => b.id === 'incidents');
    if (!box) return;

    const actionQ = box.questions.find(q => q.name === 'p1_incidents_action');
    if (actionQ) {
      const shouldShow = value === true;
      actionQ.hidden = !shouldShow;
      
      // If hiding, clear the field and its share flags, then save
      if (!shouldShow && (actionQ.value || actionQ.shareWithPatient || actionQ.shareWithDoctor)) {
        actionQ.value = '';
        actionQ.shareWithPatient = false;
        actionQ.shareWithDoctor = false;
        this.saveQuestionAnswer('p1_incidents_action', '', true);
      }
      
      console.log('[Anamnesis] updatePart1IncidentsVisibility: actionNeeded=', value, '-> showAction=', shouldShow);
    }
  }

  private updatePart1FollowupVisibility(value: any) {
    const box = this.allQuestionBoxes.part1.find(b => b.id === 'followup');
    if (!box) return;

    const actionQ = box.questions.find(q => q.name === 'p1_followup_action');
    if (actionQ) {
      const shouldShow = value === true;
      actionQ.hidden = !shouldShow;
      
      // If hiding, clear the field and its share flags, then save
      if (!shouldShow && (actionQ.value || actionQ.shareWithPatient || actionQ.shareWithDoctor)) {
        actionQ.value = '';
        actionQ.shareWithPatient = false;
        actionQ.shareWithDoctor = false;
        this.saveQuestionAnswer('p1_followup_action', '', true);
      }
      
      console.log('[Anamnesis] updatePart1FollowupVisibility: actionNeeded=', value, '-> showAction=', shouldShow);
    }
  }

  switchPart(part: 'part1' | 'part2' | 'part3') {
    this.currentPart = part;
    this.questionBoxes = this.allQuestionBoxes[part];
    this.selectedBox = null; // Clear selection when switching parts
  }

  private getNotesForBox(box: QuestionBox): ReviewNote[] {
    // Part 2: Therapy Adherence notes
    if (this.currentPart === 'part2') {
      if (box.id === 'p2_general_notes') {
        return this.notes.filter(note => 
          !note.linkedCnk && (note.category === 'TherapyAdherence' || note.category === 'MedicationSchema')
        );
      } else if (box.id.startsWith('p2_med_')) {
        const cnk = box.id.replace('p2_med_', '');
        return this.notes.filter(note => 
          String(note.linkedCnk) === cnk && (note.category === 'TherapyAdherence' || note.category === 'MedicationSchema')
        );
      }
    }

    // Part 3: Effectiveness & Side Effects notes
    if (this.currentPart === 'part3') {
      if (box.id === 'p3_general_notes') {
        return this.notes.filter(note => 
          !note.linkedCnk && note.category !== 'TherapyAdherence' && note.category !== 'MedicationSchema'
        );
      } else if (box.id.startsWith('p3_med_')) {
        const cnk = box.id.replace('p3_med_', '');
        return this.notes.filter(note => 
          String(note.linkedCnk) === cnk && note.category !== 'TherapyAdherence' && note.category !== 'MedicationSchema'
        );
      }
    }

    return [];
  }

  getVisibleQuestionCount(box: QuestionBox): number {
    let count = box.questions.filter(q => !q.hidden).length;
    
    // Add notes count for general notes boxes
    const notes = this.getNotesForBox(box);
    count += notes.length;
    
    return count;
  }

  getAnsweredQuestionCount(box: QuestionBox): number {
    const visibleQuestions = box.questions.filter(q => !q.hidden);
    let answeredCount = visibleQuestions.filter(q => {
      if (q.type === 'checkbox') {
        return q.value === true;
      }
      if (q.type === 'radio') {
        if (q.options && q.options.length > 0 && typeof q.options[0] === 'boolean') {
          return q.value === true || q.value === false;
        }
        return q.value !== null && q.value !== undefined && q.value !== '';
      }
      if (q.type === 'number') {
        return q.value !== null && q.value !== undefined;
      }
      return q.value !== null && q.value !== undefined && q.value !== '';
    }).length;
    
    // Add answered notes count (notes with comments)
    const notes = this.getNotesForBox(box);
    notes.forEach(note => {
      const questionName = `note_comment_${note.rowKey}`;
      const savedAnswer = this.questionAnswers.get(questionName);
      if (savedAnswer?.value && savedAnswer.value.trim() !== '') {
        answeredCount++;
      }
    });
    
    return answeredCount;
  }

  getShareWithPatientCount(box: QuestionBox): number {
    let count = box.questions.filter(q => q.shareWithPatient === true).length;
    
    // Add notes marked for patient sharing
    const notes = this.getNotesForBox(box);
    notes.forEach(note => {
      const questionName = `note_share_patient_${note.rowKey}`;
      const savedAnswer = this.questionAnswers.get(questionName);
      if (savedAnswer?.value === 'true') {
        count++;
      }
    });
    
    return count;
  }

  getShareWithDoctorCount(box: QuestionBox): number {
    let count = box.questions.filter(q => q.shareWithDoctor === true).length;
    
    // Add notes marked for doctor sharing
    const notes = this.getNotesForBox(box);
    notes.forEach(note => {
      const questionName = `note_share_doctor_${note.rowKey}`;
      const savedAnswer = this.questionAnswers.get(questionName);
      if (savedAnswer?.value === 'true') {
        count++;
      }
    });
    
    return count;
  }

  getQuestionProgress(box: QuestionBox): number {
    const totalVisible = this.getVisibleQuestionCount(box);
    if (totalVisible === 0) return 0;
    
    const totalAnswered = this.getAnsweredQuestionCount(box);
    const progressPercent = Math.round((totalAnswered / totalVisible) * 100);
    
    console.log(`[Anamnesis] Progress for box "${box.id}": ${totalAnswered}/${totalVisible} = ${progressPercent}%`);
    
    return progressPercent;
  }

  getPartProgress(part: 'part1' | 'part2' | 'part3'): number {
    const boxes = this.allQuestionBoxes[part];
    if (!boxes || boxes.length === 0) return 0;

    let totalQuestions = 0;
    let totalAnswered = 0;

    boxes.forEach(box => {
      const visibleQuestions = box.questions.filter(q => !q.hidden);
      totalQuestions += visibleQuestions.length;

      const answeredQuestions = visibleQuestions.filter(q => {
        if (q.type === 'checkbox') {
          return q.value === true;
        }
        if (q.type === 'radio') {
          if (q.options && q.options.length > 0 && typeof q.options[0] === 'boolean') {
            return q.value === true || q.value === false;
          }
          return q.value !== null && q.value !== undefined && q.value !== '';
        }
        if (q.type === 'number') {
          return q.value !== null && q.value !== undefined;
        }
        return q.value !== null && q.value !== undefined && q.value !== '';
      });

      totalAnswered += answeredQuestions.length;
    });

    return totalQuestions === 0 ? 0 : Math.round((totalAnswered / totalQuestions) * 100);
  }

  getNotesForSelectedBox(): ReviewNote[] {
    if (!this.selectedBox) return [];

    // Part 2: Therapy Adherence notes
    if (this.currentPart === 'part2') {
      if (this.selectedBox.id === 'p2_general_notes') {
        // Return general adherence notes
        return this.notes.filter(note => 
          !note.linkedCnk && (note.category === 'TherapyAdherence' || note.category === 'MedicationSchema')
        );
      } else if (this.selectedBox.id.startsWith('p2_med_')) {
        // Extract CNK from box ID
        const cnk = this.selectedBox.id.replace('p2_med_', '');
        return this.notes.filter(note => 
          String(note.linkedCnk) === cnk && (note.category === 'TherapyAdherence' || note.category === 'MedicationSchema')
        );
      }
    }

    // Part 3: Effectiveness & Side Effects notes
    if (this.currentPart === 'part3') {
      if (this.selectedBox.id === 'p3_general_notes') {
        // Return general effectiveness notes
        return this.notes.filter(note => 
          !note.linkedCnk && note.category !== 'TherapyAdherence' && note.category !== 'MedicationSchema'
        );
      } else if (this.selectedBox.id.startsWith('p3_med_')) {
        // Extract CNK from box ID
        const cnk = this.selectedBox.id.replace('p3_med_', '');
        return this.notes.filter(note => 
          String(note.linkedCnk) === cnk && note.category !== 'TherapyAdherence' && note.category !== 'MedicationSchema'
        );
      }
    }

    return [];
  }

  getNoteComment(noteRowKey: string): string {
    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) return '';

    // Use questionName format: note_comment_{noteRowKey}
    const questionName = `note_comment_${noteRowKey}`;
    const savedAnswer = this.questionAnswers.get(questionName);
    return savedAnswer?.value || '';
  }

  onNoteCommentChange(noteRowKey: string, event: Event) {
    const target = event.target as HTMLTextAreaElement;
    const value = target.value;
    const questionName = `note_comment_${noteRowKey}`;
    this.saveQuestionAnswer(questionName, value);
  }

  getNoteShareWithPatient(noteRowKey: string): boolean {
    const questionName = `note_share_patient_${noteRowKey}`;
    const savedAnswer = this.questionAnswers.get(questionName);
    return savedAnswer?.value === 'true';
  }

  getNoteShareWithDoctor(noteRowKey: string): boolean {
    const questionName = `note_share_doctor_${noteRowKey}`;
    const savedAnswer = this.questionAnswers.get(questionName);
    return savedAnswer?.value === 'true';
  }

  onNoteShareChange(noteRowKey: string, shareType: 'patient' | 'doctor', event: Event) {
    const target = event.target as HTMLInputElement;
    const value = target.checked;
    const questionName = `note_share_${shareType}_${noteRowKey}`;
    this.saveQuestionAnswer(questionName, value);
  }

  // Download PDF directly
  downloadPdf() {
    console.log('[AnamnesisPage] Generating and downloading PDF');
    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) {
      console.error('[AnamnesisPage] No medication review ID');
      return;
    }

    // Get current notes from service
    const notes = this.reviewNotesService.getNotes();
    const generalSections = this.prepareGeneralSections(notes);
    const { adherenceNotes, effectivenessNotes } = this.prepareGroupedNotes(notes);

    // Get translated part titles
    const partTitles = {
      part1: this.transloco.translate('pdf.part_1_title'),
      part2: this.transloco.translate('pdf.part_2_title'),
      part3: this.transloco.translate('pdf.part_3_title'),
      part4: this.transloco.translate('pdf.part_4_title')
    };

    // Generate PDF and trigger download
    this.anamnesisePdfService.generatePDF(
      generalSections,
      this.medications,
      adherenceNotes as Record<string, ReviewNote[]>,
      effectivenessNotes as Record<string, ReviewNote[]>,
      false, // download mode
      partTitles
    ).catch(error => {
      console.error('Error generating PDF:', error);
    });
  }

  private prepareGeneralSections(notes: ReviewNote[]): any[] {
    // Build Part 1 sections from the question boxes and answers
    const sections: any[] = [];
    
    // Get Part 1 question boxes
    const part1Boxes = this.allQuestionBoxes.part1 || [];
    
    part1Boxes.forEach(box => {
      const section: any = {
        title: box.title,
        questions: []
      };
      
      box.questions.forEach(question => {
        // Skip all hidden questions - they should NEVER appear in the PDF
        // Use originallyHidden to check the initial state, not the current dynamic state
        if (question.originallyHidden) {
          console.log('[PDF] Skipping originally hidden question:', question.name);
          return; // Skip this question entirely
        }
        
        // Map question type to PDF type
        let pdfType = 'text';
        if (question.type === 'radio' && question.options && question.options.includes(true)) {
          pdfType = 'checkbox';
        } else if (question.type === 'number') {
          pdfType = 'number';
        } else if (question.type === 'textarea') {
          pdfType = 'text';
        }
        
        console.log('[PDF] Including question:', question.name, 'originallyHidden:', question.originallyHidden);
        section.questions.push({
          text: question.text,
          type: pdfType,
          value: this.questionAnswers.get(question.name)?.value
        });
      });
      
      if (section.questions.length > 0) {
        sections.push(section);
      }
    });
    
    console.log('[PDF] Final sections prepared:', sections);
    return sections;
  }

  private prepareGroupedNotes(notes: ReviewNote[]): { adherenceNotes: Record<string, ReviewNote[]>, effectivenessNotes: Record<string, ReviewNote[]> } {
    const adherenceNotes: Record<string, ReviewNote[]> = {};
    const effectivenessNotes: Record<string, ReviewNote[]> = {};

    // Filter for patient conversation notes only
    const patientNotes = notes.filter(note => note.discussWithPatient === true);

    // Separate general notes (no linkedCnk) and medication-specific notes
    const generalNotes = patientNotes.filter(note => !note.linkedCnk);
    const medicationNotes = patientNotes.filter(note => note.linkedCnk);

    // Build a quick lookup of medications by CNK
    const medsByCnk: Record<string, any> = {};
    this.medications.forEach(m => {
      if (m.cnk) {
        medsByCnk[m.cnk] = m;
      }
    });

    // Group medication-specific notes by their medication
    medicationNotes.forEach(note => {
      const cnk = String(note.linkedCnk);
      const med = medsByCnk[cnk];
      
      if (med) {
        const key = med.name || 'Unknown Medication';
        
        // Categorize based on note category
        if (note.category === 'TherapyAdherence' || note.category === 'MedicationSchema') {
          if (!adherenceNotes[key]) {
            adherenceNotes[key] = [];
          }
          adherenceNotes[key].push(note);
        } else {
          if (!effectivenessNotes[key]) {
            effectivenessNotes[key] = [];
          }
          effectivenessNotes[key].push(note);
        }
      }
    });

    // Add general notes under "General" heading
    if (generalNotes.length > 0) {
      const therapyGeneralNotes = generalNotes.filter(n => n.category === 'TherapyAdherence' || n.category === 'MedicationSchema');
      const effectivenessGeneralNotes = generalNotes.filter(n => n.category !== 'TherapyAdherence' && n.category !== 'MedicationSchema');
      
      if (therapyGeneralNotes.length > 0) {
        adherenceNotes['General'] = therapyGeneralNotes;
      }
      if (effectivenessGeneralNotes.length > 0) {
        effectivenessNotes['General'] = effectivenessGeneralNotes;
      }
    }

    return { adherenceNotes, effectivenessNotes };
  }
}

