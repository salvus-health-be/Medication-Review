import { Component, OnInit, OnDestroy, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
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
  
  // General note form state
  showGeneralNoteForm = false;
  newNoteText = '';
  newNoteCategory: 'TherapyAdherence' | 'Effectiveness' = 'TherapyAdherence';

  constructor(
    private reviewNotesService: ReviewNotesService,
    private stateService: StateService,
    private router: Router,
    private transloco: TranslocoService
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
    const apbNumber = this.stateService.apbNumber;
    const reviewId = this.stateService.medicationReviewId;
    if (reviewId && this.reviewNotesService.getNotesCount() === 0) {
      this.reviewNotesService.loadReviewNotes(apbNumber, reviewId);
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
    const apbNumber = this.stateService.apbNumber;
    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) {
      this.showDeleteConfirmation = false;
      this.selectedNoteToDelete = null;
      return;
    }

    const rowKey = this.selectedNoteToDelete.rowKey;
    this.reviewNotesService.deleteNote(apbNumber, reviewId, rowKey).subscribe({
      next: () => {
        this.showDeleteConfirmation = false;
        this.selectedNoteToDelete = null;
      },
      error: (error) => {
        alert(this.transloco.translate('errors.failed_to_delete_note'));
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
    const apbNumber = this.stateService.apbNumber;
    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) return;

    this.reviewNotesService.updateNote(apbNumber, reviewId, note.rowKey, {
      discussWithPatient: !note.discussWithPatient
    }).subscribe({
      error: (error) => {
        alert(this.transloco.translate('errors.failed_to_update_note'));
      }
    });
  }

  toggleCommunicateToDoctor(note: ReviewNote) {
    const apbNumber = this.stateService.apbNumber;
    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) return;

    this.reviewNotesService.updateNote(apbNumber, reviewId, note.rowKey, {
      communicateToDoctor: !note.communicateToDoctor
    }).subscribe({
      error: (error) => {
        alert(this.transloco.translate('errors.failed_to_update_note'));
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
    const apbNumber = this.stateService.apbNumber;
    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId || !this.editingNoteText.trim()) {
      this.cancelEditing();
      return;
    }

    this.reviewNotesService.updateNote(apbNumber, reviewId, note.rowKey, {
      text: this.editingNoteText.trim()
    }).subscribe({
      next: () => {
        this.cancelEditing();
      },
      error: (error) => {
        alert(this.transloco.translate('errors.failed_to_update_note'));
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

  showAddGeneralNote() {
    this.showGeneralNoteForm = true;
    this.newNoteText = '';
    this.newNoteCategory = 'TherapyAdherence';
  }

  cancelAddGeneralNote() {
    this.showGeneralNoteForm = false;
    this.newNoteText = '';
  }

  saveGeneralNote() {
    const apbNumber = this.stateService.apbNumber;
    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId || !this.newNoteText.trim()) {
      return;
    }

    this.reviewNotesService.addNote(apbNumber, reviewId, {
      text: this.newNoteText.trim(),
      discussWithPatient: true,
      communicateToDoctor: false,
      category: this.newNoteCategory,
      linkedCnk: undefined // No linked CNK for general notes
    }).subscribe({
      next: (note) => {
        this.showGeneralNoteForm = false;
        this.newNoteText = '';
      },
      error: (error) => {
        alert(this.transloco.translate('errors.failed_to_save_note'));
      }
    });
  }
}
