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
    notes: ReviewNote[]
  ): TDocumentDefinitions {
    const content: Content[] = [];

    // Header
    content.push(this.createHeader(this.transloco.translate('pdf.doctor_summary')));
    content.push(this.createSpacer(20));

    // Patient Info
    content.push(this.createPatientInfoSection(patient, review));
    content.push(this.createSpacer(15));

    // Medication List
    if (medications.length > 0) {
      content.push(this.createSectionTitle(this.transloco.translate('pdf.current_medications')));
      content.push(this.createSpacer(10));
      content.push(this.createMedicationScheduleTable(medications));
      content.push(this.createSpacer(15));
    }

    // Clinical Notes for Doctor
    const doctorNotes = notes.filter(note => note.communicateToDoctor && note.text);
    if (doctorNotes.length > 0) {
      content.push(this.createSectionTitle('Pharmacist Observations'));
      content.push(this.createSpacer(10));
      
      doctorNotes.forEach(note => {
        const noteContent = this.createNoteCard(note, medications);
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
}
