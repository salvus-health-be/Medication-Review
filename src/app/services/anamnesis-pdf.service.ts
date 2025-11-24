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
    const original = s;

    s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Collapse standard whitespace
    s = s.replace(/\s+/g, ' ');

    // Replace curly quotes â†’ straight
    s = s.replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
         .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"');

    // Replace dash variants
    s = s.replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\u058A]/g, '-');

    // Replace bullets
    s = s.replace(/[\u2022\u2023\u2043\u00B7]/g, '-');

    // Ellipsis
    s = s.replace(/\u2026/g, '...');

    // Remove zero-width and invisible chars
    s = s.replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, '');

    // Normalize tricky spaces â†’ plain space
    s = s.replace(/[\u00A0\u202F\u2000-\u200A]/g, ' ');

    // Remove control characters (keeps \n)
    s = s.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F-\u009F]/g, '');

    s = s.replace("â†”", "<>");

    s = s.trim();
    
    // Log if characters were changed (for debugging)
    if (original !== s) {
    }

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

  private async loadLogoAsBase64(): Promise<string | null> {
    try {
      const response = await fetch('/images/Top_bar_logo.png');
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve(reader.result as string);
        };
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      return null;
    }
  }

  private async getLogoImageWithAspectRatio(): Promise<{ data: string; width: number; height: number } | null> {
    const logoBase64 = await this.loadLogoAsBase64();
    if (!logoBase64) return null;

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({
          data: logoBase64,
          width: img.naturalWidth,
          height: img.naturalHeight
        });
      };
      img.onerror = () => {
        resolve(null);
      };
      img.src = logoBase64;
    });
  }

  async generatePDF(
    generalSections: { title: string; questions: { text: string; type: string }[] }[],
    medications: any[],
    adherenceNotesByMedication: Record<string, ReviewNote[]>,
    effectivenessNotesByMedication: Record<string, ReviewNote[]>,
    previewMode: boolean = false,
    partTitles?: { part1: string; part2: string; part3: string; part4: string }
  ): Promise<Blob | void> {
    // Console log all notes for debugging
    
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

    // Add logo to top right with proper aspect ratio
    const logoInfo = await this.getLogoImageWithAspectRatio();
    if (logoInfo) {
      try {
        const maxLogoHeight = 15; // Maximum height in mm
        const aspectRatio = logoInfo.width / logoInfo.height;
        const logoHeight = maxLogoHeight;
        const logoWidth = logoHeight * aspectRatio; // Calculate width to maintain aspect ratio
        const logoX = pageWidth - margin - logoWidth; // Right aligned
        const logoY = margin; // Top aligned
        doc.addImage(logoInfo.data, 'PNG', logoX, logoY, logoWidth, logoHeight);
      } catch (error) {
      }
    }

    // Set default part titles if not provided
    const titles = partTitles || {
      part1: 'Part 1: General Questions',
      part2: 'Medication Scheme',
      part3: 'Part 2: Therapy Adherence',
      part4: 'Part 3: Effectiveness & Side-Effects'
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

    // Medication Schema (not numbered as a part)
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
        theme: 'grid',
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
          valign: 'middle',
          cellPadding: 3,
          lineWidth: 0.5,
          lineColor: [0, 0, 0]
        },
        bodyStyles: {
          fontSize: 9,
          textColor: 0,
          halign: 'center',
          valign: 'middle',
          cellPadding: 4,
          lineWidth: 0.3,
          lineColor: [100, 100, 100]
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245]
        }
      });

      yPosition = (doc as any).lastAutoTable.finalY + 10;
    }

    // Start a new page for the parts
    doc.addPage();
    yPosition = 20;

    // Part 1: General Questions
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
        doc.setDrawColor(100, 100, 100);
        doc.setLineWidth(0.3);

        // Draw checkbox or text field based on type
        if (q.type === 'checkbox' || q.type === 'checkbox-text') {
          // Draw checkbox with consistent border
          const checkboxSize = 4;
          doc.rect(margin, yPosition - 3, checkboxSize, checkboxSize); // Empty checkbox with border
          const lines = doc.splitTextToSize(this.sanitizeForPdf(q.text), contentWidth - 10);
          doc.text(lines, margin + 7, yPosition);
          yPosition += Math.max(6, lines.length * 5);

          // Add text field if checkbox-text
          if (q.type === 'checkbox-text') {
            doc.setDrawColor(200, 200, 200);
            doc.line(margin + 7, yPosition, pageWidth - margin, yPosition);
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

    // Combined Parts 2 & 3: Therapy Adherence and Effectiveness
    // Use landscape orientation for better space
    doc.addPage('a4', 'landscape');
    
    // Get landscape dimensions
    const landscapeWidth = doc.internal.pageSize.getWidth();
    const landscapeHeight = doc.internal.pageSize.getHeight();
    const landscapeMargin = 10; // Reduced from 15 to 10
    
    yPosition = landscapeMargin;

    // Prepare table data combining both parts with separate note fields
    const combinedTableData: any[] = [];
    
    // Add general notes row if they exist
    const generalAdherenceNotes = adherenceNotesByMedication['General'] || adherenceNotesByMedication['general'] || [];
    const generalEffectivenessNotes = effectivenessNotesByMedication['General'] || effectivenessNotesByMedication['general'] || [];
    
    if (generalAdherenceNotes.length > 0 || generalEffectivenessNotes.length > 0) {
      // Calculate estimated height for general notes using actual text measurement
      const estimateNoteHeight = (notes: ReviewNote[], columnWidth: number = 100) => {
        if (notes.length === 0) return 0;
        let totalHeight = 0;
        notes.forEach(note => {
          const noteText = this.sanitizeForPdf(note.text);
          const textLines = doc.splitTextToSize('- ' + noteText, columnWidth - 12);
          // Each note needs: actual text lines (3mm each) + writing space (min 12mm) + padding (6mm)
          totalHeight += (textLines.length * 3) + 18;
        });
        return totalHeight;
      };
      
      const adherenceHeight = estimateNoteHeight(generalAdherenceNotes);
      const effectivenessHeight = estimateNoteHeight(generalEffectivenessNotes);
      const estimatedHeight = Math.max(adherenceHeight, effectivenessHeight, 55);
      
      combinedTableData.push([
        this.sanitizeForPdf('General Notes'),
        { 
          adherenceNotes: generalAdherenceNotes, 
          effectivenessNotes: [], 
          isGeneral: true,
          maxNoteCount: Math.max(generalAdherenceNotes.length, generalEffectivenessNotes.length),
          estimatedHeight
        },
        { 
          adherenceNotes: [], 
          effectivenessNotes: generalEffectivenessNotes, 
          isGeneral: true,
          maxNoteCount: Math.max(generalAdherenceNotes.length, generalEffectivenessNotes.length),
          estimatedHeight
        }
      ]);
    }

    // Add rows for each medication
    medications.forEach(med => {
      const medName = med.name || 'Unnamed medication';
      const adherenceNotes = adherenceNotesByMedication[medName] || [];
      const effectivenessNotes = effectivenessNotesByMedication[medName] || [];
      const maxNoteCount = Math.max(adherenceNotes.length, effectivenessNotes.length);
      
      // Calculate estimated height needed based on actual text measurement
      const estimateNoteHeight = (notes: ReviewNote[], columnWidth: number = 100) => {
        if (notes.length === 0) return 0;
        let totalHeight = 0;
        notes.forEach(note => {
          const noteText = this.sanitizeForPdf(note.text);
          const textLines = doc.splitTextToSize('- ' + noteText, columnWidth - 12);
          // Each note needs: actual text lines (3mm each) + writing space (min 12mm) + padding (6mm)
          totalHeight += (textLines.length * 3) + 18;
        });
        return totalHeight;
      };
      
      const adherenceHeight = estimateNoteHeight(adherenceNotes);
      const effectivenessHeight = estimateNoteHeight(effectivenessNotes);
      const estimatedHeight = Math.max(adherenceHeight, effectivenessHeight, 55);
      
      combinedTableData.push([
        this.sanitizeForPdf(medName),
        { adherenceNotes, effectivenessNotes: [], isGeneral: false, maxNoteCount, estimatedHeight },
        { adherenceNotes: [], effectivenessNotes, isGeneral: false, maxNoteCount, estimatedHeight }
      ]);
    });

    // Create the combined table with custom cell rendering
    autoTable(doc, {
      head: [[
        this.sanitizeForPdf('Medication'),
        this.sanitizeForPdf(titles.part3),
        this.sanitizeForPdf(titles.part4)
      ]],
      body: combinedTableData,
      startY: yPosition,
      margin: landscapeMargin,
      theme: 'grid',
      columnStyles: {
        0: { cellWidth: 65, halign: 'left', valign: 'middle' },
        1: { cellWidth: 100, halign: 'left', valign: 'top' },
        2: { cellWidth: 100, halign: 'left', valign: 'top' }
      },
      headStyles: {
        fillColor: [69, 75, 96],
        textColor: 255,
        fontSize: 10,
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle',
        cellPadding: 5,
        lineWidth: 0.5,
        lineColor: [0, 0, 0]
      },
      bodyStyles: {
        fontSize: 8,
        textColor: 0,
        halign: 'left',
        valign: 'top',
        cellPadding: 5,
        minCellHeight: 55, // Default to ~1/3 of landscape page height
        lineWidth: 0.3,
        lineColor: [80, 80, 80]
      },
      rowPageBreak: 'avoid',
      alternateRowStyles: {
        fillColor: [250, 250, 250]
      },
      didParseCell: (data: any) => {
        // Set row height based on estimated height from note text length
        if (data.section === 'body') {
          const cellData = data.row.raw[1]; // Check column 1 for estimatedHeight
          if (typeof cellData === 'object' && cellData !== null && cellData.estimatedHeight) {
            // Use the pre-calculated estimated height based on actual text length
            const dynamicHeight = cellData.estimatedHeight;
            
            // Set the row's minCellHeight
            data.row.height = dynamicHeight;
            data.cell.styles.minCellHeight = dynamicHeight;
          }
        }
      },
      willDrawCell: (data: any) => {
        // Prevent default text rendering for columns 1 and 2 (notes columns)
        if (data.section === 'body' && (data.column.index === 1 || data.column.index === 2)) {
          data.cell.text = ''; // Clear the text so it doesn't render [object Object]
        }
      },
      didDrawCell: (data: any) => {
        // Custom rendering for notes columns with separate text fields
        if (data.section === 'body' && (data.column.index === 1 || data.column.index === 2)) {
          const cell = data.cell;
          const cellData = data.row.raw[data.column.index];
          
          if (typeof cellData === 'object' && cellData !== null) {
            const notes = data.column.index === 1 ? cellData.adherenceNotes : cellData.effectivenessNotes;
            const cellPadding = 3;
            let currentY = cell.y + cellPadding;
            
            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(0, 0, 0);
            
            // Calculate available space
            const availableWidth = cell.width - (cellPadding * 2);
            const availableHeight = cell.height - (cellPadding * 2);
            const displayNotes = notes; // Use all notes, don't limit them
            
            // Calculate individual heights for each note based on text length
            const noteHeights: number[] = [];
            let totalWeightedHeight = 0;
            
            if (displayNotes.length > 0) {
              // Calculate relative space needed for each note based on text length
              displayNotes.forEach((note: ReviewNote) => {
                const noteText = this.sanitizeForPdf(note.text);
                const textLines = doc.splitTextToSize('- ' + noteText, availableWidth - 6);
                // Each note needs: text lines + minimum writing space
                const neededHeight = (textLines.length * 3) + 18; // 3mm per line + 18mm for writing space
                noteHeights.push(neededHeight);
                totalWeightedHeight += neededHeight;
              });
              
              // Scale heights proportionally to fit available space
              const scaleFactor = availableHeight / totalWeightedHeight;
              for (let i = 0; i < noteHeights.length; i++) {
                noteHeights[i] = noteHeights[i] * scaleFactor;
              }
            } else {
              // Default: 3 equal sections if no notes
              const defaultHeight = availableHeight / 3;
              noteHeights.push(defaultHeight, defaultHeight, defaultHeight);
            }
            
            // If no notes, create equal sections with lines for writing
            if (displayNotes.length === 0) {
              let cumulativeY = currentY;
              for (let section = 0; section < 3; section++) {
                const sectionHeight = noteHeights[section];
                const sectionY = cumulativeY;
                
                // Draw separator line between sections
                if (section > 0) {
                  doc.setDrawColor(150, 150, 150);
                  doc.setLineWidth(0.3);
                  doc.line(
                    cell.x + cellPadding,
                    sectionY,
                    cell.x + cell.width - cellPadding,
                    sectionY
                  );
                }
                
                // Draw horizontal lines for writing
                doc.setDrawColor(200, 200, 200);
                doc.setLineWidth(0.15);
                const lineSpacing = 6;
                const startY = sectionY + 3;
                const writableHeight = sectionHeight - 3;
                const lineCount = Math.floor(writableHeight / lineSpacing);
                
                for (let i = 0; i < lineCount; i++) {
                  const lineY = startY + (i * lineSpacing);
                  if (lineY < sectionY + sectionHeight - 1) {
                    doc.line(
                      cell.x + cellPadding + 2,
                      lineY,
                      cell.x + cell.width - cellPadding - 2,
                      lineY
                    );
                  }
                }
                
                cumulativeY += sectionHeight;
              }
            } else {
              // Draw each note in its own section - heights based on actual text length
              let cumulativeY = currentY;
              displayNotes.forEach((note: ReviewNote, index: number) => {
                const noteHeight = noteHeights[index];
                const fieldY = cumulativeY;
                
                // Draw separator line between notes
                if (index > 0) {
                  doc.setDrawColor(150, 150, 150);
                  doc.setLineWidth(0.3);
                  doc.line(
                    cell.x + cellPadding,
                    fieldY,
                    cell.x + cell.width - cellPadding,
                    fieldY
                  );
                }
                
                // Draw the note text at the top of the section
                const noteText = this.sanitizeForPdf(note.text);
                doc.setFontSize(7.5);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(40, 40, 40);
                
                // Use a simple bullet character that works in PDF
                const bulletText = '- ' + noteText;
                const textLines = doc.splitTextToSize(bulletText, availableWidth - 6);
                
                // Display ALL text lines without artificial limiting
                const lineHeight = 3;
                const maxTextHeight = noteHeight - 6; // Leave 6mm total padding (4 top + 2 bottom)
                const maxPossibleLines = Math.floor(maxTextHeight / lineHeight);
                
                // Use all text lines up to what fits in the allocated space
                const displayLines = textLines.slice(0, Math.min(maxPossibleLines, textLines.length));
                
                doc.text(displayLines, cell.x + cellPadding + 3, fieldY + 4);
                
                // Add horizontal lines for writing below the note - use whatever space remains
                doc.setDrawColor(200, 200, 200);
                doc.setLineWidth(0.15);
                const textHeight = displayLines.length * lineHeight;
                const startLineY = fieldY + 4 + textHeight + 2;
                const remainingHeight = noteHeight - (4 + textHeight + 2);
                
                // Only add writing lines if there's actually space (at least 1 line worth)
                if (remainingHeight >= 6) {
                  const lineSpacing = 6;
                  const lineCount = Math.floor(remainingHeight / lineSpacing);
                  
                  for (let j = 0; j < lineCount; j++) {
                    const lineY = startLineY + (j * lineSpacing);
                    if (lineY < fieldY + noteHeight - 1) {
                      doc.line(
                        cell.x + cellPadding + 2,
                        lineY,
                        cell.x + cell.width - cellPadding - 2,
                        lineY
                      );
                    }
                  }
                }
                
                cumulativeY += noteHeight;
              });
            }
          }
        }
      }
    });

    if (previewMode) {
      return doc.output('blob');
    } else {
      doc.save('anamnesis-preparation.pdf');
    }
  }
}
