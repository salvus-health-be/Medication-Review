import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { PatientDetailsComponent } from '../../components/patient-details/patient-details.component';
import { ContraIndicationsComponent } from '../../components/contra-indications/contra-indications.component';
import { LabValuesComponent } from '../../components/lab-values/lab-values.component';
import { MedicationListComponent } from '../../components/medication-list/medication-list.component';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  selector: 'app-input',
  imports: [
    PatientDetailsComponent,
    ContraIndicationsComponent,
    LabValuesComponent,
    MedicationListComponent,
    TranslocoModule
  ],
  templateUrl: './input.page.html',
  styleUrls: ['./input.page.scss']
})
export class InputPage {
  constructor(private router: Router) {}

  startPreparation() {
    this.router.navigate(['/analysis']);
  }
}
