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

    // Simple letter-style header
    content.push(this.createLetterHeader());
    content.push(this.createSpacer(20));

    // Date
    content.push(this.createDate());
    content.push(this.createSpacer(20));

    // Patient Info - compact
    content.push(this.createCompactPatientInfo(patient, review));
    content.push(this.createSpacer(15));

    // Internal use notice
    content.push(this.createInternalNotice());
    content.push(this.createSpacer(12));

    // Current medications
    if (medications.length > 0) {
      content.push(this.createSimpleHeading(this.transloco.translate('pdf.current_medications') || 'Current Medications'));
      content.push(this.createSpacer(6));
      content.push(this.createMedicationScheduleTable(medications));
      content.push(this.createSpacer(12));
    }

    // Contraindications
    if (contraindications.length > 0) {
      content.push(this.createSimpleHeading(this.transloco.translate('tools.contraindications') || 'Contraindications'));
      content.push(this.createSpacer(6));
      const ciList = contraindications.map(ci => ({
        text: ci.name || ci.contraindicationCode,
        style: 'listItem'
      }));
      content.push({ ul: ciList, margin: [20, 0, 0, 0] });
      content.push(this.createSpacer(12));
    }

    // Review notes and actions
    const allNotes = notes.filter(note => note.text);
    const part1Actions = this.getPharmacyPart1Actions(questionAnswers);
    
    if (allNotes.length > 0 || part1Actions.length > 0) {
      content.push(this.createSimpleHeading(this.getPharmacyText('review_notes')));
      content.push(this.createSpacer(8));
      
      // Collect all items into a simple list
      const allItems: Array<{ text: string, context?: string }> = [];
      
      // Add Part 1 actions
      part1Actions.forEach((action: { label: string, value: string }) => {
        allItems.push({
          text: action.value,
          context: action.label
        });
      });
      
      // Group review notes
      const groupedNotes = this.groupNotesByMedication(allNotes, medications, questionAnswers);
      
      // Add general notes
      groupedNotes.general.forEach(note => {
        const commentKey = `note_comment_${note.rowKey}`;
        const commentAnswer = questionAnswers.find(qa => qa.questionName === commentKey);
        const text = commentAnswer?.value || note.text || '';
        if (text) {
          let displayText = text;
          if (note.discussWithPatient || note.communicateToDoctor) {
            const flags = [];
            if (note.discussWithPatient) flags.push('[Patient]');
            if (note.communicateToDoctor) flags.push('[Doctor]');
            displayText = `${flags.join(' ')} ${text}`;
          }
          allItems.push({ text: displayText });
        }
      });
      
      // Add medication-specific notes
      groupedNotes.byMedication.forEach(group => {
        group.notes.forEach(note => {
          const commentKey = `note_comment_${note.rowKey}`;
          const commentAnswer = questionAnswers.find(qa => qa.questionName === commentKey);
          const text = commentAnswer?.value || note.text || '';
          if (text) {
            let displayText = text;
            if (note.discussWithPatient || note.communicateToDoctor) {
              const flags = [];
              if (note.discussWithPatient) flags.push('[Patient]');
              if (note.communicateToDoctor) flags.push('[Doctor]');
              displayText = `${flags.join(' ')} ${text}`;
            }
            allItems.push({
              text: displayText,
              context: group.medicationName
            });
          }
        });
      });
      
      // Render as simple bullet list
      content.push(this.createSimpleList(allItems));
      content.push(this.createSpacer(12));
    }

    // Comprehensive Anamnesis - Part 1
    this.addPart1QuestionsToPharmacySummary(content, questionAnswers);

    // Part 2: Medication Adherence
    this.addPart2QuestionsToPharmacySummary(content, questionAnswers, medications);

    // Part 3: Medication Effectiveness and Side Effects
    this.addPart3QuestionsToPharmacySummary(content, questionAnswers, medications);

    // Footer
    content.push(this.createSpacer(15));
    content.push(this.createPharmacyFooter());

    return {
      content,
      styles: this.getStyles(),
      pageMargins: [60, 60, 60, 60],
      defaultStyle: {
        font: 'Roboto',
        fontSize: 10,
        lineHeight: 1.4
      }
    };
  }

  private createLetterHeader(): Content {
    return {
      text: this.transloco.translate('pdf.pharmacy_summary') || 'Pharmacy Summary',
      style: 'letterHeader'
    };
  }

  private createDate(): Content {
    const lang = this.transloco.getActiveLang();
    const date = new Date().toLocaleDateString(lang === 'nl' ? 'nl-BE' : lang === 'fr' ? 'fr-BE' : 'en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    
    return {
      text: date,
      style: 'dateText'
    };
  }

  private createCompactPatientInfo(patient: Patient | null, review: MedicationReview | null): Content {
    const lang = this.transloco.getActiveLang();
    let prefix = 'Voor: ';
    if (lang === 'fr') prefix = 'Pour : ';
    else if (lang === 'en') prefix = 'For: ';

    const name = [review?.firstNameAtTimeOfReview, review?.lastNameAtTimeOfReview]
      .filter(Boolean)
      .join(' ') || this.transloco.translate('pdf.unknown_patient');
    
    let dateStr = '';
    if (patient?.dateOfBirth) {
      const dob = patient.dateOfBirth.split('T')[0];
      dateStr = ` (${this.transloco.translate('patient.birth_date')}: ${dob})`;
    }

    return {
      text: `${prefix}${name}${dateStr}`,
      style: 'patientReference'
    };
  }

  private createInternalNotice(): Content {
    const lang = this.transloco.getActiveLang();
    let text = '';
    
    if (lang === 'nl') {
      text = 'Interne farmaceutische samenvatting met volledige reviewgegevens.';
    } else if (lang === 'fr') {
      text = 'Résumé pharmaceutique interne avec données complètes de l\'examen.';
    } else {
      text = 'Internal pharmaceutical summary with complete review data.';
    }

    return {
      text,
      style: 'bodyText',
      alignment: 'justify'
    };
  }

  private createSimpleHeading(text: string): Content {
    return {
      text,
      style: 'simpleHeading'
    };
  }

  private createSimpleList(items: Array<{ text: string, context?: string }>): Content {
    // Group items by context
    const grouped = new Map<string, string[]>();
    const noContext: string[] = [];

    items.forEach(item => {
      if (item.context) {
        if (!grouped.has(item.context)) {
          grouped.set(item.context, []);
        }
        grouped.get(item.context)!.push(item.text);
      } else {
        noContext.push(item.text);
      }
    });

    const listItems: any[] = [];

    // Add items without context
    noContext.forEach(text => {
      listItems.push({ text, style: 'listItem' });
    });

    // Add grouped items with nested ul
    grouped.forEach((texts, context) => {
      if (texts.length === 1) {
        // Single item: inline format
        listItems.push({
          text: `${context}: ${texts[0]}`,
          style: 'listItem'
        });
      } else {
        // Multiple items: nested list
        listItems.push({
          text: context,
          style: 'listItem',
          ul: texts.map(t => ({ text: t, style: 'listItem' }))
        });
      }
    });

    return {
      ul: listItems,
      margin: [20, 0, 0, 0]
    };
  }

  private createSubsectionTitle(text: string): Content {
    return {
      text: text,
      style: 'subsectionTitle',
      margin: [0, 8, 0, 5]
    };
  }

  private getPharmacyPart1Actions(questionAnswers: QuestionAnswer[]): Array<{ label: string, value: string }> {
    const actions: Array<{ label: string, value: string }> = [];
    
    const actionFields = [
      { key: 'p1_concerns_tooManyAction', label: this.transloco.translate('pdf.patient_concern_tooMany') },
      { key: 'p1_concerns_financialBurdenAction', label: this.transloco.translate('pdf.patient_concern_financialBurden') },
      { key: 'p1_concerns_anxietyAction', label: this.transloco.translate('pdf.patient_concern_anxiety') },
      { key: 'p1_concerns_untreatedComplaintsAction', label: this.transloco.translate('pdf.patient_concern_untreatedComplaints') },
      { key: 'p1_concerns_otherAction', label: this.transloco.translate('pdf.patient_concern_other') },
      { key: 'p1_help_additionalNeededAction', label: this.transloco.translate('pdf.medication_help_additionalNeeded') },
      { key: 'p1_practical_swallowingAction', label: this.transloco.translate('pdf.practical_problem_swallowing') },
      { key: 'p1_practical_movementAction', label: this.transloco.translate('pdf.practical_problem_movement') },
      { key: 'p1_practical_visionAction', label: this.transloco.translate('pdf.practical_problem_vision') },
      { key: 'p1_practical_hearingAction', label: this.transloco.translate('pdf.practical_problem_hearing') },
      { key: 'p1_practical_cognitiveAction', label: this.transloco.translate('pdf.practical_problem_cognitive') },
      { key: 'p1_practical_dexterityAction', label: this.transloco.translate('pdf.practical_problem_dexterity') },
      { key: 'p1_practical_otherAction', label: this.transloco.translate('pdf.practical_problem_other') },
      { key: 'p1_incidents_action', label: this.transloco.translate('pdf.incidents') },
      { key: 'p1_followup_action', label: this.transloco.translate('pdf.follow_up_monitoring') }
    ];
    
    actionFields.forEach(field => {
      const answer = questionAnswers.find(qa => qa.questionName === field.key);
      if (answer && answer.value && answer.value.trim()) {
        actions.push({
          label: field.label || field.key,
          value: answer.value
        });
      }
    });
    
    return actions;
  }

  private groupNotesByMedication(notes: ReviewNote[], medications: Medication[], questionAnswers: QuestionAnswer[]): {
    general: ReviewNote[],
    byMedication: Array<{ medicationName: string, notes: ReviewNote[] }>
  } {
    const general: ReviewNote[] = [];
    const byMedMap = new Map<string, ReviewNote[]>();

    notes.forEach(note => {
      if (!note.linkedCnk || !note.medicationName) {
        general.push(note);
      } else {
        const existing = byMedMap.get(note.medicationName) || [];
        existing.push(note);
        byMedMap.set(note.medicationName, existing);
      }
    });

    const byMedication = Array.from(byMedMap.entries()).map(([medicationName, notes]) => ({
      medicationName,
      notes
    }));

    return { general, byMedication };
  }

  private formatCategory(category: string): string {
    const categoryMap: Record<string, string> = {
      'TherapyAdherence': this.transloco.translate('pdf.medication_adherence') || 'Therapy Adherence',
      'Effectiveness': this.transloco.translate('pdf.effectiveness_side_effects') || 'Effectiveness',
      'SideEffects': this.transloco.translate('pdf.effectiveness_side_effects') || 'Side Effects',
      'MedicationSchema': this.transloco.translate('pdf.medication') || 'Medication',
      'PatientConcerns': this.transloco.translate('pdf.patient_concerns') || 'Patient Concerns',
      'PracticalProblems': this.transloco.translate('pdf.practical_problems') || 'Practical Problems'
    };
    
    return categoryMap[category] || category;
  }

  private createPharmacyFooter(): Content {
    const lang = this.transloco.getActiveLang();
    let text = '';
    
    if (lang === 'nl') {
      text = 'Voor intern farmaceutisch gebruik. Vertrouwelijke informatie.';
    } else if (lang === 'fr') {
      text = 'Pour usage pharmaceutique interne. Informations confidentielles.';
    } else {
      text = 'For internal pharmaceutical use. Confidential information.';
    }

    return {
      text,
      style: 'bodyText',
      alignment: 'left'
    };
  }

  private getPharmacyText(key: string): string {
    const lang = this.transloco.getActiveLang();
    
    const translations: Record<string, Record<string, string>> = {
      'review_notes': {
        'nl': 'Review notities',
        'fr': 'Notes de revue',
        'en': 'Review notes'
      },
      'comprehensive_notes': {
        'nl': 'Alle notities en acties uit het medicatiereview:',
        'fr': 'Toutes les notes et actions de l\'examen de médication :',
        'en': 'All notes and actions from the medication review:'
      },
      'anamnesis_actions': {
        'nl': 'Anamnese en acties',
        'fr': 'Anamnèse et actions',
        'en': 'Anamnesis and Actions'
      },
      'general_observations': {
        'nl': 'Algemene observaties',
        'fr': 'Observations générales',
        'en': 'General Observations'
      },
      'regarding': {
        'nl': 'Betreffende',
        'fr': 'Concernant',
        'en': 'Regarding'
      },
      'shared_patient': {
        'nl': '👤 Gedeeld met patiënt',
        'fr': '👤 Partagé avec le patient',
        'en': '👤 Shared with patient'
      },
      'shared_doctor': {
        'nl': '⚕ Gedeeld met arts',
        'fr': '⚕ Partagé avec le médecin',
        'en': '⚕ Shared with doctor'
      }
    };
    
    return translations[key]?.[lang] || translations[key]?.['en'] || '';
  }

  protected override getStyles(): any {
    return {
      letterHeader: {
        fontSize: 14,
        bold: true,
        color: '#333333',
        margin: [0, 0, 0, 0]
      },
      dateText: {
        fontSize: 10,
        color: '#666666',
        margin: [0, 0, 0, 0]
      },
      patientReference: {
        fontSize: 10,
        bold: true,
        color: '#333333',
        margin: [0, 0, 0, 0]
      },
      bodyText: {
        fontSize: 10,
        color: '#333333',
        lineHeight: 1.5
      },
      simpleHeading: {
        fontSize: 11,
        bold: true,
        color: '#333333',
        margin: [0, 0, 0, 0]
      },
      subsectionTitle: {
        fontSize: 10,
        bold: true,
        color: '#333333',
        margin: [0, 8, 0, 5]
      },
      listItem: {
        fontSize: 10,
        color: '#333333',
        lineHeight: 1.5,
        margin: [0, 2, 0, 2]
      },
      questionLabel: {
        fontSize: 10,
        color: '#666666',
        bold: false
      },
      answerValue: {
        fontSize: 10,
        color: '#333333',
        bold: false
      }
    };
  }

  private addPart1QuestionsToPharmacySummary(content: Content[], questionAnswers: QuestionAnswer[]) {
    content.push(this.createSimpleHeading(this.transloco.translate('pdf.part_1') || 'Part 1: Anamnesis'));
    content.push(this.createSpacer(6));

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

    content.push(this.createSimpleHeading(this.transloco.translate('pdf.part_2') || 'Part 2: Medication Adherence'));
    content.push(this.createSpacer(6));

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

    content.push(this.createSimpleHeading(this.transloco.translate('pdf.part_3') || 'Part 3: Effectiveness & Side Effects'));
    content.push(this.createSpacer(6));

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
