import { TranslocoService } from '@jsverse/transloco';
import { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { BasePdfGenerator } from './base-pdf-generator';
import { ReviewNote } from '../review-notes.service';
import { Patient, MedicationReview, Medication, QuestionAnswer } from '../../models/api.models';

export class DoctorSummaryGenerator extends BasePdfGenerator {
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

    // Filter notes for doctor (only notes marked to communicate to doctor)
    const doctorNotes = notes.filter(note => note.communicateToDoctor && note.text);

    // 3. Medication sections with notes
    const { medicationsWithNotes, generalNotes } = this.groupNotesByMedication(doctorNotes, medications);

    if (medicationsWithNotes.length > 0 || generalNotes.length > 0) {
      // Section header for medications
      content.push(this.createSectionHeader(this.getObservationsTitle()));

      // Create a card for each medication with notes
      medicationsWithNotes.forEach(medWithNotes => {
        content.push(this.createMedicationCard(
          medWithNotes,
          questionAnswers,
          true,  // Show patient comments (observations from patient)
          true   // Show pharmacist actions (suggestions for doctor)
        ));
      });

      // 4. General notes (not linked to specific medication)
      if (generalNotes.length > 0) {
        content.push(this.createGeneralNotesSection(
          generalNotes,
          questionAnswers,
          true,
          true
        ));
      }
    } else {
      // No notes to display
      content.push(this.createEmptyState(this.getNoNotesMessage()));
    }

    // 5. Closing
    content.push(this.createClosing(
      this.getClosingText(),
      this.getSignOff()
    ));

    return {
      content,
      ...this.getDefaultDocumentSettings()
    };
  }

  // Override labels for doctor context
  protected override getPatientCommentLabel(): string {
    const lang = this.getLang();
    if (lang === 'nl') return 'Observatie patiënt';
    if (lang === 'fr') return 'Observation du patient';
    return 'Patient Observation';
  }

  protected override getPharmacistActionLabel(): string {
    const lang = this.getLang();
    if (lang === 'nl') return 'Suggestie';
    if (lang === 'fr') return 'Suggestion';
    return 'Suggestion';
  }

  private getObservationsTitle(): string {
    const lang = this.getLang();
    if (lang === 'nl') return 'Bevindingen en suggesties';
    if (lang === 'fr') return 'Observations et suggestions';
    return 'Findings and Suggestions';
  }

  // Localized text getters
  private getTitle(): string {
    return this.transloco.translate('pdf.doctor_summary');
  }

  private getSubtitle(): string {
    const lang = this.getLang();
    if (lang === 'nl') return 'Rapport medicatienazicht';
    if (lang === 'fr') return 'Rapport d\'examen de médication';
    return 'Medication Review Report';
  }

  private getSalutation(): string {
    const lang = this.getLang();
    if (lang === 'nl') return 'Geachte collega,';
    if (lang === 'fr') return 'Cher confrère, chère consœur,';
    return 'Dear Colleague,';
  }

  private getIntroText(): string {
    const lang = this.getLang();
    if (lang === 'nl') {
      return 'In het kader van een medicatienazicht voor onze gemeenschappelijke patiënt, wil ik u graag informeren over enkele bevindingen en suggesties met betrekking tot de huidige medicatie.';
    }
    if (lang === 'fr') {
      return 'Dans le cadre d\'un examen de médication pour notre patient commun, je souhaite vous informer de quelques observations et suggestions concernant le traitement actuel.';
    }
    return 'As part of a medication review for our mutual patient, I would like to inform you of some findings and suggestions regarding the current medication.';
  }

  private getClosingText(): string {
    const lang = this.getLang();
    if (lang === 'nl') {
      return 'Ik hoop dat deze informatie nuttig is voor de verdere behandeling van de patiënt. Mocht u vragen hebben of wenst u aanvullende informatie, dan sta ik uiteraard tot uw beschikking.';
    }
    if (lang === 'fr') {
      return 'J\'espère que ces informations seront utiles pour la suite du traitement du patient. Si vous avez des questions ou souhaitez des informations complémentaires, je reste bien entendu à votre disposition.';
    }
    return 'I hope this information is useful for the continued care of the patient. Should you have any questions or require additional information, I am of course at your disposal.';
  }

  private getSignOff(): string {
    const lang = this.getLang();
    if (lang === 'nl') return 'Met collegiale groet,\n\nDe apotheker';
    if (lang === 'fr') return 'Confraternellement,\n\nLe pharmacien';
    return 'With kind regards,\n\nThe pharmacist';
  }
}
