import { Component, Output, EventEmitter, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-start-stop',
  standalone: true,
  imports: [CommonModule, TranslocoModule],
  templateUrl: './start-stop.component.html',
  styleUrls: ['./start-stop.component.scss']
})
export class StartStopComponent {
  @Output() openNotes = new EventEmitter<void>();

  documentUrl: SafeResourceUrl;
  isLoading = true;
  error: string | null = null;

  constructor(
    private apiService: ApiService,
    private sanitizer: DomSanitizer
  ) {
    // Build the URL to the reference document
    const url = this.apiService.getReferenceDocumentUrl('start-stop');
    this.documentUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  onIframeLoad() {
    this.isLoading = false;
  }

  onIframeError() {
    this.isLoading = false;
    this.error = 'Failed to load START-STOP document';
  }

  onAddNote() {
    this.openNotes.emit();
  }

  onAddGeneralNote() {
    console.log('[START-STOP] Opening notes for general note');
    this.openNotes.emit();
  }

  openInNewTab() {
    const url = this.apiService.getReferenceDocumentUrl('start-stop');
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
