import { Routes } from '@angular/router';
import { LoginPage } from './pages/login/login.page';
import { DisclaimerPage } from './pages/disclaimer/disclaimer.page';
import { InputPage } from './pages/input/input.page';
import { AnalysisPage } from './pages/analysis/analysis.page';
import { AnamnesisPage } from './pages/anamnesis/anamnesis.page';
import { ReportGenerationPage } from './pages/report-generation/report-generation.page';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  },
  {
    path: 'login',
    component: LoginPage
  },
  {
    path: 'disclaimer',
    component: DisclaimerPage
  },
  {
    path: 'input',
    component: InputPage
  },
  {
    path: 'analysis',
    component: AnalysisPage
  },
  {
    path: 'anamnesis',
    component: AnamnesisPage
  },
  {
    path: 'report-generation',
    component: ReportGenerationPage
  }
];
