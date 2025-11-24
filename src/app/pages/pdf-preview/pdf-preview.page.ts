import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AnamnesisePdfService } from '../../services/anamnesis-pdf.service';
import { ReviewNotesService, ReviewNote } from '../../services/review-notes.service';
import { StateService } from '../../services/state.service';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-pdf-preview',
  standalone: true,
  imports: [CommonModule, TranslocoModule],
  templateUrl: './pdf-preview.page.html',
  styleUrls: ['./pdf-preview.page.scss']
})
export class PdfPreviewPage implements OnInit, OnDestroy {
  pdfPreviewUrl: SafeResourceUrl | null = null;
  isLoading = false;
  medications: any[] = [];

  private destroy$ = new Subject<void>();

  constructor(
    private anamnesisePdfService: AnamnesisePdfService,
    private reviewNotesService: ReviewNotesService,
    private stateService: StateService,
    private apiService: ApiService,
    private transloco: TranslocoService,
    private sanitizer: DomSanitizer,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadMedications();
    this.generatePdfPreview();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    
    // Clean up blob URL
    if (this.pdfPreviewUrl) {
      const url = (this.pdfPreviewUrl as any).changingThisBreaksApplicationSecurity;
      if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    }
  }

  loadMedications() {
    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) return;

    this.apiService.getMedications(reviewId).subscribe({
      next: (meds) => {
        this.medications = meds;
      },
      error: (error) => {
      }
    });
  }

  generatePdfPreview() {
    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) {
      return;
    }

    this.isLoading = true;

    // Load notes and generate PDF
    this.reviewNotesService.loadReviewNotes(reviewId);
    
    this.reviewNotesService.notes$
      .pipe(takeUntil(this.destroy$))
      .subscribe(notes => {
        if (notes.length === 0 && this.reviewNotesService.getNotesCount() === 0) {
          return; // Still loading
        }

        if (this.medications.length === 0) {
          return; // Medications not loaded yet
        }

        // Prepare data for PDF generation
        const generalSections = this.prepareGeneralSections(notes);
        const { adherenceNotes, effectivenessNotes } = this.prepareGroupedNotes(notes);

        // Get translated part titles
        const partTitles = {
          part1: this.transloco.translate('pdf.part_1_title'),
          part2: this.transloco.translate('pdf.part_2_title'),
          part3: this.transloco.translate('pdf.part_3_title'),
          part4: this.transloco.translate('pdf.part_4_title')
        };

        // Generate PDF blob
        this.anamnesisePdfService.generatePDF(
          generalSections,
          this.medications,
          adherenceNotes as Record<string, ReviewNote[]>,
          effectivenessNotes as Record<string, ReviewNote[]>,
          true, // preview mode
          partTitles
        ).then(blob => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            // Bypass security without adding fragments that might break iframe rendering
            this.pdfPreviewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
            this.isLoading = false;
          } else {
            this.isLoading = false;
          }
        }).catch(error => {
          this.isLoading = false;
        });
      });
  }

  downloadPdf() {
    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) {
      return;
    }

    // Get current notes from service
    const notes = this.reviewNotesService.getNotes();
    const generalSections = this.prepareGeneralSections(notes);
    const { adherenceNotes, effectivenessNotes } = this.prepareGroupedNotes(notes);

    // Get translated part titles
    const partTitles = {
      part1: this.transloco.translate('pdf.part_1_title'),
      part2: this.transloco.translate('pdf.part_2_title'),
      part3: this.transloco.translate('pdf.part_3_title'),
      part4: this.transloco.translate('pdf.part_4_title')
    };

    // Generate PDF and trigger download
    this.anamnesisePdfService.generatePDF(
      generalSections,
      this.medications,
      adherenceNotes as Record<string, ReviewNote[]>,
      effectivenessNotes as Record<string, ReviewNote[]>,
      false, // download mode
      partTitles
    ).catch(error => {
    });
  }

  navigateToAnamnesis() {
    this.router.navigate(['/anamnesis']);
  }

  private prepareGeneralSections(notes: ReviewNote[]): any[] {
    // Return the standard general sections structure with predefined questions
    return [
      {
        title: 'Bezorgdheden/Ervaringen',
        questions: [
          { text: 'Ervaart de patient de geneesmiddelen als te veel?', type: 'checkbox' },
          { text: 'Ervaart de patient financiele last?', type: 'checkbox' },
          { text: 'Ervaart de patient angst?', type: 'checkbox' },
          { text: 'Ervaart de patient onvoldoende of niet behandelde klachten?', type: 'checkbox-text' },
          { text: 'Zijn er andere bezorgdheden?', type: 'text' }
        ]
      },
      {
        title: 'Medication Intake Assistance',
        questions: [
          { text: 'Heeft de patient hulp bij inname, bijvoorbeeld een pillendoos of partner/familielid?', type: 'checkbox' },
          { text: 'Is extra hulp wenselijk voor de patient?', type: 'checkbox-text' }
        ]
      },
      {
        title: 'Praktische problemen',
        questions: [
          { text: 'Heeft de patient slikproblemen?', type: 'checkbox' },
          { text: 'Heeft de patient beweegstoornissen?', type: 'checkbox' },
          { text: 'Heeft de patient visusstoornissen?', type: 'checkbox' },
          { text: 'Heeft de patient gehoorstoornissen?', type: 'checkbox' },
          { text: 'Heeft de patient cognitieve problemen?', type: 'checkbox' },
          { text: 'Heeft de patient problemen met handvaardigheid?', type: 'checkbox' },
          { text: 'Zijn er andere praktische problemen?', type: 'text' }
        ]
      },
      {
        title: 'Incidenten',
        questions: [
          { text: 'Hoe vaak is de patient in de afgelopen 6 maanden gevallen?', type: 'number' },
          { text: 'Hoe vaak is de patient gehospitaliseerd in het afgelopen jaar?', type: 'number' }
        ]
      },
      {
        title: 'Opvolging/monitoring',
        questions: [
          { text: 'Door welke hulpverleners wordt de patient opgevolgd?', type: 'text-small' },
          { text: 'Door welke hulpverleners worden de parameters opgevolgd?', type: 'text-small' }
        ]
      }
    ];
  }

  private prepareGroupedNotes(notes: ReviewNote[]): { adherenceNotes: Record<string, ReviewNote[]>, effectivenessNotes: Record<string, ReviewNote[]> } {
    const adherenceNotes: Record<string, ReviewNote[]> = {};
    const effectivenessNotes: Record<string, ReviewNote[]> = {};

    // Filter for patient conversation notes only
    const patientNotes = notes.filter(note => note.discussWithPatient === true);

    // Separate general notes (no linkedCnk) and medication-specific notes
    const generalNotes = patientNotes.filter(note => !note.linkedCnk);
    const medicationNotes = patientNotes.filter(note => note.linkedCnk);

    // Build a quick lookup of medications by CNK
    const medsByCnk: Record<string, any> = {};
    this.medications.forEach(m => {
      if (m.cnk != null) medsByCnk[String(m.cnk)] = m;
    });

    // Add general notes to appropriate sections
    generalNotes.forEach(note => {
      // Therapy adherence / medication schema general notes
      if (note.category === 'TherapyAdherence' || note.category === 'MedicationSchema') {
        if (!adherenceNotes['general']) adherenceNotes['general'] = [];
        adherenceNotes['general'].push(note);
      } else {
        // Other general notes go to effectiveness section
        if (!effectivenessNotes['general']) effectivenessNotes['general'] = [];
        effectivenessNotes['general'].push(note);
      }
    });

    // Group medication-specific notes by CNK
    medicationNotes.forEach(note => {
      const cnk = String(note.linkedCnk);

      // Therapy adherence / medication schema categories
      if (note.category === 'TherapyAdherence' || note.category === 'MedicationSchema') {
        if (!adherenceNotes[cnk]) adherenceNotes[cnk] = [];
        adherenceNotes[cnk].push(note);
      } else {
        // Effectiveness & Side-Effects related categories
        if (!effectivenessNotes[cnk]) effectivenessNotes[cnk] = [];
        effectivenessNotes[cnk].push(note);
      }
    });

    // Ensure every medication has an entry (even if empty)
    this.medications.forEach(m => {
      const key = m.cnk != null ? String(m.cnk) : 'uncategorized';
      if (!adherenceNotes[key]) adherenceNotes[key] = [];
      if (!effectivenessNotes[key]) effectivenessNotes[key] = [];
    });

    return { adherenceNotes, effectivenessNotes };
  }
}
