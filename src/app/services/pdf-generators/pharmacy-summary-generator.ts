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

    // Header with decorative line
    content.push(this.createHeader(this.transloco.translate('pdf.pharmacy_summary')));
    content.push(this.createDecorativeLine());
    content.push(this.createSpacer(12));

    // Patient Info
    content.push(this.createPatientInfoSection(patient, review));
    content.push(this.createSpacer(12));

    // Introduction
    content.push(this.createPharmacyIntroduction());
    content.push(this.createSpacer(15));

    // Medications with Schema
    if (medications.length > 0) {
      content.push(this.createSectionTitle(this.transloco.translate('pdf.current_medications')));
      content.push(this.createSpacer(6));
      content.push(this.createMedicationScheduleTable(medications));
      content.push(this.createSpacer(12));
    }

    // Contraindications Section
    if (contraindications.length > 0) {
      content.push(this.createSectionTitle(this.transloco.translate('tools.contraindications')));
      content.push(this.createSpacer(6));
      contraindications.forEach(ci => {
        content.push(this.createContraindicationCard(ci));
        content.push(this.createSpacer(4));
      });
      content.push(this.createSpacer(12));
    }

    // All Review Notes with Actions
    const allNotes = notes.filter(note => note.text);
    const part1Actions = this.getPharmacyPart1Actions(questionAnswers);
    
    if (allNotes.length > 0 || part1Actions.length > 0) {
      content.push(this.createSectionTitle(this.getPharmacyText('review_notes')));
      content.push(this.createSpacer(3));
      content.push(this.createSubtitle(this.getPharmacyText('comprehensive_notes')));
      content.push(this.createSpacer(8));
      
      // Part 1 Actions
      if (part1Actions.length > 0) {
        content.push(this.createSubsectionTitle(this.getPharmacyText('anamnesis_actions')));
        content.push(this.createSpacer(5));
        part1Actions.forEach((action: { label: string, value: string }) => {
          content.push(this.createPharmacyActionCard(action));
          content.push(this.createSpacer(6));
        });
        content.push(this.createSpacer(3));
      }
      
      // Group review notes by medication
      const groupedNotes = this.groupNotesByMedication(allNotes, medications, questionAnswers);
      
      // General notes
      if (groupedNotes.general.length > 0) {
        if (part1Actions.length === 0) {
          content.push(this.createSubsectionTitle(this.getPharmacyText('general_observations')));
          content.push(this.createSpacer(8));
        }
        groupedNotes.general.forEach(note => {
          content.push(this.createEnhancedPharmacyNoteCard(note, null, questionAnswers));
          content.push(this.createSpacer(6));
        });
        content.push(this.createSpacer(3));
      }
      
      // Medication-specific notes
      if (groupedNotes.byMedication.length > 0) {
        groupedNotes.byMedication.forEach(group => {
          content.push(this.createSubsectionTitle(`${this.getPharmacyText('regarding')} ${group.medicationName}`));
          content.push(this.createSpacer(5));
          group.notes.forEach(note => {
            content.push(this.createEnhancedPharmacyNoteCard(note, group.medicationName, questionAnswers));
            content.push(this.createSpacer(6));
          });
          content.push(this.createSpacer(3));
        });
      }
      
      content.push(this.createSpacer(6));
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
      pageMargins: [50, 70, 50, 70],
      defaultStyle: {
        font: 'Roboto'
      }
    };
  }

  private createDecorativeLine(): Content {
    return {
      canvas: [
        {
          type: 'line',
          x1: 0, y1: 0,
          x2: 515, y2: 0,
          lineWidth: 2,
          lineColor: this.brandAccent
        }
      ],
      margin: [0, 8, 0, 0]
    };
  }

  private createPharmacyIntroduction(): Content {
    const lang = this.transloco.getActiveLang();
    let introText = '';
    
    if (lang === 'nl') {
      introText = 'Dit document bevat een uitgebreide samenvatting van het uitgevoerde medicatiereview, inclusief alle klinische bevindingen, anamnesegegevens, therapietrouw en werkzaamheid van medicatie. Deze informatie dient ter ondersteuning van farmaceutische begeleiding en interdisciplinaire samenwerking.';
    } else if (lang === 'fr') {
      introText = 'Ce document contient un résumé complet de l\'examen de médication effectué, incluant toutes les observations cliniques, les données d\'anamnèse, l\'observance thérapeutique et l\'efficacité des médicaments. Ces informations servent à soutenir l\'accompagnement pharmaceutique et la collaboration interdisciplinaire.';
    } else {
      introText = 'This document contains a comprehensive summary of the medication review conducted, including all clinical findings, anamnesis data, therapy adherence, and medication effectiveness. This information serves to support pharmaceutical care and interdisciplinary collaboration.';
    }

    return {
      stack: [
        {
          text: introText,
          style: 'introduction',
          alignment: 'justify'
        }
      ],
      style: 'introCard'
    };
  }

  private createSubtitle(text: string): Content {
    return {
      text: text,
      style: 'subtitle',
      margin: [0, 0, 0, 15]
    };
  }

  private createSubsectionTitle(text: string): Content {
    return {
      text: text.toUpperCase(),
      style: 'subsectionTitle',
      margin: [0, 10, 0, 5]
    };
  }

  private createContraindicationCard(ci: Contraindication): Content {
    return {
      stack: [
        {
          columns: [
            {
              width: 24,
              text: '⚠',
              style: 'warningIcon',
              color: '#b45309'
            },
            {
              width: '*',
              text: ci.name || ci.contraindicationCode,
              style: 'contraindicationText'
            }
          ]
        }
      ],
      style: 'warningCard'
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

  private createPharmacyActionCard(action: { label: string, value: string }): Content {
    const stack: any[] = [];
    
    stack.push({
      columns: [
        {
          width: 24,
          text: '▸',
          style: 'pharmacyNoteIcon',
          color: this.brandSecondary
        },
        {
          width: '*',
          stack: [
            {
              text: action.label,
              style: 'pharmacyNoteTitle',
              margin: [0, 2, 0, 4]
            },
            {
              text: action.value,
              style: 'pharmacyNoteContent',
              margin: [0, 0, 0, 0]
            }
          ]
        }
      ]
    });
    
    return {
      table: {
        widths: ['*'],
        body: [[
          {
            stack,
            style: 'actionCard'
          }
        ]]
      },
      layout: {
        hLineWidth: () => 2,
        vLineWidth: () => 2,
        hLineColor: () => this.brandSecondary,
        vLineColor: () => this.brandSecondary,
        paddingLeft: () => 12,
        paddingRight: () => 12,
        paddingTop: () => 10,
        paddingBottom: () => 10
      },
      margin: [0, 0, 0, 8]
    } as Content;
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

  private createEnhancedPharmacyNoteCard(note: ReviewNote, medicationName: string | null, questionAnswers: QuestionAnswer[]): Content {
    const stack: any[] = [];
    
    if (note.category) {
      stack.push({
        text: this.formatCategory(note.category).toUpperCase(),
        style: 'pharmacyCategoryBadge',
        margin: [0, 0, 0, 8]
      });
    }
    
    // Add flags if note is shared
    const flags: string[] = [];
    if (note.discussWithPatient) flags.push(this.getPharmacyText('shared_patient'));
    if (note.communicateToDoctor) flags.push(this.getPharmacyText('shared_doctor'));
    
    if (flags.length > 0) {
      stack.push({
        text: flags.join(' • '),
        style: 'shareFlags',
        margin: [0, 0, 0, 8]
      });
    }
    
    if (note.text) {
      stack.push({
        columns: [
          {
            width: 24,
            text: '▸',
            style: 'pharmacyNoteIcon',
            color: this.brandSecondary
          },
          {
            width: '*',
            stack: [
              {
                text: note.text,
                style: 'pharmacyNoteTitle',
                margin: [0, 2, 0, 4]
              }
            ]
          }
        ]
      });
    }
    
    const commentKey = `note_comment_${note.rowKey}`;
    const commentAnswer = questionAnswers.find(qa => qa.questionName === commentKey);
    
    if (commentAnswer && commentAnswer.value) {
      stack.push({
        text: commentAnswer.value,
        style: 'pharmacyNoteContent',
        margin: [24, 4, 0, 0]
      });
    }
    
    return {
      table: {
        widths: ['*'],
        body: [[
          {
            stack,
            style: 'noteCard'
          }
        ]]
      },
      layout: {
        hLineWidth: () => 2,
        vLineWidth: () => 2,
        hLineColor: () => '#d1d5db',
        vLineColor: () => '#d1d5db',
        paddingLeft: () => 12,
        paddingRight: () => 12,
        paddingTop: () => 10,
        paddingBottom: () => 10
      },
      margin: [0, 0, 0, 8]
    } as Content;
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
    let footerText = '';
    
    if (lang === 'nl') {
      footerText = 'Deze samenvatting is bedoeld voor intern farmaceutisch gebruik en interdisciplinaire samenwerking. De informatie dient vertrouwelijk te worden behandeld conform de geldende privacywetgeving.';
    } else if (lang === 'fr') {
      footerText = 'Ce résumé est destiné à un usage pharmaceutique interne et à la collaboration interdisciplinaire. Les informations doivent être traitées de manière confidentielle conformément à la législation en vigueur sur la protection de la vie privée.';
    } else {
      footerText = 'This summary is intended for internal pharmaceutical use and interdisciplinary collaboration. The information must be treated confidentially in accordance with applicable privacy legislation.';
    }

    return {
      stack: [
        {
          canvas: [
            {
              type: 'line',
              x1: 0, y1: 0,
              x2: 515, y2: 0,
              lineWidth: 1,
              lineColor: this.borderColor
            }
          ],
          margin: [0, 0, 0, 12]
        },
        {
          text: footerText,
          style: 'footer',
          alignment: 'left'
        }
      ]
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
    const baseStyles = super.getStyles();
    return {
      ...baseStyles,
      introCard: {
        fillColor: '#f0f9ff', // Clinical light teal
        margin: [0, 0, 0, 0],
        padding: [16, 12, 16, 12],
        border: [0, 0, 0, 4],
        borderColor: this.brandSecondary
      },
      introduction: {
        fontSize: 11,
        color: this.textPrimary,
        lineHeight: 1.6
      },
      subtitle: {
        fontSize: 12,
        color: this.textSecondary,
        italics: true,
        margin: [0, 0, 0, 0]
      },
      pharmacyCategoryBadge: {
        fontSize: 8,
        bold: true,
        color: '#fff',
        background: this.brandSecondary,
        fillColor: this.brandSecondary,
        padding: [6, 2, 6, 2],
        borderRadius: 2,
        alignment: 'left'
      },
      shareFlags: {
        fontSize: 9,
        color: this.brandAccent,
        bold: true,
        margin: [0, 0, 0, 4]
      },
      pharmacyNoteIcon: {
        fontSize: 14,
        bold: true
      },
      pharmacyNoteTitle: {
        fontSize: 11,
        bold: true,
        color: this.textPrimary,
        lineHeight: 1.4
      },
      pharmacyNoteContent: {
        fontSize: 11,
        color: this.textPrimary,
        lineHeight: 1.5
      },
      warningIcon: {
        fontSize: 14,
        bold: true
      },
      contraindicationText: {
        fontSize: 11,
        color: '#92400e',
        bold: true,
        lineHeight: 1.4
      },
      warningCard: {
        fillColor: '#fef3c7',
        margin: [0, 0, 0, 8],
        padding: [14, 10, 14, 10],
        border: [0, 0, 0, 4],
        borderColor: '#f59e0b'
      },
      actionCard: {
        fillColor: '#f8fafc',
        margin: [0, 0, 0, 8]
      },
      footer: {
        fontSize: 10,
        color: this.textSecondary,
        italics: true,
        lineHeight: 1.4
      }
    };
  }

  private addPart1QuestionsToPharmacySummary(content: Content[], questionAnswers: QuestionAnswer[]) {
    content.push(this.createSectionTitle(this.transloco.translate('pdf.part_1')));
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

    content.push(this.createSectionTitle(this.transloco.translate('pdf.part_2')));
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

    content.push(this.createSectionTitle(this.transloco.translate('pdf.part_3')));
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
