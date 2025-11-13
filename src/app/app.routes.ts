import { Routes } from '@angular/router';
import { LoginPage } from './pages/login/login.page';
import { InputPage } from './pages/input/input.page';
import { AnalysisPage } from './pages/analysis/analysis.page';
import { PdfPreviewPage } from './pages/pdf-preview/pdf-preview.page';
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
    path: 'input',
    component: InputPage
  },
  {
    path: 'analysis',
    component: AnalysisPage
  },
  {
    path: 'pdf-preview',
    component: PdfPreviewPage
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
