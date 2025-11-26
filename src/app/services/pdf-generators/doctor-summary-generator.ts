import { TranslocoService } from '@jsverse/transloco';
import { TDocumentDefinitions, Content } from 'pdfmake/interfaces';
import { ReviewNote } from '../review-notes.service';
import { Patient, MedicationReview, Medication } from '../../models/api.models';
import { BasePdfGenerator } from './base-pdf-generator';

export class DoctorSummaryGenerator extends BasePdfGenerator {
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

    // Get Part 1 action items and notes for doctor
    const part1Actions = this.getDoctorPart1Actions(questionAnswers);
    const doctorNotes = notes.filter(note => note.communicateToDoctor && note.text);
    
    const hasAnyContent = part1Actions.length > 0 || doctorNotes.length > 0;
    
    if (hasAnyContent) {
      // Observations heading
      content.push(this.createObservationsHeading());
      content.push(this.createSpacer(8));
      
      // Collect all observations into a simple list
      const allObservations: Array<{ text: string, context?: string }> = [];
      
      // Add Part 1 actions
      part1Actions.forEach((action: { label: string, value: string }) => {
        allObservations.push({
          text: action.value,
          context: action.label
        });
      });
      
      // Group review notes
      const groupedNotes = this.groupNotesByMedication(doctorNotes, medications, questionAnswers);
      
      // Add general notes
      groupedNotes.general.forEach(note => {
        const commentKey = `note_comment_${note.rowKey}`;
        const commentAnswer = questionAnswers.find(qa => qa.questionName === commentKey);
        const text = commentAnswer?.value || note.text || '';
        if (text) {
          allObservations.push({ text });
        }
      });
      
      // Add medication-specific notes
      groupedNotes.byMedication.forEach(group => {
        group.notes.forEach(note => {
          const commentKey = `note_comment_${note.rowKey}`;
          const commentAnswer = questionAnswers.find(qa => qa.questionName === commentKey);
          const text = commentAnswer?.value || note.text || '';
          if (text) {
            allObservations.push({
              text,
              context: group.medicationName
            });
          }
        });
      });
      
      // Render observations as a simple bullet list
      content.push(this.createObservationsList(allObservations));
      content.push(this.createSpacer(12));
    } else {
      content.push(this.createNoObservationsParagraph());
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
      text: this.transloco.translate('pdf.doctor_summary') || 'Doctor Summary',
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
    // Anonymous patient reference for MVP
    let patientRef = 'Betreft: Patiënt';
    if (lang === 'fr') patientRef = 'Concernant : Patient(e)';
    else if (lang === 'en') patientRef = 'Regarding: Patient';

    return {
      text: patientRef,
      style: 'patientReference'
    };
  }

  private createSalutation(): Content {
    const lang = this.transloco.getActiveLang();
    let salutation = 'Geachte collega,';
    if (lang === 'fr') salutation = 'Cher confrère, chère consœur,';
    else if (lang === 'en') salutation = 'Dear Colleague,';

    return {
      text: salutation,
      style: 'bodyText'
    };
  }

  private createIntroductionParagraph(): Content {
    const lang = this.transloco.getActiveLang();
    let text = '';
    
    if (lang === 'nl') {
      text = 'Ik heb recent een medicatienazicht uitgevoerd met bovengenoemde patiënt. Ik zou graag enkele observaties met u willen delen die mogelijk relevant kunnen zijn voor de verdere behandeling. Ik presenteer deze punten louter ter overweging en sta natuurlijk open voor uw professioneel oordeel.';
    } else if (lang === 'fr') {
      text = 'J\'ai récemment effectué un examen de médication avec le patient susmentionné. Je souhaiterais partager avec vous quelques observations qui pourraient être pertinentes pour la poursuite du traitement. Je présente ces points uniquement à titre de considération et je reste bien entendu ouvert à votre jugement professionnel.';
    } else {
      text = 'I recently conducted a medication review with the above-mentioned patient. I would like to share some observations that may be relevant for continued treatment. I present these points merely for consideration and remain open to your professional judgment.';
    }

    return {
      text,
      style: 'bodyText',
      alignment: 'justify'
    };
  }

  private createObservationsHeading(): Content {
    const lang = this.transloco.getActiveLang();
    let heading = 'Observaties en suggesties:';
    if (lang === 'fr') heading = 'Observations et suggestions :';
    else if (lang === 'en') heading = 'Observations and suggestions:';

    return {
      text: heading,
      style: 'observationsHeading'
    };
  }

  private createObservationsList(observations: Array<{ text: string, context?: string }>): Content {
    // Group observations by context
    const grouped = new Map<string, string[]>();
    const noContext: string[] = [];

    observations.forEach(obs => {
      if (obs.context) {
        if (!grouped.has(obs.context)) {
          grouped.set(obs.context, []);
        }
        grouped.get(obs.context)!.push(obs.text);
      } else {
        noContext.push(obs.text);
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

  private createNoObservationsParagraph(): Content {
    const lang = this.transloco.getActiveLang();
    let text = '';
    
    if (lang === 'nl') {
      text = 'Het medicatienazicht heeft geen specifieke aandachtspunten opgeleverd die verdere opvolging vereisen.';
    } else if (lang === 'fr') {
      text = 'L\'examen de médication n\'a révélé aucun point d\'attention spécifique nécessitant un suivi supplémentaire.';
    } else {
      text = 'The medication review did not identify any specific points requiring further follow-up.';
    }

    return {
      text,
      style: 'bodyText',
      alignment: 'justify'
    };
  }

  private createClosingParagraph(): Content {
    const lang = this.transloco.getActiveLang();
    let text = '';
    
    if (lang === 'nl') {
      text = 'Indien u vragen heeft of deze punten verder wenst te bespreken, aarzel dan niet om contact met mij op te nemen. Ik waardeer uw expertise en sta graag tot uw beschikking.';
    } else if (lang === 'fr') {
      text = 'Si vous avez des questions ou souhaitez discuter de ces points plus en détail, n\'hésitez pas à me contacter. J\'apprécie votre expertise et reste à votre disposition.';
    } else {
      text = 'Should you have any questions or wish to discuss these points further, please do not hesitate to contact me. I value your expertise and remain at your disposal.';
    }

    return {
      text,
      style: 'bodyText',
      alignment: 'justify'
    };
  }

  private createSignOff(): Content {
    const lang = this.transloco.getActiveLang();
    let signOff = 'Met collegiale groet,';
    if (lang === 'fr') signOff = 'Cordialement,';
    else if (lang === 'en') signOff = 'With kind regards,';

    return {
      text: signOff,
      style: 'bodyText'
    };
  }

  private getDoctorPart1Actions(questionAnswers: any[]): Array<{ label: string, value: string }> {
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
      if (answer && answer.value && answer.value.trim() && answer.shareWithDoctor) {
        actions.push({
          label: field.label || field.key,
          value: answer.value
        });
      }
    });
    
    return actions;
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
      observationsHeading: {
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
