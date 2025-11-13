import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface ReviewNote {
  partitionKey: string;       // Medication Review ID
  rowKey: string;             // Review Note ID
  text?: string;
  discussWithPatient: boolean;
  communicateToDoctor: boolean;
  category?: string;          // Category for organizing notes (e.g., "Posology", "Interactions", "GheOPS")
  linkedCnk?: string;         // CNK code to link note to specific medication
  medicationName?: string;    // Medication name stored separately from CNK
  timestamp?: string;
  eTag?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ReviewNotesService {
  private notesSubject = new BehaviorSubject<ReviewNote[]>([]);
  private currentReviewId: string | null = null;

  public notes$ = this.notesSubject.asObservable();
  public notesCount$ = new BehaviorSubject<number>(0);

  constructor(private apiService: ApiService) {}

  /**
   * Load all review notes for a specific review
   */
  loadReviewNotes(reviewId: string): void {
    this.currentReviewId = reviewId;
    
    this.apiService.getReviewNotes(reviewId).subscribe({
      next: (notes) => {
        this.notesSubject.next(notes);
        this.notesCount$.next(notes.length);
        console.log('[ReviewNotesService] Loaded notes:', notes);
      },
      error: (error) => {
        console.error('[ReviewNotesService] Error loading notes:', error);
      }
    });
  }

  /**
   * Add a new review note
   */
  addNote(reviewId: string, note: { text?: string; discussWithPatient?: boolean; communicateToDoctor?: boolean; category?: string; linkedCnk?: string; medicationName?: string }): Observable<ReviewNote> {
    return new Observable(observer => {
      this.apiService.addReviewNote(reviewId, note).subscribe({
        next: (newNote) => {
          // Ensure timestamp is set (either from backend or set to current time)
          if (!newNote.timestamp) {
            newNote.timestamp = new Date().toISOString();
          }
          
          const currentNotes = this.notesSubject.value;
          const updatedNotes = [...currentNotes, newNote];
          this.notesSubject.next(updatedNotes);
          this.notesCount$.next(updatedNotes.length);
          console.log('[ReviewNotesService] Added note:', newNote);
          observer.next(newNote);
          observer.complete();
        },
        error: (error) => {
          console.error('[ReviewNotesService] Error adding note:', error);
          observer.error(error);
        }
      });
    });
  }

  /**
   * Update an existing review note
   */
  updateNote(reviewId: string, noteId: string, updates: Partial<ReviewNote>): Observable<ReviewNote> {
    return new Observable(observer => {
      this.apiService.updateReviewNote(reviewId, noteId, updates).subscribe({
        next: (updatedNote) => {
          const currentNotes = this.notesSubject.value;
          const index = currentNotes.findIndex(n => n.rowKey === noteId);
          if (index !== -1) {
            currentNotes[index] = updatedNote;
            this.notesSubject.next([...currentNotes]);
          }
          console.log('[ReviewNotesService] Updated note:', updatedNote);
          observer.next(updatedNote);
          observer.complete();
        },
        error: (error) => {
          console.error('[ReviewNotesService] Error updating note:', error);
          observer.error(error);
        }
      });
    });
  }

  /**
   * Delete a review note
   */
  deleteNote(reviewId: string, noteId: string): Observable<void> {
    return new Observable(observer => {
      this.apiService.deleteReviewNote(reviewId, noteId).subscribe({
        next: () => {
          const currentNotes = this.notesSubject.value;
          const updatedNotes = currentNotes.filter(n => n.rowKey !== noteId);
          this.notesSubject.next(updatedNotes);
          this.notesCount$.next(updatedNotes.length);
          console.log('[ReviewNotesService] Deleted note:', noteId);
          observer.next();
          observer.complete();
        },
        error: (error) => {
          console.error('[ReviewNotesService] Error deleting note:', error);
          observer.error(error);
        }
      });
    });
  }

  /**
   * Get current notes count
   */
  getNotesCount(): number {
    return this.notesSubject.value.length;
  }

  /**
   * Get all notes
   */
  getNotes(): ReviewNote[] {
    return this.notesSubject.value;
  }

  /**
   * Clear notes (useful when switching reviews)
   */
  clearNotes(): void {
    this.notesSubject.next([]);
    this.notesCount$.next(0);
    this.currentReviewId = null;
  }
}
