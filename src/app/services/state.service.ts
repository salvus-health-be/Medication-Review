import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { SessionData } from '../models/api.models';

@Injectable({
  providedIn: 'root'
})
export class StateService {
  private sessionDataSubject = new BehaviorSubject<SessionData | null>(null);
  public sessionData$: Observable<SessionData | null> = this.sessionDataSubject.asObservable();

  private contraindicationsChangedSubject = new Subject<void>();
  public contraindicationsChanged$: Observable<void> = this.contraindicationsChangedSubject.asObservable();

  private noteOverviewModalSubject = new Subject<void>();
  public noteOverviewModal$: Observable<void> = this.noteOverviewModalSubject.asObservable();

  setSessionData(data: SessionData): void {
    this.sessionDataSubject.next(data);
  }

  openNoteOverviewModal(): void {
    this.noteOverviewModalSubject.next();
  }

  getSessionData(): SessionData | null {
    return this.sessionDataSubject.value;
  }

  clearSessionData(): void {
    this.sessionDataSubject.next(null);
  }

  notifyContraindicationsChanged(): void {
    this.contraindicationsChangedSubject.next();
  }

  get apbNumber(): string {
    return this.sessionDataSubject.value?.apbNumber || '';
  }

  get patientId(): string {
    return this.sessionDataSubject.value?.patientId || '';
  }

  get medicationReviewId(): string {
    return this.sessionDataSubject.value?.medicationReviewId || '';
  }
}
