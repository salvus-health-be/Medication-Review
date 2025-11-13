import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { StateService } from '../../services/state.service';
import { ApiService } from '../../services/api.service';
import { PdfGenerationService } from '../../services/pdf-generation.service';

type ReportTool = 'patient-summary' | 'doctor-summary' | 'pharmacy-summary' | null;

@Component({
  selector: 'app-report-generation',
  imports: [CommonModule, TranslocoModule],
  templateUrl: './report-generation.page.html',
  styleUrls: ['./report-generation.page.scss']
})
export class ReportGenerationPage implements OnInit {
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);
  private stateService = inject(StateService);
  private apiService = inject(ApiService);
  private transloco = inject(TranslocoService);
  private pdfService = inject(PdfGenerationService);

  activeTool: ReportTool = null;
  isGenerating = false;
  pdfUrl: SafeResourceUrl | null = null;

  ngOnInit() {
    // Auto-select first tool on load
    this.selectTool('patient-summary');
  }

  goBack() {
    this.router.navigate(['/anamnesis']);
  }

  selectTool(tool: ReportTool) {
    if (this.activeTool === tool) return;
    
    this.activeTool = tool;
    this.pdfUrl = null;
    
    if (tool) {
      this.generatePDF(tool);
    }
  }

  getToolTitle(): string {
    switch (this.activeTool) {
      case 'patient-summary':
        return this.transloco.translate('reports.patient_summary');
      case 'doctor-summary':
        return this.transloco.translate('reports.doctor_summary');
      case 'pharmacy-summary':
        return this.transloco.translate('reports.pharmacy_summary');
      default:
        return '';
    }
  }

  private generatePDF(tool: ReportTool) {
    if (!tool) return;

    console.log('[ReportGeneration] Starting PDF generation for:', tool);
    this.isGenerating = true;
    this.pdfUrl = null;

    // Generate PDF using the PDF service
    let pdfObservable;
    switch (tool) {
      case 'patient-summary':
        pdfObservable = this.pdfService.generatePatientSummary();
        break;
      case 'doctor-summary':
        pdfObservable = this.pdfService.generateDoctorSummary();
        break;
      case 'pharmacy-summary':
        pdfObservable = this.pdfService.generatePharmacySummary();
        break;
      default:
        return;
    }

    pdfObservable.subscribe({
      next: (pdfBlob) => {
        console.log('[ReportGeneration] PDF blob created, size:', pdfBlob.size, 'bytes');
        
        const url = URL.createObjectURL(pdfBlob);
        console.log('[ReportGeneration] PDF URL created:', url);
        
        this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
        this.isGenerating = false;
        console.log('[ReportGeneration] PDF ready for display');
      },
      error: (error) => {
        console.error('[ReportGeneration] Failed to generate PDF:', error);
        this.isGenerating = false;
      }
    });
  }

  downloadPDF() {
    if (!this.pdfUrl || !this.activeTool) return;

    const filename = `${this.activeTool}-${Date.now()}.pdf`;
    
    // Create a temporary link and trigger download
    const link = document.createElement('a');
    link.href = (this.pdfUrl as any).changingThisBreaksApplicationSecurity;
    link.download = filename;
    link.click();
  }
}
