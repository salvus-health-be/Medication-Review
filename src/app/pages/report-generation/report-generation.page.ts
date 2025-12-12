import { Component, inject, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
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
  styleUrls: ['./report-generation.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReportGenerationPage implements OnInit {
  private router = inject(Router);
  private stateService = inject(StateService);
  private apiService = inject(ApiService);
  private transloco = inject(TranslocoService);
  private pdfService = inject(PdfGenerationService);
  private cdr = inject(ChangeDetectorRef);

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
    this.cdr.markForCheck();
  }

  private loadReportData() {
    this.isLoadingData = true;
    const apbNumber = this.stateService.apbNumber;
    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) {
      this.isLoadingData = false;
      this.cdr.markForCheck();
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
      this.cdr.markForCheck();
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
      originalIndex: Date.now() // Use timestamp for unique stable tracking
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
    this.cdr.markForCheck();
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
    this.cdr.markForCheck();
  }

  generateAndDownloadPDF() {
    if (!this.activeTool) return;

    this.isGenerating = true;
    this.cdr.markForCheck();

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
          this.cdr.markForCheck();
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
        this.cdr.markForCheck();
      });
    } catch (error) {
      this.isGenerating = false;
      this.cdr.markForCheck();
    }
  }

  private generatePatientPDF(): TDocumentDefinitions {
    if (!this.patientContent) {
      throw new Error('Patient content not initialized');
    }

    const lang = this.transloco.getActiveLang();
    const date = new Date().toLocaleDateString(lang === 'nl' ? 'nl-BE' : lang === 'fr' ? 'fr-BE' : 'en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // Group recommendations by context
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

    const content: any[] = [];

    // Build recommendation sections
    const recommendationContent: any[] = [];
    
    if (recsWithoutContext.length > 0) {
      const generalLabel = lang === 'nl' ? 'Algemene aanbevelingen' : lang === 'fr' ? 'Recommandations générales' : 'General recommendations';
      recommendationContent.push(this.createProfessionalSection(generalLabel, recsWithoutContext, lang, 'patient'));
    }

    groupedRecs.forEach((items, medicationName) => {
      recommendationContent.push(this.createProfessionalSection(medicationName, items, lang, 'patient'));
    });

    // Letter body
    content.push({
      text: this.patientContent.salutation,
      style: 'salutation',
      margin: [0, 0, 0, 16]
    });

    content.push({
      text: this.patientContent.introText,
      style: 'bodyText',
      alignment: 'justify',
      margin: [0, 0, 0, 24]
    });

    // Recommendations
    if (recommendationContent.length > 0) {
      content.push({
        text: this.patientContent.recommendationsHeading,
        style: 'sectionTitle',
        margin: [0, 0, 0, 16]
      });
      
      recommendationContent.forEach(section => content.push(section));
    }

    // Closing
    content.push({
      text: this.patientContent.closingText,
      style: 'bodyText',
      alignment: 'justify',
      margin: [0, 24, 0, 32]
    });

    content.push({
      text: this.patientContent.signOff,
      style: 'bodyText',
      margin: [0, 0, 0, 8]
    });

    if (this.patientContent.pharmacistName) {
      content.push({
        text: this.patientContent.pharmacistName,
        style: 'signature'
      });
    }

    return {
      pageSize: 'A4',
      pageMargins: [56, 120, 56, 80],
      header: this.createProfessionalHeader(this.patientContent.documentTitle, date),
      footer: (currentPage: number, pageCount: number) => this.createProfessionalFooter(currentPage, pageCount, lang),
      content,
      styles: this.getProfessionalStyles(),
      defaultStyle: {
        font: 'Roboto',
        fontSize: 10.5,
        lineHeight: 1.5,
        color: '#2D3748'
      }
    };
  }

  private generateDoctorPDF(): TDocumentDefinitions {
    if (!this.doctorContent) {
      throw new Error('Doctor content not initialized');
    }

    const lang = this.transloco.getActiveLang();
    const date = new Date().toLocaleDateString(lang === 'nl' ? 'nl-BE' : lang === 'fr' ? 'fr-BE' : 'en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // Patient reference
    let patientRef = lang === 'nl' ? 'Betreft: Medicatiebeoordeling patiënt' : 
                     lang === 'fr' ? 'Concernant: Revue de médication patient' : 
                     'Re: Patient medication review';

    // Group observations by context
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

    const content: any[] = [];

    // Reference line
    content.push({
      text: patientRef,
      style: 'reference',
      margin: [0, 0, 0, 20]
    });

    // Salutation
    content.push({
      text: this.doctorContent.salutation,
      style: 'salutation',
      margin: [0, 0, 0, 16]
    });

    // Introduction
    content.push({
      text: this.doctorContent.introText,
      style: 'bodyText',
      alignment: 'justify',
      margin: [0, 0, 0, 24]
    });

    // Observations section
    if (this.doctorContent.observations.length > 0) {
      content.push({
        text: this.doctorContent.observationsHeading,
        style: 'sectionTitle',
        margin: [0, 0, 0, 16]
      });

      if (obsWithoutContext.length > 0) {
        const generalLabel = lang === 'nl' ? 'Algemene observaties' : lang === 'fr' ? 'Observations générales' : 'General observations';
        content.push(this.createProfessionalSection(generalLabel, obsWithoutContext, lang, 'doctor'));
      }

      groupedObs.forEach((items, medicationName) => {
        content.push(this.createProfessionalSection(medicationName, items, lang, 'doctor'));
      });
    }

    // Closing
    content.push({
      text: this.doctorContent.closingText,
      style: 'bodyText',
      alignment: 'justify',
      margin: [0, 24, 0, 32]
    });

    content.push({
      text: this.doctorContent.signOff,
      style: 'bodyText',
      margin: [0, 0, 0, 8]
    });

    if (this.doctorContent.pharmacistName) {
      content.push({
        text: this.doctorContent.pharmacistName,
        style: 'signature'
      });
    }

    return {
      pageSize: 'A4',
      pageMargins: [56, 120, 56, 80],
      header: this.createProfessionalHeader(this.doctorContent.documentTitle, date),
      footer: (currentPage: number, pageCount: number) => this.createProfessionalFooter(currentPage, pageCount, lang),
      content,
      styles: this.getProfessionalStyles(),
      defaultStyle: {
        font: 'Roboto',
        fontSize: 10.5,
        lineHeight: 1.5,
        color: '#2D3748'
      }
    };
  }

  private generatePharmacyPDF(): TDocumentDefinitions {
    if (!this.pharmacyContent) {
      throw new Error('Pharmacy content not initialized');
    }

    const lang = this.transloco.getActiveLang();
    const date = new Date().toLocaleDateString(lang === 'nl' ? 'nl-BE' : lang === 'fr' ? 'fr-BE' : 'en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // Group notes by context
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

    const content: any[] = [];

    // Internal document notice
    content.push({
      table: {
        widths: ['*'],
        body: [[{
          text: [
            { text: '⚕ ', fontSize: 12 },
            { text: this.pharmacyContent.internalNotice }
          ],
          alignment: 'center',
          margin: [16, 12, 16, 12]
        }]]
      },
      layout: {
        hLineWidth: () => 1,
        vLineWidth: () => 1,
        hLineColor: () => '#CBD5E0',
        vLineColor: () => '#CBD5E0',
        fillColor: () => '#F7FAFC'
      },
      margin: [0, 0, 0, 24]
    });

    // Summary statistics
    const statsContent = this.createSummaryStats(lang);
    if (statsContent) {
      content.push(statsContent);
    }

    // Medications Table
    if (this.medications.length > 0) {
      content.push({
        text: this.transloco.translate('pdf.current_medications'),
        style: 'sectionTitle',
        margin: [0, 0, 0, 12]
      });
      content.push(this.createProfessionalMedicationTable());
      content.push({ text: '', margin: [0, 20, 0, 0] });
    }

    // Contraindications
    if (this.contraindications.length > 0) {
      content.push({
        text: this.transloco.translate('tools.contraindications'),
        style: 'sectionTitle',
        margin: [0, 0, 0, 12]
      });
      
      const ciItems = this.contraindications.map(ci => ci.name || ci.contraindicationCode);
      content.push({
        ul: ciItems,
        style: 'bulletList',
        margin: [0, 0, 0, 20]
      });
    }

    // Review Notes Section
    if (this.pharmacyContent.notes.length > 0) {
      content.push({
        text: this.pharmacyContent.reviewNotesHeading,
        style: 'sectionTitle',
        margin: [0, 0, 0, 16]
      });

      if (notesWithoutContext.length > 0) {
        const generalLabel = lang === 'nl' ? 'Algemene notities' : lang === 'fr' ? 'Notes générales' : 'General notes';
        content.push(this.createProfessionalSection(generalLabel, notesWithoutContext, lang, 'pharmacy'));
      }

      groupedNotes.forEach((items, medicationName) => {
        content.push(this.createProfessionalSection(medicationName, items, lang, 'pharmacy'));
      });
    }

    // Closing
    content.push({
      text: this.pharmacyContent.closingText,
      style: 'bodyText',
      italics: true,
      margin: [0, 24, 0, 16]
    });

    if (this.pharmacyContent.pharmacistName) {
      content.push({
        text: this.pharmacyContent.pharmacistName,
        style: 'signature'
      });
    }

    return {
      pageSize: 'A4',
      pageMargins: [56, 120, 56, 80],
      header: this.createProfessionalHeader(this.pharmacyContent.documentTitle, date),
      footer: (currentPage: number, pageCount: number) => this.createProfessionalFooter(currentPage, pageCount, lang),
      content,
      styles: this.getProfessionalStyles(),
      defaultStyle: {
        font: 'Roboto',
        fontSize: 10.5,
        lineHeight: 1.5,
        color: '#2D3748'
      }
    };
  }

  // ============================================================================
  // Professional PDF Helper Methods
  // ============================================================================

  private createProfessionalHeader(title: string, date: string): any {
    return {
      margin: [56, 30, 56, 0],
      stack: [
        {
          columns: [
            {
              width: '*',
              stack: [
                { text: title, style: 'documentTitle' },
                { text: date, style: 'documentDate', margin: [0, 4, 0, 0] }
              ]
            },
            {
              width: 'auto',
              stack: [
                { text: 'SALVUS', style: 'brandName' },
                { text: 'Health', style: 'brandTagline' }
              ],
              alignment: 'right'
            }
          ]
        },
        {
          canvas: [
            { type: 'line', x1: 0, y1: 12, x2: 483, y2: 12, lineWidth: 1, lineColor: '#E2E8F0' },
            { type: 'line', x1: 0, y1: 14, x2: 80, y2: 14, lineWidth: 2, lineColor: '#9DC9A2' }
          ]
        }
      ]
    };
  }

  private createProfessionalFooter(currentPage: number, pageCount: number, lang: string): any {
    const confidentialText = lang === 'nl' ? 'Vertrouwelijk document' : 
                             lang === 'fr' ? 'Document confidentiel' : 
                             'Confidential document';
    
    return {
      margin: [56, 20, 56, 0],
      stack: [
        {
          canvas: [
            { type: 'line', x1: 0, y1: 0, x2: 483, y2: 0, lineWidth: 0.5, lineColor: '#E2E8F0' }
          ]
        },
        {
          columns: [
            { text: confidentialText, style: 'footerText', width: '*' },
            { text: `${currentPage} / ${pageCount}`, style: 'footerText', alignment: 'right', width: 'auto' }
          ],
          margin: [0, 8, 0, 0]
        }
      ]
    };
  }

  private createProfessionalSection(
    title: string,
    items: { text: string; action?: string; isActionOnly?: boolean }[],
    lang: string,
    type: 'patient' | 'doctor' | 'pharmacy'
  ): any {
    const noteLabel = type === 'doctor' 
      ? (lang === 'nl' ? 'Observatie' : lang === 'fr' ? 'Observation' : 'Observation')
      : (lang === 'nl' ? 'Opmerking' : lang === 'fr' ? 'Remarque' : 'Note');
    
    const actionLabel = type === 'doctor'
      ? (lang === 'nl' ? 'Suggestie' : lang === 'fr' ? 'Suggestion' : 'Suggestion')
      : type === 'patient'
      ? (lang === 'nl' ? 'Aanbeveling' : lang === 'fr' ? 'Recommandation' : 'Recommendation')
      : (lang === 'nl' ? 'Actie' : lang === 'fr' ? 'Action' : 'Action');

    const tableBody: any[][] = [];

    items.forEach((item, index) => {
      if (index > 0) {
        tableBody.push([{ text: '', colSpan: 2, border: [false, true, false, false], borderColor: ['', '#E2E8F0', '', ''], margin: [0, 8, 0, 8] }, {}]);
      }

      if (!item.isActionOnly && item.text) {
        tableBody.push([
          { text: noteLabel, style: 'fieldLabel', border: [false, false, false, false], width: 80 },
          { text: item.text, style: 'fieldValue', border: [false, false, false, false] }
        ]);
      }

      if (item.action) {
        tableBody.push([
          { text: actionLabel, style: 'fieldLabelAccent', border: [false, false, false, false], width: 80 },
          { text: item.action, style: 'fieldValue', border: [false, false, false, false] }
        ]);
      }
    });

    if (tableBody.length === 0) return { text: '' };

    return {
      stack: [
        {
          columns: [
            {
              canvas: [{ type: 'rect', x: 0, y: 0, w: 3, h: 16, color: '#9DC9A2' }],
              width: 8
            },
            { text: title, style: 'subsectionTitle', margin: [4, 0, 0, 0] }
          ],
          margin: [0, 0, 0, 12]
        },
        {
          table: {
            widths: [80, '*'],
            body: tableBody
          },
          layout: {
            hLineWidth: (i: number) => tableBody[i] && tableBody[i][0]?.border?.[1] ? 0.5 : 0,
            vLineWidth: () => 0,
            hLineColor: () => '#E2E8F0',
            paddingLeft: () => 12,
            paddingRight: () => 12,
            paddingTop: () => 4,
            paddingBottom: () => 4
          },
          margin: [0, 0, 0, 0]
        }
      ],
      margin: [0, 0, 0, 20]
    };
  }

  private createSummaryStats(lang: string): any {
    const medicationCount = this.medications.length;
    const contraindicationCount = this.contraindications.length;
    const noteCount = this.reviewNotes.length;

    if (medicationCount === 0 && contraindicationCount === 0 && noteCount === 0) {
      return null;
    }

    const medLabel = lang === 'nl' ? 'Medicaties' : lang === 'fr' ? 'Médicaments' : 'Medications';
    const ciLabel = lang === 'nl' ? 'Contra-indicaties' : lang === 'fr' ? 'Contre-indications' : 'Contraindications';
    const notesLabel = lang === 'nl' ? 'Notities' : lang === 'fr' ? 'Notes' : 'Notes';

    return {
      columns: [
        { 
          stack: [
            { text: String(medicationCount), style: 'statNumber' },
            { text: medLabel, style: 'statLabel' }
          ],
          width: '*',
          alignment: 'center'
        },
        {
          stack: [
            { text: String(contraindicationCount), style: 'statNumber' },
            { text: ciLabel, style: 'statLabel' }
          ],
          width: '*',
          alignment: 'center'
        },
        {
          stack: [
            { text: String(noteCount), style: 'statNumber' },
            { text: notesLabel, style: 'statLabel' }
          ],
          width: '*',
          alignment: 'center'
        }
      ],
      margin: [0, 0, 0, 28]
    };
  }

  private createProfessionalMedicationTable(): any {
    const tableBody: any[] = [
      [
        { text: this.transloco.translate('pdf.medication'), style: 'tableHeaderCell' },
        { text: this.transloco.translate('medication.breakfast'), style: 'tableHeaderCell', alignment: 'center' },
        { text: this.transloco.translate('medication.lunch'), style: 'tableHeaderCell', alignment: 'center' },
        { text: this.transloco.translate('medication.dinner'), style: 'tableHeaderCell', alignment: 'center' },
        { text: this.transloco.translate('medication.bedtime'), style: 'tableHeaderCell', alignment: 'center' }
      ]
    ];

    this.medications.forEach((med, index) => {
      const morning = [med.unitsBeforeBreakfast, med.unitsDuringBreakfast]
        .filter(u => u && u > 0)
        .map(u => String(u))
        .join('+') || '—';
      
      const noon = [med.unitsBeforeLunch, med.unitsDuringLunch]
        .filter(u => u && u > 0)
        .map(u => String(u))
        .join('+') || '—';
      
      const evening = [med.unitsBeforeDinner, med.unitsDuringDinner]
        .filter(u => u && u > 0)
        .map(u => String(u))
        .join('+') || '—';
      
      const bedtime = med.unitsAtBedtime && med.unitsAtBedtime > 0 
        ? String(med.unitsAtBedtime) 
        : '—';

      const rowStyle = index % 2 === 0 ? 'tableRowEven' : 'tableRowOdd';

      tableBody.push([
        { text: med.name || 'Unknown', style: 'tableCellBold' },
        { text: morning, style: 'tableCell', alignment: 'center' },
        { text: noon, style: 'tableCell', alignment: 'center' },
        { text: evening, style: 'tableCell', alignment: 'center' },
        { text: bedtime, style: 'tableCell', alignment: 'center' }
      ]);
    });

    return {
      table: {
        headerRows: 1,
        widths: ['*', 60, 60, 60, 60],
        body: tableBody
      },
      layout: {
        hLineWidth: (i: number, node: any) => i === 1 ? 1 : 0.5,
        vLineWidth: () => 0,
        hLineColor: (i: number) => i === 1 ? '#454B60' : '#E2E8F0',
        paddingLeft: () => 12,
        paddingRight: () => 12,
        paddingTop: () => 10,
        paddingBottom: () => 10,
        fillColor: (i: number) => i === 0 ? '#454B60' : (i % 2 === 0 ? '#F7FAFC' : null)
      }
    };
  }

  private getProfessionalStyles(): any {
    return {
      documentTitle: {
        fontSize: 18,
        bold: true,
        color: '#1A202C'
      },
      documentDate: {
        fontSize: 10,
        color: '#718096'
      },
      brandName: {
        fontSize: 14,
        bold: true,
        color: '#454B60'
      },
      brandTagline: {
        fontSize: 10,
        color: '#9DC9A2'
      },
      salutation: {
        fontSize: 11,
        color: '#2D3748'
      },
      reference: {
        fontSize: 10,
        bold: true,
        color: '#4A5568',
        background: '#F7FAFC',
        margin: [0, 0, 0, 0]
      },
      bodyText: {
        fontSize: 10.5,
        color: '#2D3748',
        lineHeight: 1.6
      },
      sectionTitle: {
        fontSize: 13,
        bold: true,
        color: '#1A202C'
      },
      subsectionTitle: {
        fontSize: 11,
        bold: true,
        color: '#2D3748'
      },
      fieldLabel: {
        fontSize: 9,
        color: '#718096',
        bold: true
      },
      fieldLabelAccent: {
        fontSize: 9,
        color: '#48BB78',
        bold: true
      },
      fieldValue: {
        fontSize: 10.5,
        color: '#2D3748',
        lineHeight: 1.5
      },
      signature: {
        fontSize: 11,
        bold: true,
        color: '#2D3748'
      },
      footerText: {
        fontSize: 8,
        color: '#A0AEC0'
      },
      bulletList: {
        fontSize: 10.5,
        color: '#2D3748'
      },
      tableHeaderCell: {
        fontSize: 9,
        bold: true,
        color: '#FFFFFF'
      },
      tableCell: {
        fontSize: 10,
        color: '#2D3748'
      },
      tableCellBold: {
        fontSize: 10,
        color: '#2D3748',
        bold: true
      },
      statNumber: {
        fontSize: 24,
        bold: true,
        color: '#454B60'
      },
      statLabel: {
        fontSize: 9,
        color: '#718096'
      }
    };
  }

  // ============================================================================
  // Data Helper Methods
  // ============================================================================

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
}
