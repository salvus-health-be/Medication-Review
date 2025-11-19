import { Component, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
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
export class StartStopComponent implements OnInit, OnDestroy {
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

    this.apiService.getReferenceDocument('start-stop').subscribe({
      next: (blob) => {
        console.log('[StartStopComponent] Received blob:', blob.size, 'bytes, type:', blob.type);
        
        // Verify blob is a PDF
        if (!blob.type.includes('pdf')) {
          console.warn('[StartStopComponent] Received non-PDF blob:', blob.type);
        }
        
        // Create object URL from blob
        this.blobUrl = URL.createObjectURL(blob);
        console.log('[StartStopComponent] Created blob URL:', this.blobUrl);
        
        // Trust the URL for iframe usage
        this.documentUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.blobUrl);
        console.log('[StartStopComponent] Document URL ready for iframe');
      },
      error: (err) => {
        console.error('[StartStopComponent] Failed to download document:', err);
        console.error('[StartStopComponent] Error details:', {
          status: err.status,
          statusText: err.statusText,
          message: err.message,
          url: err.url
        });
        this.error = 'Failed to load START-STOP document. Click "Open in New Tab" to try in a separate window.';
        this.isLoading = false;
      }
    });
  }

  ngOnDestroy() {
    if (this.blobUrl) {
      console.log('[StartStopComponent] Cleaning up blob URL');
      URL.revokeObjectURL(this.blobUrl);
    }
  }

  onIframeLoad() {
    console.log('[StartStopComponent] Iframe loaded successfully');
    this.isLoading = false;
  }

  onIframeError() {
    console.error('[StartStopComponent] Iframe failed to load');
    this.error = 'Failed to display PDF in iframe. Click "Open in New Tab" to view.';
    this.isLoading = false;
  }

  onAddGeneralNote() {
    this.openNotes.emit();
  }

  openInNewTab() {
    const url = this.apiService.getReferenceDocumentUrl('start-stop');
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}