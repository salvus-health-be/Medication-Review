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
        
        // Verify blob is a PDF
        if (!blob.type.includes('pdf')) {
        }
        
        // Create object URL from blob
        this.blobUrl = URL.createObjectURL(blob);
        
        // Trust the URL for iframe usage
        this.documentUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.blobUrl);
      },
      error: (err) => {
        
        this.error = 'Failed to load GheOPS document. Click "Open in New Tab" to try in a separate window.';
        this.isLoading = false;
      }
    });
  }

  ngOnDestroy() {
    // Clean up the blob URL to prevent memory leaks
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
    }
  }

  onIframeLoad() {
    this.isLoading = false;
  }

  onIframeError(event?: any) {
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