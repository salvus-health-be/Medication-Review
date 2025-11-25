import { TranslocoService } from '@jsverse/transloco';
import { Content } from 'pdfmake/interfaces';
import { ReviewNote } from '../review-notes.service';
import { Patient, MedicationReview, Medication, LabValue, QuestionAnswer } from '../../models/api.models';

export abstract class BasePdfGenerator {
  // Clinical Modern color palette
  protected readonly brandPrimary = '#0F4C81'; // Deep Navy Blue
  protected readonly brandSecondary = '#1e6b8f'; // Clinical Teal
  protected readonly brandAccent = '#10b981'; // Medical Green
  protected readonly textPrimary = '#1f2937'; // Dark Slate
  protected readonly textSecondary = '#6b7280'; // Medium Gray
  protected readonly borderColor = '#e5e7eb'; // Light Border
  protected readonly backgroundLight = '#f9fafb'; // Subtle Background

  constructor(protected transloco: TranslocoService) {}

  protected createHeader(title: string): Content {
    return {
      stack: [
        {
          canvas: [
            {
              type: 'rect',
              x: 0, y: 0,
              w: 515, h: 60,
              color: this.brandPrimary
            }
          ]
        },
        {
          columns: [
            {
              text: title.toUpperCase(),
              style: 'header',
              width: '*'
            },
            {
              text: new Date().toLocaleDateString('nl-NL', { day: '2-digit', month: 'long', year: 'numeric' }),
              style: 'headerDate',
              width: 'auto'
            }
          ],
          absolutePosition: { x: 70, y: 70 }
        },
        {
          canvas: [
            {
              type: 'rect',
              x: 0, y: 0,
              w: 515, h: 4,
              color: this.brandAccent
            }
          ],
          margin: [0, 8, 0, 0]
        }
      ],
      margin: [0, 0, 0, 25]
    };
  }

  protected createPatientInfoSection(patient: Patient | null, review: MedicationReview | null): Content {
    // For MVP: Keep patient info anonymous - don't show name, DOB, or sex
    // Only show a generic "Patient" label
    const items: any[] = [];

    // Use generic "Patient" label instead of actual name for MVP anonymity
    items.push({ 
      stack: [
        { text: this.transloco.translate('patient.name').toUpperCase(), style: 'infoLabel' },
        { text: 'Patiënt', style: 'infoValue' }
      ],
      width: '*'
    });

    // Don't include date of birth for MVP anonymity
    // Don't include sex for MVP anonymity

    if (items.length === 0) {
      return { text: '' };
    }

    return {
      table: {
        widths: ['*'],
        body: [
          [
            {
              stack: [
                {
                  text: 'PATIËNTGEGEVENS',
                  style: 'cardTitle',
                  margin: [0, 0, 0, 10]
                },
                {
                  columns: items,
                  margin: [0, 0, 0, 0]
                }
              ],
              style: 'patientInfo'
            }
          ]
        ]
      },
      layout: {
        hLineWidth: () => 2,
        vLineWidth: () => 2,
        hLineColor: () => '#9ca3af',
        vLineColor: () => '#9ca3af',
        paddingLeft: () => 14,
        paddingRight: () => 14,
        paddingTop: () => 12,
        paddingBottom: () => 12
      },
      margin: [0, 0, 0, 0]
    };
  }

  protected createSectionTitle(title: string): Content {
    return {
      text: title.toUpperCase(),
      style: 'sectionTitle',
      margin: [0, 12, 0, 6]
    };
  }

  protected createNoteCard(note: ReviewNote, medications: Medication[]): Content {
    const stack: any[] = [];
    
    // Add category if available
    if (note.category) {
      stack.push({
        text: note.category.toUpperCase(),
        style: 'noteCategory',
        margin: [0, 0, 0, 4]
      });
    }
    
    // Add medication name if linked to a medication
    if (note.linkedCnk && note.medicationName) {
      stack.push({
        text: `${this.transloco.translate('pdf.medication')}: ${note.medicationName}`,
        style: 'noteMedication',
        margin: [0, 0, 0, 4]
      });
    }
    
    // Add the actual note content
    stack.push({
      text: note.text || '',
      style: 'noteContent',
      margin: [0, 4, 0, 0]
    });
    
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
    };
  }

  protected createMedicationScheduleTable(medications: Medication[]): Content {
    const tableBody: any[] = [
      [
        { text: this.transloco.translate('pdf.medication').toUpperCase(), style: 'tableHeader' },
        { text: this.transloco.translate('medication.breakfast').toUpperCase(), style: 'tableHeader', alignment: 'center' },
        { text: this.transloco.translate('medication.lunch').toUpperCase(), style: 'tableHeader', alignment: 'center' },
        { text: this.transloco.translate('medication.dinner').toUpperCase(), style: 'tableHeader', alignment: 'center' },
        { text: this.transloco.translate('medication.bedtime').toUpperCase(), style: 'tableHeader', alignment: 'center' }
      ]
    ];

    medications.forEach((med, index) => {
      const rowColor = index % 2 === 0 ? '#ffffff' : '#f9f9f9';
      
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
          { text: med.name || this.transloco.translate('pdf.unknown'), style: 'tableCell', fillColor: rowColor },
          { text: `${med.specialDescription}`, style: 'tableCell', alignment: 'center', fillColor: rowColor },
          { text: `(${freqText})`, style: 'tableCell', alignment: 'center', colSpan: 3, fillColor: rowColor },
          {}, {} // Empty cells for colspan
        ]);
      } else if (med.asNeeded) {
        // As needed medication
        tableBody.push([
          { text: med.name || this.transloco.translate('pdf.unknown'), style: 'tableCell', fillColor: rowColor },
          { text: this.transloco.translate('pdf.as_needed'), style: 'tableCell', alignment: 'center', colSpan: 4, fillColor: rowColor },
          {}, {}, {} // Empty cells for colspan
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
          { text: med.name || this.transloco.translate('pdf.unknown'), style: 'tableCell', fillColor: rowColor },
          { text: morning, style: 'tableCell', alignment: 'center', fillColor: rowColor },
          { text: noon, style: 'tableCell', alignment: 'center', fillColor: rowColor },
          { text: evening, style: 'tableCell', alignment: 'center', fillColor: rowColor },
          { text: bedtime, style: 'tableCell', alignment: 'center', fillColor: rowColor }
        ]);
      }
    });

    return {
      table: {
        headerRows: 1,
        widths: ['*', 60, 60, 60, 60],
        body: tableBody
      },
      layout: {
        hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length) ? 0 : 1,
        vLineWidth: () => 0,
        hLineColor: () => '#eeeeee',
        paddingLeft: () => 6,
        paddingRight: () => 6,
        paddingTop: () => 6,
        paddingBottom: () => 6
      }
    };
  }

  protected createLabValuesTable(labValues: LabValue[]): Content {
    const tableBody: any[] = [
      [
        { text: this.transloco.translate('pdf.parameter').toUpperCase(), style: 'tableHeader' },
        { text: this.transloco.translate('pdf.value').toUpperCase(), style: 'tableHeader', alignment: 'right' },
        { text: this.transloco.translate('pdf.unit').toUpperCase(), style: 'tableHeader' }
      ]
    ];

    labValues.forEach((lab, index) => {
      const rowColor = index % 2 === 0 ? '#ffffff' : '#f9f9f9';
      tableBody.push([
        { text: lab.name || this.transloco.translate('pdf.unknown'), style: 'tableCell', fillColor: rowColor },
        { text: String(lab.value), style: 'tableCell', alignment: 'right', fillColor: rowColor },
        { text: lab.unit || '', style: 'tableCell', fillColor: rowColor }
      ]);
    });

    return {
      table: {
        headerRows: 1,
        widths: ['*', 'auto', 'auto'],
        body: tableBody
      },
      layout: {
        hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length) ? 0 : 1,
        vLineWidth: () => 0,
        hLineColor: () => '#eeeeee',
        paddingLeft: () => 6,
        paddingRight: () => 6,
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
        fontSize: 22,
        bold: true,
        color: '#ffffff',
        margin: [0, 0, 0, 0],
        letterSpacing: 1.5
      },
      headerDate: {
        fontSize: 10,
        color: '#ffffff',
        alignment: 'right',
        margin: [0, 0, 0, 0]
      },
      cardTitle: {
        fontSize: 10,
        bold: true,
        color: this.brandSecondary,
        letterSpacing: 1.2,
        margin: [0, 0, 0, 6]
      },
      sectionTitle: {
        fontSize: 16,
        bold: true,
        color: this.brandPrimary,
        margin: [0, 0, 0, 0],
        letterSpacing: 1,
        decoration: 'underline',
        decorationColor: this.brandAccent,
        decorationStyle: 'solid'
      },
      subsectionTitle: {
        fontSize: 13,
        bold: true,
        color: this.brandSecondary,
        margin: [0, 3, 0, 0],
        letterSpacing: 0.5
      },
      questionLabel: {
        fontSize: 10,
        color: this.textSecondary,
        bold: false,
        margin: [0, 2, 0, 2]
      },
      answerValue: {
        fontSize: 11,
        color: this.textPrimary,
        bold: false,
        margin: [0, 0, 0, 5]
      },
      patientInfo: {
        fillColor: '#f9fafb',
        margin: [0, 0, 0, 0]
      },
      infoLabel: {
        fontSize: 9,
        bold: true,
        color: this.textSecondary,
        margin: [0, 0, 0, 3],
        letterSpacing: 0.5
      },
      infoValue: {
        fontSize: 13,
        color: this.textPrimary,
        bold: true
      },
      noteCard: {
        fillColor: '#f9fafb',
        margin: [0, 0, 0, 8]
      },
      noteCategory: {
        fontSize: 9,
        bold: true,
        color: '#ffffff',
        background: this.brandAccent,
        padding: [4, 2, 4, 2],
        borderRadius: 2
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
        margin: [0, 0, 0, 3]
      },
      noteContent: {
        fontSize: 11,
        color: this.textPrimary,
        lineHeight: 1.5
      },
      tableHeader: {
        fontSize: 10,
        bold: true,
        color: '#ffffff',
        fillColor: this.brandPrimary,
        margin: [0, 6, 0, 6],
        letterSpacing: 0.5
      },
      tableCell: {
        fontSize: 10,
        color: this.textPrimary,
        margin: [0, 4, 0, 4]
      },
      listItem: {
        fontSize: 11,
        color: this.textPrimary,
        margin: [0, 3, 0, 3],
        lineHeight: 1.4
      },
      emptyState: {
        fontSize: 11,
        color: this.textSecondary,
        italics: true,
        alignment: 'center',
        margin: [0, 6, 0, 6]
      }
    };
  }
}
