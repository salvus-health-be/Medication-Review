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
import { PatientSummaryGenerator } from '../../services/pdf-generators/patient-summary-generator';
import { DoctorSummaryGenerator } from '../../services/pdf-generators/doctor-summary-generator';
import { PharmacySummaryGenerator } from '../../services/pdf-generators/pharmacy-summary-generator';

type ReportTool = 'patient-summary' | 'doctor-summary' | 'pharmacy-summary' | null;

interface EditableRecommendation {
  text: string;
  context?: string;
  originalIndex: number;
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
    
    // Get default salutation with patient name
    const patientName = this.review?.firstNameAtTimeOfReview || 'patiÃ«nt';
    let salutation = `Beste ${patientName},`;
    if (lang === 'fr') salutation = `Cher(e) ${patientName},`;
    else if (lang === 'en') salutation = `Dear ${patientName},`;

    // Get default intro text
    let introText = '';
    if (lang === 'nl') {
      introText = 'Hierbij ontvangt u een samenvatting van ons gesprek over uw medicatie. Dit document bevat belangrijke informatie en aanbevelingen om u te helpen het beste uit uw medicatie te halen.';
    } else if (lang === 'fr') {
      introText = 'Voici un rÃ©sumÃ© de notre conversation sur vos mÃ©dicaments. Ce document contient des informations importantes et des recommandations pour vous aider Ã  tirer le meilleur parti de vos mÃ©dicaments.';
    } else {
      introText = 'This is a summary of our conversation about your medication. This document contains important information and recommendations to help you get the most out of your treatment.';
    }

    // Get Part 1 actions and notes
    const part1Actions = this.getPatientPart1Actions();
    const patientNotes = this.reviewNotes.filter(note => note.discussWithPatient && note.text);
    
    const recommendations: EditableRecommendation[] = [];
    let index = 0;

    // Add Part 1 actions
    part1Actions.forEach(action => {
      recommendations.push({
        text: action.value,
        context: action.label,
        originalIndex: index++
      });
    });

    // Add review notes
    const groupedNotes = this.groupNotesByMedication(patientNotes);
    groupedNotes.general.forEach(note => {
      const commentKey = `note_comment_${note.rowKey}`;
      const commentAnswer = this.questionAnswers.find(qa => qa.questionName === commentKey);
      const text = commentAnswer?.value || note.text || '';
      if (text) {
        recommendations.push({ text, originalIndex: index++ });
      }
    });

    groupedNotes.byMedication.forEach(group => {
      group.notes.forEach(note => {
        const commentKey = `note_comment_${note.rowKey}`;
        const commentAnswer = this.questionAnswers.find(qa => qa.questionName === commentKey);
        const text = commentAnswer?.value || note.text || '';
        if (text) {
          recommendations.push({
            text,
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
      closingText = 'Avez-vous des questions sur ces informations ? N\'hÃ©sitez pas Ã  nous contacter. Nous sommes toujours lÃ  pour vous aider.';
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
    if (lang === 'fr') salutation = 'Cher collÃ¨gue,';
    else if (lang === 'en') salutation = 'Dear Colleague,';

    // Get default intro text
    let introText = '';
    if (lang === 'nl') {
      introText = 'Hierbij deel ik de bevindingen van een recent uitgevoerd medicatiereview. De volgende observaties kunnen relevant zijn voor de patiÃ«ntenzorg.';
    } else if (lang === 'fr') {
      introText = 'Je partage avec vous les rÃ©sultats d\'un examen de mÃ©dication rÃ©cemment effectuÃ©. Les observations suivantes peuvent Ãªtre pertinentes pour les soins aux patients.';
    } else {
      introText = 'I am sharing the findings from a recent medication review. The following observations may be relevant to patient care.';
    }

    // Get Part 1 actions and notes for doctor
    const part1Actions = this.getDoctorPart1Actions();
    const doctorNotes = this.reviewNotes.filter(note => note.communicateToDoctor && note.text);
    
    const observations: EditableRecommendation[] = [];
    let index = 0;

    // Add Part 1 actions
    part1Actions.forEach(action => {
      observations.push({
        text: action.value,
        context: action.label,
        originalIndex: index++
      });
    });

    // Add review notes
    const groupedNotes = this.groupNotesByMedication(doctorNotes);
    groupedNotes.general.forEach(note => {
      const commentKey = `note_comment_${note.rowKey}`;
      const commentAnswer = this.questionAnswers.find(qa => qa.questionName === commentKey);
      const text = commentAnswer?.value || note.text || '';
      if (text) {
        observations.push({ text, originalIndex: index++ });
      }
    });

    groupedNotes.byMedication.forEach(group => {
      group.notes.forEach(note => {
        const commentKey = `note_comment_${note.rowKey}`;
        const commentAnswer = this.questionAnswers.find(qa => qa.questionName === commentKey);
        const text = commentAnswer?.value || note.text || '';
        if (text) {
          observations.push({
            text,
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
      closingText = 'Je reste Ã  votre disposition pour toute question ou discussion complÃ©mentaire.';
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
      internalNotice = 'RÃ©sumÃ© pharmaceutique interne avec donnÃ©es complÃ¨tes de l\'examen.';
    } else {
      internalNotice = 'Internal pharmaceutical summary with complete review data.';
    }

    // Get all actions and notes
    const part1Actions = this.getPharmacyPart1Actions();
    const allNotes = this.reviewNotes.filter(note => note.text);
    
    const notes: EditableRecommendation[] = [];
    let index = 0;

    // Add Part 1 actions
    part1Actions.forEach(action => {
      notes.push({
        text: action.value,
        context: action.label,
        originalIndex: index++
      });
    });

    // Add review notes with flags
    const groupedNotes = this.groupNotesByMedication(allNotes);
    groupedNotes.general.forEach(note => {
      const commentKey = `note_comment_${note.rowKey}`;
      const commentAnswer = this.questionAnswers.find(qa => qa.questionName === commentKey);
      const text = commentAnswer?.value || note.text || '';
      if (text) {
        let displayText = text;
        if (note.discussWithPatient || note.communicateToDoctor) {
          const flags = [];
          if (note.discussWithPatient) flags.push('[Patient]');
          if (note.communicateToDoctor) flags.push('[Doctor]');
          displayText = `${flags.join(' ')} ${text}`;
        }
        notes.push({ text: displayText, originalIndex: index++ });
      }
    });

    groupedNotes.byMedication.forEach(group => {
      group.notes.forEach(note => {
        const commentKey = `note_comment_${note.rowKey}`;
        const commentAnswer = this.questionAnswers.find(qa => qa.questionName === commentKey);
        const text = commentAnswer?.value || note.text || '';
        if (text) {
          let displayText = text;
          if (note.discussWithPatient || note.communicateToDoctor) {
            const flags = [];
            if (note.discussWithPatient) flags.push('[Patient]');
            if (note.communicateToDoctor) flags.push('[Doctor]');
            displayText = `${flags.join(' ')} ${text}`;
          }
          notes.push({
            text: displayText,
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
          lineColor: '#E8EBF0'
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

    // Patient info
    let prefix = 'Voor: ';
    if (lang === 'fr') prefix = 'Pour : ';
    else if (lang === 'en') prefix = 'For: ';

    const name = [this.review?.firstNameAtTimeOfReview, this.review?.lastNameAtTimeOfReview]
      .filter(Boolean)
      .join(' ') || this.transloco.translate('pdf.unknown_patient');
    
    let dateStr = '';
    if (this.patient?.dateOfBirth) {
      const dob = this.patient.dateOfBirth.split('T')[0];
      dateStr = ` (${this.transloco.translate('patient.birth_date')}: ${dob})`;
    }

    content.push({
      text: `${prefix}${name}${dateStr}`,
      style: 'patientReference'
    });
    content.push({ text: '', margin: [0, 15, 0, 0] });

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
    content.push({ text: '', margin: [0, 12, 0, 0] });

    // Recommendations
    if (this.patientContent.recommendations.length > 0) {
      content.push({
        text: this.patientContent.recommendationsHeading,
        style: 'recommendationsHeading'
      });
      content.push({ text: '', margin: [0, 8, 0, 0] });

      // Group recommendations by context (medication)
      const groupedRecs = new Map<string, string[]>();
      const recsWithoutContext: string[] = [];

      this.patientContent.recommendations.forEach(rec => {
        if (rec.context) {
          if (!groupedRecs.has(rec.context)) {
            groupedRecs.set(rec.context, []);
          }
          groupedRecs.get(rec.context)!.push(rec.text);
        } else {
          recsWithoutContext.push(rec.text);
        }
      });

      const listItems: any[] = [];

      // Add recommendations without context
      recsWithoutContext.forEach(text => {
        listItems.push({
          text,
          style: 'listItem'
        });
      });

      // Add grouped recommendations with nested ul
      groupedRecs.forEach((texts, context) => {
        if (texts.length === 1) {
          // Single item: inline format
          listItems.push({
            text: `${context}: ${texts[0]}`,
            style: 'listItem'
          });
        } else {
          // Multiple items: nested list with proper parent
          listItems.push([
            context + ':',
            {
              ul: texts.map(t => ({
                text: t,
                style: 'listItem'
              })),
              margin: [0, 2, 0, 4]
            }
          ]);
        }
      });

      content.push({
        ul: listItems,
        margin: [20, 0, 0, 0]
      });
      content.push({ text: '', margin: [0, 12, 0, 0] });
    }

    // Closing
    content.push({
      text: this.patientContent.closingText,
      style: 'bodyText',
      alignment: 'justify'
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
        style: 'bodyText'
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

  private generateDoctorPDF(): TDocumentDefinitions {
    if (!this.doctorContent) {
      throw new Error('Doctor content not initialized');
    }

    const content: any[] = [];
    const lang = this.transloco.getActiveLang();

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
          lineColor: '#E8EBF0'
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

    // Patient info
    let prefix = 'Betreft: ';
    if (lang === 'fr') prefix = 'Concernant : ';
    else if (lang === 'en') prefix = 'Regarding: ';

    const name = [this.review?.firstNameAtTimeOfReview, this.review?.lastNameAtTimeOfReview]
      .filter(Boolean)
      .join(' ') || this.transloco.translate('pdf.unknown_patient');
    
    let dateStr = '';
    if (this.patient?.dateOfBirth) {
      const dob = this.patient.dateOfBirth.split('T')[0];
      dateStr = ` (${this.transloco.translate('patient.birth_date')}: ${dob})`;
    }

    content.push({
      text: `${prefix}${name}${dateStr}`,
      style: 'patientReference'
    });
    content.push({ text: '', margin: [0, 15, 0, 0] });

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
    content.push({ text: '', margin: [0, 12, 0, 0] });

    // Observations
    if (this.doctorContent.observations.length > 0) {
      content.push({
        text: this.doctorContent.observationsHeading,
        style: 'observationsHeading'
      });
      content.push({ text: '', margin: [0, 8, 0, 0] });

      // Group observations by context (medication)
      const groupedObs = new Map<string, string[]>();
      const obsWithoutContext: string[] = [];

      this.doctorContent.observations.forEach(obs => {
        if (obs.context) {
          if (!groupedObs.has(obs.context)) {
            groupedObs.set(obs.context, []);
          }
          groupedObs.get(obs.context)!.push(obs.text);
        } else {
          obsWithoutContext.push(obs.text);
        }
      });

      const listItems: any[] = [];

      // Add observations without context
      obsWithoutContext.forEach(text => {
        listItems.push({
          text,
          style: 'listItem'
        });
      });

      // Add grouped observations with nested ul
      groupedObs.forEach((texts, context) => {
        if (texts.length === 1) {
          // Single item: inline format
          listItems.push({
            text: `${context}: ${texts[0]}`,
            style: 'listItem'
          });
        } else {
          // Multiple items: nested list with proper parent
          listItems.push([
            context + ':',
            {
              ul: texts.map(t => ({
                text: t,
                style: 'listItem'
              })),
              margin: [0, 2, 0, 4]
            }
          ]);
        }
      });

      content.push({
        ul: listItems,
        margin: [20, 0, 0, 0]
      });
      content.push({ text: '', margin: [0, 12, 0, 0] });
    }

    // Closing
    content.push({
      text: this.doctorContent.closingText,
      style: 'bodyText',
      alignment: 'justify'
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
        style: 'bodyText'
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

  private generatePharmacyPDF(): TDocumentDefinitions {
    if (!this.pharmacyContent) {
      throw new Error('Pharmacy content not initialized');
    }

    const content: any[] = [];
    const lang = this.transloco.getActiveLang();

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
          lineColor: '#E8EBF0'
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

    // Patient info
    let prefix = 'Voor: ';
    if (lang === 'fr') prefix = 'Pour : ';
    else if (lang === 'en') prefix = 'For: ';

    const name = [this.review?.firstNameAtTimeOfReview, this.review?.lastNameAtTimeOfReview]
      .filter(Boolean)
      .join(' ') || this.transloco.translate('pdf.unknown_patient');
    
    let dateStr = '';
    if (this.patient?.dateOfBirth) {
      const dob = this.patient.dateOfBirth.split('T')[0];
      dateStr = ` (${this.transloco.translate('patient.birth_date')}: ${dob})`;
    }

    content.push({
      text: `${prefix}${name}${dateStr}`,
      style: 'patientReference'
    });
    content.push({ text: '', margin: [0, 15, 0, 0] });

    // Internal notice
    content.push({
      text: this.pharmacyContent.internalNotice,
      style: 'bodyText',
      alignment: 'justify'
    });
    content.push({ text: '', margin: [0, 12, 0, 0] });

    // Medications
    if (this.medications.length > 0) {
      content.push({
        text: this.transloco.translate('pdf.current_medications'),
        style: 'simpleHeading'
      });
      content.push({ text: '', margin: [0, 6, 0, 0] });
      content.push(this.createMedicationScheduleTable());
      content.push({ text: '', margin: [0, 12, 0, 0] });
    }

    // Contraindications
    if (this.contraindications.length > 0) {
      content.push({
        text: this.transloco.translate('tools.contraindications'),
        style: 'simpleHeading'
      });
      content.push({ text: '', margin: [0, 6, 0, 0] });
      const ciList = this.contraindications.map(ci => ({
        text: ci.name || ci.contraindicationCode,
        style: 'listItem'
      }));
      content.push({ ul: ciList, margin: [20, 0, 0, 0] });
      content.push({ text: '', margin: [0, 12, 0, 0] });
    }

    // Notes
    if (this.pharmacyContent.notes.length > 0) {
      content.push({
        text: this.pharmacyContent.reviewNotesHeading,
        style: 'simpleHeading'
      });
      content.push({ text: '', margin: [0, 8, 0, 0] });

      // Group notes by context (medication)
      const groupedNotes = new Map<string, string[]>();
      const notesWithoutContext: string[] = [];

      this.pharmacyContent.notes.forEach(note => {
        if (note.context) {
          if (!groupedNotes.has(note.context)) {
            groupedNotes.set(note.context, []);
          }
          groupedNotes.get(note.context)!.push(note.text);
        } else {
          notesWithoutContext.push(note.text);
        }
      });
      
      groupedNotes.forEach((notes, med) => {
      });

      // Build list items with proper nesting
      const listItems: any[] = [];

      // Add notes without context first
      notesWithoutContext.forEach(text => {
        listItems.push({
          text,
          style: 'listItem'
        });
      });

      // Add grouped notes with medication context using nested ul
      groupedNotes.forEach((notes, medicationName) => {
        if (notes.length === 1) {
          // Single note: display inline
          listItems.push({
            text: `${medicationName}: ${notes[0]}`,
            style: 'listItem'
          });
        } else {
          // Multiple notes: create nested structure with proper parent
          
          listItems.push([
            medicationName + ':',
            {
              ul: notes.map(note => ({
                text: note,
                style: 'indentedNote'
              })),
              margin: [0, 2, 0, 4]
            }
          ]);
        }
      });

      content.push({
        ul: listItems,
        margin: [20, 0, 0, 0]
      });
      content.push({ text: '', margin: [0, 12, 0, 0] });
    }

    // Closing
    content.push({
      text: this.pharmacyContent.closingText,
      style: 'bodyText',
      alignment: 'left'
    });
    content.push({ text: '', margin: [0, 12, 0, 0] });

    // Pharmacist name
    if (this.pharmacyContent.pharmacistName) {
      content.push({
        text: this.pharmacyContent.pharmacistName,
        style: 'bodyText',
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
      recommendationsHeading: {
        fontSize: 11,
        bold: true,
        color: '#454B60',
        margin: [0, 0, 0, 0],
        decoration: 'underline',
        decorationColor: '#E8EBF0'
      },
      listItem: {
        fontSize: 10,
        color: '#2C3E50',
        lineHeight: 1.6,
        margin: [0, 3, 0, 3]
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
      observationsHeading: {
        fontSize: 11,
        bold: true,
        color: '#454B60',
        margin: [0, 0, 0, 0],
        decoration: 'underline',
        decorationColor: '#E8EBF0'
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
      simpleHeading: {
        fontSize: 11,
        bold: true,
        color: '#454B60',
        margin: [0, 0, 0, 0],
        decoration: 'underline',
        decorationColor: '#E8EBF0'
      },
      listItem: {
        fontSize: 10,
        color: '#2C3E50',
        lineHeight: 1.6,
        margin: [0, 3, 0, 3]
      },
      indentedNote: {
        fontSize: 9,
        color: '#454B60',
        lineHeight: 1.5,
        margin: [0, 2, 0, 0]
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
