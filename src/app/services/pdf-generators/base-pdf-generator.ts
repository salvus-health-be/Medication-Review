import { TranslocoService } from '@jsverse/transloco';
import { Content } from 'pdfmake/interfaces';
import { ReviewNote } from '../review-notes.service';
import { Patient, MedicationReview, Medication, LabValue, QuestionAnswer } from '../../models/api.models';

export abstract class BasePdfGenerator {
  // Brand colors from _colors.scss
  protected readonly brandPrimary = '#454B60';
  protected readonly brandSecondary = '#5F6476';
  protected readonly brandAccent = '#9DC9A2';
  protected readonly textPrimary = '#454B60';
  protected readonly textSecondary = '#666666';
  protected readonly borderColor = '#e0e0e0';

  constructor(protected transloco: TranslocoService) {}

  protected createHeader(title: string): Content {
    return {
      columns: [
        {
          text: title,
          style: 'header',
          width: '*'
        },
        {
          text: new Date().toLocaleDateString(),
          style: 'headerDate',
          width: 'auto'
        }
      ]
    };
  }

  protected createPatientInfoSection(patient: Patient | null, review: MedicationReview | null): Content {
    const items: any[] = [];

    if (review?.firstNameAtTimeOfReview || review?.lastNameAtTimeOfReview) {
      const name = [review.firstNameAtTimeOfReview, review.lastNameAtTimeOfReview]
        .filter(Boolean)
        .join(' ');
      items.push({ text: this.transloco.translate('patient.name') + ':', style: 'infoLabel', width: 80 });
      items.push({ text: name, style: 'infoValue', width: '*' });
    }

    if (patient?.dateOfBirth) {
      if (items.length > 0) {
        items.push({ text: '', width: 20 }); // Spacer
      }
      items.push({ text: this.transloco.translate('patient.birth_date') + ':', style: 'infoLabel', width: 60 });
      // Format date: extract date part only (YYYY-MM-DD)
      const formattedDate = patient.dateOfBirth.split('T')[0];
      items.push({ text: formattedDate, style: 'infoValue', width: 'auto' });
    }

    if (patient?.sex) {
      if (items.length > 0) {
        items.push({ text: '', width: 20 }); // Spacer
      }
      items.push({ text: this.transloco.translate('patient.sex') + ':', style: 'infoLabel', width: 60 });
      items.push({ text: patient.sex, style: 'infoValue', width: 'auto' });
    }

    if (items.length === 0) {
      return { text: '' };
    }

    return {
      columns: items,
      style: 'patientInfo'
    };
  }

  protected createSectionTitle(title: string): Content {
    return {
      text: title,
      style: 'sectionTitle'
    };
  }

  protected createNoteCard(note: ReviewNote, medications: Medication[]): Content {
    const stack: any[] = [];
    
    // Add category if available
    if (note.category) {
      stack.push({
        text: note.category,
        style: 'noteCategory',
        margin: [0, 0, 0, 2]
      });
    }
    
    // Add medication name if linked to a medication
    if (note.linkedCnk && note.medicationName) {
      stack.push({
        text: `Medication: ${note.medicationName} (CNK: ${note.linkedCnk})`,
        style: 'noteMedication',
        margin: [0, 0, 0, 4]
      });
    }
    
    // Add the actual note content
    stack.push({
      text: note.text || '',
      style: 'noteContent',
      margin: [0, 0, 0, 0]
    });
    
    return {
      stack,
      margin: [10, 5, 10, 10],
      fillColor: '#f9f9f9'
    };
  }

  protected createMedicationScheduleTable(medications: Medication[]): Content {
    const tableBody: any[] = [
      [
        { text: this.transloco.translate('pdf.medication'), style: 'tableHeader' },
        { text: this.transloco.translate('medication.breakfast'), style: 'tableHeader' },
        { text: this.transloco.translate('medication.lunch'), style: 'tableHeader' },
        { text: this.transloco.translate('medication.dinner'), style: 'tableHeader' },
        { text: this.transloco.translate('medication.bedtime'), style: 'tableHeader' }
      ]
    ];

    medications.forEach(med => {
      // Check for special frequency (non-daily)
      if (med.specialFrequency && med.specialDescription) {
        const frequencyMap: Record<number, string> = {
          1: 'daily',
          2: 'twice weekly',
          3: 'three times weekly',
          4: 'weekly',
          5: 'every 2 weeks',
          6: 'every 3 weeks',
          7: 'every 4 weeks',
          8: 'monthly',
          9: 'every 2 months',
          10: 'quarterly',
          11: 'annually'
        };
        const freqText = frequencyMap[med.specialFrequency] || `code ${med.specialFrequency}`;
        tableBody.push([
          { text: med.name || 'Unknown', style: 'tableCell' },
          { text: `${med.specialDescription}`, style: 'tableCell', alignment: 'center' },
          { text: `(${freqText})`, style: 'tableCell', alignment: 'center', colSpan: 3 }
        ]);
      } else if (med.asNeeded) {
        // As needed medication
        tableBody.push([
          { text: med.name || 'Unknown', style: 'tableCell' },
          { text: 'As needed', style: 'tableCell', alignment: 'center', colSpan: 4 }
        ]);
      } else {
        // Standard daily schedule
        const morning = [med.unitsBeforeBreakfast, med.unitsDuringBreakfast]
          .filter(u => u && u > 0)
          .map(u => String(u))
          .join('+') || '-';
        
        const noon = [med.unitsBeforeLunch, med.unitsDuringLunch]
          .filter(u => u && u > 0)
          .map(u => String(u))
          .join('+') || '-';
        
        const evening = [med.unitsBeforeDinner, med.unitsDuringDinner]
          .filter(u => u && u > 0)
          .map(u => String(u))
          .join('+') || '-';
        
        const bedtime = med.unitsAtBedtime && med.unitsAtBedtime > 0 
          ? String(med.unitsAtBedtime) 
          : '-';

        tableBody.push([
          { text: med.name || 'Unknown', style: 'tableCell' },
          { text: morning, style: 'tableCell', alignment: 'center' },
          { text: noon, style: 'tableCell', alignment: 'center' },
          { text: evening, style: 'tableCell', alignment: 'center' },
          { text: bedtime, style: 'tableCell', alignment: 'center' }
        ]);
      }
    });

    return {
      table: {
        headerRows: 1,
        widths: ['*', 'auto', 'auto', 'auto', 'auto'],
        body: tableBody
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        hLineColor: () => this.borderColor,
        vLineColor: () => this.borderColor,
        paddingLeft: () => 8,
        paddingRight: () => 8,
        paddingTop: () => 6,
        paddingBottom: () => 6
      }
    };
  }

  protected createLabValuesTable(labValues: LabValue[]): Content {
    const tableBody: any[] = [
      [
        { text: 'Parameter', style: 'tableHeader' },
        { text: 'Value', style: 'tableHeader' },
        { text: 'Unit', style: 'tableHeader' }
      ]
    ];

    labValues.forEach(lab => {
      tableBody.push([
        { text: lab.name || 'Unknown', style: 'tableCell' },
        { text: String(lab.value), style: 'tableCell', alignment: 'right' },
        { text: lab.unit || '', style: 'tableCell' }
      ]);
    });

    return {
      table: {
        headerRows: 1,
        widths: ['*', 'auto', 'auto'],
        body: tableBody
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        hLineColor: () => this.borderColor,
        vLineColor: () => this.borderColor,
        paddingLeft: () => 8,
        paddingRight: () => 8,
        paddingTop: () => 6,
        paddingBottom: () => 6
      }
    };
  }

  protected createSpacer(height: number): Content {
    return { text: '', margin: [0, height, 0, 0] };
  }

  protected getStyles(): any {
    return {
      header: {
        fontSize: 24,
        bold: true,
        color: this.brandPrimary,
        margin: [0, 0, 0, 0]
      },
      headerDate: {
        fontSize: 12,
        color: this.textSecondary,
        alignment: 'right',
        margin: [0, 8, 0, 0]
      },
      sectionTitle: {
        fontSize: 16,
        bold: true,
        color: this.brandPrimary,
        margin: [0, 0, 0, 0]
      },
      subsectionTitle: {
        fontSize: 13,
        bold: true,
        color: this.brandSecondary,
        margin: [0, 5, 0, 0]
      },
      questionLabel: {
        fontSize: 10,
        color: this.textSecondary,
        bold: false
      },
      answerValue: {
        fontSize: 10,
        color: this.textPrimary,
        bold: true
      },
      patientInfo: {
        fillColor: '#f5f5f5',
        margin: [0, 0, 0, 0]
      },
      infoLabel: {
        fontSize: 10,
        bold: true,
        color: this.textSecondary
      },
      infoValue: {
        fontSize: 10,
        color: this.textPrimary
      },
      noteCategory: {
        fontSize: 9,
        bold: true,
        color: this.brandAccent,
        italics: true
      },
      noteMedication: {
        fontSize: 11,
        bold: true,
        color: this.brandPrimary
      },
      noteQuestion: {
        fontSize: 10,
        color: this.textSecondary,
        italics: true
      },
      noteLabel: {
        fontSize: 11,
        bold: true,
        color: this.brandPrimary,
        margin: [0, 0, 0, 4]
      },
      noteContent: {
        fontSize: 10,
        color: this.textPrimary,
        lineHeight: 1.4
      },
      tableHeader: {
        fontSize: 11,
        bold: true,
        color: this.brandPrimary,
        fillColor: '#f5f5f5'
      },
      tableCell: {
        fontSize: 10,
        color: this.textPrimary
      },
      listItem: {
        fontSize: 10,
        color: this.textPrimary,
        margin: [0, 2, 0, 2]
      },
      emptyState: {
        fontSize: 10,
        color: this.textSecondary,
        italics: true
      }
    };
  }
}
