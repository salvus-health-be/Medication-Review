import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ReviewNote } from './review-notes.service';

@Injectable({
  providedIn: 'root'
})
export class AnamnesisePdfService {

  private sanitizeForPdf(input: string | undefined | null): string {
    if (input == null) return '';
    let s = String(input);

    // Remove control characters
    s = s.replace(/\x00-\x1F|\x7F/g, '');

    // Replace smart single quotes with ASCII apostrophe
    s = s.replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");
    // Replace smart double quotes
    s = s.replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"');
    // Replace various dashes with hyphen
    s = s.replace(/[\u2013\u2014\u2015\u2212\u2012]/g, '-');
    // Ellipsis
    s = s.replace(/\u2026/g, '...');
    // Non-breaking space
    s = s.replace(/\u00A0/g, ' ');
    // Hyphenation char
    s = s.replace(/\u2010/g, '-');

    // Collapse excessive whitespace
    s = s.replace(/\s+/g, ' ').trim();

    return s;
  }

  private formatSpecialFrequency(specialFrequency: number): string {
    const frequencyMap: Record<number, string> = {
      1: 'daily',
      2: 'twice weekly',
      3: 'three times weekly',
      4: 'weekly',
      5: 'every 2 weeks',
      6: 'every 3 weeks',
      7: 'every 4 weeks',
      8: 'monthly',
      9: 'every 2 months',
      10: 'quarterly',
      11: 'annually'
    };
    return frequencyMap[specialFrequency] || `frequency code ${specialFrequency}`;
  }

  generatePDF(
    generalSections: { title: string; questions: { text: string; type: string }[] }[],
    medications: any[],
    adherenceNotesByMedication: Record<string, ReviewNote[]>,
    effectivenessNotesByMedication: Record<string, ReviewNote[]>,
    previewMode: boolean = false,
    partTitles?: { part1: string; part2: string; part3: string; part4: string }
  ): Blob | void {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    let yPosition = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - (margin * 2);

    // Set default part titles if not provided
    const titles = partTitles || {
      part1: 'Part 1: General Questions',
      part2: 'Part 2: Current Medication Scheme',
      part3: 'Part 3: Therapy Adherence',
      part4: 'Part 4: Effectiveness & Side-Effects'
    };

    // Title
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
  doc.text(this.sanitizeForPdf('Anamnesis Preparation'), margin, yPosition);
    yPosition += 12;

    // Add horizontal line
    doc.setLineWidth(0.5);
    doc.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 8;

    // Part 1: General Questions
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
  doc.text(this.sanitizeForPdf(titles.part1), margin, yPosition);
    yPosition += 8;

    generalSections.forEach(section => {
      // Check if we need a new page
      if (yPosition > pageHeight - 40) {
        doc.addPage();
        yPosition = 20;
      }

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
  doc.text(this.sanitizeForPdf(section.title), margin, yPosition);
      yPosition += 6;

      section.questions.forEach(q => {
        if (yPosition > pageHeight - 30) {
          doc.addPage();
          yPosition = 20;
        }

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');

        // Draw checkbox or text field based on type
        if (q.type === 'checkbox' || q.type === 'checkbox-text') {
          // Draw checkbox
          doc.rect(margin, yPosition - 3, 4, 4);
          const lines = doc.splitTextToSize(this.sanitizeForPdf(q.text), contentWidth - 10);
          doc.text(lines, margin + 6, yPosition);
          yPosition += Math.max(6, lines.length * 5);

          // Add text field if checkbox-text
          if (q.type === 'checkbox-text') {
            doc.setDrawColor(200, 200, 200);
            doc.line(margin + 6, yPosition, pageWidth - margin, yPosition);
            yPosition += 8;
          }
        } else if (q.type === 'number') {
          const lines = doc.splitTextToSize(this.sanitizeForPdf(q.text), contentWidth - 25);
          doc.text(lines, margin, yPosition);
          const textHeight = lines.length * 5;
          // Draw number field box
          doc.setDrawColor(150, 150, 150);
          doc.rect(pageWidth - margin - 20, yPosition - 4, 20, 6);
          yPosition += Math.max(8, textHeight + 2);
        } else if (q.type === 'text' || q.type === 'text-small') {
          const lines = doc.splitTextToSize(this.sanitizeForPdf(q.text), contentWidth);
          doc.text(lines, margin, yPosition);
          yPosition += lines.length * 5 + 2;
          
          // Draw text field lines
          const lineCount = q.type === 'text' ? 2 : 1;
          doc.setDrawColor(200, 200, 200);
          for (let i = 0; i < lineCount; i++) {
            doc.line(margin, yPosition, pageWidth - margin, yPosition);
            yPosition += 6;
          }
        }

        yPosition += 2;
      });

      yPosition += 4;
    });

    // Part 2: Therapy Adherence
    if (yPosition > pageHeight - 50) {
      doc.addPage();
      yPosition = 20;
    } else {
      yPosition += 5;
    }

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
  doc.text(this.sanitizeForPdf(titles.part2), margin, yPosition);
    yPosition += 8;

    // Add medication scheme table
    if (medications.length > 0) {
      const tableData = medications.map(med => {
        // Check for special frequency first
        if (med.specialFrequency && med.specialDescription) {
          const freqText = this.formatSpecialFrequency(med.specialFrequency);
          return [
            this.sanitizeForPdf(med.name || 'Unnamed'),
            '',
            '',
            '',
            '',
            '',
            '',
            this.sanitizeForPdf(`${med.specialDescription} (${freqText})`)
          ];
        } else if (med.asNeeded) {
          // As needed medication
          return [
            this.sanitizeForPdf(med.name || 'Unnamed'),
            '',
            '',
            '',
            '',
            '',
            '',
            this.sanitizeForPdf('As needed')
          ];
        } else {
          // Standard daily schedule with intake moments
          return [
            this.sanitizeForPdf(med.name || 'Unnamed'),
            this.sanitizeForPdf(med.unitsBeforeBreakfast || ''),
            this.sanitizeForPdf(med.unitsDuringBreakfast || ''),
            this.sanitizeForPdf(med.unitsBeforeLunch || ''),
            this.sanitizeForPdf(med.unitsDuringLunch || ''),
            this.sanitizeForPdf(med.unitsBeforeDinner || ''),
            this.sanitizeForPdf(med.unitsDuringDinner || ''),
            this.sanitizeForPdf(med.unitsAtBedtime || '')
          ];
        }
      });

      autoTable(doc, {
        head: [['Medication', 'Before\nBreakfast', 'During\nBreakfast', 'Before\nLunch', 'During\nLunch', 'Before\nDinner', 'During\nDinner', 'Bedtime']],
        body: tableData,
        startY: yPosition,
        margin: margin,
        columnStyles: {
          0: { cellWidth: 50, halign: 'left' },
          1: { cellWidth: 15 },
          2: { cellWidth: 15 },
          3: { cellWidth: 15 },
          4: { cellWidth: 15 },
          5: { cellWidth: 15 },
          6: { cellWidth: 15 },
          7: { cellWidth: 30 }
        },
        headStyles: {
          fillColor: [69, 75, 96],
          textColor: 255,
          fontSize: 8,
          fontStyle: 'bold',
          halign: 'center',
          valign: 'middle'
        },
        bodyStyles: {
          fontSize: 9,
          textColor: 0,
          halign: 'center',
          valign: 'middle'
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245]
        }
      });

      yPosition = (doc as any).lastAutoTable.finalY + 10;
    }

    // Part 3: Therapy Adherence
    if (yPosition > pageHeight - 50) {
      doc.addPage();
      yPosition = 20;
    } else {
      yPosition += 5;
    }

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
  doc.text(this.sanitizeForPdf(titles.part3), margin, yPosition);
    yPosition += 8;

    // Render general notes first (if any)
    const generalAdherenceNotes = adherenceNotesByMedication['general'] || [];
    if (generalAdherenceNotes.length > 0) {
      if (yPosition > pageHeight - 40) {
        doc.addPage();
        yPosition = 20;
      }

      // General notes header
      doc.setFillColor(240, 240, 240);
      doc.rect(margin, yPosition - 5, contentWidth, 10, 'F');
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(this.sanitizeForPdf('General Notes'), margin + 2, yPosition);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      yPosition += 12;

      // Render each general note
      generalAdherenceNotes.forEach(note => {
        if (yPosition > pageHeight - 35) {
          doc.addPage();
          yPosition = 20;
        }

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        const noteLines = doc.splitTextToSize(this.sanitizeForPdf(`• ${note.text}`), contentWidth - 4);
        doc.text(noteLines, margin + 2, yPosition);
        yPosition += noteLines.length * 4 + 2;

        // Add text field for pharmacist notes
        doc.setDrawColor(200, 200, 200);
        doc.setFillColor(250, 250, 250);
        doc.rect(margin + 2, yPosition, contentWidth - 4, 15, 'FD');
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.text(this.sanitizeForPdf('Notities:'), margin + 4, yPosition + 3);
        doc.setTextColor(0, 0, 0);
        yPosition += 18;
      });

      yPosition += 3;
    }

    medications.forEach(med => {
      const cnk = med.cnk != null ? String(med.cnk) : 'uncategorized';
      const notes = adherenceNotesByMedication[cnk] || [];

      if (yPosition > pageHeight - 40) {
        doc.addPage();
        yPosition = 20;
      }

      // Medication header
      doc.setFillColor(240, 240, 240);
      doc.rect(margin, yPosition - 5, contentWidth, 10, 'F');
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
  doc.text(this.sanitizeForPdf(med.name || 'Unnamed medication'), margin + 2, yPosition);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
      yPosition += 12;

      // Notes
      if (notes.length === 0) {
        // Add placeholder space for pharmacist to write notes
        doc.setDrawColor(200, 200, 200);
        doc.setFillColor(250, 250, 250);
        doc.rect(margin + 2, yPosition, contentWidth - 4, 20, 'FD');
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
  doc.text(this.sanitizeForPdf('Notities:'), margin + 4, yPosition + 3);
        doc.setTextColor(0, 0, 0);
        yPosition += 23;
      }

      notes.forEach(note => {
        if (yPosition > pageHeight - 35) {
          doc.addPage();
          yPosition = 20;
        }

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
  const noteLines = doc.splitTextToSize(this.sanitizeForPdf(`• ${note.text}`), contentWidth - 4);
  doc.text(noteLines, margin + 2, yPosition);
        yPosition += noteLines.length * 4 + 2;

        // Add text field for pharmacist notes
        doc.setDrawColor(200, 200, 200);
        doc.setFillColor(250, 250, 250);
        doc.rect(margin + 2, yPosition, contentWidth - 4, 15, 'FD');
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
  doc.text(this.sanitizeForPdf('Notities:'), margin + 4, yPosition + 3);
        doc.setTextColor(0, 0, 0);
        yPosition += 18;
      });

      yPosition += 3;
    });

    // Part 4: Effectiveness & Side-Effects
    if (yPosition > pageHeight - 50) {
      doc.addPage();
      yPosition = 20;
    } else {
      yPosition += 5;
    }

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
  doc.text(this.sanitizeForPdf(titles.part4), margin, yPosition);
    yPosition += 8;

    // Render general notes first (if any)
    const generalEffectivenessNotes = effectivenessNotesByMedication['general'] || [];
    if (generalEffectivenessNotes.length > 0) {
      if (yPosition > pageHeight - 40) {
        doc.addPage();
        yPosition = 20;
      }

      // General notes header
      doc.setFillColor(240, 240, 240);
      doc.rect(margin, yPosition - 5, contentWidth, 10, 'F');
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(this.sanitizeForPdf('General Notes'), margin + 2, yPosition);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      yPosition += 12;

      // Render each general note
      generalEffectivenessNotes.forEach(note => {
        if (yPosition > pageHeight - 35) {
          doc.addPage();
          yPosition = 20;
        }

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        const noteLines = doc.splitTextToSize(this.sanitizeForPdf(`• ${note.text}`), contentWidth - 4);
        doc.text(noteLines, margin + 2, yPosition);
        yPosition += noteLines.length * 4 + 2;

        // Add text field for pharmacist notes
        doc.setDrawColor(200, 200, 200);
        doc.setFillColor(250, 250, 250);
        doc.rect(margin + 2, yPosition, contentWidth - 4, 15, 'FD');
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.text(this.sanitizeForPdf('Notities:'), margin + 4, yPosition + 3);
        doc.setTextColor(0, 0, 0);
        yPosition += 18;
      });

      yPosition += 3;
    }

    medications.forEach(med => {
      const cnk = med.cnk != null ? String(med.cnk) : 'uncategorized';
      const notes = effectivenessNotesByMedication[cnk] || [];

      if (yPosition > pageHeight - 40) {
        doc.addPage();
        yPosition = 20;
      }

      // Medication header
      doc.setFillColor(240, 240, 240);
      doc.rect(margin, yPosition - 5, contentWidth, 10, 'F');
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
  doc.text(this.sanitizeForPdf(med.name || 'Unnamed medication'), margin + 2, yPosition);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
      yPosition += 12;

      // Notes
      if (notes.length === 0) {
        // Add placeholder space for pharmacist to write notes
        doc.setDrawColor(200, 200, 200);
        doc.setFillColor(250, 250, 250);
        doc.rect(margin + 2, yPosition, contentWidth - 4, 20, 'FD');
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
  doc.text(this.sanitizeForPdf('Notities:'), margin + 4, yPosition + 3);
        doc.setTextColor(0, 0, 0);
        yPosition += 23;
      }

      notes.forEach(note => {
        if (yPosition > pageHeight - 35) {
          doc.addPage();
          yPosition = 20;
        }

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
  const noteLines = doc.splitTextToSize(this.sanitizeForPdf(`• ${note.text}`), contentWidth - 4);
  doc.text(noteLines, margin + 2, yPosition);
        yPosition += noteLines.length * 4 + 2;

        // Add text field for pharmacist notes
        doc.setDrawColor(200, 200, 200);
        doc.setFillColor(250, 250, 250);
        doc.rect(margin + 2, yPosition, contentWidth - 4, 15, 'FD');
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
  doc.text(this.sanitizeForPdf('Notities:'), margin + 4, yPosition + 3);
        doc.setTextColor(0, 0, 0);
        yPosition += 18;
      });

      yPosition += 3;
    });

    if (previewMode) {
      return doc.output('blob');
    } else {
      doc.save('anamnesis-preparation.pdf');
    }
  }
}
