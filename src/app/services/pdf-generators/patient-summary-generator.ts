import { TranslocoService } from '@jsverse/transloco';
import { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { BasePdfGenerator, MedicationWithNotes } from './base-pdf-generator';
import { ReviewNote } from '../review-notes.service';
import { Patient, MedicationReview, Medication, QuestionAnswer } from '../../models/api.models';

interface ActionItem {
  label: string;
  value: string;
}

export class PatientSummaryGenerator extends BasePdfGenerator {
  constructor(transloco: TranslocoService) {
    super(transloco);
  }

  generate(
    patient: Patient | null,
    review: MedicationReview | null,
    medications: Medication[],
    notes: ReviewNote[],
    questionAnswers: QuestionAnswer[]
  ): TDocumentDefinitions {
    const content: Content[] = [];

    // 1. Header
    content.push(this.createDocumentHeader(
      this.getTitle(),
      this.getSubtitle()
    ));

    // 2. Introduction
    content.push(this.createIntroduction(
      this.getSalutation(),
      this.getIntroText()
    ));

    // Get action items from questionnaire (Part 1 actions)
    const actionItems = this.getPatientActionItems(questionAnswers);

    // Filter notes for patient (only notes marked to discuss with patient)
    const patientNotes = notes.filter(note => note.discussWithPatient && note.text);

    // 3. Medication sections with notes
    const { medicationsWithNotes, generalNotes } = this.groupNotesByMedication(patientNotes, medications);

    const hasContent = medicationsWithNotes.length > 0 || generalNotes.length > 0 || actionItems.length > 0;

    if (hasContent) {
      // Section header
      content.push(this.createSectionHeader(this.getRecommendationsTitle()));

      // First, add questionnaire action items as general recommendations
      if (actionItems.length > 0) {
        content.push(this.createActionItemsCard(actionItems));
      }

      // Create a card for each medication with notes (without dosage)
      medicationsWithNotes.forEach(medWithNotes => {
        content.push(this.createPatientMedicationCard(medWithNotes, questionAnswers));
      });

      // General notes (not linked to specific medication)
      if (generalNotes.length > 0) {
        generalNotes.forEach(note => {
          content.push(this.createPatientNoteCard(note, questionAnswers));
        });
      }
    } else {
      // No notes to display
      content.push(this.createEmptyState(this.getNoNotesMessage()));
    }

    // 4. Closing
    content.push(this.createClosing(
      this.getClosingText(),
      this.getSignOff()
    ));

    return {
      content,
      ...this.getDefaultDocumentSettings()
    };
  }

  /**
   * Gets action items from questionnaire answers (Part 1 actions for patient)
   */
  private getPatientActionItems(questionAnswers: QuestionAnswer[]): ActionItem[] {
    const actions: ActionItem[] = [];
    
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
      if (answer?.value && answer.value.trim()) {
        actions.push({
          label: field.label,
          value: answer.value.trim()
        });
      }
    });
    
    return actions;
  }

  /**
   * Creates a card for action items from questionnaire
   */
  private createActionItemsCard(actionItems: ActionItem[]): Content {
    const stack: any[] = [];

    actionItems.forEach((item, index) => {
      if (index > 0) {
        // Add separator between items
        stack.push({
          canvas: [
            {
              type: 'line',
              x1: 0, y1: 0,
              x2: 463, y2: 0,
              lineWidth: 1,
              lineColor: this.colors.border,
              dash: { length: 3, space: 3 }
            }
          ],
          margin: [0, 8, 0, 12] as [number, number, number, number]
        });
      }

      // Label (the question context)
      stack.push({
        text: item.label,
        style: 'actionLabel',
        margin: [0, 0, 0, 6] as [number, number, number, number]
      });

      // Recommendation box
      stack.push(this.createCommentBox(
        this.getPharmacistActionLabel(),
        item.value,
        this.colors.accent
      ));
    });

    return {
      table: {
        widths: ['*'],
        body: [[
          {
            stack,
            margin: [16, 16, 16, 16] as [number, number, number, number]
          }
        ]]
      },
      layout: {
        hLineWidth: () => 1,
        vLineWidth: () => 1,
        hLineColor: () => this.colors.border,
        vLineColor: () => this.colors.border,
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0
      },
      margin: [0, 0, 0, 16] as [number, number, number, number]
    };
  }

  /**
   * Creates a medication card for patient (no dosage, simplified)
   */
  private createPatientMedicationCard(
    medicationWithNotes: MedicationWithNotes,
    questionAnswers: QuestionAnswer[]
  ): Content {
    const { medication, notes } = medicationWithNotes;
    const stack: any[] = [];

    // Medication header with accent bar (no dosage)
    stack.push({
      columns: [
        {
          canvas: [
            {
              type: 'rect',
              x: 0, y: 0,
              w: 4, h: 24,
              color: this.colors.primary
            }
          ],
          width: 8
        },
        {
          stack: [
            {
              text: medication.name || this.transloco.translate('pdf.no_medication'),
              style: 'medicationName'
            },
            medication.indication ? {
              text: medication.indication,
              style: 'medicationIndication',
              margin: [0, 2, 0, 0] as [number, number, number, number]
            } : { text: '' }
          ],
          width: '*',
          margin: [8, 0, 0, 0] as [number, number, number, number]
        }
      ],
      margin: [0, 0, 0, 12] as [number, number, number, number]
    });

    // Notes for this medication (no category badge, includes pharmacist action)
    notes.forEach((note, index) => {
      stack.push(this.createPatientNoteItem(note, questionAnswers, index > 0));
    });

    return {
      table: {
        widths: ['*'],
        body: [[
          {
            stack,
            margin: [16, 16, 16, 16] as [number, number, number, number]
          }
        ]]
      },
      layout: {
        hLineWidth: () => 1,
        vLineWidth: () => 1,
        hLineColor: () => this.colors.border,
        vLineColor: () => this.colors.border,
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0
      },
      margin: [0, 0, 0, 16] as [number, number, number, number]
    };
  }

  /**
   * Creates a note item for patient (no category badge, shows pharmacist action)
   */
  private createPatientNoteItem(
    note: ReviewNote,
    questionAnswers: QuestionAnswer[],
    addTopBorder: boolean = false
  ): Content {
    const stack: any[] = [];

    // Add separator if not first note
    if (addTopBorder) {
      stack.push({
        canvas: [
          {
            type: 'line',
            x1: 0, y1: 0,
            x2: 463, y2: 0,
            lineWidth: 1,
            lineColor: this.colors.border,
            dash: { length: 3, space: 3 }
          }
        ],
        margin: [0, 8, 0, 12] as [number, number, number, number]
      });
    }

    // Note text (the observation/finding) - skip category badge for patient
    if (note.text) {
      stack.push({
        text: note.text,
        style: 'noteText',
        margin: [0, 0, 0, 10] as [number, number, number, number]
      });
    }

    // Look for pharmacist action/comment in question answers for this note
    const commentKey = `note_comment_${note.rowKey}`;
    const commentAnswer = questionAnswers.find(qa => qa.questionName === commentKey);
    if (commentAnswer?.value && commentAnswer.value.trim()) {
      stack.push(this.createCommentBox(
        this.getPharmacistActionLabel(),
        commentAnswer.value.trim(),
        this.colors.accent
      ));
    }

    return { stack };
  }

  /**
   * Creates a standalone note card for patient (general notes)
   */
  private createPatientNoteCard(
    note: ReviewNote,
    questionAnswers: QuestionAnswer[]
  ): Content {
    const stack: any[] = [];

    // Note text (no category badge for patient)
    if (note.text) {
      stack.push({
        text: note.text,
        style: 'noteText',
        margin: [0, 0, 0, 10] as [number, number, number, number]
      });
    }

    // Look for pharmacist action/comment
    const commentKey = `note_comment_${note.rowKey}`;
    const commentAnswer = questionAnswers.find(qa => qa.questionName === commentKey);
    if (commentAnswer?.value && commentAnswer.value.trim()) {
      stack.push(this.createCommentBox(
        this.getPharmacistActionLabel(),
        commentAnswer.value.trim(),
        this.colors.accent
      ));
    }

    return {
      table: {
        widths: ['*'],
        body: [[
          {
            stack,
            margin: [16, 16, 16, 16] as [number, number, number, number]
          }
        ]]
      },
      layout: {
        hLineWidth: () => 1,
        vLineWidth: () => 1,
        hLineColor: () => this.colors.border,
        vLineColor: () => this.colors.border,
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0
      },
      margin: [0, 0, 0, 12] as [number, number, number, number]
    };
  }

  // Override to customize action label for patient
  protected override getPharmacistActionLabel(): string {
    const lang = this.getLang();
    if (lang === 'nl') return 'Aanbeveling';
    if (lang === 'fr') return 'Recommandation';
    return 'Recommendation';
  }

  // Localized text getters
  private getTitle(): string {
    return this.transloco.translate('pdf.patient_summary');
  }

  private getSubtitle(): string {
    const lang = this.getLang();
    if (lang === 'nl') return 'Samenvatting medicatienazicht';
    if (lang === 'fr') return 'Résumé de l\'examen de médication';
    return 'Medication Review Summary';
  }

  private getSalutation(): string {
    const lang = this.getLang();
    if (lang === 'nl') return 'Beste patiënt,';
    if (lang === 'fr') return 'Cher patient,';
    return 'Dear Patient,';
  }

  private getIntroText(): string {
    const lang = this.getLang();
    if (lang === 'nl') {
      return 'Naar aanleiding van uw recente medicatienazicht in onze apotheek, vindt u hieronder een overzicht van de besproken punten en aanbevelingen met betrekking tot uw medicatie.';
    }
    if (lang === 'fr') {
      return 'Suite à votre récent examen de médication dans notre pharmacie, vous trouverez ci-dessous un aperçu des points discutés et des recommandations concernant vos médicaments.';
    }
    return 'Following your recent medication review at our pharmacy, please find below an overview of the discussed points and recommendations regarding your medication.';
  }

  private getClosingText(): string {
    const lang = this.getLang();
    if (lang === 'nl') {
      return 'Indien u vragen heeft over deze aanbevelingen of uw medicatie in het algemeen, aarzel dan niet om contact met ons op te nemen. Wij staan altijd klaar om u te helpen.';
    }
    if (lang === 'fr') {
      return 'Si vous avez des questions concernant ces recommandations ou vos médicaments en général, n\'hésitez pas à nous contacter. Nous sommes toujours disponibles pour vous aider.';
    }
    return 'If you have any questions about these recommendations or your medication in general, please do not hesitate to contact us. We are always available to help you.';
  }

  private getSignOff(): string {
    const lang = this.getLang();
    if (lang === 'nl') return 'Met vriendelijke groet,\n\nUw apotheker';
    if (lang === 'fr') return 'Cordialement,\n\nVotre pharmacien';
    return 'Kind regards,\n\nYour pharmacist';
  }

  private getRecommendationsTitle(): string {
    const lang = this.getLang();
    if (lang === 'nl') return 'Aanbevelingen';
    if (lang === 'fr') return 'Recommandations';
    return 'Recommendations';
  }

  protected override getStyles(): Record<string, any> {
    return {
      ...super.getStyles(),
      actionLabel: {
        fontSize: 10,
        color: this.colors.textMedium,
        italics: true
      }
    };
  }
}
