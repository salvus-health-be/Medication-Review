import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TranslocoModule } from '@jsverse/transloco';
import { ReviewNotesService, ReviewNote } from '../../services/review-notes.service';
import { StateService } from '../../services/state.service';
import { ConfirmationModalComponent } from '../../components/confirmation-modal/confirmation-modal.component';

@Component({
  selector: 'app-note-overview',
  imports: [CommonModule, ConfirmationModalComponent, TranslocoModule],
  templateUrl: './note-overview.page.html',
  styleUrls: ['./note-overview.page.scss']
})
export class NoteOverviewPage implements OnInit, OnDestroy {
  notes: ReviewNote[] = [];
  notesForPatient: ReviewNote[] = [];
  notesForDoctor: ReviewNote[] = [];
  internalNotes: ReviewNote[] = [];
  
  private destroy$ = new Subject<void>();
  showDeleteConfirmation = false;
  selectedNoteToDelete: ReviewNote | null = null;

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
        this.notes = notes;
        this.categorizeNotes();
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
    // Navigate to the Anamnesis page (the three-column preparation view)
    this.router.navigate(['/anamnesis']);
  }

  private categorizeNotes() {
    this.notesForPatient = this.notes.filter(n => n.discussWithPatient);
    this.notesForDoctor = this.notes.filter(n => n.communicateToDoctor);
    this.internalNotes = this.notes.filter(n => !n.discussWithPatient && !n.communicateToDoctor);
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
    const apbNumber = this.stateService.apbNumber;
    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) return;

    this.reviewNotesService.updateNote(apbNumber, reviewId, note.rowKey, {
      discussWithPatient: !note.discussWithPatient
    }).subscribe({
      error: (error) => {
        alert('Failed to update note. Please try again.');
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
        alert('Failed to update note. Please try again.');
      }
    });
  }

  goBack() {
    this.router.navigate(['/analysis']);
  }
}
