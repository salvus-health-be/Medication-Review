import { Injectable, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import pdfMake from 'pdfmake/build/pdfmake';
import { vfs } from 'pdfmake/build/vfs_fonts';
import { TDocumentDefinitions, Content } from 'pdfmake/interfaces';
import { ApiService } from './api.service';
import { StateService } from './state.service';
import { ReviewNotesService, ReviewNote } from './review-notes.service';
import { forkJoin, Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { 
  QuestionAnswer, 
  Medication, 
  Contraindication, 
  LabValue,
  Patient,
  MedicationReview 
} from '../models/api.models';

// Initialize pdfMake with fonts
(pdfMake as any).vfs = vfs;

interface ReportData {
  patient: Patient | null;
  review: MedicationReview | null;
  medications: Medication[];
  questionAnswers: QuestionAnswer[];
  contraindications: Contraindication[];
  labValues: LabValue[];
  reviewNotes: ReviewNote[];
}

@Injectable({
  providedIn: 'root'
})
export class PdfGenerationService {
  private apiService = inject(ApiService);
  private stateService = inject(StateService);
  private transloco = inject(TranslocoService);
  private reviewNotesService = inject(ReviewNotesService);

  // Brand colors
  private readonly brandPrimary = '#454B60';
  private readonly brandSecondary = '#5F6476';
  private readonly brandAccent = '#9DC9A2';
  private readonly textPrimary = '#454B60';
  private readonly textSecondary = '#666666';
  private readonly borderColor = '#e0e0e0';

  private loadReportData(): Observable<ReportData> {
    const apbNumber = this.stateService.apbNumber;
    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) {
      return of({
        patient: null,
        review: null,
        medications: [],
        questionAnswers: [],
        contraindications: [],
        labValues: [],
        reviewNotes: []
      });
    }

    const sessionData = this.stateService.getSessionData();

    return forkJoin({
      medications: this.apiService.getMedications(apbNumber, reviewId).pipe(catchError(() => of([]))),
      questionAnswers: this.apiService.getQuestionAnswers(apbNumber, reviewId).pipe(catchError(() => of([]))),
      contraindications: this.apiService.getContraindications(apbNumber, reviewId).pipe(catchError(() => of([]))),
      labValues: this.apiService.getLabValues(apbNumber, reviewId).pipe(catchError(() => of([]))),
      reviewNotes: this.apiService.getReviewNotes(apbNumber, reviewId).pipe(catchError(() => of([])))
    }).pipe(
      map(data => ({
        patient: sessionData?.patient || null,
        review: sessionData?.review || null,
        medications: data.medications,
        questionAnswers: data.questionAnswers,
        contraindications: data.contraindications,
        labValues: data.labValues,
        reviewNotes: data.reviewNotes
      }))
    );
  }

  private createPdfBlob(docDefinition: TDocumentDefinitions): Observable<Blob> {
    return new Observable<Blob>(observer => {
      try {
        const pdfDocGenerator = pdfMake.createPdf(docDefinition);
        
        pdfDocGenerator.getBlob((blob) => {
          observer.next(blob);
          observer.complete();
        });
      } catch (error) {
        observer.error(error);
      }
    });
  }

  // ============================================================================
  // Helper methods for PDF generation
  // ============================================================================

  private createPatientSummaryDocument(data: ReportData): TDocumentDefinitions {
    const content: Content[] = [];

    // Header
    content.push(this.createHeader(this.transloco.translate('pdf.patient_summary')));
    content.push(this.createSpacer(20));

    // Patient Info
    content.push(this.createPatientInfoSection(data));
    content.push(this.createSpacer(15));

    // Notes to Discuss with Patient
    const patientNotes = data.questionAnswers.filter(qa => qa.shareWithPatient && qa.value);
    if (patientNotes.length > 0) {
      content.push(this.createSectionTitle(this.transloco.translate('pdf.pharmacist_notes')));
      content.push(this.createSpacer(10));
      
      patientNotes.forEach(note => {
        const noteContent = this.createNoteCard(note, data.medications);
        content.push(noteContent);
        content.push(this.createSpacer(8));
      });
    } else {
      content.push({
        text: this.transloco.translate('pdf.no_notes') || 'No notes',
        style: 'emptyState'
      });
    }

    return {
      content,
      styles: this.getStyles(),
      pageMargins: [40, 60, 40, 60]
    };
  }

  private createDoctorSummaryDocument(data: ReportData): TDocumentDefinitions {
    const content: Content[] = [];

    // Header
    content.push(this.createHeader(this.transloco.translate('pdf.doctor_summary')));
    content.push(this.createSpacer(20));

    // Patient Info
    content.push(this.createPatientInfoSection(data));
    content.push(this.createSpacer(15));

    // Medication List
    if (data.medications.length > 0) {
      content.push(this.createSectionTitle(this.transloco.translate('pdf.current_medications')));
      content.push(this.createSpacer(10));
      content.push(this.createMedicationScheduleTable(data.medications));
      content.push(this.createSpacer(15));
    }

    // Clinical Notes for Doctor
    const doctorNotes = data.questionAnswers.filter(qa => qa.shareWithDoctor && qa.value);
    if (doctorNotes.length > 0) {
      content.push(this.createSectionTitle('Pharmacist Observations'));
      content.push(this.createSpacer(10));
      
      doctorNotes.forEach(note => {
        const noteContent = this.createNoteCard(note, data.medications);
        content.push(noteContent);
        content.push(this.createSpacer(8));
      });
    } else {
      content.push({
        text: 'No clinical observations marked for review.',
        style: 'emptyState'
      });
    }

    return {
      content,
      styles: this.getStyles(),
      pageMargins: [40, 60, 40, 60]
    };
  }

  private createPharmacySummaryDocument(data: ReportData): TDocumentDefinitions {
    const content: Content[] = [];

    // Header
    content.push(this.createHeader(this.transloco.translate('pdf.pharmacy_summary')));
    content.push(this.createSpacer(20));

    // Patient Info
    content.push(this.createPatientInfoSection(data));
    content.push(this.createSpacer(15));

    // Medications with Schema
    if (data.medications.length > 0) {
      content.push(this.createSectionTitle(this.transloco.translate('pdf.current_medications')));
      content.push(this.createSpacer(10));
      content.push(this.createMedicationScheduleTable(data.medications));
      content.push(this.createSpacer(15));
    }

    // Contraindications
    if (data.contraindications.length > 0) {
      content.push(this.createSectionTitle(this.transloco.translate('tools.contraindications')));
      content.push(this.createSpacer(10));
      data.contraindications.forEach(ci => {
        content.push({
          text: `• ${ci.name || ci.contraindicationCode}`,
          style: 'listItem'
        });
      });
      content.push(this.createSpacer(15));
    }

    // Lab Values
    if (data.labValues.length > 0) {
      content.push(this.createSectionTitle('Lab Values'));
      content.push(this.createSpacer(10));
      content.push(this.createLabValuesTable(data.labValues));
      content.push(this.createSpacer(15));
    }

    // Comprehensive Anamnesis - Part 1
    this.addPart1QuestionsToPharmacySummary(content, data);

    // Part 2: Medication Adherence
    this.addPart2QuestionsToPharmacySummary(content, data);

    // Part 3: Medication Effectiveness and Side Effects
    this.addPart3QuestionsToPharmacySummary(content, data);

    return {
      content,
      styles: this.getStyles(),
      pageMargins: [40, 60, 40, 60]
    };
  }

  private addPart1QuestionsToPharmacySummary(content: Content[], data: ReportData) {
    content.push(this.createSectionTitle(this.transloco.translate('pdf.part_1')));
    content.push(this.createSpacer(10));

    // Patient Concerns
    const concernsAnswers = this.getAnswersForSection(data.questionAnswers, 'p1_concerns_');
    if (concernsAnswers.length > 0) {
      content.push({ text: this.transloco.translate('pdf.patient_concerns') || 'Patient Concerns', style: 'subsectionTitle' });
      content.push(this.createSpacer(5));
      this.addQuestionAnswerPairs(content, concernsAnswers, [
        { key: 'tooMany', label: this.transloco.translate('pdf.patient_concern_tooMany') },
        { key: 'financialBurden', label: this.transloco.translate('pdf.patient_concern_financialBurden') },
        { key: 'anxiety', label: this.transloco.translate('pdf.patient_concern_anxiety') },
        { key: 'untreatedComplaints', label: this.transloco.translate('pdf.patient_concern_untreatedComplaints') },
        { key: 'other', label: this.transloco.translate('pdf.patient_concern_other') }
      ]);
      content.push(this.createSpacer(10));
    }

    // Medication Assistance
    const helpAnswers = this.getAnswersForSection(data.questionAnswers, 'p1_help_');
    if (helpAnswers.length > 0) {
      content.push({ text: this.transloco.translate('pdf.medication_assistance') || 'Medication Assistance', style: 'subsectionTitle' });
      content.push(this.createSpacer(5));
      this.addQuestionAnswerPairs(content, helpAnswers, [
        { key: 'hasAssistance', label: this.transloco.translate('pdf.medication_help_hasAssistance') },
        { key: 'additionalNeededQuestion', label: this.transloco.translate('pdf.medication_help_additionalNeeded') }
      ]);
      content.push(this.createSpacer(10));
    }

    // Practical Problems
    const practicalAnswers = this.getAnswersForSection(data.questionAnswers, 'p1_practical_');
    if (practicalAnswers.length > 0) {
      content.push({ text: this.transloco.translate('pdf.practical_problems') || 'Practical Problems', style: 'subsectionTitle' });
      content.push(this.createSpacer(5));
      this.addQuestionAnswerPairs(content, practicalAnswers, [
        { key: 'swallowing', label: this.transloco.translate('pdf.practical_problem_swallowing') },
        { key: 'movement', label: this.transloco.translate('pdf.practical_problem_movement') },
        { key: 'vision', label: this.transloco.translate('pdf.practical_problem_vision') },
        { key: 'hearing', label: this.transloco.translate('pdf.practical_problem_hearing') },
        { key: 'cognitive', label: this.transloco.translate('pdf.practical_problem_cognitive') },
        { key: 'dexterity', label: this.transloco.translate('pdf.practical_problem_dexterity') },
        { key: 'other', label: this.transloco.translate('pdf.practical_problem_other') }
      ]);
      content.push(this.createSpacer(10));
    }

    // Incidents
    const incidentAnswers = this.getAnswersForSection(data.questionAnswers, 'p1_incidents_');
    if (incidentAnswers.length > 0) {
      content.push({ text: this.transloco.translate('pdf.incidents') || 'Incidents', style: 'subsectionTitle' });
      content.push(this.createSpacer(5));
      this.addQuestionAnswerPairs(content, incidentAnswers, [
        { key: 'falls', label: this.transloco.translate('pdf.incidents_falls') },
        { key: 'hospitalizations', label: this.transloco.translate('pdf.incidents_hospitalizations') },
        { key: 'actionNeeded', label: this.transloco.translate('pdf.incidents_actionNeeded') }
      ]);
      content.push(this.createSpacer(10));
    }

    // Follow-up/Monitoring
    const followupAnswers = this.getAnswersForSection(data.questionAnswers, 'p1_followup_');
    if (followupAnswers.length > 0) {
      content.push({ text: this.transloco.translate('pdf.follow_up_monitoring') || 'Follow-up and Monitoring', style: 'subsectionTitle' });
      content.push(this.createSpacer(5));
      this.addQuestionAnswerPairs(content, followupAnswers, [
        { key: 'careProviders', label: this.transloco.translate('pdf.followup_careProviders') },
        { key: 'parameterMonitoring', label: this.transloco.translate('pdf.followup_parameterMonitoring') },
        { key: 'actionNeeded', label: this.transloco.translate('pdf.followup_actionNeeded') }
      ]);
      content.push(this.createSpacer(10));
    }
  }

  private addPart2QuestionsToPharmacySummary(content: Content[], data: ReportData) {
    const part2Answers = data.questionAnswers.filter(qa => qa.questionName.startsWith('p2_med_'));
    if (part2Answers.length === 0) return;

    content.push(this.createSectionTitle(this.transloco.translate('pdf.part_2')));
    content.push(this.createSpacer(10));

    // Group by medication
    const medicationGroups = this.groupAnswersByMedication(part2Answers, data.medications);
    
    medicationGroups.forEach(group => {
      content.push({ text: group.medicationName, style: 'subsectionTitle' });
      content.push(this.createSpacer(5));
      
      this.addQuestionAnswerPairs(content, group.answers, [
        { key: 'adherence', label: this.transloco.translate('pdf.adherence_takes_as_prescribed') },
        { key: 'frequency', label: this.transloco.translate('pdf.adherence_frequency_forgotten') },
        { key: 'barriers', label: this.transloco.translate('pdf.adherence_problems') },
        { key: 'notes', label: this.transloco.translate('pdf.pharmacist_notes') }
      ]);
      
      content.push(this.createSpacer(10));
    });
  }

  private addPart3QuestionsToPharmacySummary(content: Content[], data: ReportData) {
    const part3Answers = data.questionAnswers.filter(qa => qa.questionName.startsWith('p3_med_'));
    if (part3Answers.length === 0) return;

    content.push(this.createSectionTitle(this.transloco.translate('pdf.part_3')));
    content.push(this.createSpacer(10));

    // Group by medication
    const medicationGroups = this.groupAnswersByMedication(part3Answers, data.medications);
    
    medicationGroups.forEach(group => {
      content.push({ text: group.medicationName, style: 'subsectionTitle' });
      content.push(this.createSpacer(5));
      
      this.addQuestionAnswerPairs(content, group.answers, [
        { key: 'effective', label: this.transloco.translate('pdf.effectiveness_is_effective') },
        { key: 'effectiveAction', label: this.transloco.translate('pdf.pharmacist_notes') },
        { key: 'hasSideEffects', label: this.transloco.translate('pdf.effectiveness_has_side_effects') },
        { key: 'sideEffectsAction', label: this.transloco.translate('pdf.pharmacist_notes') }
      ]);
      
      content.push(this.createSpacer(10));
    });
  }

  private getAnswersForSection(answers: QuestionAnswer[], prefix: string): QuestionAnswer[] {
    return answers.filter(qa => qa.questionName.startsWith(prefix));
  }

  private addQuestionAnswerPairs(content: Content[], answers: QuestionAnswer[], questionMap: { key: string; label: string }[]) {
    questionMap.forEach(q => {
      const answer = answers.find(a => a.questionName.includes(`_${q.key}`));
      if (answer && answer.value) {
        content.push({
          columns: [
            { text: q.label, style: 'questionLabel', width: '*' },
            { text: answer.value, style: 'answerValue', width: '60%' }
          ],
          margin: [0, 2, 0, 2]
        });
      }
    });
  }

  private groupAnswersByMedication(answers: QuestionAnswer[], medications: Medication[]): { medicationName: string; answers: QuestionAnswer[] }[] {
    const groups: Map<string, QuestionAnswer[]> = new Map();
    
    answers.forEach(answer => {
      const cnkMatch = answer.questionName.match(/med_(\d+)/);
      if (cnkMatch) {
        const cnk = cnkMatch[1];
        if (!groups.has(cnk)) {
          groups.set(cnk, []);
        }
        groups.get(cnk)!.push(answer);
      }
    });

    return Array.from(groups.entries()).map(([cnk, answers]) => {
      const med = medications.find(m => String(m.cnk) === cnk);
      return {
        medicationName: med?.name || `Medication CNK: ${cnk}`,
        answers
      };
    });
  }

  private createHeader(title: string): Content {
    return {
      columns: [
        {
          text: title,
          style: 'header',
          width: '*'
        },
        {
          text: new Date().toLocaleDateString(),
          style: 'headerDate',
          width: 'auto'
        }
      ]
    };
  }

  private createPatientInfoSection(data: ReportData): Content {
    const items: any[] = [];

    if (data.review?.firstNameAtTimeOfReview || data.review?.lastNameAtTimeOfReview) {
      const name = [data.review.firstNameAtTimeOfReview, data.review.lastNameAtTimeOfReview]
        .filter(Boolean)
        .join(' ');
      items.push({ text: this.transloco.translate('patient.name') + ':', style: 'infoLabel', width: 80 });
      items.push({ text: name, style: 'infoValue', width: '*' });
    }

    if (data.patient?.dateOfBirth) {
      if (items.length > 0) {
        items.push({ text: '', width: 20 }); // Spacer
      }
      items.push({ text: this.transloco.translate('patient.birth_date') + ':', style: 'infoLabel', width: 60 });
      // Format date: extract date part only (YYYY-MM-DD)
      const formattedDate = data.patient.dateOfBirth.split('T')[0];
      items.push({ text: formattedDate, style: 'infoValue', width: 'auto' });
    }

    if (data.patient?.sex) {
      if (items.length > 0) {
        items.push({ text: '', width: 20 }); // Spacer
      }
      items.push({ text: this.transloco.translate('patient.sex') + ':', style: 'infoLabel', width: 60 });
      items.push({ text: data.patient.sex, style: 'infoValue', width: 'auto' });
    }

    if (items.length === 0) {
      return { text: '' };
    }

    return {
      columns: items,
      style: 'patientInfo'
    };
  }

  private createSectionTitle(title: string): Content {
    return {
      text: title,
      style: 'sectionTitle'
    };
  }

  private createNoteCard(note: QuestionAnswer, medications: Medication[]): Content {
    const context = this.getNoteContext(note.questionName, medications);
    
    const stack: any[] = [];
    
    // Add context header if available
    if (context.category) {
      stack.push({
        text: context.category,
        style: 'noteCategory',
        margin: [0, 0, 0, 2]
      });
    }
    
    // Add medication name if applicable
    if (context.medicationName) {
      stack.push({
        text: context.medicationName,
        style: 'noteMedication',
        margin: [0, 0, 0, 4]
      });
    }
    
    // Add question context
    if (context.question) {
      stack.push({
        text: context.question,
        style: 'noteQuestion',
        margin: [0, 0, 0, 4]
      });
    }
    
    // Add the actual note content
    stack.push({
      text: note.value || '',
      style: 'noteContent',
      margin: [0, 0, 0, 0]
    });
    
    return {
      stack,
      margin: [10, 5, 10, 10],
      fillColor: '#f9f9f9'
    };
  }

  private getNoteContext(questionName: string, medications: Medication[]): { 
    category?: string; 
    medicationName?: string; 
    question?: string;
  } {
    const context: { category?: string; medicationName?: string; question?: string } = {};
    
    // Extract CNK if present
    const cnkMatch = questionName.match(/med_(\d+)/);
    if (cnkMatch) {
      const cnk = parseInt(cnkMatch[1]);
      const med = medications.find(m => m.cnk === cnk);
      if (med?.name) {
        context.medicationName = `Medication: ${med.name} (CNK: ${med.cnk})`;
        if (med.indication) {
          context.medicationName += ` - ${med.indication}`;
        }
      }
    }
    
    // Determine category and question context
    if (questionName.startsWith('p1_concerns_')) {
      context.category = 'Part 1: Patient Concerns';
      if (questionName.includes('tooManyAction')) context.question = 'Action for: Patient feels they take too many medications';
      else if (questionName.includes('financialBurdenAction')) context.question = 'Action for: Financial burden concern';
      else if (questionName.includes('anxietyAction')) context.question = 'Action for: Anxiety about medications';
      else if (questionName.includes('untreatedComplaintsAction')) context.question = 'Action for: Untreated complaints';
      else if (questionName.includes('otherAction')) context.question = 'Action for: Other concerns';
    } else if (questionName.startsWith('p1_help_')) {
      context.category = 'Part 1: Medication Assistance';
      if (questionName.includes('additionalNeededAction')) context.question = 'Action for: Additional assistance needed';
    } else if (questionName.startsWith('p1_practical_')) {
      context.category = 'Part 1: Practical Problems';
      if (questionName.includes('swallowingAction')) context.question = 'Action for: Swallowing difficulties';
      else if (questionName.includes('movementAction')) context.question = 'Action for: Movement limitations';
      else if (questionName.includes('visionAction')) context.question = 'Action for: Vision problems';
      else if (questionName.includes('hearingAction')) context.question = 'Action for: Hearing problems';
      else if (questionName.includes('cognitiveAction')) context.question = 'Action for: Cognitive problems';
      else if (questionName.includes('dexterityAction')) context.question = 'Action for: Dexterity issues';
      else if (questionName.includes('otherAction')) context.question = 'Action for: Other practical problems';
    } else if (questionName.includes('p1_incidents_action')) {
      context.category = 'Part 1: Incidents';
      context.question = 'Pharmacist action regarding falls or hospitalizations';
    } else if (questionName.includes('p1_followup_action')) {
      context.category = 'Part 1: Follow-up/Monitoring';
      context.question = 'Pharmacist action for care coordination and monitoring';
    } else if (questionName.includes('p2_med_') && questionName.includes('_notes')) {
      context.category = 'Part 2: Therapy Adherence';
      context.question = 'Pharmacist notes on medication adherence';
    } else if (questionName.includes('p2_med_') && questionName.includes('_barriers')) {
      context.category = 'Part 2: Therapy Adherence';
      context.question = 'Barriers to taking medication as prescribed';
    } else if (questionName.includes('p3_med_') && questionName.includes('effectiveAction')) {
      context.category = 'Part 3: Medication Effectiveness';
      context.question = 'Action for: Medication not working as expected';
    } else if (questionName.includes('p3_med_') && questionName.includes('sideEffectsAction')) {
      context.category = 'Part 3: Side Effects';
      context.question = 'Action for: Patient experiencing side effects';
    }
    
    return context;
  }

  private createMedicationTable(medications: Medication[]): Content {
    const tableBody: any[] = [
      [
        { text: this.transloco.translate('pdf.medication'), style: 'tableHeader' },
        { text: this.transloco.translate('pdf.frequency_per_day'), style: 'tableHeader' },
        { text: this.transloco.translate('pdf.indication'), style: 'tableHeader' }
      ]
    ];

    medications.forEach(med => {
      tableBody.push([
        { text: med.name || this.transloco.translate('pdf.no_medication'), style: 'tableCell' },
        { text: this.formatFrequency(med), style: 'tableCell' },
        { text: med.indication || '-', style: 'tableCell' }
      ]);
    });

    return {
      table: {
        headerRows: 1,
        widths: ['*', 'auto', '*'],
        body: tableBody
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        hLineColor: () => this.borderColor,
        vLineColor: () => this.borderColor,
        paddingLeft: () => 8,
        paddingRight: () => 8,
        paddingTop: () => 6,
        paddingBottom: () => 6
      }
    };
  }

  private createMedicationScheduleTable(medications: Medication[]): Content {
    const tableBody: any[] = [
      [
        { text: this.transloco.translate('pdf.medication'), style: 'tableHeader' },
        { text: this.transloco.translate('medication.breakfast'), style: 'tableHeader' },
        { text: this.transloco.translate('medication.lunch'), style: 'tableHeader' },
        { text: this.transloco.translate('medication.dinner'), style: 'tableHeader' },
        { text: this.transloco.translate('medication.bedtime'), style: 'tableHeader' }
      ]
    ];

    medications.forEach(med => {
      // Check for special frequency (non-daily)
      if (med.specialFrequency && med.specialDescription) {
        const frequencyMap: Record<number, string> = {
          1: 'daily',
          2: 'twice weekly',
          3: 'three times weekly',
          4: 'weekly',
          5: 'every 2 weeks',
          6: 'every 3 weeks',
          7: 'every 4 weeks',
          8: 'monthly',
          9: 'every 2 months',
          10: 'quarterly',
          11: 'annually'
        };
        const freqText = frequencyMap[med.specialFrequency] || `code ${med.specialFrequency}`;
        tableBody.push([
          { text: med.name || 'Unknown', style: 'tableCell' },
          { text: `${med.specialDescription}`, style: 'tableCell', alignment: 'center' },
          { text: `(${freqText})`, style: 'tableCell', alignment: 'center', colSpan: 3 }
        ]);
      } else if (med.asNeeded) {
        // As needed medication
        tableBody.push([
          { text: med.name || 'Unknown', style: 'tableCell' },
          { text: 'As needed', style: 'tableCell', alignment: 'center', colSpan: 4 }
        ]);
      } else {
        // Standard daily schedule
        const morning = [med.unitsBeforeBreakfast, med.unitsDuringBreakfast]
          .filter(u => u && u > 0)
          .map(u => String(u))
          .join('+') || '-';
        
        const noon = [med.unitsBeforeLunch, med.unitsDuringLunch]
          .filter(u => u && u > 0)
          .map(u => String(u))
          .join('+') || '-';
        
        const evening = [med.unitsBeforeDinner, med.unitsDuringDinner]
          .filter(u => u && u > 0)
          .map(u => String(u))
          .join('+') || '-';
        
        const bedtime = med.unitsAtBedtime && med.unitsAtBedtime > 0 
          ? String(med.unitsAtBedtime) 
          : '-';

        tableBody.push([
          { text: med.name || 'Unknown', style: 'tableCell' },
          { text: morning, style: 'tableCell', alignment: 'center' },
          { text: noon, style: 'tableCell', alignment: 'center' },
          { text: evening, style: 'tableCell', alignment: 'center' },
          { text: bedtime, style: 'tableCell', alignment: 'center' }
        ]);
      }
    });

    return {
      table: {
        headerRows: 1,
        widths: ['*', 'auto', 'auto', 'auto', 'auto'],
        body: tableBody
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        hLineColor: () => this.borderColor,
        vLineColor: () => this.borderColor,
        paddingLeft: () => 8,
        paddingRight: () => 8,
        paddingTop: () => 6,
        paddingBottom: () => 6
      }
    };
  }

  private createLabValuesTable(labValues: LabValue[]): Content {
    const tableBody: any[] = [
      [
        { text: 'Parameter', style: 'tableHeader' },
        { text: 'Value', style: 'tableHeader' },
        { text: 'Unit', style: 'tableHeader' }
      ]
    ];

    labValues.forEach(lab => {
      tableBody.push([
        { text: lab.name || 'Unknown', style: 'tableCell' },
        { text: String(lab.value), style: 'tableCell', alignment: 'right' },
        { text: lab.unit || '', style: 'tableCell' }
      ]);
    });

    return {
      table: {
        headerRows: 1,
        widths: ['*', 'auto', 'auto'],
        body: tableBody
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        hLineColor: () => this.borderColor,
        vLineColor: () => this.borderColor,
        paddingLeft: () => 8,
        paddingRight: () => 8,
        paddingTop: () => 6,
        paddingBottom: () => 6
      }
    };
  }

  private formatDosage(med: Medication): string {
    if (med.dosageMg) {
      return `${med.dosageMg}mg`;
    }
    return '-';
  }

  private formatFrequency(med: Medication): string {
    const doses = [
      med.unitsBeforeBreakfast || 0,
      med.unitsDuringBreakfast || 0,
      med.unitsBeforeLunch || 0,
      med.unitsDuringLunch || 0,
      med.unitsBeforeDinner || 0,
      med.unitsDuringDinner || 0,
      med.unitsAtBedtime || 0
    ];
    
    const totalPerDay = doses.reduce((sum, dose) => sum + dose, 0);
    const timesPerDay = doses.filter(d => d > 0).length;
    
    if (totalPerDay === 0) {
      return med.asNeeded ? (this.transloco.translate('pdf.as_needed') || 'As needed') : '-';
    }
    
    if (timesPerDay === 1) {
      return this.transloco.translate('pdf.x_daily', { count: totalPerDay }) || `${totalPerDay}x daily`;
    }
    
    return this.transloco.translate('pdf.units_x_daily', { units: totalPerDay, count: timesPerDay }) || `${totalPerDay} units, ${timesPerDay}x daily`;
  }

  private createSpacer(height: number): Content {
    return { text: '', margin: [0, height, 0, 0] };
  }

  private getStyles(): any {
    return {
      header: {
        fontSize: 24,
        bold: true,
        color: this.brandPrimary,
        margin: [0, 0, 0, 0]
      },
      headerDate: {
        fontSize: 12,
        color: this.textSecondary,
        alignment: 'right',
        margin: [0, 8, 0, 0]
      },
      sectionTitle: {
        fontSize: 16,
        bold: true,
        color: this.brandPrimary,
        margin: [0, 0, 0, 0]
      },
      subsectionTitle: {
        fontSize: 13,
        bold: true,
        color: this.brandSecondary,
        margin: [0, 5, 0, 0]
      },
      questionLabel: {
        fontSize: 10,
        color: this.textSecondary,
        bold: false
      },
      answerValue: {
        fontSize: 10,
        color: this.textPrimary,
        bold: true
      },
      patientInfo: {
        fillColor: '#f5f5f5',
        margin: [0, 0, 0, 0]
      },
      infoLabel: {
        fontSize: 10,
        bold: true,
        color: this.textSecondary
      },
      infoValue: {
        fontSize: 10,
        color: this.textPrimary
      },
      noteCategory: {
        fontSize: 9,
        bold: true,
        color: this.brandAccent,
        italics: true
      },
      noteMedication: {
        fontSize: 11,
        bold: true,
        color: this.brandPrimary
      },
      noteQuestion: {
        fontSize: 10,
        color: this.textSecondary,
        italics: true
      },
      noteLabel: {
        fontSize: 11,
        bold: true,
        color: this.brandPrimary,
        margin: [0, 0, 0, 4]
      },
      noteContent: {
        fontSize: 10,
        color: this.textPrimary,
        lineHeight: 1.4
      },
      tableHeader: {
        fontSize: 11,
        bold: true,
        color: this.brandPrimary,
        fillColor: '#f5f5f5'
      },
      tableCell: {
        fontSize: 10,
        color: this.textPrimary
      },
      listItem: {
        fontSize: 10,
        color: this.textPrimary,
        margin: [0, 2, 0, 2]
      },
      emptyState: {
        fontSize: 10,
        color: this.textSecondary,
        italics: true
      }
    };
  }
}
