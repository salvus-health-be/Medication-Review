import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-questionnaire',
  standalone: true,
  imports: [CommonModule, TranslocoModule],
  templateUrl: './questionnaire.component.html',
  styleUrls: ['./questionnaire.component.scss']
})
export class QuestionnaireComponent {
  @Output() openNotes = new EventEmitter<void>();
  
  pdfUrl: SafeResourceUrl | null = null;
  pdfFileName: string = '';
  isDragging = false;
  error: string | null = null;

  constructor(private sanitizer: DomSanitizer, private transloco: TranslocoService) {}

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleFile(files[0]);
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFile(input.files[0]);
    }
  }

  handleFile(file: File) {
    this.error = null;

    // Validate file type
    if (file.type !== 'application/pdf') {
      this.error = this.transloco.translate('tools.questionnaire_invalid_pdf');
      return;
    }

    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      this.error = this.transloco.translate('tools.questionnaire_file_too_large');
      return;
    }

    // Create object URL for the PDF
    const objectUrl = URL.createObjectURL(file);
    this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(objectUrl);
    this.pdfFileName = file.name;
    
  }

  removePdf() {
    if (this.pdfUrl) {
      // Revoke the object URL to free memory
      const url = (this.pdfUrl as any).changingThisBreaksApplicationSecurity;
      if (url) {
        URL.revokeObjectURL(url);
      }
    }
    this.pdfUrl = null;
    this.pdfFileName = '';
    this.error = null;
  }

  openNotesModal() {
    this.openNotes.emit();
  }

  ngOnDestroy() {
    // Clean up object URL when component is destroyed
    this.removePdf();
  }
}
