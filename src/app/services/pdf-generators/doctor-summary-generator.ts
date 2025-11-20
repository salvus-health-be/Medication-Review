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

    // Header with decorative line
    content.push(this.createHeader(this.transloco.translate('pdf.doctor_summary')));
    content.push(this.createDecorativeLine());
    content.push(this.createSpacer(12));

    // Patient Info
    content.push(this.createPatientInfoSection(patient, review));
    content.push(this.createSpacer(12));

    // Professional Introduction
    content.push(this.createDoctorIntroduction());
    content.push(this.createSpacer(18));

    // Get Part 1 action items and notes for doctor
    const part1Actions = this.getDoctorPart1Actions(questionAnswers);
    const doctorNotes = notes.filter(note => note.communicateToDoctor && note.text);
    
    const hasAnyContent = part1Actions.length > 0 || doctorNotes.length > 0;
    
    if (hasAnyContent) {
      content.push(this.createSectionTitle(this.transloco.translate('pdf.pharmacist_notes')));
      content.push(this.createSpacer(3));
      content.push(this.createSubtitle(this.getDoctorIntroText('notes_intro')));
      content.push(this.createSpacer(8));
      
      // Part 1 Clinical Observations first
      if (part1Actions.length > 0) {
        content.push(this.createSubsectionTitle(this.getDoctorIntroText('clinical_observations')));
        content.push(this.createSpacer(5));
        part1Actions.forEach((action: { label: string, value: string }) => {
          content.push(this.createDoctorActionCard(action));
          content.push(this.createSpacer(6));
        });
        content.push(this.createSpacer(3));
      }
      
      // Group review notes by medication
      const groupedNotes = this.groupNotesByMedication(doctorNotes, medications, questionAnswers);
      
      // General clinical notes
      if (groupedNotes.general.length > 0) {
        if (part1Actions.length === 0) {
          content.push(this.createSubsectionTitle(this.getDoctorIntroText('clinical_observations')));
          content.push(this.createSpacer(8));
        }
        groupedNotes.general.forEach(note => {
          content.push(this.createEnhancedDoctorNoteCard(note, null, questionAnswers));
          content.push(this.createSpacer(6));
        });
        content.push(this.createSpacer(3));
      }
      
      // Medication-specific clinical notes
      if (groupedNotes.byMedication.length > 0) {
        groupedNotes.byMedication.forEach(group => {
          content.push(this.createSubsectionTitle(`${this.getDoctorIntroText('regarding')} ${group.medicationName}`));
          content.push(this.createSpacer(5));
          group.notes.forEach(note => {
            content.push(this.createEnhancedDoctorNoteCard(note, group.medicationName, questionAnswers));
            content.push(this.createSpacer(6));
          });
          content.push(this.createSpacer(3));
        });
      }
    } else {
      content.push(this.createSectionTitle(this.transloco.translate('pdf.pharmacist_notes')));
      content.push(this.createSpacer(6));
      content.push({
        text: this.getDoctorIntroText('no_observations'),
        style: 'emptyState'
      });
    }

    // Professional footer
    content.push(this.createSpacer(15));
    content.push(this.createDoctorFooter());

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

  private createDoctorIntroduction(): Content {
    const lang = this.transloco.getActiveLang();
    let introText = '';
    
    if (lang === 'nl') {
      introText = 'Geachte collega,\n\nHierbij ontvangt u een samenvatting van het medicatiereview dat ik heb uitgevoerd met bovengenoemde patiënt. Dit rapport bevat klinische observaties en aanbevelingen die uw aandacht vereisen. De vermelde punten kunnen implicaties hebben voor de behandeling en medicatie van de patiënt.';
    } else if (lang === 'fr') {
      introText = 'Cher confrère,\n\nVoici un résumé de l\'examen de médication que j\'ai effectué avec le patient susmentionné. Ce rapport contient des observations cliniques et des recommandations nécessitant votre attention. Les points mentionnés peuvent avoir des implications pour le traitement et les médicaments du patient.';
    } else {
      introText = 'Dear Colleague,\n\nPlease find enclosed a summary of the medication review I conducted with the above-mentioned patient. This report contains clinical observations and recommendations requiring your attention. The points mentioned may have implications for the patient\'s treatment and medication management.';
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

  private createDoctorActionCard(action: { label: string, value: string }): Content {
    const stack: any[] = [];
    
    stack.push({
      columns: [
        {
          width: 24,
          text: '▸',
          style: 'doctorNoteIcon',
          color: this.brandPrimary
        },
        {
          width: '*',
          stack: [
            {
              text: action.label,
              style: 'doctorNoteTitle',
              margin: [0, 2, 0, 4]
            },
            {
              text: action.value,
              style: 'doctorNoteContent',
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
        hLineColor: () => this.brandPrimary,
        vLineColor: () => this.brandPrimary,
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

  private createEnhancedDoctorNoteCard(note: ReviewNote, medicationName: string | null, questionAnswers: any[]): Content {
    const stack: any[] = [];
    
    if (note.category) {
      stack.push({
        text: this.formatCategory(note.category).toUpperCase(),
        style: 'doctorCategoryBadge',
        margin: [0, 0, 0, 8]
      });
    }
    
    if (note.text) {
      stack.push({
        columns: [
          {
            width: 24,
            text: '▸',
            style: 'doctorNoteIcon',
            color: this.brandPrimary
          },
          {
            width: '*',
            stack: [
              {
                text: note.text,
                style: 'doctorNoteTitle',
                margin: [0, 2, 0, 4]
              }
            ]
          }
        ]
      });
    }
    
    const commentKey = `note_comment_${note.rowKey}`;
    const commentAnswer = questionAnswers.find(qa => qa.questionName === commentKey);
    
    if (commentAnswer && commentAnswer.value) {
      stack.push({
        text: commentAnswer.value,
        style: 'doctorNoteContent',
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

  private createDoctorFooter(): Content {
    const lang = this.transloco.getActiveLang();
    let footerText = '';
    
    if (lang === 'nl') {
      footerText = 'Indien u vragen heeft over deze bevindingen of verdere toelichting wenst, aarzel dan niet om contact met mij op te nemen. Ik sta graag tot uw beschikking voor overleg.';
    } else if (lang === 'fr') {
      footerText = 'Si vous avez des questions sur ces constatations ou si vous souhaitez des éclaircissements supplémentaires, n\'hésitez pas à me contacter. Je reste à votre disposition pour toute consultation.';
    } else {
      footerText = 'Should you have any questions regarding these findings or require further clarification, please do not hesitate to contact me. I remain at your disposal for consultation.';
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
          alignment: 'left'
        }
      ]
    };
  }

  private getDoctorIntroText(key: string): string {
    const lang = this.transloco.getActiveLang();
    
    const translations: Record<string, Record<string, string>> = {
      'notes_intro': {
        'nl': 'Hieronder vindt u de klinische observaties en aanbevelingen die voortkomen uit het medicatiereview:',
        'fr': 'Vous trouverez ci-dessous les observations cliniques et les recommandations issues de l\'examen de médication :',
        'en': 'Below you will find the clinical observations and recommendations arising from the medication review:'
      },
      'clinical_observations': {
        'nl': 'Klinische observaties en aanbevelingen',
        'fr': 'Observations cliniques et recommandations',
        'en': 'Clinical Observations and Recommendations'
      },
      'regarding': {
        'nl': 'Betreffende',
        'fr': 'Concernant',
        'en': 'Regarding'
      },
      'no_observations': {
        'nl': 'Geen klinische observaties gemarkeerd voor beoordeling.',
        'fr': 'Aucune observation clinique marquée pour examen.',
        'en': 'No clinical observations marked for review.'
      }
    };
    
    return translations[key]?.[lang] || translations[key]?.['en'] || '';
  }

  protected override getStyles(): any {
    const baseStyles = super.getStyles();
    return {
      ...baseStyles,
      introCard: {
        fillColor: '#f8fafc', // Clinical light blue
        margin: [0, 0, 0, 0],
        padding: [16, 12, 16, 12],
        border: [0, 0, 0, 4],
        borderColor: this.brandPrimary
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
      doctorCategoryBadge: {
        fontSize: 8,
        bold: true,
        color: '#fff',
        background: this.brandPrimary,
        fillColor: this.brandPrimary,
        padding: [6, 2, 6, 2],
        borderRadius: 2,
        alignment: 'left'
      },
      doctorNoteIcon: {
        fontSize: 14,
        bold: true
      },
      doctorNoteTitle: {
        fontSize: 11,
        bold: true,
        color: this.textPrimary,
        lineHeight: 1.4
      },
      doctorNoteContent: {
        fontSize: 11,
        color: this.textPrimary,
        lineHeight: 1.5
      },
      actionCard: {
        fillColor: '#f8fafc',
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
