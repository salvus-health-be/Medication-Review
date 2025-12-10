import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { StateService } from '../../services/state.service';
import { ApiService } from '../../services/api.service';
import { PdfGenerationService } from '../../services/pdf-generation.service';
import { ReviewNotesService, ReviewNote } from '../../services/review-notes.service';
import { Patient, MedicationReview, Medication, QuestionAnswer, Contraindication, LabValue } from '../../models/api.models';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import pdfMake from 'pdfmake/build/pdfmake';
import { TDocumentDefinitions } from 'pdfmake/interfaces';

type ReportTool = 'patient-summary' | 'doctor-summary' | 'pharmacy-summary' | null;

interface EditableRecommendation {
  text: string;
  action?: string;
  context?: string;
  originalIndex: number;
  isActionOnly?: boolean; // For questionnaire items that only have an action, no note
}

interface PatientSummaryContent {
  documentTitle: string;
  salutation: string;
  introText: string;
  recommendationsHeading: string;
  recommendations: EditableRecommendation[];
  closingText: string;
  signOff: string;
  pharmacistName: string;
}

interface DoctorSummaryContent {
  documentTitle: string;
  salutation: string;
  introText: string;
  observationsHeading: string;
  observations: EditableRecommendation[];
  closingText: string;
  signOff: string;
  pharmacistName: string;
}

interface PharmacySummaryContent {
  documentTitle: string;
  internalNotice: string;
  reviewNotesHeading: string;
  notes: EditableRecommendation[];
  closingText: string;
  pharmacistName: string;
}

@Component({
  selector: 'app-report-generation',
  imports: [CommonModule, TranslocoModule, FormsModule],
  templateUrl: './report-generation.page.html',
  styleUrls: ['./report-generation.page.scss']
})
export class ReportGenerationPage implements OnInit {
  private router = inject(Router);
  private stateService = inject(StateService);
  private apiService = inject(ApiService);
  private transloco = inject(TranslocoService);
  private pdfService = inject(PdfGenerationService);

  activeTool: ReportTool = null;
  isGenerating = false;
  isLoadingData = false;
  
  // Data for PDF generation
  patient: Patient | null = null;
  review: MedicationReview | null = null;
  medications: Medication[] = [];
  questionAnswers: QuestionAnswer[] = [];
  contraindications: Contraindication[] = [];
  labValues: LabValue[] = [];
  reviewNotes: ReviewNote[] = [];
  
  // Editable content
  patientContent: PatientSummaryContent | null = null;
  doctorContent: DoctorSummaryContent | null = null;
  pharmacyContent: PharmacySummaryContent | null = null;

  ngOnInit() {
    this.loadReportData();
    // Auto-select first tool on load
    this.selectTool('patient-summary');
  }

  goBack() {
    this.router.navigate(['/anamnesis']);
  }

  selectTool(tool: ReportTool) {
    if (this.activeTool === tool) return;
    
    this.activeTool = tool;
    
    if (tool) {
      this.initializeContent(tool);
    }
  }

  private loadReportData() {
    this.isLoadingData = true;
    const apbNumber = this.stateService.apbNumber;
    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) {
      this.isLoadingData = false;
      return;
    }

    const sessionData = this.stateService.getSessionData();
    this.patient = sessionData?.patient || null;
    this.review = sessionData?.review || null;

    forkJoin({
      medications: this.apiService.getMedications(apbNumber, reviewId).pipe(catchError(() => of([]))),
      questionAnswers: this.apiService.getQuestionAnswers(apbNumber, reviewId).pipe(catchError(() => of([]))),
      contraindications: this.apiService.getContraindications(apbNumber, reviewId).pipe(catchError(() => of([]))),
      labValues: this.apiService.getLabValues(apbNumber, reviewId).pipe(catchError(() => of([]))),
      reviewNotes: this.apiService.getReviewNotes(apbNumber, reviewId).pipe(catchError(() => of([])))
    }).subscribe(data => {
      this.medications = data.medications;
      this.questionAnswers = data.questionAnswers;
      this.contraindications = data.contraindications;
      this.labValues = data.labValues;
      this.reviewNotes = data.reviewNotes;
      this.isLoadingData = false;
      
      // Re-initialize content if tool is already selected
      if (this.activeTool) {
        this.initializeContent(this.activeTool);
      }
    });
  }

  private initializeContent(tool: ReportTool) {
    if (!tool) return;

    switch (tool) {
      case 'patient-summary':
        this.initializePatientContent();
        break;
      case 'doctor-summary':
        this.initializeDoctorContent();
        break;
      case 'pharmacy-summary':
        this.initializePharmacyContent();
        break;
    }
  }

  private initializePatientContent() {
    const lang = this.transloco.getActiveLang();
    
    // Use generic salutation for MVP anonymity
    let salutation = 'Beste,';
    if (lang === 'fr') salutation = 'Cher(e) patient(e),';
    else if (lang === 'en') salutation = 'Dear patient,';

    // Get default intro text
    let introText = '';
    if (lang === 'nl') {
      introText = 'Hierbij ontvangt u een samenvatting van ons gesprek over uw medicatie. Dit document bevat belangrijke informatie en aanbevelingen om u te helpen het beste uit uw medicatie te halen.';
    } else if (lang === 'fr') {
      introText = 'Voici un résumé de notre conversation sur vos médicaments. Ce document contient des informations importantes et des recommandations pour vous aider à tirer le meilleur parti de vos médicaments.';
    } else {
      introText = 'This is a summary of our conversation about your medication. This document contains important information and recommendations to help you get the most out of your treatment.';
    }

    // Get Part 1 actions and notes
    const part1Actions = this.getPatientPart1Actions();
    const patientNotes = this.reviewNotes.filter(note => note.discussWithPatient && note.text);
    
    const recommendations: EditableRecommendation[] = [];
    let index = 0;

    // Add Part 1 actions (questionnaire items - action only, no note)
    part1Actions.forEach(action => {
      recommendations.push({
        text: '',
        action: action.value,
        context: action.label,
        originalIndex: index++,
        isActionOnly: true
      });
    });

    // Add review notes - show both note text and pharmacist action as separate fields
    const groupedNotes = this.groupNotesByMedication(patientNotes);
    groupedNotes.general.forEach(note => {
      const commentKey = `note_comment_${note.rowKey}`;
      const commentAnswer = this.questionAnswers.find(qa => qa.questionName === commentKey);
      const noteText = note.text || '';
      const pharmacistAction = commentAnswer?.value || '';
      
      if (noteText || pharmacistAction) {
        recommendations.push({ 
          text: noteText, 
          action: pharmacistAction,
          originalIndex: index++ 
        });
      }
    });

    groupedNotes.byMedication.forEach(group => {
      group.notes.forEach(note => {
        const commentKey = `note_comment_${note.rowKey}`;
        const commentAnswer = this.questionAnswers.find(qa => qa.questionName === commentKey);
        const noteText = note.text || '';
        const pharmacistAction = commentAnswer?.value || '';
        
        if (noteText || pharmacistAction) {
          recommendations.push({
            text: noteText,
            action: pharmacistAction,
            context: group.medicationName,
            originalIndex: index++
          });
        }
      });
    });

    // Get closing text
    let closingText = '';
    if (lang === 'nl') {
      closingText = 'Heeft u vragen over deze informatie? Neem gerust contact met ons op. Wij staan altijd klaar om u te helpen.';
    } else if (lang === 'fr') {
      closingText = 'Avez-vous des questions sur ces informations ? N\'hésitez pas à nous contacter. Nous sommes toujours là pour vous aider.';
    } else {
      closingText = 'Do you have any questions about this information? Please feel free to contact us. We are always here to help.';
    }

    // Get sign-off
    let signOff = 'Met vriendelijke groet,';
    if (lang === 'fr') signOff = 'Cordialement,';
    else if (lang === 'en') signOff = 'Kind regards,';

    this.patientContent = {
      documentTitle: this.transloco.translate('reports.patient_summary'),
      salutation,
      introText,
      recommendationsHeading: this.transloco.translate('pdf.recommendations') || 'Recommendations:',
      recommendations,
      closingText,
      signOff,
      pharmacistName: ''
    };
  }

  private initializeDoctorContent() {
    const lang = this.transloco.getActiveLang();
    
    // Get default salutation
    let salutation = 'Geachte collega,';
    if (lang === 'fr') salutation = 'Cher collègue,';
    else if (lang === 'en') salutation = 'Dear Colleague,';

    // Get default intro text
    let introText = '';
    if (lang === 'nl') {
      introText = 'Hierbij deel ik de bevindingen van een recent uitgevoerd medicatienazicht. De volgende observaties kunnen relevant zijn voor de patiëntenzorg.';
    } else if (lang === 'fr') {
      introText = 'Je partage avec vous les résultats d\'un examen de médication récemment effectué. Les observations suivantes peuvent être pertinentes pour les soins aux patients.';
    } else {
      introText = 'I am sharing the findings from a recent medication review. The following observations may be relevant to patient care.';
    }

    // Get Part 1 actions and notes for doctor
    const part1Actions = this.getDoctorPart1Actions();
    const doctorNotes = this.reviewNotes.filter(note => note.communicateToDoctor && note.text);
    
    const observations: EditableRecommendation[] = [];
    let index = 0;

    // Add Part 1 actions (questionnaire items - action only, no note)
    part1Actions.forEach(action => {
      observations.push({
        text: '',
        action: action.value,
        context: action.label,
        originalIndex: index++,
        isActionOnly: true
      });
    });

    // Add review notes with separate text and action fields
    const groupedNotes = this.groupNotesByMedication(doctorNotes);
    groupedNotes.general.forEach(note => {
      const commentKey = `note_comment_${note.rowKey}`;
      const commentAnswer = this.questionAnswers.find(qa => qa.questionName === commentKey);
      const noteText = note.text || '';
      const pharmacistAction = commentAnswer?.value || '';
      
      if (noteText || pharmacistAction) {
        observations.push({ 
          text: noteText, 
          action: pharmacistAction,
          originalIndex: index++ 
        });
      }
    });

    groupedNotes.byMedication.forEach(group => {
      group.notes.forEach(note => {
        const commentKey = `note_comment_${note.rowKey}`;
        const commentAnswer = this.questionAnswers.find(qa => qa.questionName === commentKey);
        const noteText = note.text || '';
        const pharmacistAction = commentAnswer?.value || '';
        
        if (noteText || pharmacistAction) {
          observations.push({
            text: noteText,
            action: pharmacistAction,
            context: group.medicationName,
            originalIndex: index++
          });
        }
      });
    });

    // Get closing text
    let closingText = '';
    if (lang === 'nl') {
      closingText = 'Voor verdere vragen of overleg sta ik graag tot uw beschikking.';
    } else if (lang === 'fr') {
      closingText = 'Je reste à votre disposition pour toute question ou discussion complémentaire.';
    } else {
      closingText = 'I remain available for any questions or further discussion.';
    }

    // Get sign-off
    let signOff = 'Met collegiale groet,';
    if (lang === 'fr') signOff = 'Cordialement,';
    else if (lang === 'en') signOff = 'With kind regards,';

    this.doctorContent = {
      documentTitle: this.transloco.translate('reports.doctor_summary'),
      salutation,
      introText,
      observationsHeading: this.transloco.translate('pdf.observations') || 'Observations:',
      observations,
      closingText,
      signOff,
      pharmacistName: ''
    };
  }

  private initializePharmacyContent() {
    const lang = this.transloco.getActiveLang();
    
    // Get internal notice
    let internalNotice = '';
    if (lang === 'nl') {
      internalNotice = 'Interne farmaceutische samenvatting met volledige reviewgegevens.';
    } else if (lang === 'fr') {
      internalNotice = 'Résumé pharmaceutique interne avec données complètes de l\'examen.';
    } else {
      internalNotice = 'Internal pharmaceutical summary with complete review data.';
    }

    // Get all actions and notes
    const part1Actions = this.getPharmacyPart1Actions();
    const allNotes = this.reviewNotes.filter(note => note.text);
    
    const notes: EditableRecommendation[] = [];
    let index = 0;

    // Add Part 1 actions (questionnaire items - action only, no note)
    part1Actions.forEach(action => {
      notes.push({
        text: '',
        action: action.value,
        context: action.label,
        originalIndex: index++,
        isActionOnly: true
      });
    });

    // Add review notes with flags and separate text/action fields
    const groupedNotes = this.groupNotesByMedication(allNotes);
    groupedNotes.general.forEach(note => {
      const commentKey = `note_comment_${note.rowKey}`;
      const commentAnswer = this.questionAnswers.find(qa => qa.questionName === commentKey);
      const noteText = note.text || '';
      const pharmacistAction = commentAnswer?.value || '';
      
      // Build flags prefix
      const flags = [];
      if (note.discussWithPatient) flags.push('[Patient]');
      if (note.communicateToDoctor) flags.push('[Doctor]');
      const flagPrefix = flags.length > 0 ? `${flags.join(' ')} ` : '';
      
      if (noteText || pharmacistAction) {
        notes.push({ 
          text: `${flagPrefix}${noteText}`, 
          action: pharmacistAction,
          originalIndex: index++ 
        });
      }
    });

    groupedNotes.byMedication.forEach(group => {
      group.notes.forEach(note => {
        const commentKey = `note_comment_${note.rowKey}`;
        const commentAnswer = this.questionAnswers.find(qa => qa.questionName === commentKey);
        const noteText = note.text || '';
        const pharmacistAction = commentAnswer?.value || '';
        
        // Build flags prefix
        const flags = [];
        if (note.discussWithPatient) flags.push('[Patient]');
        if (note.communicateToDoctor) flags.push('[Doctor]');
        const flagPrefix = flags.length > 0 ? `${flags.join(' ')} ` : '';
        
        if (noteText || pharmacistAction) {
          notes.push({
            text: `${flagPrefix}${noteText}`,
            action: pharmacistAction,
            context: group.medicationName,
            originalIndex: index++
          });
        }
      });
    });

    // Get closing text
    let closingText = '';
    if (lang === 'nl') {
      closingText = 'Voor intern farmaceutisch gebruik. Vertrouwelijke informatie.';
    } else if (lang === 'fr') {
      closingText = 'Pour usage pharmaceutique interne. Informations confidentielles.';
    } else {
      closingText = 'For internal pharmaceutical use. Confidential information.';
    }

    this.pharmacyContent = {
      documentTitle: this.transloco.translate('reports.pharmacy_summary'),
      internalNotice,
      reviewNotesHeading: this.transloco.translate('pdf.review_notes') || 'Review Notes:',
      notes,
      closingText,
      pharmacistName: ''
    };
  }

  addRecommendation() {
    if (!this.activeTool) return;

    const newRec: EditableRecommendation = {
      text: '',
      originalIndex: -1
    };

    switch (this.activeTool) {
      case 'patient-summary':
        if (this.patientContent) {
          this.patientContent.recommendations.push(newRec);
        }
        break;
      case 'doctor-summary':
        if (this.doctorContent) {
          this.doctorContent.observations.push(newRec);
        }
        break;
      case 'pharmacy-summary':
        if (this.pharmacyContent) {
          this.pharmacyContent.notes.push(newRec);
        }
        break;
    }
  }

  removeRecommendation(index: number) {
    if (!this.activeTool) return;

    switch (this.activeTool) {
      case 'patient-summary':
        if (this.patientContent) {
          this.patientContent.recommendations.splice(index, 1);
        }
        break;
      case 'doctor-summary':
        if (this.doctorContent) {
          this.doctorContent.observations.splice(index, 1);
        }
        break;
      case 'pharmacy-summary':
        if (this.pharmacyContent) {
          this.pharmacyContent.notes.splice(index, 1);
        }
        break;
    }
  }

  generateAndDownloadPDF() {
    if (!this.activeTool) return;

    this.isGenerating = true;

    try {
      let docDefinition: TDocumentDefinitions;

      // Use the editor content methods that respect user edits
      switch (this.activeTool) {
        case 'patient-summary':
          docDefinition = this.generatePatientPDF();
          break;
        case 'doctor-summary':
          docDefinition = this.generateDoctorPDF();
          break;
        case 'pharmacy-summary':
          docDefinition = this.generatePharmacyPDF();
          break;
        default:
          this.isGenerating = false;
          return;
      }

      const pdfDocGenerator = pdfMake.createPdf(docDefinition);
      
      pdfDocGenerator.getBlob((blob) => {
        const filename = `${this.activeTool}-${Date.now()}.pdf`;
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        this.isGenerating = false;
      });
    } catch (error) {
      this.isGenerating = false;
    }
  }

  private generatePatientPDF(): TDocumentDefinitions {
    if (!this.patientContent) {
      throw new Error('Patient content not initialized');
    }

    const content: any[] = [];
    const lang = this.transloco.getActiveLang();
    const colors = {
      primary: '#3B82F6',
      accent: '#10B981',
      text: '#2C3E50',
      textSecondary: '#5F6476',
      border: '#E8EBF0',
      background: '#F8F9FB',
      noteBackground: '#FEF3C7',
      actionBackground: '#DBEAFE'
    };

    // Logo and Header
    content.push({
      columns: [
        {
          width: '*',
          text: this.patientContent.documentTitle,
          style: 'letterHeader'
        },
        {
          width: 80,
          text: 'Salvus Health',
          style: 'logoText',
          alignment: 'right'
        }
      ]
    });
    content.push({
      canvas: [
        {
          type: 'line',
          x1: 0,
          y1: 5,
          x2: 515,
          y2: 5,
          lineWidth: 1,
          lineColor: colors.border
        }
      ],
      margin: [0, 10, 0, 15]
    });

    // Date
    const date = new Date().toLocaleDateString(lang === 'nl' ? 'nl-BE' : lang === 'fr' ? 'fr-BE' : 'en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    content.push({
      text: date,
      style: 'dateText'
    });
    content.push({ text: '', margin: [0, 20, 0, 0] });

    // Salutation
    content.push({
      text: this.patientContent.salutation,
      style: 'bodyText'
    });
    content.push({ text: '', margin: [0, 10, 0, 0] });

    // Introduction
    content.push({
      text: this.patientContent.introText,
      style: 'bodyText',
      alignment: 'justify'
    });
    content.push({ text: '', margin: [0, 16, 0, 0] });

    // Recommendations Section
    if (this.patientContent.recommendations.length > 0) {
      content.push({
        text: this.patientContent.recommendationsHeading,
        style: 'sectionHeading'
      });
      content.push({ text: '', margin: [0, 12, 0, 0] });

      // Group recommendations by context (medication)
      const groupedRecs = new Map<string, { text: string; action?: string; isActionOnly?: boolean }[]>();
      const recsWithoutContext: { text: string; action?: string; isActionOnly?: boolean }[] = [];

      this.patientContent.recommendations.forEach(rec => {
        const item = { text: rec.text, action: rec.action, isActionOnly: rec.isActionOnly };
        if (rec.context) {
          if (!groupedRecs.has(rec.context)) {
            groupedRecs.set(rec.context, []);
          }
          groupedRecs.get(rec.context)!.push(item);
        } else {
          recsWithoutContext.push(item);
        }
      });

      // Render recommendations without context as general items first
      if (recsWithoutContext.length > 0) {
        const generalLabel = lang === 'nl' ? 'Algemene Aanbevelingen' : lang === 'fr' ? 'Recommandations Générales' : 'General Recommendations';
        content.push(this.createPatientRecommendationCard(generalLabel, recsWithoutContext, colors, lang));
      }

      // Render grouped recommendations as medication cards
      groupedRecs.forEach((items, medicationName) => {
        content.push(this.createPatientRecommendationCard(medicationName, items, colors, lang));
      });
    }

    // Closing
    content.push({
      text: this.patientContent.closingText,
      style: 'bodyText',
      alignment: 'justify',
      margin: [0, 8, 0, 0]
    });
    content.push({ text: '', margin: [0, 20, 0, 0] });

    // Sign-off
    content.push({
      text: this.patientContent.signOff,
      style: 'bodyText'
    });

    // Pharmacist name
    if (this.patientContent.pharmacistName) {
      content.push({ text: '', margin: [0, 8, 0, 0] });
      content.push({
        text: this.patientContent.pharmacistName,
        style: 'pharmacistName'
      });
    }

    return {
      content,
      styles: this.getPatientStyles(),
      pageMargins: [60, 60, 60, 60],
      defaultStyle: {
        font: 'Roboto',
        fontSize: 10,
        lineHeight: 1.4
      }
    };
  }

  /**
   * Creates a styled recommendation card for patient summary
   */
  private createPatientRecommendationCard(
    title: string,
    items: { text: string; action?: string; isActionOnly?: boolean }[],
    colors: any,
    lang: string
  ): any {
    const stack: any[] = [];

    // Card header with accent bar
    stack.push({
      columns: [
        {
          canvas: [
            {
              type: 'rect',
              x: 0, y: 0,
              w: 4, h: 20,
              color: colors.primary
            }
          ],
          width: 8
        },
        {
          text: title,
          style: 'cardTitle',
          margin: [8, 2, 0, 0]
        }
      ],
      margin: [0, 0, 0, 10]
    });

    // Render each recommendation item
    items.forEach((item, index) => {
      if (index > 0) {
        stack.push({
          canvas: [{ type: 'line', x1: 0, y1: 0, x2: 435, y2: 0, lineWidth: 0.5, lineColor: colors.border }],
          margin: [0, 8, 0, 8]
        });
      }

      // Note text (if not action-only)
      if (!item.isActionOnly && item.text) {
        const noteLabel = lang === 'nl' ? 'Opmerking:' : lang === 'fr' ? 'Remarque:' : 'Note:';
        stack.push({
          table: {
            widths: ['*'],
            body: [[{
              stack: [
                { text: noteLabel, style: 'itemLabel', margin: [0, 0, 0, 3] },
                { text: item.text, style: 'itemText' }
              ],
              margin: [10, 8, 10, 8]
            }]]
          },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: () => 0,
            fillColor: () => colors.noteBackground
          },
          margin: [0, 0, 0, 6]
        });
      }

      // Action/tip (if present)
      if (item.action) {
        const actionLabel = lang === 'nl' ? 'Tip:' : lang === 'fr' ? 'Conseil:' : 'Tip:';
        stack.push({
          table: {
            widths: ['*'],
            body: [[{
              stack: [
                { text: actionLabel, style: 'itemLabel', margin: [0, 0, 0, 3] },
                { text: item.action, style: 'itemText' }
              ],
              margin: [10, 8, 10, 8]
            }]]
          },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: () => 0,
            fillColor: () => colors.actionBackground
          },
          margin: [0, 0, 0, 0]
        });
      }
    });

    return {
      table: {
        widths: ['*'],
        body: [[{ stack, margin: [14, 14, 14, 14] }]]
      },
      layout: {
        hLineWidth: () => 1,
        vLineWidth: () => 1,
        hLineColor: () => colors.border,
        vLineColor: () => colors.border,
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0
      },
      margin: [0, 0, 0, 12]
    };
  }

  private generateDoctorPDF(): TDocumentDefinitions {
    if (!this.doctorContent) {
      throw new Error('Doctor content not initialized');
    }

    const content: any[] = [];
    const lang = this.transloco.getActiveLang();
    const colors = {
      primary: '#4A90A4',
      accent: '#6B7280',
      text: '#2C3E50',
      textSecondary: '#5F6476',
      border: '#E8EBF0',
      background: '#F8F9FB',
      noteBackground: '#FFF9E6',
      actionBackground: '#E8F4F8'
    };

    // Logo and Header
    content.push({
      columns: [
        {
          width: '*',
          text: this.doctorContent.documentTitle,
          style: 'letterHeader'
        },
        {
          width: 80,
          text: 'Salvus Health',
          style: 'logoText',
          alignment: 'right'
        }
      ]
    });
    content.push({
      canvas: [
        {
          type: 'line',
          x1: 0,
          y1: 5,
          x2: 515,
          y2: 5,
          lineWidth: 1,
          lineColor: colors.border
        }
      ],
      margin: [0, 10, 0, 15]
    });

    // Date
    const date = new Date().toLocaleDateString(lang === 'nl' ? 'nl-BE' : lang === 'fr' ? 'fr-BE' : 'en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    content.push({
      text: date,
      style: 'dateText'
    });
    content.push({ text: '', margin: [0, 20, 0, 0] });

    // Patient info - anonymous for MVP
    let patientRef = 'Betreft: Patiënt';
    if (lang === 'fr') patientRef = 'Concernant : Patient(e)';
    else if (lang === 'en') patientRef = 'Regarding: Patient';

    content.push({
      table: {
        widths: ['*'],
        body: [[{ text: patientRef, style: 'patientReference', margin: [8, 6, 8, 6] }]]
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        fillColor: () => colors.background
      },
      margin: [0, 0, 0, 15]
    });

    // Salutation
    content.push({
      text: this.doctorContent.salutation,
      style: 'bodyText'
    });
    content.push({ text: '', margin: [0, 10, 0, 0] });

    // Introduction
    content.push({
      text: this.doctorContent.introText,
      style: 'bodyText',
      alignment: 'justify'
    });
    content.push({ text: '', margin: [0, 16, 0, 0] });

    // Observations Section
    if (this.doctorContent.observations.length > 0) {
      content.push({
        text: this.doctorContent.observationsHeading,
        style: 'sectionHeading'
      });
      content.push({ text: '', margin: [0, 12, 0, 0] });

      // Group observations by context (medication)
      const groupedObs = new Map<string, { text: string; action?: string; isActionOnly?: boolean }[]>();
      const obsWithoutContext: { text: string; action?: string; isActionOnly?: boolean }[] = [];

      this.doctorContent.observations.forEach(obs => {
        const item = { text: obs.text, action: obs.action, isActionOnly: obs.isActionOnly };
        if (obs.context) {
          if (!groupedObs.has(obs.context)) {
            groupedObs.set(obs.context, []);
          }
          groupedObs.get(obs.context)!.push(item);
        } else {
          obsWithoutContext.push(item);
        }
      });

      // Render observations without context as general items first
      if (obsWithoutContext.length > 0) {
        const generalLabel = lang === 'nl' ? 'Algemene Observaties' : lang === 'fr' ? 'Observations Générales' : 'General Observations';
        content.push(this.createObservationCard(generalLabel, obsWithoutContext, colors, lang));
      }

      // Render grouped observations as medication cards
      groupedObs.forEach((items, medicationName) => {
        content.push(this.createObservationCard(medicationName, items, colors, lang));
      });
    }

    // Closing
    content.push({
      text: this.doctorContent.closingText,
      style: 'bodyText',
      alignment: 'justify',
      margin: [0, 8, 0, 0]
    });
    content.push({ text: '', margin: [0, 20, 0, 0] });

    // Sign-off
    content.push({
      text: this.doctorContent.signOff,
      style: 'bodyText'
    });

    // Pharmacist name
    if (this.doctorContent.pharmacistName) {
      content.push({ text: '', margin: [0, 8, 0, 0] });
      content.push({
        text: this.doctorContent.pharmacistName,
        style: 'pharmacistName'
      });
    }

    return {
      content,
      styles: this.getDoctorStyles(),
      pageMargins: [60, 60, 60, 60],
      defaultStyle: {
        font: 'Roboto',
        fontSize: 10,
        lineHeight: 1.4
      }
    };
  }

  /**
   * Creates a styled observation card for doctor summary
   */
  private createObservationCard(
    title: string,
    items: { text: string; action?: string; isActionOnly?: boolean }[],
    colors: any,
    lang: string
  ): any {
    const stack: any[] = [];

    // Card header with accent bar
    stack.push({
      columns: [
        {
          canvas: [
            {
              type: 'rect',
              x: 0, y: 0,
              w: 4, h: 20,
              color: colors.primary
            }
          ],
          width: 8
        },
        {
          text: title,
          style: 'cardTitle',
          margin: [8, 2, 0, 0]
        }
      ],
      margin: [0, 0, 0, 10]
    });

    // Render each observation item
    items.forEach((item, index) => {
      if (index > 0) {
        stack.push({
          canvas: [{ type: 'line', x1: 0, y1: 0, x2: 435, y2: 0, lineWidth: 0.5, lineColor: colors.border }],
          margin: [0, 8, 0, 8]
        });
      }

      // Note text (if not action-only)
      if (!item.isActionOnly && item.text) {
        const noteLabel = lang === 'nl' ? 'Observatie:' : lang === 'fr' ? 'Observation:' : 'Observation:';
        stack.push({
          table: {
            widths: ['*'],
            body: [[{
              stack: [
                { text: noteLabel, style: 'itemLabel', margin: [0, 0, 0, 3] },
                { text: item.text, style: 'itemText' }
              ],
              margin: [10, 8, 10, 8]
            }]]
          },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: () => 0,
            fillColor: () => colors.noteBackground
          },
          margin: [0, 0, 0, 6]
        });
      }

      // Action/suggestion (if present)
      if (item.action) {
        const actionLabel = lang === 'nl' ? 'Suggestie:' : lang === 'fr' ? 'Suggestion:' : 'Suggestion:';
        stack.push({
          table: {
            widths: ['*'],
            body: [[{
              stack: [
                { text: actionLabel, style: 'itemLabel', margin: [0, 0, 0, 3] },
                { text: item.action, style: 'itemText' }
              ],
              margin: [10, 8, 10, 8]
            }]]
          },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: () => 0,
            fillColor: () => colors.actionBackground
          },
          margin: [0, 0, 0, 0]
        });
      }
    });

    return {
      table: {
        widths: ['*'],
        body: [[{ stack, margin: [14, 14, 14, 14] }]]
      },
      layout: {
        hLineWidth: () => 1,
        vLineWidth: () => 1,
        hLineColor: () => colors.border,
        vLineColor: () => colors.border,
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0
      },
      margin: [0, 0, 0, 12]
    };
  }

  private generatePharmacyPDF(): TDocumentDefinitions {
    if (!this.pharmacyContent) {
      throw new Error('Pharmacy content not initialized');
    }

    const content: any[] = [];
    const lang = this.transloco.getActiveLang();
    const colors = {
      primary: '#6B5B95',
      accent: '#5F6476',
      text: '#2C3E50',
      textSecondary: '#5F6476',
      border: '#E8EBF0',
      background: '#F8F9FB',
      noteBackground: '#F0F4F8',
      actionBackground: '#EDE7F6',
      flagPatient: '#E3F2FD',
      flagDoctor: '#FFF3E0'
    };

    // Logo and Header
    content.push({
      columns: [
        {
          width: '*',
          text: this.pharmacyContent.documentTitle,
          style: 'letterHeader'
        },
        {
          width: 80,
          text: 'Salvus Health',
          style: 'logoText',
          alignment: 'right'
        }
      ]
    });
    content.push({
      canvas: [
        {
          type: 'line',
          x1: 0,
          y1: 5,
          x2: 515,
          y2: 5,
          lineWidth: 1,
          lineColor: colors.border
        }
      ],
      margin: [0, 10, 0, 15]
    });

    // Date
    const date = new Date().toLocaleDateString(lang === 'nl' ? 'nl-BE' : lang === 'fr' ? 'fr-BE' : 'en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    content.push({
      text: date,
      style: 'dateText'
    });
    content.push({ text: '', margin: [0, 16, 0, 0] });

    // Internal notice banner
    content.push({
      table: {
        widths: ['*'],
        body: [[{
          text: this.pharmacyContent.internalNotice,
          style: 'internalNotice',
          margin: [12, 10, 12, 10]
        }]]
      },
      layout: {
        hLineWidth: () => 1,
        vLineWidth: () => 1,
        hLineColor: () => colors.primary,
        vLineColor: () => colors.primary,
        fillColor: () => '#F5F3FF'
      },
      margin: [0, 0, 0, 16]
    });

    // Medications Table
    if (this.medications.length > 0) {
      content.push({
        text: this.transloco.translate('pdf.current_medications'),
        style: 'sectionHeading'
      });
      content.push({ text: '', margin: [0, 8, 0, 0] });
      content.push(this.createMedicationScheduleTable());
      content.push({ text: '', margin: [0, 16, 0, 0] });
    }

    // Contraindications
    if (this.contraindications.length > 0) {
      content.push({
        text: this.transloco.translate('tools.contraindications'),
        style: 'sectionHeading'
      });
      content.push({ text: '', margin: [0, 8, 0, 0] });
      
      const ciStack: any[] = this.contraindications.map(ci => ({
        columns: [
          { text: '•', width: 12, color: colors.primary },
          { text: ci.name || ci.contraindicationCode, style: 'listItem' }
        ],
        margin: [0, 2, 0, 2]
      }));
      
      content.push({
        table: {
          widths: ['*'],
          body: [[{ stack: ciStack, margin: [12, 10, 12, 10] }]]
        },
        layout: {
          hLineWidth: () => 1,
          vLineWidth: () => 1,
          hLineColor: () => colors.border,
          vLineColor: () => colors.border,
          fillColor: () => colors.background
        },
        margin: [0, 0, 0, 16]
      });
    }

    // Review Notes Section
    if (this.pharmacyContent.notes.length > 0) {
      content.push({
        text: this.pharmacyContent.reviewNotesHeading,
        style: 'sectionHeading'
      });
      content.push({ text: '', margin: [0, 12, 0, 0] });

      // Group notes by context (medication)
      const groupedNotes = new Map<string, { text: string; action?: string; isActionOnly?: boolean }[]>();
      const notesWithoutContext: { text: string; action?: string; isActionOnly?: boolean }[] = [];

      this.pharmacyContent.notes.forEach(note => {
        const item = { text: note.text, action: note.action, isActionOnly: note.isActionOnly };
        if (note.context) {
          if (!groupedNotes.has(note.context)) {
            groupedNotes.set(note.context, []);
          }
          groupedNotes.get(note.context)!.push(item);
        } else {
          notesWithoutContext.push(item);
        }
      });

      // Render notes without context as general items
      if (notesWithoutContext.length > 0) {
        const generalLabel = lang === 'nl' ? 'Algemene Notities' : lang === 'fr' ? 'Notes Générales' : 'General Notes';
        content.push(this.createPharmacyNoteCard(generalLabel, notesWithoutContext, colors, lang));
      }

      // Render grouped notes as medication cards
      groupedNotes.forEach((items, medicationName) => {
        content.push(this.createPharmacyNoteCard(medicationName, items, colors, lang));
      });
    }

    // Closing
    content.push({
      text: this.pharmacyContent.closingText,
      style: 'bodyText',
      alignment: 'left',
      margin: [0, 8, 0, 0]
    });

    // Pharmacist name
    if (this.pharmacyContent.pharmacistName) {
      content.push({
        text: this.pharmacyContent.pharmacistName,
        style: 'pharmacistName',
        margin: [0, 20, 0, 0]
      });
    }

    return {
      content,
      styles: this.getPharmacyStyles(),
      pageMargins: [60, 60, 60, 60],
      defaultStyle: {
        font: 'Roboto',
        fontSize: 10,
        lineHeight: 1.4
      }
    };
  }

  /**
   * Creates a styled note card for pharmacy summary
   */
  private createPharmacyNoteCard(
    title: string,
    items: { text: string; action?: string; isActionOnly?: boolean }[],
    colors: any,
    lang: string
  ): any {
    const stack: any[] = [];

    // Card header with accent bar
    stack.push({
      columns: [
        {
          canvas: [
            {
              type: 'rect',
              x: 0, y: 0,
              w: 4, h: 20,
              color: colors.primary
            }
          ],
          width: 8
        },
        {
          text: title,
          style: 'cardTitle',
          margin: [8, 2, 0, 0]
        }
      ],
      margin: [0, 0, 0, 10]
    });

    // Render each note item
    items.forEach((item, index) => {
      if (index > 0) {
        stack.push({
          canvas: [{ type: 'line', x1: 0, y1: 0, x2: 435, y2: 0, lineWidth: 0.5, lineColor: colors.border }],
          margin: [0, 8, 0, 8]
        });
      }

      // Note text (if not action-only)
      if (!item.isActionOnly && item.text) {
        const noteLabel = lang === 'nl' ? 'Notitie:' : lang === 'fr' ? 'Note:' : 'Note:';
        stack.push({
          table: {
            widths: ['*'],
            body: [[{
              stack: [
                { text: noteLabel, style: 'itemLabel', margin: [0, 0, 0, 3] },
                { text: item.text, style: 'itemText' }
              ],
              margin: [10, 8, 10, 8]
            }]]
          },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: () => 0,
            fillColor: () => colors.noteBackground
          },
          margin: [0, 0, 0, 6]
        });
      }

      // Action (if present)
      if (item.action) {
        const actionLabel = lang === 'nl' ? 'Actie:' : lang === 'fr' ? 'Action:' : 'Action:';
        stack.push({
          table: {
            widths: ['*'],
            body: [[{
              stack: [
                { text: actionLabel, style: 'itemLabel', margin: [0, 0, 0, 3] },
                { text: item.action, style: 'itemText' }
              ],
              margin: [10, 8, 10, 8]
            }]]
          },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: () => 0,
            fillColor: () => colors.actionBackground
          },
          margin: [0, 0, 0, 0]
        });
      }
    });

    return {
      table: {
        widths: ['*'],
        body: [[{ stack, margin: [14, 14, 14, 14] }]]
      },
      layout: {
        hLineWidth: () => 1,
        vLineWidth: () => 1,
        hLineColor: () => colors.border,
        vLineColor: () => colors.border,
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0
      },
      margin: [0, 0, 0, 12]
    };
  }

  private createMedicationScheduleTable(): any {
    const tableBody: any[] = [
      [
        { text: this.transloco.translate('pdf.medication'), style: 'tableHeader' },
        { text: this.transloco.translate('medication.breakfast'), style: 'tableHeader' },
        { text: this.transloco.translate('medication.lunch'), style: 'tableHeader' },
        { text: this.transloco.translate('medication.dinner'), style: 'tableHeader' },
        { text: this.transloco.translate('medication.bedtime'), style: 'tableHeader' }
      ]
    ];

    this.medications.forEach(med => {
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
        { text: med.name || 'Unknown', fontSize: 9 },
        { text: morning, fontSize: 9, alignment: 'center' },
        { text: noon, fontSize: 9, alignment: 'center' },
        { text: evening, fontSize: 9, alignment: 'center' },
        { text: bedtime, fontSize: 9, alignment: 'center' }
      ]);
    });

    return {
      table: {
        headerRows: 1,
        widths: ['*', 'auto', 'auto', 'auto', 'auto'],
        body: tableBody
      },
      layout: {
        hLineWidth: (i: number, node: any) => i === 0 || i === node.table.body.length ? 1.5 : 0.5,
        vLineWidth: () => 0.5,
        hLineColor: (i: number, node: any) => i === 0 || i === node.table.body.length ? '#5F6476' : '#E8EBF0',
        vLineColor: () => '#E8EBF0',
        paddingLeft: () => 10,
        paddingRight: () => 10,
        paddingTop: () => 8,
        paddingBottom: () => 8,
        fillColor: (i: number) => i === 0 ? '#5F6476' : (i % 2 === 0 ? '#F8F9FB' : null)
      }
    };
  }

  private getPatientPart1Actions(): Array<{ label: string, value: string }> {
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
      const answer = this.questionAnswers.find(qa => qa.questionName === field.key);
      if (answer && answer.value && answer.value.trim() && answer.shareWithPatient) {
        actions.push({
          label: field.label || field.key,
          value: answer.value
        });
      }
    });
    
    return actions;
  }

  private getDoctorPart1Actions(): Array<{ label: string, value: string }> {
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
      const answer = this.questionAnswers.find(qa => qa.questionName === field.key);
      if (answer && answer.value && answer.value.trim() && answer.shareWithDoctor) {
        actions.push({
          label: field.label || field.key,
          value: answer.value
        });
      }
    });
    
    return actions;
  }

  private getPharmacyPart1Actions(): Array<{ label: string, value: string }> {
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
      const answer = this.questionAnswers.find(qa => qa.questionName === field.key);
      if (answer && answer.value && answer.value.trim()) {
        actions.push({
          label: field.label || field.key,
          value: answer.value
        });
      }
    });
    
    return actions;
  }

  private groupNotesByMedication(notes: ReviewNote[]): {
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

  private getPatientStyles(): any {
    return {
      letterHeader: {
        fontSize: 16,
        bold: true,
        color: '#2C3E50',
        margin: [0, 0, 0, 0]
      },
      logoText: {
        fontSize: 9,
        color: '#5F6476',
        italics: true,
        margin: [0, 2, 0, 0]
      },
      dateText: {
        fontSize: 10,
        color: '#7F8C9F',
        margin: [0, 0, 0, 0]
      },
      patientReference: {
        fontSize: 10,
        bold: true,
        color: '#454B60',
        margin: [0, 0, 0, 0],
        background: '#F8F9FB',
        padding: [8, 4, 8, 4]
      },
      bodyText: {
        fontSize: 10,
        color: '#2C3E50',
        lineHeight: 1.6
      },
      sectionHeading: {
        fontSize: 12,
        bold: true,
        color: '#2C3E50',
        margin: [0, 0, 0, 0]
      },
      cardTitle: {
        fontSize: 11,
        bold: true,
        color: '#2C3E50'
      },
      itemLabel: {
        fontSize: 8,
        bold: true,
        color: '#5F6476',
        margin: [0, 0, 0, 0]
      },
      itemText: {
        fontSize: 10,
        color: '#2C3E50',
        lineHeight: 1.5
      },
      pharmacistName: {
        fontSize: 10,
        bold: true,
        color: '#2C3E50'
      }
    };
  }

  private getDoctorStyles(): any {
    return {
      letterHeader: {
        fontSize: 16,
        bold: true,
        color: '#2C3E50',
        margin: [0, 0, 0, 0]
      },
      logoText: {
        fontSize: 9,
        color: '#5F6476',
        italics: true,
        margin: [0, 2, 0, 0]
      },
      dateText: {
        fontSize: 10,
        color: '#7F8C9F',
        margin: [0, 0, 0, 0]
      },
      patientReference: {
        fontSize: 10,
        bold: true,
        color: '#454B60'
      },
      bodyText: {
        fontSize: 10,
        color: '#2C3E50',
        lineHeight: 1.6
      },
      sectionHeading: {
        fontSize: 12,
        bold: true,
        color: '#2C3E50',
        margin: [0, 0, 0, 0]
      },
      cardTitle: {
        fontSize: 11,
        bold: true,
        color: '#2C3E50'
      },
      itemLabel: {
        fontSize: 8,
        bold: true,
        color: '#5F6476',
        characterSpacing: 0.5
      },
      itemText: {
        fontSize: 10,
        color: '#2C3E50',
        lineHeight: 1.5
      },
      pharmacistName: {
        fontSize: 10,
        bold: true,
        color: '#2C3E50'
      },
      listItem: {
        fontSize: 10,
        color: '#2C3E50',
        lineHeight: 1.6,
        margin: [0, 3, 0, 3]
      }
    };
  }

  private getPharmacyStyles(): any {
    return {
      letterHeader: {
        fontSize: 16,
        bold: true,
        color: '#2C3E50',
        margin: [0, 0, 0, 0]
      },
      logoText: {
        fontSize: 9,
        color: '#5F6476',
        italics: true,
        margin: [0, 2, 0, 0]
      },
      dateText: {
        fontSize: 10,
        color: '#7F8C9F',
        margin: [0, 0, 0, 0]
      },
      internalNotice: {
        fontSize: 10,
        color: '#6B5B95',
        italics: true,
        lineHeight: 1.5
      },
      bodyText: {
        fontSize: 10,
        color: '#2C3E50',
        lineHeight: 1.6
      },
      sectionHeading: {
        fontSize: 12,
        bold: true,
        color: '#2C3E50',
        margin: [0, 0, 0, 0]
      },
      cardTitle: {
        fontSize: 11,
        bold: true,
        color: '#2C3E50'
      },
      itemLabel: {
        fontSize: 8,
        bold: true,
        color: '#5F6476',
        characterSpacing: 0.5
      },
      itemText: {
        fontSize: 10,
        color: '#2C3E50',
        lineHeight: 1.5
      },
      pharmacistName: {
        fontSize: 10,
        bold: true,
        color: '#2C3E50'
      },
      listItem: {
        fontSize: 10,
        color: '#2C3E50',
        lineHeight: 1.6,
        margin: [0, 3, 0, 3]
      },
      tableHeader: {
        fontSize: 9,
        bold: true,
        color: '#FFFFFF',
        fillColor: '#5F6476'
      }
    };
  }
}
