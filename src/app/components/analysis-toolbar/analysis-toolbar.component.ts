import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';

export type ToolType = 
  | 'medication-schema' 
  | 'therapy-adherence' 
  | 'interactions' 
  | 'contra-indications' 
  | 'posology' 
  | 'renadapter' 
  | 'gheops' 
  | 'start-stop-nl' 
  | 'questionnaire';

export interface ToolItem {
  id: ToolType;
  label: string;
  icon: string; // SVG path data
}

@Component({
  selector: 'app-analysis-toolbar',
  standalone: true,
  imports: [CommonModule, TranslocoModule],
  templateUrl: './analysis-toolbar.component.html',
  styleUrls: ['./analysis-toolbar.component.scss']
})
export class AnalysisToolbarComponent {
  @Input() activeTool: ToolType | null = null;
  @Output() toolSelected = new EventEmitter<ToolType>();

  tools: ToolItem[] = [
    {
      id: 'medication-schema',
      label: 'tools.medication_schema',
      icon: 'grid'
    },
    {
      id: 'therapy-adherence',
      label: 'tools.therapy_adherence',
      icon: 'clock-pill'
    },
    {
      id: 'interactions',
      label: 'tools.interactions',
      icon: 'pills-warning'
    },
    {
      id: 'contra-indications',
      label: 'tools.contraindications',
      icon: 'person-warning'
    },
    {
      id: 'posology',
      label: 'tools.posology',
      icon: 'pill-times'
    },
    {
      id: 'renadapter',
      label: 'tools.renadaptor',
      icon: 'kidney'
    },
    {
      id: 'gheops',
  label: 'tools.gheops',
      icon: 'shield-plus'
    },
    {
      id: 'start-stop-nl',
      label: 'tools.start_stop',
      icon: 'play-stop'
    },
    {
      id: 'questionnaire',
      label: 'tools.questionnaire',
      icon: 'document'
    }
  ];

  onToolClick(toolId: ToolType) {
    this.toolSelected.emit(toolId);
  }
}
