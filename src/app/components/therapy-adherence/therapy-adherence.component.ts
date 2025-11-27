import { Component, OnInit, AfterViewInit, OnDestroy, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import 'chartjs-adapter-date-fns';
import { forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import { StateService } from '../../services/state.service';
import { DispensingHistoryResponse, CnkDispensingData, Medication as ApiMedication } from '../../models/api.models';
import { ManualDispensingModalComponent } from '../manual-dispensing-modal/manual-dispensing-modal.component';
import { ManageMomentsModalComponent } from '../manage-moments-modal/manage-moments-modal.component';

// Register Chart.js components
Chart.register(...registerables);

interface MedicationWithDispensingData {
  medication: ApiMedication;
  dispensingData: CnkDispensingData | null;
  chartId: string;
  unitsPerPackage: number; // User-defined units per package
}

interface StockDataPoint {
  x: Date;
  y: number;
  status: 'sufficient' | 'depleted' | 'oversupply';
}

interface DispensingMomentWithUnits {
  date: Date;
  amount: number;          // Number of packages
  unitsPerPackage: number; // Units in one package
  totalUnits: number;      // amount × unitsPerPackage
  dateString: string;
  source?: 'csv' | 'manual'; // Source of dispensing moment
  vmp?: number | null;     // VMP code from dispensing data
}

@Component({
  selector: 'app-therapy-adherence',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslocoModule, ManualDispensingModalComponent, ManageMomentsModalComponent],
  templateUrl: './therapy-adherence.component.html',
  styleUrls: ['./therapy-adherence.component.scss']
})
export class TherapyAdherenceComponent implements OnInit, AfterViewInit, OnDestroy {
  @Output() openNotes = new EventEmitter<ApiMedication>();
  
  selectedFile: File | null = null;
  uploading = false;
  uploadSuccess = false;
  uploadError: string | null = null;
  showManualDispensingModal = false;
  showManageMomentsModal = false;
  
  dispensingHistory: DispensingHistoryResponse | null = null;
  medications: ApiMedication[] = [];
  medicationsWithData: MedicationWithDispensingData[] = [];
  
  loading = false;
  queryError: string | null = null;
  
  dateRange: { earliest: Date | null, latest: Date | null } = { earliest: null, latest: null };
  fullDateRange: { earliest: Date | null, latest: Date | null } = { earliest: null, latest: null }; // Store the full unfiltered range
  maxStockValue: number = 0; // Maximum stock value across all medications for y-axis scaling
  
  // VMP cache for CNK to VMP conversions
  private vmpCache: Map<string, number | null> = new Map();
  
  // Filtering and zoom controls
  filterStartDate: string = ''; // ISO date string for input
  filterEndDate: string = ''; // ISO date string for input
  zoomLevel: number = 1; // 1 = full range, values < 1 = zoomed in
  panPosition: number = 0; // 0 to 100, percentage of how far panned
  
  private charts: Map<string, Chart> = new Map();

  constructor(
    private apiService: ApiService,
    private stateService: StateService
  ) {}

  ngOnInit() {
    this.refreshData();
  }

  ngAfterViewInit() {
    // Charts will be created after data is loaded
  }

  ngOnDestroy() {
    // Clean up all charts
    this.charts.forEach(chart => chart.destroy());
    this.charts.clear();
  }

  // Public method to refresh all data and charts
  refreshData() {
    // Clear existing charts before refreshing
    this.charts.forEach(chart => chart.destroy());
    this.charts.clear();
    
    // Reset medications with data to force re-render
    this.medicationsWithData = [];
    
    // Load both medications and dispensing history, then match
    this.loadAllData();
  }

  private loadAllData() {
    const apbNumber = this.stateService.apbNumber;
    const reviewId = this.stateService.medicationReviewId;
    
    if (!apbNumber || !reviewId) return;

    this.loading = true;
    this.uploadError = null;
    this.queryError = null;

    // Load medications and dispensing history in parallel
    const medications$ = this.apiService.getMedications(apbNumber, reviewId).pipe(
      catchError(err => {
        console.error('[Therapy Adherence] Failed to load medications:', err);
        return of([]);
      })
    );

    const dispensingHistory$ = this.apiService.queryDispensingHistory(apbNumber, reviewId).pipe(
      catchError(err => {
        if (err.status === 404) {
          // No dispensing history yet - this is normal
          return of(null);
        }
        console.error('[Therapy Adherence] Failed to load dispensing history:', err);
        this.queryError = err.error?.error || 'Failed to load dispensing history';
        return of(null);
      })
    );

    forkJoin([medications$, dispensingHistory$]).subscribe({
      next: ([medications, dispensingHistory]) => {
        this.medications = medications;
        this.loading = false;

        if (dispensingHistory) {
          this.dispensingHistory = dispensingHistory;
          this.uploadSuccess = true;

          if (dispensingHistory.dispensingData && Array.isArray(dispensingHistory.dispensingData)) {
            this.matchDispensingData();
          } else {
            this.queryError = 'Backend API needs to be updated to return dispensing data in the new format';
          }
        } else {
          this.uploadSuccess = false;
          this.dispensingHistory = null;
          this.medicationsWithData = [];
        }
      },
      error: (err) => {
        console.error('[Therapy Adherence] Failed to load data:', err);
        this.loading = false;
        this.queryError = 'Failed to load data';
      }
    });
  }

  loadMedications() {
    const apbNumber = this.stateService.apbNumber;
    const reviewId = this.stateService.medicationReviewId;
    if (!reviewId) return;

    this.apiService.getMedications(apbNumber, reviewId).subscribe({
      next: (medications) => {
        this.medications = medications;
        
        // If we already have dispensing data, match it
        if (this.dispensingHistory) {
          this.matchDispensingData();
        }
      },
      error: (err) => {
      }
    });
  }

  checkExistingFile() {
    const apbNumber = this.stateService.apbNumber;
    const reviewId = this.stateService.medicationReviewId;

    if (!apbNumber || !reviewId) return;

    this.loading = true;
    this.uploadError = null;
    this.queryError = null;
    
    this.apiService.queryDispensingHistory(apbNumber, reviewId).subscribe({
      next: (response) => {
        
        this.dispensingHistory = response;
        this.uploadSuccess = true;
        this.loading = false;
        
        // Check if we have the new format with dispensingData
        if (response.dispensingData && Array.isArray(response.dispensingData)) {
          // Match with medications
          this.matchDispensingData();
        } else {
          this.queryError = 'Backend API needs to be updated to return dispensing data in the new format';
        }
      },
      error: (err) => {
        
        this.loading = false;
        
        // 404 means no file uploaded yet - show upload form
        if (err.status === 404) {
          this.uploadSuccess = false;
          this.dispensingHistory = null;
          this.medicationsWithData = [];
        } else {
          // Other errors - still try to show upload form but display error
          this.uploadSuccess = false;
          this.queryError = err.error?.error || 'Failed to load dispensing history';
        }
      }
    });
  }

  matchDispensingData() {
    if (!this.dispensingHistory || this.medications.length === 0) {
      return;
    }

    if (!this.dispensingHistory.dispensingData) {
      return;
    }

    // Step 1: Cache any existing VMPs from medications and dispensing data
    this.medications.forEach(med => {
      if (med.cnk && med.vmp && !this.vmpCache.has(med.cnk.toString())) {
        this.vmpCache.set(med.cnk.toString(), med.vmp);
        console.log(`[Therapy Adherence] Cached existing medication VMP for CNK ${med.cnk}: ${med.vmp}`);
      }
    });
    
    this.dispensingHistory.dispensingData.forEach(data => {
      if (data.cnk && data.vmp && !this.vmpCache.has(data.cnk)) {
        this.vmpCache.set(data.cnk, data.vmp);
        console.log(`[Therapy Adherence] Cached existing dispensing VMP for CNK ${data.cnk}: ${data.vmp}`);
      }
    });
    
    // Step 2: Collect all CNKs that need VMP resolution
    const cnksToResolve: string[] = [];
    
    // Collect medication CNKs that don't have VMP
    this.medications.forEach(med => {
      if (med.cnk && !this.vmpCache.has(med.cnk.toString())) {
        cnksToResolve.push(med.cnk.toString());
      }
    });
    
    // Collect dispensing data CNKs that don't have VMP
    this.dispensingHistory.dispensingData.forEach(data => {
      if (data.cnk && !this.vmpCache.has(data.cnk)) {
        cnksToResolve.push(data.cnk);
      }
    });

    // If no CNKs to resolve, proceed with matching
    if (cnksToResolve.length === 0) {
      console.log('[Therapy Adherence] All VMPs cached, proceeding to matching...');
      this.performVmpMatching();
      return;
    }

    // Step 3: Resolve all CNKs to VMPs in bulk
    console.log(`[Therapy Adherence] Resolving ${cnksToResolve.length} CNKs to VMPs...`);
    
    const lookupObservables = cnksToResolve.map(cnk => 
      this.apiService.getVmpFromCnk(cnk).pipe(
        catchError(err => {
          console.error(`[Therapy Adherence] Failed to resolve CNK ${cnk}:`, err);
          return of({ cnk: parseInt(cnk), vmp: null, found: false });
        })
      )
    );

    forkJoin(lookupObservables).subscribe({
      next: (results) => {
        // Step 4: Cache all VMP results
        results.forEach(result => {
          this.vmpCache.set(result.cnk.toString(), result.vmp);
          console.log(`[Therapy Adherence] Resolved and cached VMP for CNK ${result.cnk}: ${result.vmp}`);
        });

        // Step 5: Perform VMP-based matching
        this.performVmpMatching();
      },
      error: (err) => {
        console.error('[Therapy Adherence] Failed to resolve VMPs:', err);
        // Fall back to CNK matching if VMP resolution fails
        this.performCnkMatching();
      }
    });
  }

  private performVmpMatching() {
    console.log('[Therapy Adherence] Performing VMP-based matching...');
    console.log('[Therapy Adherence] VMP Cache:', Array.from(this.vmpCache.entries()));
    
    this.medicationsWithData = this.medications.map(medication => {
      console.log(`[Therapy Adherence] Matching medication: "${medication.name}", CNK: ${medication.cnk}, VMP: ${medication.vmp}`);
      
      // Get VMP for medication (prefer medication.vmp, then cache)
      const medicationVmp = medication.vmp ?? this.vmpCache.get(medication.cnk?.toString() || '');
      console.log(`[Therapy Adherence]   -> Resolved medication VMP: ${medicationVmp}`);
      
      let matchingData: CnkDispensingData | null = null;
      
      if (medicationVmp) {
        // Try to find dispensing data with matching VMP
        console.log(`[Therapy Adherence]   -> Searching for VMP match in ${this.dispensingHistory!.dispensingData.length} dispensing records...`);
        matchingData = this.dispensingHistory!.dispensingData.find(d => {
          const dataVmpRaw = d.vmp ?? this.vmpCache.get(d.cnk);
          // Convert both VMPs to numbers for comparison (handle string/number type mismatch)
          const dataVmp = dataVmpRaw ? Number(dataVmpRaw) : null;
          const medVmp = Number(medicationVmp);
          
          console.log(`[Therapy Adherence]     -> Checking dispensing CNK ${d.cnk}: VMP=${dataVmp}`);
          
          const matches = dataVmp !== null && !isNaN(dataVmp) && !isNaN(medVmp) && dataVmp === medVmp;
          
          if (matches) {
            console.log(`[Therapy Adherence]   ✓ MATCHED by VMP! Medication "${medication.name}" (VMP: ${medVmp}) with dispensing CNK ${d.cnk} (VMP: ${dataVmp})`);
          }
          return matches;
        }) || null;
      }
      
      // Fallback: if no VMP match, try direct CNK match
      if (!matchingData && medication.cnk) {
        const medCnkString = medication.cnk.toString();
        console.log(`[Therapy Adherence]   -> Trying CNK fallback match for CNK ${medCnkString}...`);
        matchingData = this.dispensingHistory!.dispensingData.find(d => {
          const dispensingCnkString = d.cnk.toString();
          const matches = dispensingCnkString === medCnkString;
          if (matches) {
            console.log(`[Therapy Adherence]   ✓ MATCHED by CNK! Medication "${medication.name}" CNK ${medCnkString} with dispensing CNK ${dispensingCnkString}`);
          }
          return matches;
        }) || null;
      }
      
      if (!matchingData) {
        console.log(`[Therapy Adherence]   ✗ NO MATCH for medication "${medication.name}"`);
      }
      
      const chartId = `chart-${medication.medicationId}`;

      return {
        medication,
        dispensingData: matchingData,
        chartId,
        unitsPerPackage: medication.packageSize ?? 0 // Initialize from packageSize
      };
    });

    // Calculate date range from all dispensing moments
    this.calculateDateRange();

    // Create charts after a short delay to ensure DOM is ready
    setTimeout(() => this.createCharts(), 100);
  }

  private performCnkMatching() {
    console.log('[Therapy Adherence] Falling back to CNK-based matching...');
    
    this.medicationsWithData = this.medications.map(medication => {
      // Match by CNK code
      const cnkString = medication.cnk?.toString();
      const matchingData = cnkString 
        ? this.dispensingHistory!.dispensingData.find(d => d.cnk === cnkString)
        : null;
      
      const chartId = `chart-${medication.medicationId}`;

      return {
        medication,
        dispensingData: matchingData || null,
        chartId,
        unitsPerPackage: medication.packageSize ?? 0 // Initialize from packageSize
      };
    });

    // Calculate date range from all dispensing moments
    this.calculateDateRange();

    // Create charts after a short delay to ensure DOM is ready
    setTimeout(() => this.createCharts(), 100);
  }

  calculateDateRange() {
    let earliestTime: number | null = null;
    let latestTime: number | null = null;

    this.dispensingHistory?.dispensingData.forEach(cnkData => {
      cnkData.dispensingMoments.forEach(moment => {
        const date = this.parseDate(moment.date);
        const time = date.getTime();
        
        if (earliestTime === null || time < earliestTime) {
          earliestTime = time;
        }
        
        if (latestTime === null || time > latestTime) {
          latestTime = time;
        }
      });
    });

    // Extend latest to current date if it's after the last dispensing
    const now = new Date().getTime();
    if (latestTime === null || now > latestTime) {
      latestTime = now;
    }

    // Add padding to prevent points from being cut off at edges
    // Add 7 days before earliest and after latest
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const paddedEarliest = earliestTime !== null ? new Date(earliestTime - sevenDays) : null;
    const paddedLatest = latestTime !== null ? new Date(latestTime + sevenDays) : null;

    // Store full range for reset functionality
    this.fullDateRange = { earliest: paddedEarliest, latest: paddedLatest };
    
    // Apply filters and zoom
    this.applyDateRangeFilters();
  }

  applyDateRangeFilters() {
    let earliest = this.fullDateRange.earliest;
    let latest = this.fullDateRange.latest;

    if (!earliest || !latest) {
      this.dateRange = { earliest, latest };
      return;
    }

    // Apply custom date filters if set
    if (this.filterStartDate) {
      const filterStart = new Date(this.filterStartDate);
      if (filterStart.getTime() > earliest.getTime()) {
        earliest = filterStart;
      }
    }

    if (this.filterEndDate) {
      const filterEnd = new Date(this.filterEndDate);
      if (filterEnd.getTime() < latest.getTime()) {
        latest = filterEnd;
      }
    }

    // Apply zoom level (zoom reduces the visible range)
    if (this.zoomLevel < 1) {
      const totalRange = latest.getTime() - earliest.getTime();
      const visibleRange = totalRange * this.zoomLevel;
      
      // Apply pan position
      const maxPanOffset = totalRange - visibleRange;
      const panOffset = (this.panPosition / 100) * maxPanOffset;
      
      const newStart = earliest.getTime() + panOffset;
      const newEnd = newStart + visibleRange;
      
      earliest = new Date(newStart);
      latest = new Date(newEnd);
    }

    this.dateRange = { earliest, latest };
  }

  onDateFilterChange() {
    this.applyDateRangeFilters();
    this.createCharts();
  }

  resetDateFilter() {
    this.filterStartDate = '';
    this.filterEndDate = '';
    this.zoomLevel = 1;
    this.panPosition = 0;
    this.applyDateRangeFilters();
    this.createCharts();
  }

  zoomIn() {
    if (this.zoomLevel > 0.1) {
      this.zoomLevel = Math.max(0.1, this.zoomLevel - 0.1);
      this.applyDateRangeFilters();
      this.createCharts();
    }
  }

  zoomOut() {
    if (this.zoomLevel < 1) {
      this.zoomLevel = Math.min(1, this.zoomLevel + 0.1);
      if (this.zoomLevel >= 0.99) {
        this.zoomLevel = 1;
        this.panPosition = 0; // Reset pan when fully zoomed out
      }
      this.applyDateRangeFilters();
      this.createCharts();
    }
  }

  onPanChange(event: Event) {
    const input = event.target as HTMLInputElement;
    this.panPosition = parseFloat(input.value);
    this.applyDateRangeFilters();
    this.createCharts();
  }

  isPanEnabled(): boolean {
    return this.zoomLevel < 1;
  }

  getDateTicks(): string[] {
    if (!this.dateRange.earliest || !this.dateRange.latest) {
      return [];
    }

    const formatDate = (date: Date) => {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
    };

    const ticks: string[] = [];
    const current = new Date(this.dateRange.earliest);
    const end = this.dateRange.latest;

    // Generate monthly ticks
    while (current <= end) {
      ticks.push(formatDate(current));
      current.setMonth(current.getMonth() + 1);
    }

    // Limit to reasonable number of ticks (show every 2-3 months if too many)
    if (ticks.length > 8) {
      return ticks.filter((_, index) => index % 2 === 0);
    }

    return ticks;
  }

  getTimeScaleConfig() {
    if (!this.dateRange.earliest || !this.dateRange.latest) {
      return {
        unit: 'month' as const,
        displayFormats: {
          month: 'MMM yyyy'
        }
      };
    }

    // Calculate the visible date range in days
    const rangeMs = this.dateRange.latest.getTime() - this.dateRange.earliest.getTime();
    const rangeDays = rangeMs / (24 * 60 * 60 * 1000);

    // Determine appropriate time unit based on visible range
    // Use days and weeks earlier for more granular ticks when zooming in
    if (rangeDays <= 30) {
      // 30 days or less - show days
      return {
        unit: 'day' as const,
        displayFormats: {
          day: 'dd MMM'
        }
      };
    } else if (rangeDays <= 180) {
      // Up to ~6 months - show weeks
      return {
        unit: 'week' as const,
        displayFormats: {
          week: 'dd MMM'
        }
      };
    } else {
      // Default to months for larger ranges
      return {
        unit: 'month' as const,
        displayFormats: {
          month: 'MMM yyyy'
        }
      };
    }
    // Do not use quarters/years - when zoomed out beyond 1 year, still display months
    return {
      unit: 'month' as const,
      displayFormats: {
        month: 'MMM yyyy'
      }
    };
  }

  createCharts() {
    // Destroy existing charts
    this.charts.forEach(chart => chart.destroy());
    this.charts.clear();

    // Calculate maximum stock value across all medications for consistent y-axis scaling
    this.calculateMaxStockValue();

    this.medicationsWithData.forEach(item => {
      if (item.dispensingData && item.unitsPerPackage > 0) {
        this.createChart(item);
      }
    });
  }

  onUnitsPerPackageChange(item: MedicationWithDispensingData) {
    // Save to backend via packageSize field
    const apbNumber = this.stateService.apbNumber;
    const reviewId = this.stateService.medicationReviewId;
    const medicationId = item.medication.medicationId;
    
    if (apbNumber && reviewId && medicationId) {
      this.apiService.updateMedication(apbNumber, reviewId, medicationId, {
        packageSize: item.unitsPerPackage
      }).subscribe({
        next: (updatedMed) => {
          // Update local medication object
          item.medication.packageSize = updatedMed.packageSize ?? null;
        },
        error: (err) => {
          console.error('Failed to save units per package:', err);
        }
      });
    }

    // Destroy existing chart if it exists
    const existingChart = this.charts.get(item.chartId);
    if (existingChart) {
      existingChart.destroy();
      this.charts.delete(item.chartId);
    }

    // Recalculate max stock value across all medications
    this.calculateMaxStockValue();

    // Recreate all charts to maintain consistent scaling
    this.medicationsWithData.forEach(med => {
      const chart = this.charts.get(med.chartId);
      if (chart) {
        chart.destroy();
        this.charts.delete(med.chartId);
      }
    });

    // Recreate charts after a short delay
    setTimeout(() => {
      this.medicationsWithData.forEach(med => {
        if (med.dispensingData && med.unitsPerPackage > 0) {
          this.createChart(med);
        }
      });
    }, 50);
  }

  calculateMaxStockValue() {
    let maxStock = 0;

    this.medicationsWithData.forEach(item => {
      if (!item.dispensingData) return;

      const dailyUsage = this.calculateDailyUsage(item.medication);
      if (dailyUsage <= 0) return;

      const unitsPerPackage = item.unitsPerPackage;
      if (unitsPerPackage <= 0) return;

      const moments = item.dispensingData.dispensingMoments.map(moment => ({
        date: this.parseDate(moment.date),
        amount: moment.amount,
        unitsPerPackage: unitsPerPackage,
        totalUnits: moment.amount * unitsPerPackage,
        dateString: moment.date
      })).sort((a, b) => a.date.getTime() - b.date.getTime());

      const stockTimeline = this.generateStockTimeline(moments, dailyUsage);
      
      stockTimeline.forEach(point => {
        if (point.y > maxStock) {
          maxStock = point.y;
        }
      });
    });

    // Add 20% padding to the max value to prevent points from being above visible area
    this.maxStockValue = Math.ceil(maxStock * 1.2);
  }

  createChart(item: MedicationWithDispensingData) {
    const canvas = document.getElementById(item.chartId) as HTMLCanvasElement;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Calculate daily usage
    const dailyUsage = this.calculateDailyUsage(item.medication);
    
    // Get units per package from user input (not from packageSize)
    const unitsPerPackage = item.unitsPerPackage;

    if (dailyUsage === 0 || unitsPerPackage === 0) {
      // Don't create chart if unitsPerPackage is 0 - will show "Amount per package not set" message
      return;
    }

    // Parse dates and sort chronologically, calculate total units
    const moments: DispensingMomentWithUnits[] = item.dispensingData!.dispensingMoments.map(moment => ({
      date: this.parseDate(moment.date),
      amount: moment.amount,
      unitsPerPackage: unitsPerPackage,
      totalUnits: moment.amount * unitsPerPackage,
      dateString: moment.date,
      source: moment.source || 'csv', // Default to csv if not specified
      vmp: item.dispensingData!.vmp // Include VMP from parent dispensing data
    })).sort((a, b) => a.date.getTime() - b.date.getTime());

    // Generate stock timeline with status
    const stockTimeline = this.generateStockTimeline(moments, dailyUsage);

    // Create datasets for different statuses - only include points with matching status
    const allStockData: any[] = [];
    const dispensingPoints: any[] = [];

    // Add all stock data points at fixed y-value (0.5 = middle of chart)
    stockTimeline.forEach(point => {
      allStockData.push({
        x: point.x,
        y: 0.5, // Fixed y-value - all nodes at same height
        originalY: point.y, // Keep original value for tooltip
        status: point.status
      });
    });

    // Add dispensing markers at fixed y-value
    moments.forEach(moment => {
      dispensingPoints.push({
        x: moment.date,
        y: 0.5, // Fixed y-value - all nodes at same height
        dateString: moment.dateString,
        amount: moment.amount,
        unitsPerPackage: moment.unitsPerPackage,
        totalUnits: moment.totalUnits,
        source: moment.source || 'csv',
        vmp: moment.vmp // Include VMP for tooltip
      });
    });

    allStockData.slice(0, 10).forEach((p, i) => {
    });
    dispensingPoints.forEach((p, i) => {
    });

    const config: ChartConfiguration<'line'> = {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Stock Level',
            data: allStockData,
            borderColor: (context: any) => {
              if (!context.raw) return 'rgb(200, 200, 200)';
              const status = context.raw.status;
              if (status === 'sufficient') return 'rgb(54, 162, 235)'; // Blue
              if (status === 'depleted') return 'rgb(255, 99, 132)'; // Red
              if (status === 'oversupply') return 'rgb(153, 102, 255)'; // Purple
              return 'rgb(200, 200, 200)';
            },
            segment: {
              borderColor: (context: any) => {
                const point = context.p1 as any;
                if (!point || !point.raw) return 'rgb(200, 200, 200)';
                const status = point.raw.status;
                if (status === 'sufficient') return 'rgb(54, 162, 235)'; // Blue
                if (status === 'depleted') return 'rgb(255, 99, 132)'; // Red
                if (status === 'oversupply') return 'rgb(153, 102, 255)'; // Purple
                return 'rgb(200, 200, 200)';
              }
            },
            backgroundColor: 'rgba(54, 162, 235, 0.1)',
            pointRadius: 0,
            pointHoverRadius: 0,
            pointHitRadius: 50, // Much larger hit area for easier hovering
            borderWidth: 3,
            hoverBorderWidth: 5, // Thicker on hover
            fill: true,
            tension: 0.1
          },
          {
            label: 'Dispensing',
            data: dispensingPoints,
            borderColor: (context: any) => {
              if (!context.raw) return 'rgb(0, 0, 0)';
              return context.raw.source === 'manual' ? 'rgb(255, 152, 0)' : 'rgb(0, 0, 0)'; // Orange for manual, black for CSV
            },
            backgroundColor: (context: any) => {
              if (!context.raw) return 'rgb(0, 0, 0)';
              return context.raw.source === 'manual' ? 'rgb(255, 152, 0)' : 'rgb(0, 0, 0)'; // Orange for manual, black for CSV
            },
            pointRadius: 6,
            pointHoverRadius: 8,
            pointHitRadius: 50, // Much larger hit area for easier hovering
            showLine: false,
            order: -1 // Draw on top
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: {
            left: 5,
            right: 10,
            top: 5,
            bottom: 0
          }
        },
        scales: {
          x: {
            type: 'time',
            time: this.getTimeScaleConfig(),
            min: this.dateRange.earliest?.getTime(),
            max: this.dateRange.latest?.getTime(),
            display: true,
            grid: {
              display: true,
              drawOnChartArea: false,
              color: 'rgba(0, 0, 0, 0.1)'
            },
            ticks: {
              font: {
                size: 9
              },
              maxRotation: 0,
              autoSkipPadding: 10,
              color: '#666'
            },
            border: {
              display: true,
              color: 'rgba(0, 0, 0, 0.2)'
            }
          },
          y: {
            display: false,
            grid: {
              display: false
            },
            beginAtZero: true,
            min: 0,
            max: 1
          }
        },
        plugins: {
          tooltip: {
            enabled: true,
            position: 'nearest',
            yAlign: 'top',
            xAlign: 'center',
            caretPadding: 20,
            displayColors: false,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            titleColor: '#fff',
            bodyColor: '#fff',
            borderColor: 'rgba(0, 0, 0, 0.9)',
            borderWidth: 1,
            padding: 10,
            callbacks: {
              title: (context: any) => {
                const date = new Date(context[0].parsed.x);
                return this.formatDateForTooltip(date);
              },
              label: (context: any) => {
                const datasetLabel = context.dataset.label;
                const raw = context.raw as any;
                
                if (datasetLabel === 'Dispensing') {
                  const sourceLabel = raw.source === 'manual' ? ' (Manual)' : ' (CSV)';
                  const vmpLabel = raw.vmp ? ` [VMP: ${raw.vmp}]` : '';
                  return [
                    `Dispensed: ${raw.amount} package(s)${sourceLabel}`,
                    `Package size: ${raw.unitsPerPackage} units`,
                    `Total: ${raw.totalUnits} units${vmpLabel}`
                  ];
                }
                
                // Show original stock value from stored data
                const stock = raw.originalY !== undefined ? raw.originalY : 0;
                return `Stock: ${stock.toFixed(1)} units`;
              }
            }
          },
          legend: {
            display: false
          }
        }
      }
    };

    const chart = new Chart(ctx, config);
    this.charts.set(item.chartId, chart);
  }

  calculateDailyUsage(medication: ApiMedication): number {
    const before = (medication.unitsBeforeBreakfast || 0) + 
                   (medication.unitsBeforeLunch || 0) + 
                   (medication.unitsBeforeDinner || 0);
    const during = (medication.unitsDuringBreakfast || 0) + 
                   (medication.unitsDuringLunch || 0) + 
                   (medication.unitsDuringDinner || 0);
    const bedtime = medication.unitsAtBedtime || 0;
    
    return before + during + bedtime;
  }

  generateStockTimeline(
    moments: DispensingMomentWithUnits[],
    dailyUsage: number
  ): StockDataPoint[] {
    const timeline: StockDataPoint[] = [];
    const oneDay = 24 * 60 * 60 * 1000; // milliseconds in a day

    if (moments.length === 0) return timeline;

    // Normalize all dispensing dates to midnight UTC to avoid timezone issues
    const normalizedMoments = moments.map(m => {
      const year = m.date.getFullYear();
      const month = m.date.getMonth();
      const day = m.date.getDate();
      return {
        ...m,
        normalizedDate: new Date(Date.UTC(year, month, day, 0, 0, 0, 0))
      };
    });

    // Start from first dispensing
    const firstDate = normalizedMoments[0].normalizedDate;
    const lastDate = normalizedMoments[normalizedMoments.length - 1].normalizedDate;
    
    // Extend end date to show depletion after last dispensing
    const extendedEndDate = new Date(lastDate.getTime() + (90 * oneDay)); // 90 days after last

    let currentStock = 0;
    let currentDate = new Date(firstDate.getTime()); // Clone the start date

    normalizedMoments.forEach((m, idx) => {
    });

    // Generate daily data points
    let dayCounter = 0;
    let lastDispensingDay = -1; // Track when we last received medication
    let oversupplyUntilDay = -1; // Track how many days the oversupply lasts
    
    while (currentDate <= extendedEndDate) {
      const currentDateKey = currentDate.getTime();
      
      // Check if we have any dispensings on this date
      let totalUnitsDispensedToday = 0;
      let receivedDispensingToday = false;
      
      // Check all dispensing moments for this date
      for (let i = 0; i < normalizedMoments.length; i++) {
        if (normalizedMoments[i].normalizedDate.getTime() === currentDateKey) {
          totalUnitsDispensedToday += normalizedMoments[i].totalUnits;
          receivedDispensingToday = true;
        }
      }
      
      // Track stock BEFORE receiving today's dispensing
      const stockBeforeDispensing = currentStock;
      
      // Add dispensed units at the start of the day
      if (totalUnitsDispensedToday > 0) {
        currentStock += totalUnitsDispensedToday;
        
        // If we received medication while still having stock, calculate oversupply period
        if (stockBeforeDispensing > 0) {
          // The oversupply lasts for as many days as the previous stock would have lasted
          const daysOfOversupply = Math.floor(stockBeforeDispensing / dailyUsage);
          oversupplyUntilDay = dayCounter + daysOfOversupply;
          
        } else {
        }
        
        lastDispensingDay = dayCounter;
      }

      // Determine current status BEFORE depleting
      let status: 'sufficient' | 'depleted' | 'oversupply';
      
      if (currentStock <= 0) {
        status = 'depleted';
        if (dayCounter % 50 === 0 || totalUnitsDispensedToday > 0) {
        }
      } else if (dayCounter <= oversupplyUntilDay) {
        // Still in oversupply period - consuming medication from previous dispensing
        status = 'oversupply';
        if (dayCounter % 50 === 0 || totalUnitsDispensedToday > 0 || dayCounter === oversupplyUntilDay) {
        }
      } else {
        // Normal/sufficient usage
        status = 'sufficient';
        if (dayCounter % 50 === 0 || totalUnitsDispensedToday > 0) {
        }
      }

      // Record the stock level for this day (never go below 0 for display)
      const displayStock = Math.max(0, currentStock);
      timeline.push({
        x: new Date(currentDate),
        y: displayStock,
        status
      });

      if (dayCounter % 50 === 0 || totalUnitsDispensedToday > 0) {
      }

      // Deplete stock by daily usage at END of day (but don't go below 0)
      currentStock -= dailyUsage;
      if (currentStock < 0) {
        currentStock = 0; // Patient cannot have negative medication
      }
      
      if (dayCounter % 50 === 0 || totalUnitsDispensedToday > 0) {
      }

      // Move to next day
      currentDate = new Date(currentDate.getTime() + oneDay);
      dayCounter++;
    }

    // Log some sample timeline points to verify data
    timeline.slice(0, 10).forEach((p, i) => {
    });
    
    timeline.slice(98, 103).forEach((p, i) => {
    });

    return timeline;
  }

  createSimpleScatterChart(item: MedicationWithDispensingData) {
    const canvas = document.getElementById(item.chartId) as HTMLCanvasElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get package size for display
    const packageSize = item.medication.packageSize ?? 0;

    // Parse dates and sort chronologically
    const moments = item.dispensingData!.dispensingMoments.map(moment => ({
      date: this.parseDate(moment.date),
      amount: moment.amount,
      dateString: moment.date,
      packageSize: packageSize,
      source: moment.source || 'csv',
      vmp: item.dispensingData!.vmp // Include VMP from parent dispensing data
    })).sort((a, b) => a.date.getTime() - b.date.getTime());

    // Create simple data points at fixed y-value (0.5 = middle of chart)
    const dataPoints = moments.map(moment => ({
      x: moment.date,
      y: 0.5, // Fixed y-value - all nodes at same height
      dateString: moment.dateString,
      amount: moment.amount,
      packageSize: moment.packageSize,
      source: moment.source,
      vmp: moment.vmp // Include VMP for tooltip
    }));

    const config: ChartConfiguration<'line'> = {
      type: 'line',
      data: {
        datasets: [{
          label: 'Dispensed',
          data: dataPoints as any,
          borderColor: (context: any) => {
            if (!context.raw) return 'rgb(75, 192, 192)';
            return context.raw.source === 'manual' ? 'rgb(255, 152, 0)' : 'rgb(75, 192, 192)'; // Orange for manual, teal for CSV
          },
          backgroundColor: (context: any) => {
            if (!context.raw) return 'rgb(75, 192, 192)';
            return context.raw.source === 'manual' ? 'rgb(255, 152, 0)' : 'rgb(75, 192, 192)'; // Orange for manual, teal for CSV
          },
          pointRadius: 4,
          pointHoverRadius: 6,
          pointHitRadius: 50, // Much larger hit area for easier hovering
          showLine: false,
          tension: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: {
            left: 5,
            right: 10,
            top: 5,
            bottom: 0
          }
        },
        scales: {
          x: {
            type: 'time',
            time: this.getTimeScaleConfig(),
            min: this.dateRange.earliest?.getTime(),
            max: this.dateRange.latest?.getTime(),
            display: true,
            grid: {
              display: true,
              drawOnChartArea: false,
              color: 'rgba(0, 0, 0, 0.1)'
            },
            ticks: {
              font: {
                size: 9
              },
              maxRotation: 0,
              autoSkipPadding: 10,
              color: '#666'
            },
            border: {
              display: true,
              color: 'rgba(0, 0, 0, 0.2)'
            }
          },
          y: {
            display: false,
            grid: {
              display: false
            },
            min: 0,
            max: 1
          }
        },
        plugins: {
          tooltip: {
            enabled: true,
            position: 'nearest',
            yAlign: 'top',
            xAlign: 'center',
            caretPadding: 20,
            displayColors: false,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            titleColor: '#fff',
            bodyColor: '#fff',
            borderColor: 'rgba(0, 0, 0, 0.9)',
            borderWidth: 1,
            padding: 10,
            callbacks: {
              title: (context: any) => {
                const point = context[0].raw as any;
                return point.dateString;
              },
              label: (context: any) => {
                const point = context.raw as any;
                const sourceLabel = point.source === 'manual' ? ' (Manual)' : ' (CSV)';
                const vmpLabel = point.vmp ? ` [VMP: ${point.vmp}]` : '';
                if (point.packageSize > 0) {
                  return [
                    `Dispensed: ${point.amount} package(s)${sourceLabel}`,
                    `Package size: ${point.packageSize} units${vmpLabel}`
                  ];
                }
                return `Dispensed: ${point.amount} package(s)${sourceLabel}${vmpLabel}`;
              }
            }
          },
          legend: {
            display: false
          }
        }
      }
    };

    const chart = new Chart(ctx, config);
    this.charts.set(item.chartId, chart);
  }

  formatDateForTooltip(date: Date): string {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  parseDate(dateString: string): Date {
    // Handle DD/MM/YYYY format (from CSV and backend response)
    if (dateString.includes('/')) {
      const parts = dateString.split('/');
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
        const year = parseInt(parts[2], 10);
        return new Date(year, month, day);
      }
    }
    
    // Handle YYYY-MM-DD format (ISO format, just in case)
    if (dateString.includes('-')) {
      const parts = dateString.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
        const day = parseInt(parts[2], 10);
        return new Date(year, month, day);
      }
    }
    
    // Fallback to Date constructor
    return new Date(dateString);
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile = input.files[0];
      this.uploadFile();
    }
  }

  uploadFile() {
    if (!this.selectedFile) return;

    const apbNumber = this.stateService.apbNumber;
    const reviewId = this.stateService.medicationReviewId;

    if (!apbNumber || !reviewId) {
      this.uploadError = 'Session data not available. Please log in again.';
      return;
    }

    this.uploading = true;
    this.uploadSuccess = false;
    this.uploadError = null;
    this.queryError = null;

    this.apiService.uploadDispensingHistory(apbNumber, reviewId, this.selectedFile).subscribe({
      next: (response) => {
        this.uploading = false;
        this.selectedFile = null;
        
        // Reset the file input
        const fileInput = document.getElementById('file-input') as HTMLInputElement;
        if (fileInput) {
          fileInput.value = '';
        }
        
        // Wait a moment for backend to update the MedicationReview record, then refresh
        setTimeout(() => {
          this.refreshData();
        }, 1000);
      },
      error: (err) => {
        this.uploading = false;
        this.uploadSuccess = false;
        this.uploadError = err.error?.error || 'Failed to upload file';
        this.selectedFile = null;
        
        // Reset the file input
        const fileInput = document.getElementById('file-input') as HTMLInputElement;
        if (fileInput) {
          fileInput.value = '';
        }
      }
    });
  }

  checkExistingFileAfterUpload() {
    const apbNumber = this.stateService.apbNumber;
    const reviewId = this.stateService.medicationReviewId;

    if (!apbNumber || !reviewId) return;

    this.loading = true;
    this.uploadError = null;
    this.queryError = null;
    
    this.apiService.queryDispensingHistory(apbNumber, reviewId).subscribe({
      next: (response) => {
        
        this.dispensingHistory = response;
        this.uploadSuccess = true;
        this.loading = false;
        
        if (response.dispensingData && Array.isArray(response.dispensingData)) {
          this.matchDispensingData();
        } else {
          this.queryError = 'Backend API needs to be updated to return dispensing data in the new format';
        }
      },
      error: (err) => {
        
        this.loading = false;
        
        // The file was uploaded but the backend might not have updated the MedicationReview record yet
        if (err.status === 404) {
          this.uploadSuccess = true; // Show as uploaded
          this.queryError = 'File uploaded successfully, but needs processing. Please refresh the page or click "Upload New File" to try again.';
        } else {
          this.uploadSuccess = false;
          this.queryError = err.error?.error || 'Failed to load dispensing history after upload';
        }
      }
    });
  }

  private shouldRetryQuery = false;
  private currentRetryAttempt = 0;

  retryLoadFile() {
    this.queryError = null;
    this.checkExistingFile();
  }

  triggerFileInput() {
    const fileInput = document.getElementById('file-input') as HTMLInputElement;
    fileInput?.click();
  }

  openNotesModal(medication?: ApiMedication) {
    if (medication) {
      this.openNotes.emit(medication);
    } else {
      this.openNotes.emit(undefined as any); // Emit undefined for general notes
    }
  }

  openManualDispensingModal() {
    this.showManualDispensingModal = true;
  }

  closeManualDispensingModal() {
    this.showManualDispensingModal = false;
  }

  onManualMomentsAdded() {
    this.showManualDispensingModal = false;
    // Refresh everything to show the new manual entries
    this.refreshData();
  }

  openManageMomentsModal() {
    this.showManageMomentsModal = true;
  }

  closeManageMomentsModal() {
    this.showManageMomentsModal = false;
  }

  onMomentsDeleted() {
    // Refresh everything to reflect deletions
    this.refreshData();
  }
}
