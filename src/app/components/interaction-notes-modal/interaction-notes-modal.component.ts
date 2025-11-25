import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
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
  addToPatientConversation = true;
  addToGpReport = true;
  isSubmitting = false;

  constructor(
    private reviewNotesService: ReviewNotesService,
    private stateService: StateService,
    private transloco: TranslocoService
  ) {}

  addPresetText(presetKey: string) {
    const presetText = this.transloco.translate(presetKey);
    if (this.noteText.trim()) {
      this.noteText += '\n' + presetText;
    } else {
      this.noteText = presetText;
    }
  }

  onCancel() {
    this.close.emit();
    this.resetForm();
  }

  onAddToAnamnesis() {
    if (!this.noteText.trim()) {
      return;
    }

    const apbNumber = this.stateService.apbNumber;
    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) {
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

    this.reviewNotesService.addNote(apbNumber, reviewId, noteData).subscribe({
      next: (note) => {
        this.close.emit();
        this.resetForm();
      },
      error: (error) => {
        this.isSubmitting = false;
      }
    });
  }

  private buildNoteText(): string {
    // Build a note text that includes interaction context
    const interactionBetween = this.transloco.translate('interactions.interaction_between');
    const andText = this.transloco.translate('interactions.and');
    const title = this.getInteractionTitle(interactionBetween, andText);
    let text = `${title}\n\n`;
    text += this.noteText;
    return text;
  }

  private resetForm() {
    this.noteText = '';
    this.addToPatientConversation = true;
    this.addToGpReport = true;
    this.isSubmitting = false;
  }

  getInteractionTitle(interactionBetween?: string, andText?: string): string {
    // Use provided translations or default to English
    const between = interactionBetween || this.transloco.translate('interactions.interaction_between');
    const and = andText || this.transloco.translate('interactions.and');
    
    if (this.interactionType === 'drug-drug') {
      return `${between} ${this.interaction.leftMedication} ${and} ${this.interaction.rightMedication}`;
    } else {
      return `${between} ${this.interaction.medication} ${and} ${this.interaction.food}`;
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
