import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';
import { ApiService } from '../../services/api.service';
import { StateService } from '../../services/state.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-feedback-modal',
  imports: [CommonModule, FormsModule, TranslocoModule],
  templateUrl: './feedback-modal.component.html',
  styleUrls: ['./feedback-modal.component.scss']
})
export class FeedbackModalComponent {
  @Output() close = new EventEmitter<void>();

  feedbackText: string = '';
  isSubmitting: boolean = false;
  showSuccess: boolean = false;
  errorMessage: string = '';

  constructor(
    private apiService: ApiService,
    private stateService: StateService,
    private router: Router
  ) {}

  submitFeedback(): void {
    if (!this.feedbackText.trim()) {
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';

    const apbNumber = this.stateService.apbNumber;
    const reviewId = this.stateService.medicationReviewId;

    this.apiService.submitFeedback({
      apbNumber: apbNumber || 'unknown',
      feedbackText: this.feedbackText.trim(),
      medicationReviewId: reviewId || undefined,
      pageContext: this.getCurrentPage()
    }).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.showSuccess = true;
        this.feedbackText = '';
        
        // Auto-close after showing success
        setTimeout(() => {
          this.closeModal();
        }, 2000);
      },
      error: (err) => {
        this.isSubmitting = false;
        this.errorMessage = 'feedback.error_submitting';
        console.error('Failed to submit feedback:', err);
      }
    });
  }

  closeModal(): void {
    this.close.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.closeModal();
    }
  }

  private getCurrentPage(): string {
    const url = this.router.url;
    // Extract page name from route
    const segments = url.split('/').filter(s => s);
    return segments.length > 0 ? segments[segments.length - 1] : 'unknown';
  }
}
