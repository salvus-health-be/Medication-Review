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
        
        // Verify blob is a PDF
        if (!blob.type.includes('pdf')) {
        }
        
        // Create object URL from blob
        this.blobUrl = URL.createObjectURL(blob);
        
        // Trust the URL for iframe usage
        this.documentUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.blobUrl);
      },
      error: (err) => {
        
        this.error = 'Failed to load START-STOP document. Click "Open in New Tab" to try in a separate window.';
        this.isLoading = false;
      }
    });
  }

  ngOnDestroy() {
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
    }
  }

  onIframeLoad() {
    this.isLoading = false;
  }

  onIframeError() {
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