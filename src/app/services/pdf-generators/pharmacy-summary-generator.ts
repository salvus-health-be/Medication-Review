import { TranslocoService } from '@jsverse/transloco';
import { TDocumentDefinitions, Content } from 'pdfmake/interfaces';
import { ReviewNote } from '../review-notes.service';
import { 
  Patient, 
  MedicationReview, 
  Medication, 
  QuestionAnswer, 
  Contraindication, 
  LabValue 
} from '../../models/api.models';
import { BasePdfGenerator } from './base-pdf-generator';

export class PharmacySummaryGenerator extends BasePdfGenerator {
  constructor(transloco: TranslocoService) {
    super(transloco);
  }

  generate(
    patient: Patient | null,
    review: MedicationReview | null,
    medications: Medication[],
    questionAnswers: QuestionAnswer[],
    contraindications: Contraindication[],
    labValues: LabValue[],
    notes: ReviewNote[]
  ): TDocumentDefinitions {
    const content: Content[] = [];

    // Header
    content.push(this.createHeader(this.transloco.translate('pdf.pharmacy_summary')));
    content.push(this.createSpacer(20));

    // Patient Info
    content.push(this.createPatientInfoSection(patient, review));
    content.push(this.createSpacer(15));

    // Medications with Schema
    if (medications.length > 0) {
      content.push(this.createSectionTitle(this.transloco.translate('pdf.current_medications')));
      content.push(this.createSpacer(10));
      content.push(this.createMedicationScheduleTable(medications));
      content.push(this.createSpacer(15));
    }

    // Contraindications
    if (contraindications.length > 0) {
      content.push(this.createSectionTitle(this.transloco.translate('tools.contraindications')));
      content.push(this.createSpacer(10));
      contraindications.forEach(ci => {
        content.push({
          text: `• ${ci.name || ci.contraindicationCode}`,
          style: 'listItem'
        });
      });
      content.push(this.createSpacer(15));
    }

    // Lab Values
    if (labValues.length > 0) {
      content.push(this.createSectionTitle('Lab Values'));
      content.push(this.createSpacer(10));
      content.push(this.createLabValuesTable(labValues));
      content.push(this.createSpacer(15));
    }

    // Review Notes (all notes, regardless of patient/doctor flags)
    if (notes.length > 0) {
      content.push(this.createSectionTitle(this.transloco.translate('pdf.review_notes')));
      content.push(this.createSpacer(10));
      
      notes.forEach(note => {
        if (note.text) {
          const noteContent = this.createNoteCard(note, medications);
          content.push(noteContent);
          content.push(this.createSpacer(8));
        }
      });
      content.push(this.createSpacer(15));
    }

    // Comprehensive Anamnesis - Part 1
    this.addPart1QuestionsToPharmacySummary(content, questionAnswers);

    // Part 2: Medication Adherence
    this.addPart2QuestionsToPharmacySummary(content, questionAnswers, medications);

    // Part 3: Medication Effectiveness and Side Effects
    this.addPart3QuestionsToPharmacySummary(content, questionAnswers, medications);

    return {
      content,
      styles: this.getStyles(),
      pageMargins: [40, 60, 40, 60]
    };
  }

  private addPart1QuestionsToPharmacySummary(content: Content[], questionAnswers: QuestionAnswer[]) {
    content.push(this.createSectionTitle(this.transloco.translate('pdf.part_1')));
    content.push(this.createSpacer(10));

    // Patient Concerns
    const concernsAnswers = this.getAnswersForSection(questionAnswers, 'p1_concerns_');
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
    const helpAnswers = this.getAnswersForSection(questionAnswers, 'p1_help_');
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
    const practicalAnswers = this.getAnswersForSection(questionAnswers, 'p1_practical_');
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
    const incidentAnswers = this.getAnswersForSection(questionAnswers, 'p1_incidents_');
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
    const followupAnswers = this.getAnswersForSection(questionAnswers, 'p1_followup_');
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

  private addPart2QuestionsToPharmacySummary(content: Content[], questionAnswers: QuestionAnswer[], medications: Medication[]) {
    const part2Answers = questionAnswers.filter(qa => qa.questionName.startsWith('p2_med_'));
    if (part2Answers.length === 0) return;

    content.push(this.createSectionTitle(this.transloco.translate('pdf.part_2')));
    content.push(this.createSpacer(10));

    // Group by medication
    const medicationGroups = this.groupAnswersByMedication(part2Answers, medications);
    
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

  private addPart3QuestionsToPharmacySummary(content: Content[], questionAnswers: QuestionAnswer[], medications: Medication[]) {
    const part3Answers = questionAnswers.filter(qa => qa.questionName.startsWith('p3_med_'));
    if (part3Answers.length === 0) return;

    content.push(this.createSectionTitle(this.transloco.translate('pdf.part_3')));
    content.push(this.createSpacer(10));

    // Group by medication
    const medicationGroups = this.groupAnswersByMedication(part3Answers, medications);
    
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
}
