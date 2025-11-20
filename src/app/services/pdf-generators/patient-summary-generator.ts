import { TranslocoService } from '@jsverse/transloco';
import { TDocumentDefinitions, Content } from 'pdfmake/interfaces';
import { ReviewNote } from '../review-notes.service';
import { Patient, MedicationReview, Medication } from '../../models/api.models';
import { BasePdfGenerator } from './base-pdf-generator';

export class PatientSummaryGenerator extends BasePdfGenerator {
  constructor(transloco: TranslocoService) {
    super(transloco);
  }

  generate(
    patient: Patient | null,
    review: MedicationReview | null,
    medications: Medication[],
    notes: ReviewNote[],
    questionAnswers: any[]
  ): TDocumentDefinitions {
    const content: Content[] = [];

    // Header with decorative line
    content.push(this.createHeader(this.transloco.translate('pdf.patient_summary')));
    content.push(this.createDecorativeLine());
    content.push(this.createSpacer(12));

    // Patient Info Section
    content.push(this.createPatientInfoSection(patient, review));
    content.push(this.createSpacer(12));

    // Warm Introduction
    content.push(this.createIntroduction());
    content.push(this.createSpacer(18));

    // Get Part 1 action items and notes to discuss with patient
    const part1Actions = this.getPatientPart1Actions(questionAnswers);
    const patientNotes = notes.filter(note => note.discussWithPatient && note.text);
    
    const hasAnyContent = part1Actions.length > 0 || patientNotes.length > 0;
    
    if (hasAnyContent) {
      content.push(this.createSectionTitle(this.transloco.translate('pdf.pharmacist_notes')));
      content.push(this.createSpacer(3));
      content.push(this.createSubtitle(this.getIntroText('notes_intro')));
      content.push(this.createSpacer(8));
      
      // Part 1 Actions first (general health and medication management)
      if (part1Actions.length > 0) {
        content.push(this.createSubsectionTitle(this.getIntroText('general_recommendations')));
        content.push(this.createSpacer(5));
        part1Actions.forEach(action => {
          content.push(this.createPart1ActionCard(action));
          content.push(this.createSpacer(6));
        });
        content.push(this.createSpacer(3));
      }
      
      // Group review notes by medication
      const groupedNotes = this.groupNotesByMedication(patientNotes, medications, questionAnswers);
      
      // General notes
      if (groupedNotes.general.length > 0) {
        if (part1Actions.length === 0) {
          content.push(this.createSubsectionTitle(this.getIntroText('general_recommendations')));
          content.push(this.createSpacer(8));
        }
        groupedNotes.general.forEach(note => {
          content.push(this.createEnhancedNoteCard(note, null, questionAnswers));
          content.push(this.createSpacer(6));
        });
        content.push(this.createSpacer(3));
      }
      
      // Medication-specific notes
      if (groupedNotes.byMedication.length > 0) {
        groupedNotes.byMedication.forEach(group => {
          content.push(this.createSubsectionTitle(`${this.getIntroText('regarding')} ${group.medicationName}`));
          content.push(this.createSpacer(5));
          group.notes.forEach(note => {
            content.push(this.createEnhancedNoteCard(note, group.medicationName, questionAnswers));
            content.push(this.createSpacer(6));
          });
          content.push(this.createSpacer(3));
        });
      }
    } else {
      content.push(this.createSectionTitle(this.transloco.translate('pdf.pharmacist_notes')));
      content.push(this.createSpacer(6));
      content.push({
        text: this.transloco.translate('pdf.no_notes') || 'No specific notes to discuss at this time.',
        style: 'emptyState'
      });
    }

    // Footer with contact encouragement
    content.push(this.createSpacer(15));
    content.push(this.createFooter());

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

  private createIntroduction(): Content {
    const lang = this.transloco.getActiveLang();
    let introText = '';
    
    if (lang === 'nl') {
      introText = 'Beste patiënt,\n\nHierbij ontvangt u een samenvatting van ons gesprek over uw medicatie. Dit document bevat belangrijke informatie en aanbevelingen om u te helpen het beste uit uw medicatie te halen. Neem de tijd om deze informatie door te nemen en aarzel niet om contact met ons op te nemen als u vragen heeft.';
    } else if (lang === 'fr') {
      introText = 'Cher patient,\n\nVoici un résumé de notre conversation sur vos médicaments. Ce document contient des informations importantes et des recommandations pour vous aider à tirer le meilleur parti de vos médicaments. Prenez le temps de lire ces informations et n\'hésitez pas à nous contacter si vous avez des questions.';
    } else {
      introText = 'Dear Patient,\n\nThis is a summary of our conversation about your medication. This document contains important information and recommendations to help you get the most out of your treatment. Please take the time to review this information, and don\'t hesitate to contact us if you have any questions.';
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

  private getPatientPart1Actions(questionAnswers: any[]): Array<{ label: string, value: string }> {
    const actions: Array<{ label: string, value: string }> = [];
    
    // Define all Part 1 action fields with their user-friendly labels
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
      if (answer && answer.value && answer.value.trim() && answer.shareWithPatient) {
        actions.push({
          label: field.label || field.key,
          value: answer.value
        });
      }
    });
    
    return actions;
  }

  private createPart1ActionCard(action: { label: string, value: string }): Content {
    const stack: any[] = [];
    
    // Add the label/topic
    stack.push({
      columns: [
        {
          width: 24,
          text: '✓',
          style: 'checkIcon',
          alignment: 'center'
        },
        {
          width: '*',
          stack: [
            {
              text: action.label,
              style: 'noteTitle',
              margin: [0, 2, 0, 4]
            },
            {
              text: action.value,
              style: 'noteActionContent',
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
        hLineColor: () => this.brandAccent,
        vLineColor: () => this.brandAccent,
        paddingLeft: () => 12,
        paddingRight: () => 12,
        paddingTop: () => 10,
        paddingBottom: () => 10
      },
      margin: [0, 0, 0, 8]
    } as Content;
  }

  private groupNotesByMedication(notes: ReviewNote[], medications: Medication[], questionAnswers: any[]): {
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

  private createEnhancedNoteCard(note: ReviewNote, medicationName: string | null, questionAnswers: any[]): Content {
    const stack: any[] = [];
    
    // Add category badge if available
    if (note.category) {
      stack.push({
        text: this.formatCategory(note.category).toUpperCase(),
        style: 'noteCategoryBadge',
        margin: [0, 0, 0, 8]
      });
    }
    
    // Add the note title if available
    if (note.text) {
      stack.push({
        columns: [
          {
            width: 24,
            text: '●',
            style: 'noteIcon',
            color: this.brandAccent
          },
          {
            width: '*',
            stack: [
              {
                text: note.text,
                style: 'noteTitle',
                margin: [0, 2, 0, 4]
              }
            ]
          }
        ]
      });
    }
    
    // Find and add the pharmacist action/comment for this note
    const commentKey = `note_comment_${note.rowKey}`;
    const commentAnswer = questionAnswers.find(qa => qa.questionName === commentKey);
    
    if (commentAnswer && commentAnswer.value) {
      stack.push({
        text: commentAnswer.value,
        style: 'noteActionContent',
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

  private createFooter(): Content {
    const lang = this.transloco.getActiveLang();
    let footerText = '';
    
    if (lang === 'nl') {
      footerText = 'Heeft u vragen of opmerkingen over deze informatie? Neem gerust contact met ons op. Wij staan altijd klaar om u te helpen!';
    } else if (lang === 'fr') {
      footerText = 'Avez-vous des questions ou des commentaires sur ces informations ? N\'hésitez pas à nous contacter. Nous sommes toujours là pour vous aider !';
    } else {
      footerText = 'Do you have any questions or comments about this information? Please feel free to contact us. We are always here to help!';
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
          alignment: 'center'
        }
      ]
    };
  }

  private getIntroText(key: string): string {
    const lang = this.transloco.getActiveLang();
    
    const translations: Record<string, Record<string, string>> = {
      'notes_intro': {
        'nl': 'Hieronder vindt u de belangrijkste punten die we tijdens ons gesprek hebben besproken:',
        'fr': 'Vous trouverez ci-dessous les points principaux que nous avons discutés lors de notre entretien :',
        'en': 'Below you will find the key points we discussed during our conversation:'
      },
      'general_recommendations': {
        'nl': 'Algemene aanbevelingen',
        'fr': 'Recommandations générales',
        'en': 'General Recommendations'
      },
      'regarding': {
        'nl': 'Betreffende',
        'fr': 'Concernant',
        'en': 'Regarding'
      }
    };
    
    return translations[key]?.[lang] || translations[key]?.['en'] || '';
  }

  protected override getStyles(): any {
    const baseStyles = super.getStyles();
    return {
      ...baseStyles,
      introCard: {
        fillColor: '#f0fdf4', // Clinical light green
        margin: [0, 0, 0, 0],
        padding: [16, 12, 16, 12],
        border: [0, 0, 0, 4],
        borderColor: this.brandAccent
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
      noteCategoryBadge: {
        fontSize: 8,
        bold: true,
        color: '#fff',
        background: this.brandAccent,
        padding: [6, 2, 6, 2],
        borderRadius: 2
      },
      noteIcon: {
        fontSize: 14,
        bold: true
      },
      checkIcon: {
        fontSize: 16,
        bold: true,
        color: this.brandAccent
      },
      noteTitle: {
        fontSize: 11,
        bold: true,
        color: this.textPrimary,
        lineHeight: 1.4
      },
      noteActionContent: {
        fontSize: 11,
        color: this.textPrimary,
        lineHeight: 1.5,
        italics: false
      },
      actionCard: {
        fillColor: '#f0fdf4',
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
}
