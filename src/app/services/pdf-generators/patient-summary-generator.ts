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

    // Simple letter-style header
    content.push(this.createLetterHeader());
    content.push(this.createSpacer(20));

    // Date
    content.push(this.createDate());
    content.push(this.createSpacer(20));

    // Patient Info - compact
    content.push(this.createCompactPatientInfo(patient, review));
    content.push(this.createSpacer(15));

    // Opening salutation
    content.push(this.createSalutation());
    content.push(this.createSpacer(10));

    // Introduction paragraph
    content.push(this.createIntroductionParagraph());
    content.push(this.createSpacer(12));

    // Get Part 1 action items and notes to discuss with patient
    const part1Actions = this.getPatientPart1Actions(questionAnswers);
    const patientNotes = notes.filter(note => note.discussWithPatient && note.text);
    
    const hasAnyContent = part1Actions.length > 0 || patientNotes.length > 0;
    
    if (hasAnyContent) {
      // Recommendations heading
      content.push(this.createRecommendationsHeading());
      content.push(this.createSpacer(8));
      
      // Collect all recommendations into a simple list
      const allRecommendations: Array<{ text: string, context?: string }> = [];
      
      // Add Part 1 actions
      part1Actions.forEach(action => {
        allRecommendations.push({
          text: action.value,
          context: action.label
        });
      });
      
      // Group review notes
      const groupedNotes = this.groupNotesByMedication(patientNotes, medications, questionAnswers);
      
      // Add general notes
      groupedNotes.general.forEach(note => {
        const commentKey = `note_comment_${note.rowKey}`;
        const commentAnswer = questionAnswers.find(qa => qa.questionName === commentKey);
        const text = commentAnswer?.value || note.text || '';
        if (text) {
          allRecommendations.push({ text });
        }
      });
      
      // Add medication-specific notes
      groupedNotes.byMedication.forEach(group => {
        group.notes.forEach(note => {
          const commentKey = `note_comment_${note.rowKey}`;
          const commentAnswer = questionAnswers.find(qa => qa.questionName === commentKey);
          const text = commentAnswer?.value || note.text || '';
          if (text) {
            allRecommendations.push({
              text,
              context: group.medicationName
            });
          }
        });
      });
      
      // Render recommendations as a simple bullet list
      content.push(this.createRecommendationsList(allRecommendations));
      content.push(this.createSpacer(12));
    } else {
      content.push(this.createNoRecommendationsParagraph());
      content.push(this.createSpacer(12));
    }

    // Closing paragraph
    content.push(this.createClosingParagraph());
    content.push(this.createSpacer(20));

    // Sign-off
    content.push(this.createSignOff());

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
      text: this.transloco.translate('pdf.patient_summary') || 'Patient Summary',
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

  private createSalutation(): Content {
    const lang = this.transloco.getActiveLang();
    let salutation = 'Beste patiënt,';
    if (lang === 'fr') salutation = 'Cher patient,';
    else if (lang === 'en') salutation = 'Dear Patient,';

    return {
      text: salutation,
      style: 'bodyText'
    };
  }

  private createIntroductionParagraph(): Content {
    const lang = this.transloco.getActiveLang();
    let text = '';
    
    if (lang === 'nl') {
      text = 'Hierbij ontvangt u een samenvatting van ons gesprek over uw medicatie. Dit document bevat belangrijke informatie en aanbevelingen om u te helpen het beste uit uw medicatie te halen.';
    } else if (lang === 'fr') {
      text = 'Voici un résumé de notre conversation sur vos médicaments. Ce document contient des informations importantes et des recommandations pour vous aider à tirer le meilleur parti de vos médicaments.';
    } else {
      text = 'This is a summary of our conversation about your medication. This document contains important information and recommendations to help you get the most out of your treatment.';
    }

    return {
      text,
      style: 'bodyText',
      alignment: 'justify'
    };
  }

  private createRecommendationsHeading(): Content {
    const lang = this.transloco.getActiveLang();
    let heading = 'Aanbevelingen:';
    if (lang === 'fr') heading = 'Recommandations :';
    else if (lang === 'en') heading = 'Recommendations:';

    return {
      text: heading,
      style: 'recommendationsHeading'
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

  private createRecommendationsList(recommendations: Array<{ text: string, context?: string }>): Content {
    // Group recommendations by context
    const grouped = new Map<string, string[]>();
    const noContext: string[] = [];

    recommendations.forEach(rec => {
      if (rec.context) {
        if (!grouped.has(rec.context)) {
          grouped.set(rec.context, []);
        }
        grouped.get(rec.context)!.push(rec.text);
      } else {
        noContext.push(rec.text);
      }
    });

    const items: any[] = [];

    // Add items without context
    noContext.forEach(text => {
      items.push({ text, style: 'listItem' });
    });

    // Add grouped items with nested ul
    grouped.forEach((texts, context) => {
      if (texts.length === 1) {
        // Single item: inline format
        items.push({
          text: `${context}: ${texts[0]}`,
          style: 'listItem'
        });
      } else {
        // Multiple items: nested list
        items.push({
          text: context,
          style: 'listItem',
          ul: texts.map(t => ({ text: t, style: 'listItem' }))
        });
      }
    });

    return {
      ul: items,
      margin: [20, 0, 0, 0]
    };
  }

  private createNoRecommendationsParagraph(): Content {
    const lang = this.transloco.getActiveLang();
    let text = '';
    
    if (lang === 'nl') {
      text = 'Er zijn geen specifieke aanbevelingen op dit moment.';
    } else if (lang === 'fr') {
      text = 'Il n\'y a pas de recommandations spécifiques pour le moment.';
    } else {
      text = 'There are no specific recommendations at this time.';
    }

    return {
      text,
      style: 'bodyText',
      alignment: 'justify'
    };
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

  private createClosingParagraph(): Content {
    const lang = this.transloco.getActiveLang();
    let text = '';
    
    if (lang === 'nl') {
      text = 'Heeft u vragen over deze informatie? Neem gerust contact met ons op. Wij staan altijd klaar om u te helpen.';
    } else if (lang === 'fr') {
      text = 'Avez-vous des questions sur ces informations ? N\'hésitez pas à nous contacter. Nous sommes toujours là pour vous aider.';
    } else {
      text = 'Do you have any questions about this information? Please feel free to contact us. We are always here to help.';
    }

    return {
      text,
      style: 'bodyText',
      alignment: 'justify'
    };
  }

  private createSignOff(): Content {
    const lang = this.transloco.getActiveLang();
    let signOff = 'Met vriendelijke groet,';
    if (lang === 'fr') signOff = 'Cordialement,';
    else if (lang === 'en') signOff = 'Kind regards,';

    return {
      text: signOff,
      style: 'bodyText'
    };
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
      recommendationsHeading: {
        fontSize: 10,
        bold: true,
        color: '#333333',
        margin: [0, 0, 0, 0]
      },
      listItem: {
        fontSize: 10,
        color: '#333333',
        lineHeight: 1.5,
        margin: [0, 2, 0, 2]
      }
    };
  }
}
