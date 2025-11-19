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
    notes: ReviewNote[]
  ): TDocumentDefinitions {
    const content: Content[] = [];

    // Header
    content.push(this.createHeader(this.transloco.translate('pdf.patient_summary')));
    content.push(this.createSpacer(20));

    // Patient Info
    content.push(this.createPatientInfoSection(patient, review));
    content.push(this.createSpacer(15));

    // Notes to Discuss with Patient
    const patientNotes = notes.filter(note => note.discussWithPatient && note.text);
    if (patientNotes.length > 0) {
      content.push(this.createSectionTitle(this.transloco.translate('pdf.pharmacist_notes')));
      content.push(this.createSpacer(10));
      
      patientNotes.forEach(note => {
        const noteContent = this.createNoteCard(note, medications);
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
}
