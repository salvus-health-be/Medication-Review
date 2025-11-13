import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LabValuesListComponent } from '../lab-values-list/lab-values-list.component';

@Component({
  selector: 'app-lab-values',
  standalone: true,
  imports: [CommonModule, LabValuesListComponent],
  templateUrl: './lab-values.component.html',
  styleUrls: ['./lab-values.component.scss']
})
export class LabValuesComponent {}
