import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';
import { Medication } from '../medication-item/medication-item.component';
import { ReviewNotesService } from '../../services/review-notes.service';
import { StateService } from '../../services/state.service';

@Component({
  selector: 'app-medication-notes-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslocoModule],
  templateUrl: './medication-notes-modal.component.html',
  styleUrls: ['./medication-notes-modal.component.scss']
})
export class MedicationNotesModalComponent {
  @Input() medication: Medication | null = null;
  @Input() category: string = 'General'; // Category based on tool/source
  @Output() close = new EventEmitter<void>();

  noteText = '';
  addToPatientConversation = false;
  addToGpReport = false;
  isSubmitting = false;

  constructor(
    private reviewNotesService: ReviewNotesService,
    private stateService: StateService
  ) {}

  onCancel() {
    this.close.emit();
    this.resetForm();
  }

  onAddToAnamnesis() {
    if (!this.noteText.trim()) {
      console.warn('[MedicationNotesModal] Note text is empty');
      return;
    }

    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) {
      console.error('[MedicationNotesModal] No review ID found');
      return;
    }

    this.isSubmitting = true;

    const noteData = {
      text: this.noteText.trim(),
      category: this.category,
      linkedCnk: this.medication?.cnk?.toString() || undefined,
      medicationName: this.medication?.name || undefined,
      discussWithPatient: this.addToPatientConversation,
      communicateToDoctor: this.addToGpReport
    };

    console.log('[MedicationNotesModal] Adding to anamnesis:', noteData);

    this.reviewNotesService.addNote(reviewId, noteData).subscribe({
      next: (note) => {
        console.log('[MedicationNotesModal] Successfully added note:', note);
        this.close.emit();
        this.resetForm();
      },
      error: (error) => {
        console.error('[MedicationNotesModal] Error adding note:', error);
        this.isSubmitting = false;
      }
    });
  }

  private resetForm() {
    this.noteText = '';
    this.addToPatientConversation = false;
    this.addToGpReport = false;
    this.isSubmitting = false;
  }
}
