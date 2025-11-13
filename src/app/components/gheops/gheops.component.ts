import { Component, Output, EventEmitter, OnInit, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-gheops',
  standalone: true,
  imports: [CommonModule, TranslocoModule],
  templateUrl: './gheops.component.html',
  styleUrls: ['./gheops.component.scss']
})
export class GheopsComponent implements AfterViewInit {
  @Output() openNotes = new EventEmitter<void>();

  documentUrl: SafeResourceUrl;
  isLoading = true;
  error: string | null = null;
  rawUrl: string;

  constructor(
    private apiService: ApiService,
    private sanitizer: DomSanitizer
  ) {
    // Build the URL to the reference document
    this.rawUrl = this.apiService.getReferenceDocumentUrl('gheops');
    console.log('[GheopsComponent] Loading document from URL:', this.rawUrl);
    this.documentUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.rawUrl);
  }

  ngAfterViewInit() {
    // Set a timeout to detect if the iframe never loads
    setTimeout(() => {
      if (this.isLoading) {
        console.warn('[GheopsComponent] Document taking too long to load, check network tab');
        console.log('[GheopsComponent] Try opening this URL directly:', this.rawUrl);
      }
    }, 5000);
  }

  onIframeLoad() {
  console.log('[GheopsComponent] Document loaded successfully');
    this.isLoading = false;
  }

  onIframeError(event?: any) {
    console.error('[GheopsComponent] Failed to load document:', event);
    this.isLoading = false;
  this.error = 'Failed to load GheOPS document. Click "Open in New Tab" to try in a separate window.';
  }

  onAddNote() {
    this.openNotes.emit();
  }

  onAddGeneralNote() {
    console.log('[GheOPS] Opening notes for general note');
    this.openNotes.emit();
  }

  openInNewTab() {
    const url = this.apiService.getReferenceDocumentUrl('gheops');
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
