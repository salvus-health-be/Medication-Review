import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';
import { ReviewNotesService } from '../../services/review-notes.service';
import { StateService } from '../../services/state.service';

@Component({
  selector: 'app-interaction-notes-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslocoModule],
  templateUrl: './interaction-notes-modal.component.html',
  styleUrls: ['./interaction-notes-modal.component.scss']
})
export class InteractionNotesModalComponent {
  @Input() interaction: any = null;
  @Input() interactionType: 'drug-drug' | 'drug-food' = 'drug-drug';
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
      console.warn('[InteractionNotesModal] Note text is empty');
      return;
    }

    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) {
      console.error('[InteractionNotesModal] No review ID found');
      return;
    }

    this.isSubmitting = true;

    const noteData = {
      text: this.buildNoteText(),
      category: 'Interactions',
      linkedCnk: this.getLinkedCnk(),
      medicationName: this.getLinkedMedicationName(),
      discussWithPatient: this.addToPatientConversation,
      communicateToDoctor: this.addToGpReport
    };

    console.log('[InteractionNotesModal] Adding to anamnesis:', noteData);

    this.reviewNotesService.addNote(reviewId, noteData).subscribe({
      next: (note) => {
        console.log('[InteractionNotesModal] Successfully added note:', note);
        this.close.emit();
        this.resetForm();
      },
      error: (error) => {
        console.error('[InteractionNotesModal] Error adding note:', error);
        this.isSubmitting = false;
      }
    });
  }

  private buildNoteText(): string {
    // Build a note text that includes interaction context
    let text = `[Interaction: ${this.getInteractionTitle()}]\n\n`;
    text += this.noteText;
    return text;
  }

  private resetForm() {
    this.noteText = '';
    this.addToPatientConversation = false;
    this.addToGpReport = false;
    this.isSubmitting = false;
  }

  getInteractionTitle(): string {
    if (this.interactionType === 'drug-drug') {
      return `${this.interaction.leftMedication} ↔ ${this.interaction.rightMedication}`;
    } else {
      return `${this.interaction.medication} ↔ ${this.interaction.food}`;
    }
  }

  private getLinkedCnk(): string | undefined {
    // For drug-drug interactions, link to the "left" medication CNK
    if (this.interactionType === 'drug-drug' && this.interaction.leftParticipantId) {
      return this.interaction.leftParticipantId;
    }
    // For drug-food interactions, link to the medication CNK
    else if (this.interactionType === 'drug-food' && this.interaction.participantId) {
      return this.interaction.participantId;
    }
    return undefined;
  }

  private getLinkedMedicationName(): string | undefined {
    // For drug-drug interactions, use the "left" medication name
    if (this.interactionType === 'drug-drug' && this.interaction.leftMedication) {
      return this.interaction.leftMedication;
    }
    // For drug-food interactions, use the medication name
    else if (this.interactionType === 'drug-food' && this.interaction.medication) {
      return this.interaction.medication;
    }
    return undefined;
  }
}
