import { Component, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
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
export class GheopsComponent implements OnInit, OnDestroy {
  @Output() openNotes = new EventEmitter<void>();

  documentUrl: SafeResourceUrl | null = null;
  isLoading = true;
  error: string | null = null;
  private blobUrl: string | null = null;

  constructor(
    private apiService: ApiService,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit() {
    this.loadDocument();
  }

  loadDocument() {
    this.isLoading = true;
    this.error = null;

    this.apiService.getReferenceDocument('gheops').subscribe({
      next: (blob) => {
        console.log('[GheopsComponent] Received blob:', blob.size, 'bytes, type:', blob.type);
        
        // Verify blob is a PDF
        if (!blob.type.includes('pdf')) {
          console.warn('[GheopsComponent] Received non-PDF blob:', blob.type);
        }
        
        // Create object URL from blob
        this.blobUrl = URL.createObjectURL(blob);
        console.log('[GheopsComponent] Created blob URL:', this.blobUrl);
        
        // Trust the URL for iframe usage
        this.documentUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.blobUrl);
        console.log('[GheopsComponent] Document URL ready for iframe');
      },
      error: (err) => {
        console.error('[GheopsComponent] Failed to download document:', err);
        console.error('[GheopsComponent] Error details:', {
          status: err.status,
          statusText: err.statusText,
          message: err.message,
          url: err.url
        });
        this.error = 'Failed to load GheOPS document. Click "Open in New Tab" to try in a separate window.';
        this.isLoading = false;
      }
    });
  }

  ngOnDestroy() {
    // Clean up the blob URL to prevent memory leaks
    if (this.blobUrl) {
      console.log('[GheopsComponent] Cleaning up blob URL');
      URL.revokeObjectURL(this.blobUrl);
    }
  }

  onIframeLoad() {
    console.log('[GheopsComponent] Iframe loaded successfully');
    this.isLoading = false;
  }

  onIframeError(event?: any) {
    console.error('[GheopsComponent] Iframe error:', event);
    this.error = 'Failed to display PDF in iframe. Click "Open in New Tab" to view.';
    this.isLoading = false;
  }

  onAddGeneralNote() {
    this.openNotes.emit();
  }

  openInNewTab() {
    const url = this.apiService.getReferenceDocumentUrl('gheops');
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}