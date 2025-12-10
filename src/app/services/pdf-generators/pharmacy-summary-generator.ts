import { TranslocoService } from '@jsverse/transloco';
import { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { BasePdfGenerator, MedicationWithNotes } from './base-pdf-generator';
import { ReviewNote } from '../review-notes.service';
import { Patient, MedicationReview, Medication, QuestionAnswer, Contraindication, LabValue } from '../../models/api.models';

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

    // 1. Header
    content.push(this.createDocumentHeader(
      this.getTitle(),
      this.getSubtitle()
    ));

    // 2. Introduction / Internal notice
    content.push(this.createIntroduction(
      this.getInternalNotice(),
      this.getIntroText()
    ));

    // 3. Patient & Review Summary (compact)
    content.push(this.createSummarySection(patient, review, medications.length, contraindications.length, labValues.length));

    // All notes for internal pharmacy use (no filter)
    const allNotes = notes.filter(note => note.text);

    // 4. Medication sections with notes
    const { medicationsWithNotes, generalNotes } = this.groupNotesByMedication(allNotes, medications);

    if (medicationsWithNotes.length > 0 || generalNotes.length > 0) {
      // Section header
      content.push(this.createSectionHeader(this.getNotesOverviewTitle()));

      // Create a card for each medication with notes
      medicationsWithNotes.forEach(medWithNotes => {
        content.push(this.createPharmacyMedicationCard(
          medWithNotes,
          questionAnswers
        ));
      });

      // 5. General notes
      if (generalNotes.length > 0) {
        content.push(this.createGeneralNotesSection(
          generalNotes,
          questionAnswers,
          false, // No patient comments for pharmacy internal
          true   // Show pharmacist actions
        ));
      }
    } else {
      content.push(this.createEmptyState(this.getNoNotesMessage()));
    }

    // 6. Footer
    content.push(this.createFooter());

    return {
      content,
      ...this.getDefaultDocumentSettings()
    };
  }

  /**
   * Creates a compact summary section with review statistics
   */
  private createSummarySection(
    patient: Patient | null,
    review: MedicationReview | null,
    medicationCount: number,
    contraindicationCount: number,
    labValueCount: number
  ): Content {
    const stats = [
      { label: this.transloco.translate('pdf.current_medications'), value: medicationCount.toString() },
      { label: this.transloco.translate('header.contraindications'), value: contraindicationCount.toString() },
      { label: this.transloco.translate('tools.lab_values'), value: labValueCount.toString() }
    ];

    return {
      table: {
        widths: ['*', '*', '*'],
        body: [
          stats.map(stat => ({
            stack: [
              {
                text: stat.value,
                style: 'statValue',
                alignment: 'center' as const
              },
              {
                text: stat.label,
                style: 'statLabel',
                alignment: 'center' as const
              }
            ],
            margin: [10, 12, 10, 12] as [number, number, number, number]
          }))
        ]
      },
      layout: {
        hLineWidth: () => 1,
        vLineWidth: () => 1,
        hLineColor: () => this.colors.border,
        vLineColor: () => this.colors.border
      },
      margin: [0, 0, 0, 25] as [number, number, number, number]
    };
  }

  /**
   * Creates a medication card for pharmacy internal use with flags
   */
  private createPharmacyMedicationCard(
    medicationWithNotes: MedicationWithNotes,
    questionAnswers: QuestionAnswer[]
  ): Content {
    const { medication, notes } = medicationWithNotes;
    const stack: any[] = [];

    // Medication header
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

    // Posology
    const posology = this.formatPosology(medication);
    if (posology) {
      stack.push({
        text: `${this.getPosologyLabel()}: ${posology}`,
        style: 'posologyText',
        margin: [12, 0, 0, 12] as [number, number, number, number]
      });
    }

    // Notes for this medication
    notes.forEach((note, index) => {
      stack.push(this.createPharmacyNoteItem(note, questionAnswers, index > 0));
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
   * Creates a note item for pharmacy with communication flags
   */
  private createPharmacyNoteItem(
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

    // Flags row (category + communication flags)
    const flagsRow: any[] = [];

    // Category badge
    if (note.category) {
      flagsRow.push({
        table: {
          body: [[
            {
              text: this.formatCategory(note.category),
              style: 'categoryBadge',
              margin: [8, 4, 8, 4] as [number, number, number, number]
            }
          ]]
        },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          paddingLeft: () => 0,
          paddingRight: () => 0,
          paddingTop: () => 0,
          paddingBottom: () => 0,
          fillColor: () => this.colors.secondary
        }
      });
    }

    // Communication flags
    if (note.discussWithPatient) {
      flagsRow.push({
        table: {
          body: [[
            {
              text: this.getPatientFlagLabel(),
              style: 'flagBadge',
              margin: [6, 4, 6, 4] as [number, number, number, number]
            }
          ]]
        },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          paddingLeft: () => 0,
          paddingRight: () => 0,
          paddingTop: () => 0,
          paddingBottom: () => 0,
          fillColor: () => this.colors.accent
        },
        margin: [4, 0, 0, 0] as [number, number, number, number]
      });
    }

    if (note.communicateToDoctor) {
      flagsRow.push({
        table: {
          body: [[
            {
              text: this.getDoctorFlagLabel(),
              style: 'flagBadge',
              margin: [6, 4, 6, 4] as [number, number, number, number]
            }
          ]]
        },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          paddingLeft: () => 0,
          paddingRight: () => 0,
          paddingTop: () => 0,
          paddingBottom: () => 0,
          fillColor: () => this.colors.warning
        },
        margin: [4, 0, 0, 0] as [number, number, number, number]
      });
    }

    if (flagsRow.length > 0) {
      stack.push({
        columns: flagsRow,
        margin: [0, 0, 0, 10] as [number, number, number, number]
      });
    }

    // Note text
    if (note.text) {
      stack.push({
        text: note.text,
        style: 'noteText',
        margin: [0, 0, 0, 12] as [number, number, number, number]
      });
    }

    // Pharmacist action box
    const action = this.findPharmacistAction(note, questionAnswers);
    if (action) {
      stack.push(this.createCommentBox(
        this.getPharmacistActionLabel(),
        action,
        this.colors.accent
      ));
    }

    return { stack };
  }

  /**
   * Creates the footer section
   */
  private createFooter(): Content {
    return {
      stack: [
        {
          canvas: [
            {
              type: 'line',
              x1: 0, y1: 0,
              x2: 495, y2: 0,
              lineWidth: 1,
              lineColor: this.colors.border
            }
          ],
          margin: [0, 20, 0, 12] as [number, number, number, number]
        },
        {
          text: this.getFooterText(),
          style: 'footerText',
          alignment: 'center' as const
        }
      ]
    };
  }

  // Override labels for pharmacy context
  protected override getPharmacistActionLabel(): string {
    const lang = this.getLang();
    if (lang === 'nl') return 'Actiepunt';
    if (lang === 'fr') return 'Point d\'action';
    return 'Action Point';
  }

  private getPatientFlagLabel(): string {
    const lang = this.getLang();
    if (lang === 'nl') return '→ Patiënt';
    if (lang === 'fr') return '→ Patient';
    return '→ Patient';
  }

  private getDoctorFlagLabel(): string {
    const lang = this.getLang();
    if (lang === 'nl') return '→ Arts';
    if (lang === 'fr') return '→ Médecin';
    return '→ Doctor';
  }

  private getNotesOverviewTitle(): string {
    const lang = this.getLang();
    if (lang === 'nl') return 'Notities per medicatie';
    if (lang === 'fr') return 'Notes par médicament';
    return 'Notes by Medication';
  }

  // Localized text getters
  private getTitle(): string {
    return this.transloco.translate('pdf.pharmacy_summary');
  }

  private getSubtitle(): string {
    const lang = this.getLang();
    if (lang === 'nl') return 'Interne documentatie medicatienazicht';
    if (lang === 'fr') return 'Documentation interne de l\'examen de médication';
    return 'Internal Medication Review Documentation';
  }

  private getInternalNotice(): string {
    const lang = this.getLang();
    if (lang === 'nl') return '🔒 Intern document';
    if (lang === 'fr') return '🔒 Document interne';
    return '🔒 Internal Document';
  }

  private getIntroText(): string {
    const lang = this.getLang();
    if (lang === 'nl') {
      return 'Dit document bevat het volledige overzicht van alle notities en bevindingen uit het medicatienazicht, georganiseerd per medicatie. Gebruik dit als referentie voor interne opvolging.';
    }
    if (lang === 'fr') {
      return 'Ce document contient un aperçu complet de toutes les notes et observations de l\'examen de médication, organisées par médicament. Utilisez-le comme référence pour le suivi interne.';
    }
    return 'This document contains a complete overview of all notes and findings from the medication review, organized by medication. Use this as a reference for internal follow-up.';
  }

  private getFooterText(): string {
    const lang = this.getLang();
    if (lang === 'nl') {
      return 'Dit document is gegenereerd voor intern gebruik in de apotheek en is niet bedoeld voor distributie.';
    }
    if (lang === 'fr') {
      return 'Ce document a été généré pour un usage interne en pharmacie et n\'est pas destiné à être distribué.';
    }
    return 'This document was generated for internal pharmacy use and is not intended for distribution.';
  }

  // Additional styles for pharmacy summary
  protected override getStyles(): Record<string, any> {
    return {
      ...super.getStyles(),
      statValue: {
        fontSize: 20,
        bold: true,
        color: this.colors.primary
      },
      statLabel: {
        fontSize: 9,
        color: this.colors.textMedium
      },
      flagBadge: {
        fontSize: 8,
        bold: true,
        color: this.colors.white
      },
      footerText: {
        fontSize: 9,
        color: this.colors.textLight,
        italics: true
      }
    };
  }
}
