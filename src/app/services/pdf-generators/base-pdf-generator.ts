import { TranslocoService } from '@jsverse/transloco';
import { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { ReviewNote } from '../review-notes.service';
import { Patient, MedicationReview, Medication, LabValue, QuestionAnswer, Contraindication } from '../../models/api.models';

export interface MedicationWithNotes {
  medication: Medication;
  notes: ReviewNote[];
}

export abstract class BasePdfGenerator {
  // Modern, professional color palette
  protected readonly colors = {
    primary: '#1e3a5f',        // Deep navy blue
    secondary: '#2563eb',      // Bright blue
    accent: '#059669',         // Emerald green
    warning: '#d97706',        // Amber
    textDark: '#1f2937',       // Near black
    textMedium: '#4b5563',     // Medium gray
    textLight: '#9ca3af',      // Light gray
    border: '#e5e7eb',         // Light border
    backgroundLight: '#f9fafb', // Subtle background
    backgroundCard: '#f3f4f6', // Card background
    white: '#ffffff'
  };

  constructor(protected transloco: TranslocoService) {}

  protected getLang(): string {
    return this.transloco.getActiveLang();
  }

  protected formatDate(): string {
    const lang = this.getLang();
    const locale = lang === 'nl' ? 'nl-BE' : lang === 'fr' ? 'fr-BE' : 'en-GB';
    return new Date().toLocaleDateString(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  /**
   * Groups notes by their linked medication
   */
  protected groupNotesByMedication(
    notes: ReviewNote[],
    medications: Medication[]
  ): { medicationsWithNotes: MedicationWithNotes[], generalNotes: ReviewNote[] } {
    const generalNotes: ReviewNote[] = [];
    const medicationNotesMap = new Map<string, ReviewNote[]>();

    // Initialize map with all medications
    medications.forEach(med => {
      if (med.cnk) {
        medicationNotesMap.set(String(med.cnk), []);
      }
    });

    // Sort notes into their respective medications
    notes.forEach(note => {
      if (note.linkedCnk && medicationNotesMap.has(note.linkedCnk)) {
        medicationNotesMap.get(note.linkedCnk)!.push(note);
      } else if (note.linkedCnk) {
        // Note is linked to a CNK that might match a medication
        const matchingMed = medications.find(m => String(m.cnk) === note.linkedCnk);
        if (matchingMed) {
          if (!medicationNotesMap.has(note.linkedCnk)) {
            medicationNotesMap.set(note.linkedCnk, []);
          }
          medicationNotesMap.get(note.linkedCnk)!.push(note);
        } else {
          generalNotes.push(note);
        }
      } else {
        generalNotes.push(note);
      }
    });

    // Build the result array
    const medicationsWithNotes: MedicationWithNotes[] = medications
      .filter(med => {
        const cnk = String(med.cnk);
        const medNotes = medicationNotesMap.get(cnk) || [];
        return medNotes.length > 0; // Only include medications that have notes
      })
      .map(med => ({
        medication: med,
        notes: medicationNotesMap.get(String(med.cnk)) || []
      }));

    return { medicationsWithNotes, generalNotes };
  }

  /**
   * Creates the document header with title and date
   */
  protected createDocumentHeader(title: string, subtitle?: string): Content {
    return {
      stack: [
        {
          columns: [
            {
              stack: [
                {
                  text: title,
                  style: 'documentTitle'
                },
                subtitle ? {
                  text: subtitle,
                  style: 'documentSubtitle',
                  margin: [0, 4, 0, 0] as [number, number, number, number]
                } : { text: '' }
              ],
              width: '*'
            },
            {
              text: this.formatDate(),
              style: 'dateText',
              width: 'auto',
              alignment: 'right' as const
            }
          ],
          margin: [0, 0, 0, 12] as [number, number, number, number]
        },
        {
          canvas: [
            {
              type: 'line',
              x1: 0, y1: 0,
              x2: 495, y2: 0,
              lineWidth: 3,
              lineColor: this.colors.primary
            }
          ]
        },
        {
          canvas: [
            {
              type: 'line',
              x1: 0, y1: 0,
              x2: 120, y2: 0,
              lineWidth: 3,
              lineColor: this.colors.accent
            }
          ],
          margin: [0, 2, 0, 0] as [number, number, number, number]
        }
      ],
      margin: [0, 0, 0, 30] as [number, number, number, number]
    };
  }

  /**
   * Creates the introduction section
   */
  protected createIntroduction(salutation: string, introText: string): Content {
    return {
      stack: [
        {
          text: salutation,
          style: 'salutation',
          margin: [0, 0, 0, 12] as [number, number, number, number]
        },
        {
          text: introText,
          style: 'bodyText',
          alignment: 'justify' as const
        }
      ],
      margin: [0, 0, 0, 25] as [number, number, number, number]
    };
  }

  /**
   * Creates a section header
   */
  protected createSectionHeader(title: string): Content {
    return {
      stack: [
        {
          text: title,
          style: 'sectionTitle'
        },
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
          margin: [0, 6, 0, 12] as [number, number, number, number]
        }
      ],
      margin: [0, 0, 0, 0] as [number, number, number, number]
    };
  }

  /**
   * Creates a medication card with its notes
   */
  protected createMedicationCard(
    medicationWithNotes: MedicationWithNotes,
    questionAnswers: QuestionAnswer[],
    showPatientComment: boolean,
    showPharmacistAction: boolean
  ): Content {
    const { medication, notes } = medicationWithNotes;
    const stack: any[] = [];

    // Medication header with accent bar
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

    // Posology line
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
      stack.push(this.createNoteItem(note, questionAnswers, showPatientComment, showPharmacistAction, index > 0));
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
   * Creates a single note item with optional patient comment and pharmacist action
   */
  protected createNoteItem(
    note: ReviewNote,
    questionAnswers: QuestionAnswer[],
    showPatientComment: boolean,
    showPharmacistAction: boolean,
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

    // Category badge if present
    if (note.category) {
      stack.push({
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
        },
        margin: [0, 0, 0, 10] as [number, number, number, number]
      });
    }

    // Note text (the observation/finding)
    if (note.text) {
      stack.push({
        text: note.text,
        style: 'noteText',
        margin: [0, 0, 0, 12] as [number, number, number, number]
      });
    }

    // Patient comment box
    if (showPatientComment) {
      const patientComment = this.findPatientComment(note, questionAnswers);
      if (patientComment) {
        stack.push(this.createCommentBox(
          this.getPatientCommentLabel(),
          patientComment,
          this.colors.secondary
        ));
      }
    }

    // Pharmacist action box
    if (showPharmacistAction) {
      const pharmacistAction = this.findPharmacistAction(note, questionAnswers);
      if (pharmacistAction) {
        stack.push(this.createCommentBox(
          this.getPharmacistActionLabel(),
          pharmacistAction,
          this.colors.accent
        ));
      }
    }

    return { stack };
  }

  /**
   * Creates a styled comment/action box
   */
  protected createCommentBox(label: string, text: string, accentColor: string): Content {
    return {
      table: {
        widths: [4, '*'],
        body: [[
          {
            text: '',
            fillColor: accentColor
          },
          {
            stack: [
              {
                text: label,
                style: 'boxLabel'
              },
              {
                text: text,
                style: 'boxContent'
              }
            ],
            margin: [12, 10, 12, 10] as [number, number, number, number],
            fillColor: this.colors.backgroundLight
          }
        ]]
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0
      },
      margin: [0, 0, 0, 10] as [number, number, number, number]
    };
  }

  /**
   * Creates a general notes section (notes not linked to any medication)
   */
  protected createGeneralNotesSection(
    notes: ReviewNote[],
    questionAnswers: QuestionAnswer[],
    showPatientComment: boolean,
    showPharmacistAction: boolean
  ): Content {
    if (notes.length === 0) {
      return { text: '' };
    }

    const stack: any[] = [];
    
    stack.push(this.createSectionHeader(this.getGeneralNotesTitle()));

    notes.forEach((note) => {
      stack.push(this.createStandaloneNoteCard(note, questionAnswers, showPatientComment, showPharmacistAction));
    });

    return { stack, margin: [0, 20, 0, 0] as [number, number, number, number] };
  }

  /**
   * Creates a standalone note card (for general notes not linked to medication)
   */
  protected createStandaloneNoteCard(
    note: ReviewNote,
    questionAnswers: QuestionAnswer[],
    showPatientComment: boolean,
    showPharmacistAction: boolean
  ): Content {
    const stack: any[] = [];

    // Category badge if present
    if (note.category) {
      stack.push({
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
        },
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

    // Patient comment
    if (showPatientComment) {
      const patientComment = this.findPatientComment(note, questionAnswers);
      if (patientComment) {
        stack.push(this.createCommentBox(
          this.getPatientCommentLabel(),
          patientComment,
          this.colors.secondary
        ));
      }
    }

    // Pharmacist action
    if (showPharmacistAction) {
      const pharmacistAction = this.findPharmacistAction(note, questionAnswers);
      if (pharmacistAction) {
        stack.push(this.createCommentBox(
          this.getPharmacistActionLabel(),
          pharmacistAction,
          this.colors.accent
        ));
      }
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

  /**
   * Creates an empty state message
   */
  protected createEmptyState(message: string): Content {
    return {
      table: {
        widths: ['*'],
        body: [[
          {
            text: message,
            style: 'emptyState',
            margin: [20, 30, 20, 30] as [number, number, number, number]
          }
        ]]
      },
      layout: {
        hLineWidth: () => 1,
        vLineWidth: () => 1,
        hLineColor: () => this.colors.border,
        vLineColor: () => this.colors.border,
        hLineStyle: () => ({ dash: { length: 4, space: 4 } }),
        vLineStyle: () => ({ dash: { length: 4, space: 4 } })
      },
      margin: [0, 0, 0, 16] as [number, number, number, number]
    };
  }

  /**
   * Creates the closing section
   */
  protected createClosing(closingText: string, signOff: string): Content {
    return {
      stack: [
        {
          text: closingText,
          style: 'bodyText',
          alignment: 'justify' as const,
          margin: [0, 0, 0, 20] as [number, number, number, number]
        },
        {
          text: signOff,
          style: 'signOff'
        }
      ],
      margin: [0, 30, 0, 0] as [number, number, number, number]
    };
  }

  /**
   * Formats medication posology into a readable string
   */
  protected formatPosology(medication: Medication): string {
    if (medication.asNeeded) {
      return this.transloco.translate('pdf.as_needed');
    }

    if (medication.specialFrequency && medication.specialDescription) {
      return medication.specialDescription;
    }

    const values = [
      (medication.unitsBeforeBreakfast || 0) + (medication.unitsDuringBreakfast || 0),
      (medication.unitsBeforeLunch || 0) + (medication.unitsDuringLunch || 0),
      (medication.unitsBeforeDinner || 0) + (medication.unitsDuringDinner || 0),
      medication.unitsAtBedtime || 0
    ];

    const nonZeroValues = values.filter(v => v > 0);
    if (nonZeroValues.length === 0) return '';

    // Simple format: just show the dosing pattern
    const pattern = values.map(v => v > 0 ? v : '-').join(' - ');
    return pattern;
  }

  /**
   * Formats category name for display
   */
  protected formatCategory(category: string): string {
    const categoryMap: Record<string, string> = {
      'TherapyAdherence': this.transloco.translate('pdf.medication_adherence'),
      'Effectiveness': this.transloco.translate('pdf.effectiveness_side_effects'),
      'SideEffects': this.transloco.translate('pdf.effectiveness_side_effects'),
      'MedicationSchema': this.transloco.translate('pdf.medication'),
      'PatientConcerns': this.transloco.translate('pdf.patient_concerns'),
      'PracticalProblems': this.transloco.translate('pdf.practical_problems'),
      'Interactions': this.transloco.translate('tools.interactions'),
      'Posology': this.transloco.translate('tools.posology'),
      'GheOPS': this.transloco.translate('tools.gheops'),
      'Contraindications': this.transloco.translate('tools.contraindications')
    };
    
    return categoryMap[category] || category;
  }

  /**
   * Finds patient comment associated with a note
   * The comment is stored as note_comment_{rowKey}
   */
  protected findPatientComment(note: ReviewNote, questionAnswers: QuestionAnswer[]): string | null {
    // Patient comments are not stored separately - the note text itself is the observation
    // This method is kept for potential future use
    return null;
  }

  /**
   * Finds pharmacist action/comment associated with a note
   * The action is stored as note_comment_{rowKey} in questionAnswers
   */
  protected findPharmacistAction(note: ReviewNote, questionAnswers: QuestionAnswer[]): string | null {
    const commentKey = `note_comment_${note.rowKey}`;
    const commentAnswer = questionAnswers.find(qa => qa.questionName === commentKey);
    if (commentAnswer?.value && commentAnswer.value.trim()) {
      return commentAnswer.value.trim();
    }
    return null;
  }

  // Localized labels
  protected getPatientCommentLabel(): string {
    const lang = this.getLang();
    if (lang === 'nl') return 'Opmerking patiënt';
    if (lang === 'fr') return 'Commentaire du patient';
    return 'Patient Comment';
  }

  protected getPharmacistActionLabel(): string {
    const lang = this.getLang();
    if (lang === 'nl') return 'Actie apotheker';
    if (lang === 'fr') return 'Action du pharmacien';
    return 'Pharmacist Action';
  }

  protected getGeneralNotesTitle(): string {
    const lang = this.getLang();
    if (lang === 'nl') return 'Algemene opmerkingen';
    if (lang === 'fr') return 'Remarques générales';
    return 'General Notes';
  }

  protected getMedicationsTitle(): string {
    const lang = this.getLang();
    if (lang === 'nl') return 'Medicatie-overzicht';
    if (lang === 'fr') return 'Aperçu des médicaments';
    return 'Medication Overview';
  }

  protected getPosologyLabel(): string {
    const lang = this.getLang();
    if (lang === 'nl') return 'Dosering';
    if (lang === 'fr') return 'Posologie';
    return 'Dosage';
  }

  protected getNoNotesMessage(): string {
    const lang = this.getLang();
    if (lang === 'nl') return 'Geen opmerkingen toegevoegd voor deze beoordeling.';
    if (lang === 'fr') return 'Aucune remarque ajoutée pour cette évaluation.';
    return 'No notes added for this review.';
  }

  /**
   * Returns the base styles for the document
   */
  protected getStyles(): Record<string, any> {
    return {
      documentTitle: {
        fontSize: 22,
        bold: true,
        color: this.colors.primary
      },
      documentSubtitle: {
        fontSize: 11,
        color: this.colors.textMedium
      },
      dateText: {
        fontSize: 10,
        color: this.colors.textMedium
      },
      salutation: {
        fontSize: 11,
        color: this.colors.textDark
      },
      bodyText: {
        fontSize: 10,
        color: this.colors.textDark,
        lineHeight: 1.5
      },
      sectionTitle: {
        fontSize: 14,
        bold: true,
        color: this.colors.primary
      },
      medicationName: {
        fontSize: 13,
        bold: true,
        color: this.colors.primary
      },
      medicationIndication: {
        fontSize: 9,
        color: this.colors.textMedium,
        italics: true
      },
      posologyText: {
        fontSize: 9,
        color: this.colors.textMedium
      },
      categoryBadge: {
        fontSize: 8,
        bold: true,
        color: this.colors.white
      },
      noteText: {
        fontSize: 10,
        color: this.colors.textDark,
        lineHeight: 1.5
      },
      boxLabel: {
        fontSize: 9,
        bold: true,
        color: this.colors.textMedium
      },
      boxContent: {
        fontSize: 10,
        color: this.colors.textDark,
        lineHeight: 1.4
      },
      signOff: {
        fontSize: 11,
        color: this.colors.textDark
      },
      emptyState: {
        fontSize: 10,
        color: this.colors.textLight,
        italics: true,
        alignment: 'center' as const
      }
    };
  }

  /**
   * Returns the default document definition settings
   */
  protected getDefaultDocumentSettings(): Partial<TDocumentDefinitions> {
    return {
      pageMargins: [50, 50, 50, 50] as [number, number, number, number],
      defaultStyle: {
        font: 'Roboto',
        fontSize: 10,
        lineHeight: 1.4
      },
      styles: this.getStyles()
    };
  }
}
