import { Component, OnInit, OnDestroy, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslocoModule } from '@jsverse/transloco';
import { ReviewNotesService, ReviewNote } from '../../services/review-notes.service';
import { StateService } from '../../services/state.service';
import { ConfirmationModalComponent } from '../confirmation-modal/confirmation-modal.component';

@Component({
  selector: 'app-note-overview-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmationModalComponent, TranslocoModule],
  templateUrl: './note-overview-modal.component.html',
  styleUrls: ['./note-overview-modal.component.scss']
})
export class NoteOverviewModalComponent implements OnInit, OnDestroy {
  @Output() closeModal = new EventEmitter<void>();
  @Output() createConversation = new EventEmitter<void>();

  notes: ReviewNote[] = [];
  
  private destroy$ = new Subject<void>();
  showDeleteConfirmation = false;
  selectedNoteToDelete: ReviewNote | null = null;
  editingNoteId: string | null = null;
  editingNoteText: string = '';

  constructor(
    private reviewNotesService: ReviewNotesService,
    private stateService: StateService,
    private router: Router
  ) {}

  ngOnInit() {
    // Subscribe to notes changes
    this.reviewNotesService.notes$
      .pipe(takeUntil(this.destroy$))
      .subscribe(notes => {
        // Sort notes by timestamp descending (newest first)
        this.notes = (notes || []).slice().sort((a, b) => {
          const ta = this.parseTimestamp(a.timestamp);
          const tb = this.parseTimestamp(b.timestamp);
          return tb - ta;
        });
      });

    // Load notes if not already loaded
    const reviewId = this.stateService.medicationReviewId;
    if (reviewId && this.reviewNotesService.getNotesCount() === 0) {
      this.reviewNotesService.loadReviewNotes(reviewId);
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  generatePatientConversation() {
    // Close modal and navigate directly to anamnesis page
    this.closeModal.emit();
    this.router.navigate(['/anamnesis']);
  }

  deleteNote(note: ReviewNote) {
    // Show confirmation modal instead of browser confirm
    this.selectedNoteToDelete = note;
    this.showDeleteConfirmation = true;
  }

  onConfirmDelete() {
    if (!this.selectedNoteToDelete) return;
    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) {
      console.error('[NoteOverviewModal] No review ID found');
      this.showDeleteConfirmation = false;
      this.selectedNoteToDelete = null;
      return;
    }

    const rowKey = this.selectedNoteToDelete.rowKey;
    this.reviewNotesService.deleteNote(reviewId, rowKey).subscribe({
      next: () => {
        console.log('[NoteOverviewModal] Note deleted successfully');
        this.showDeleteConfirmation = false;
        this.selectedNoteToDelete = null;
      },
      error: (error) => {
        console.error('[NoteOverviewModal] Error deleting note:', error);
        alert('Failed to delete note. Please try again.');
        this.showDeleteConfirmation = false;
        this.selectedNoteToDelete = null;
      }
    });
  }

  onCancelDelete() {
    this.showDeleteConfirmation = false;
    this.selectedNoteToDelete = null;
  }

  toggleDiscussWithPatient(note: ReviewNote) {
    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) return;

    this.reviewNotesService.updateNote(reviewId, note.rowKey, {
      discussWithPatient: !note.discussWithPatient
    }).subscribe({
      error: (error) => {
        console.error('[NoteOverviewModal] Error updating note:', error);
        alert('Failed to update note. Please try again.');
      }
    });
  }

  toggleCommunicateToDoctor(note: ReviewNote) {
    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) return;

    this.reviewNotesService.updateNote(reviewId, note.rowKey, {
      communicateToDoctor: !note.communicateToDoctor
    }).subscribe({
      error: (error) => {
        console.error('[NoteOverviewModal] Error updating note:', error);
        alert('Failed to update note. Please try again.');
      }
    });
  }

  startEditing(note: ReviewNote) {
    this.editingNoteId = note.rowKey;
    this.editingNoteText = note.text || '';
  }

  cancelEditing() {
    this.editingNoteId = null;
    this.editingNoteText = '';
  }

  saveEdit(note: ReviewNote) {
    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId || !this.editingNoteText.trim()) {
      this.cancelEditing();
      return;
    }

    this.reviewNotesService.updateNote(reviewId, note.rowKey, {
      text: this.editingNoteText.trim()
    }).subscribe({
      next: () => {
        console.log('[NoteOverviewModal] Note updated successfully');
        this.cancelEditing();
      },
      error: (error) => {
        console.error('[NoteOverviewModal] Error updating note:', error);
        alert('Failed to update note. Please try again.');
      }
    });
  }

  isEditing(note: ReviewNote): boolean {
    return this.editingNoteId === note.rowKey;
  }

  private parseTimestamp(ts: any): number {
    // Accept Date, ISO string, or numeric timestamp. Fallback to 0.
    if (!ts) return 0;
    if (ts instanceof Date) return ts.getTime();
    const n = Number(ts);
    if (!isNaN(n)) return n;
    const parsed = Date.parse(String(ts));
    return isNaN(parsed) ? 0 : parsed;
  }

  formatTimestamp(timestamp: any): string {
    if (!timestamp) return '';

    const date = new Date(timestamp);
    // Use user's locale with a concise, absolute format including time
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    return date.toLocaleString(undefined, options);
  }

  close() {
    this.closeModal.emit();
  }
}
