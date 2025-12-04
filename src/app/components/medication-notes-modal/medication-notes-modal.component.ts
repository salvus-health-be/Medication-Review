import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
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
export class MedicationNotesModalComponent implements OnInit {
  @Input() medication: Medication | null = null;
  @Input() category: string = 'General'; // Category based on tool/source
  @Input() initialText: string = ''; // Pre-filled note text
  @Output() close = new EventEmitter<void>();

  noteText = '';
  addToPatientConversation = true;
  addToGpReport = true;
  isSubmitting = false;
  presetButtons: string[] = [];

  constructor(
    private reviewNotesService: ReviewNotesService,
    private stateService: StateService,
    private transloco: TranslocoService
  ) {}

  ngOnInit() {
    this.updatePresetButtons();
    // Pre-fill note text if initial text is provided
    if (this.initialText) {
      this.noteText = this.initialText;
    }
  }

  updatePresetButtons() {
    const presetMap: Record<string, string[]> = {
      'MedicationSchema': ['notes.preset_reduce_intake', 'notes.preset_move_intake'],
      'TherapyAdherence': ['notes.preset_too_few_units', 'notes.preset_too_many_units'],
      'Interactions': ['notes.preset_advice_alternative', 'notes.preset_inform_patient'],
      'Contraindications': ['notes.preset_advice_alternative', 'notes.preset_inform_patient'],
      'Posology': ['notes.preset_dose_too_high', 'notes.preset_dose_too_low'],
      'Renadapter': ['notes.preset_dosing_adjustment', 'notes.preset_renal_followup']
    };
    this.presetButtons = presetMap[this.category] || [];
  }

  getFrequencyDisplay(): string {
    if (!this.medication) return '';
    
    // Check for special frequency (non-daily)
    if (this.medication.specialFrequency && this.medication.specialDescription) {
      const frequencyMap: Record<number, string> = {
        1: this.transloco.translate('frequency.daily'),
        2: this.transloco.translate('frequency.twice_weekly'),
        3: this.transloco.translate('frequency.three_times_weekly'),
        4: this.transloco.translate('frequency.weekly'),
        5: this.transloco.translate('frequency.every_2_weeks'),
        6: this.transloco.translate('frequency.every_3_weeks'),
        7: this.transloco.translate('frequency.every_4_weeks'),
        8: this.transloco.translate('frequency.monthly'),
        9: this.transloco.translate('frequency.every_2_months'),
        10: this.transloco.translate('frequency.quarterly'),
        11: this.transloco.translate('frequency.annually')
      };
      const freqText = frequencyMap[this.medication.specialFrequency] || `${this.medication.specialFrequency}x`;
      return `${this.medication.specialFrequency}x ${freqText}`;
    }
    
    // If daily medication, show dosage if available
    if (this.medication.dosage) {
      return this.medication.dosage;
    }
    
    return '';
  }

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
      text: this.noteText.trim(),
      category: this.category,
      linkedCnk: this.medication?.cnk?.toString() || undefined,
      medicationName: this.medication?.name || undefined,
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

  private resetForm() {
    this.noteText = '';
    this.addToPatientConversation = true;
    this.addToGpReport = true;
    this.isSubmitting = false;
  }
}
