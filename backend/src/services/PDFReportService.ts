import puppeteer, { Browser, Page } from 'puppeteer';
import { ChartConfiguration } from 'chart.js';
import { Pool } from 'pg';
import { format } from 'date-fns';
import path from 'path';
import fs from 'fs/promises';
import AnalyticsService from './AnalyticsService';
import DemographicAnalytics from './DemographicAnalytics';
import TimeAnalytics from './TimeAnalytics';

export interface ReportConfig {
  sessionId?: string;
  startDate?: Date;
  endDate?: Date;
  includeCharts?: boolean;
  includeHeatmap?: boolean;
  includeSummary?: boolean;
  includeRecommendations?: boolean;
  pageSize?: 'A4' | 'Letter';
  orientation?: 'portrait' | 'landscape';
  logoPath?: string;
  companyName?: string;
  headerText?: string;
  footerText?: string;
}

export interface ReportData {
  sessionMetrics?: any;
  demographicBalance?: any;
  timeDistribution?: any;
  participationRates?: any;
  peakHours?: any;
  speakerRankings?: any;
  recommendations?: string[];
}

export class PDFReportService {
  private browser: Browser | null = null;
  private analyticsService: AnalyticsService;
  private demographicAnalytics: DemographicAnalytics;
  private timeAnalytics: TimeAnalytics;

  constructor(private db: Pool) {
    this.analyticsService = new AnalyticsService(db);
    this.demographicAnalytics = new DemographicAnalytics(db);
    this.timeAnalytics = new TimeAnalytics(db);
  }

  /**
   * Generate PDF report for a session or date range
   */
  async generateReport(config: ReportConfig): Promise<Buffer> {
    try {
      // Launch browser if not already running
      if (!this.browser) {
        this.browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
      }

      // Gather report data
      const reportData = await this.gatherReportData(config);

      // Generate HTML content
      const html = await this.generateHTML(reportData, config);

      // Convert HTML to PDF
      const pdf = await this.htmlToPDF(html, config);

      return pdf;
    } catch (error) {
      console.error('Error generating PDF report:', error);
      throw error;
    }
  }

  /**
   * Generate batch reports for multiple sessions
   */
  async generateBatchReports(
    sessionIds: string[],
    config: Omit<ReportConfig, 'sessionId'>
  ): Promise<Map<string, Buffer>> {
    const reports = new Map<string, Buffer>();

    try {
      // Launch browser once for all reports
      if (!this.browser) {
        this.browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
      }

      for (const sessionId of sessionIds) {
        const report = await this.generateReport({ ...config, sessionId });
        reports.set(sessionId, report);
      }

      return reports;
    } finally {
      // Clean up browser
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
    }
  }

  /**
   * Gather all data needed for the report
   */
  private async gatherReportData(config: ReportConfig): Promise<ReportData> {
    const data: ReportData = {};

    // Get session metrics if sessionId provided
    if (config.sessionId) {
      data.sessionMetrics = await this.analyticsService.getSessionMetrics(config.sessionId);
    }

    // Get demographic balance
    data.demographicBalance = await this.demographicAnalytics.calculateBalanceScores(config.sessionId);

    // Get participation rates
    data.participationRates = {
      gender: await this.analyticsService.calculateParticipationRate('gender', undefined, config.sessionId),
      age: await this.analyticsService.calculateParticipationRate('age_group', undefined, config.sessionId),
      race: await this.analyticsService.calculateParticipationRate('race', undefined, config.sessionId)
    };

    // Get time distribution
    data.timeDistribution = await this.timeAnalytics.createTimeHistogram(30, config.sessionId);

    // Get peak hours analysis
    data.peakHours = await this.timeAnalytics.analyzePeakHours(undefined, config.sessionId);

    // Get speaker rankings
    data.speakerRankings = {
      gender: await this.demographicAnalytics.rankSpeakersByDemographic('gender', config.sessionId, 10),
      age: await this.demographicAnalytics.rankSpeakersByDemographic('age_group', config.sessionId, 10),
      race: await this.demographicAnalytics.rankSpeakersByDemographic('race', config.sessionId, 10)
    };

    // Generate recommendations
    if (config.includeRecommendations) {
      data.recommendations = await this.generateRecommendations(data);
    }

    return data;
  }

  /**
   * Generate HTML content for the report
   */
  private async generateHTML(data: ReportData, config: ReportConfig): Promise<string> {
    const chartScripts = config.includeCharts ? await this.generateChartScripts(data) : '';
    const heatmapScript = config.includeHeatmap ? await this.generateHeatmapScript(data) : '';

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Convention Speaker Analytics Report</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      background: white;
    }
    
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px;
      text-align: center;
      page-break-after: avoid;
    }
    
    .header h1 {
      font-size: 2.5em;
      margin-bottom: 10px;
    }
    
    .header .subtitle {
      font-size: 1.2em;
      opacity: 0.9;
    }
    
    .company-info {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 20px;
      margin-top: 20px;
    }
    
    .company-info img {
      height: 60px;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    
    .section {
      margin-bottom: 60px;
      page-break-inside: avoid;
    }
    
    .section-title {
      font-size: 1.8em;
      color: #667eea;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 2px solid #e0e0e0;
    }
    
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    
    .metric-card {
      background: #f8f9fa;
      border-radius: 10px;
      padding: 20px;
      border-left: 4px solid #667eea;
    }
    
    .metric-card .label {
      font-size: 0.9em;
      color: #666;
      margin-bottom: 5px;
    }
    
    .metric-card .value {
      font-size: 2em;
      font-weight: bold;
      color: #333;
    }
    
    .metric-card .change {
      font-size: 0.9em;
      margin-top: 5px;
    }
    
    .metric-card .change.positive {
      color: #4caf50;
    }
    
    .metric-card .change.negative {
      color: #f44336;
    }
    
    .chart-container {
      position: relative;
      height: 400px;
      margin: 30px 0;
      page-break-inside: avoid;
    }
    
    .chart-title {
      text-align: center;
      font-size: 1.2em;
      margin-bottom: 20px;
      color: #555;
    }
    
    .table-container {
      overflow-x: auto;
      margin: 30px 0;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      background: white;
    }
    
    th {
      background: #667eea;
      color: white;
      padding: 12px;
      text-align: left;
      font-weight: 600;
    }
    
    td {
      padding: 10px 12px;
      border-bottom: 1px solid #e0e0e0;
    }
    
    tr:hover {
      background: #f8f9fa;
    }
    
    .heatmap-container {
      margin: 30px 0;
      page-break-inside: avoid;
    }
    
    .heatmap {
      display: grid;
      grid-template-columns: repeat(24, 1fr);
      gap: 2px;
      margin-top: 20px;
    }
    
    .heatmap-cell {
      aspect-ratio: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.7em;
      border-radius: 4px;
    }
    
    .recommendations {
      background: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: 10px;
      padding: 20px;
      margin: 30px 0;
    }
    
    .recommendations h3 {
      color: #856404;
      margin-bottom: 15px;
    }
    
    .recommendations ul {
      list-style-position: inside;
      color: #856404;
    }
    
    .recommendations li {
      margin-bottom: 10px;
    }
    
    .footer {
      text-align: center;
      padding: 20px;
      background: #f8f9fa;
      color: #666;
      font-size: 0.9em;
      margin-top: 60px;
    }
    
    @media print {
      .section {
        page-break-inside: avoid;
      }
      
      .chart-container {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Convention Speaker Analytics Report</h1>
    <div class="subtitle">
      ${config.sessionId ? `Session ${config.sessionId}` : 
        `${format(config.startDate || new Date(), 'MMM dd, yyyy')} - ${format(config.endDate || new Date(), 'MMM dd, yyyy')}`}
    </div>
    ${config.companyName || config.logoPath ? `
      <div class="company-info">
        ${config.logoPath ? `<img src="${config.logoPath}" alt="Logo">` : ''}
        ${config.companyName ? `<h2>${config.companyName}</h2>` : ''}
      </div>
    ` : ''}
  </div>

  <div class="container">
    ${config.includeSummary !== false ? this.generateExecutiveSummary(data) : ''}
    
    <div class="section">
      <h2 class="section-title">Key Metrics</h2>
      ${this.generateMetricsGrid(data)}
    </div>
    
    <div class="section">
      <h2 class="section-title">Demographic Analysis</h2>
      ${this.generateDemographicSection(data, config.includeCharts)}
    </div>
    
    <div class="section">
      <h2 class="section-title">Time Analysis</h2>
      ${this.generateTimeSection(data, config.includeCharts)}
    </div>
    
    ${config.includeHeatmap ? `
      <div class="section">
        <h2 class="section-title">Activity Heatmap</h2>
        ${this.generateHeatmap(data)}
      </div>
    ` : ''}
    
    ${config.includeRecommendations && data.recommendations ? `
      <div class="section">
        ${this.generateRecommendations(data.recommendations)}
      </div>
    ` : ''}
  </div>
  
  <div class="footer">
    <p>Generated on ${format(new Date(), 'MMMM dd, yyyy HH:mm:ss')}</p>
    ${config.footerText ? `<p>${config.footerText}</p>` : ''}
  </div>
  
  ${chartScripts}
  ${heatmapScript}
</body>
</html>
    `;

    return html;
  }

  /**
   * Generate executive summary section
   */
  private generateExecutiveSummary(data: ReportData): string {
    const metrics = data.sessionMetrics;
    const balance = data.demographicBalance;
    
    return `
      <div class="section">
        <h2 class="section-title">Executive Summary</h2>
        <p style="margin-bottom: 20px; line-height: 1.8;">
          This report provides a comprehensive analysis of speaker participation patterns
          ${metrics ? `for session ${metrics.sessionId}` : 'for the specified period'}.
          ${metrics ? `The session had ${metrics.uniqueSpeakers} unique speakers with a 
          ${metrics.participationRate.toFixed(1)}% participation rate.` : ''}
          The overall demographic balance score is ${((balance.gender + balance.age + balance.race) / 3).toFixed(0)}%,
          indicating ${this.getBalanceDescription((balance.gender + balance.age + balance.race) / 3)}.
        </p>
      </div>
    `;
  }

  /**
   * Generate metrics grid HTML
   */
  private generateMetricsGrid(data: ReportData): string {
    const metrics = data.sessionMetrics;
    if (!metrics) return '';

    return `
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="label">Total Speakers</div>
          <div class="value">${metrics.uniqueSpeakers}</div>
        </div>
        <div class="metric-card">
          <div class="label">Participation Rate</div>
          <div class="value">${metrics.participationRate.toFixed(1)}%</div>
        </div>
        <div class="metric-card">
          <div class="label">Avg Speaking Time</div>
          <div class="value">${Math.round(metrics.averageSpeakingTime)}s</div>
        </div>
        <div class="metric-card">
          <div class="label">Queue Length</div>
          <div class="value">${metrics.queueLength}</div>
        </div>
      </div>
    `;
  }

  /**
   * Generate demographic section HTML
   */
  private generateDemographicSection(data: ReportData, includeCharts?: boolean): string {
    const balance = data.demographicBalance;
    
    let html = `
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="label">Gender Balance</div>
          <div class="value">${balance.gender.toFixed(0)}%</div>
        </div>
        <div class="metric-card">
          <div class="label">Age Balance</div>
          <div class="value">${balance.age.toFixed(0)}%</div>
        </div>
        <div class="metric-card">
          <div class="label">Race Balance</div>
          <div class="value">${balance.race.toFixed(0)}%</div>
        </div>
      </div>
    `;

    if (includeCharts) {
      html += `
        <div class="chart-container">
          <div class="chart-title">Participation by Gender</div>
          <canvas id="genderChart"></canvas>
        </div>
        <div class="chart-container">
          <div class="chart-title">Participation by Age Group</div>
          <canvas id="ageChart"></canvas>
        </div>
      `;
    }

    // Add top speakers table
    html += this.generateTopSpeakersTable(data.speakerRankings);

    return html;
  }

  /**
   * Generate time section HTML
   */
  private generateTimeSection(data: ReportData, includeCharts?: boolean): string {
    let html = '';

    if (includeCharts && data.timeDistribution) {
      html += `
        <div class="chart-container">
          <div class="chart-title">Speaking Time Distribution</div>
          <canvas id="timeDistChart"></canvas>
        </div>
      `;
    }

    if (data.peakHours) {
      html += `
        <div class="chart-container">
          <div class="chart-title">Activity by Hour</div>
          <canvas id="peakHoursChart"></canvas>
        </div>
      `;
    }

    return html;
  }

  /**
   * Generate heatmap HTML
   */
  private generateHeatmap(data: ReportData): string {
    const heatmapData = this.prepareHeatmapData(data.peakHours);
    
    return `
      <div class="heatmap-container">
        <div class="heatmap">
          ${heatmapData.map(cell => `
            <div class="heatmap-cell" style="background: ${cell.color}; color: ${cell.textColor}">
              ${cell.value}
            </div>
          `).join('')}
        </div>
        <div style="text-align: center; margin-top: 10px; color: #666;">
          Hours of the Day (0-23)
        </div>
      </div>
    `;
  }

  /**
   * Generate top speakers table
   */
  private generateTopSpeakersTable(rankings: any): string {
    if (!rankings || !rankings.gender) return '';

    return `
      <div class="table-container">
        <h3 style="margin-bottom: 15px;">Top Speakers by Frequency</h3>
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Name</th>
              <th>Demographic</th>
              <th>Speaking Instances</th>
              <th>Total Time</th>
            </tr>
          </thead>
          <tbody>
            ${rankings.gender.slice(0, 5).map((speaker: any) => `
              <tr>
                <td>${speaker.rank}</td>
                <td>${speaker.value}</td>
                <td>${speaker.demographic_group}: ${speaker.value}</td>
                <td>${speaker.speaking_frequency}</td>
                <td>${Math.round(speaker.total_time)}s</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * Generate recommendations HTML
   */
  private generateRecommendations(recommendations: string[]): string {
    return `
      <div class="recommendations">
        <h3>Recommendations</h3>
        <ul>
          ${recommendations.map(rec => `<li>${rec}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  /**
   * Generate chart scripts
   */
  private async generateChartScripts(data: ReportData): Promise<string> {
    const scripts: string[] = [];

    // Gender chart
    if (data.participationRates?.gender) {
      scripts.push(this.createPieChartScript('genderChart', 
        data.participationRates.gender.map((r: any) => ({
          label: r.value,
          value: r.participants
        }))
      ));
    }

    // Age chart
    if (data.participationRates?.age) {
      scripts.push(this.createBarChartScript('ageChart',
        data.participationRates.age.map((r: any) => ({
          label: r.value,
          value: r.rate
        }))
      ));
    }

    // Time distribution chart
    if (data.timeDistribution) {
      scripts.push(this.createBarChartScript('timeDistChart',
        data.timeDistribution.map((t: any) => ({
          label: t.bucket,
          value: t.count
        }))
      ));
    }

    // Peak hours chart
    if (data.peakHours) {
      scripts.push(this.createLineChartScript('peakHoursChart',
        data.peakHours.map((h: any) => ({
          label: h.time_label,
          value: h.speaking_instances
        }))
      ));
    }

    return `
      <script>
        window.addEventListener('load', function() {
          ${scripts.join('\n')}
        });
      </script>
    `;
  }

  /**
   * Create pie chart script
   */
  private createPieChartScript(canvasId: string, data: any[]): string {
    return `
      new Chart(document.getElementById('${canvasId}'), {
        type: 'pie',
        data: {
          labels: ${JSON.stringify(data.map(d => d.label))},
          datasets: [{
            data: ${JSON.stringify(data.map(d => d.value))},
            backgroundColor: [
              '#667eea', '#764ba2', '#f093fb', '#c471f5',
              '#fa709a', '#fee140', '#30cfd0', '#330867'
            ]
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom'
            }
          }
        }
      });
    `;
  }

  /**
   * Create bar chart script
   */
  private createBarChartScript(canvasId: string, data: any[]): string {
    return `
      new Chart(document.getElementById('${canvasId}'), {
        type: 'bar',
        data: {
          labels: ${JSON.stringify(data.map(d => d.label))},
          datasets: [{
            label: 'Value',
            data: ${JSON.stringify(data.map(d => d.value))},
            backgroundColor: '#667eea'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            }
          },
          scales: {
            y: {
              beginAtZero: true
            }
          }
        }
      });
    `;
  }

  /**
   * Create line chart script
   */
  private createLineChartScript(canvasId: string, data: any[]): string {
    return `
      new Chart(document.getElementById('${canvasId}'), {
        type: 'line',
        data: {
          labels: ${JSON.stringify(data.map(d => d.label))},
          datasets: [{
            label: 'Activity',
            data: ${JSON.stringify(data.map(d => d.value))},
            borderColor: '#667eea',
            backgroundColor: 'rgba(102, 126, 234, 0.1)',
            tension: 0.4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            }
          },
          scales: {
            y: {
              beginAtZero: true
            }
          }
        }
      });
    `;
  }

  /**
   * Generate heatmap script
   */
  private async generateHeatmapScript(data: ReportData): Promise<string> {
    return ''; // Heatmap is rendered with CSS, no script needed
  }

  /**
   * Prepare heatmap data
   */
  private prepareHeatmapData(peakHours: any[]): any[] {
    if (!peakHours) return [];

    const maxValue = Math.max(...peakHours.map(h => h.speaking_instances));
    
    return Array.from({ length: 24 }, (_, hour) => {
      const hourData = peakHours.find(h => h.hour === hour);
      const value = hourData?.speaking_instances || 0;
      const intensity = maxValue > 0 ? value / maxValue : 0;
      
      return {
        hour,
        value: value.toString(),
        color: this.getHeatmapColor(intensity),
        textColor: intensity > 0.5 ? 'white' : 'black'
      };
    });
  }

  /**
   * Get heatmap color based on intensity
   */
  private getHeatmapColor(intensity: number): string {
    const colors = [
      '#f0f0f0', // 0%
      '#ffecb3', // 20%
      '#ffca28', // 40%
      '#ff9800', // 60%
      '#ff6f00', // 80%
      '#ff3d00'  // 100%
    ];
    
    const index = Math.min(Math.floor(intensity * colors.length), colors.length - 1);
    return colors[index];
  }

  /**
   * Convert HTML to PDF
   */
  private async htmlToPDF(html: string, config: ReportConfig): Promise<Buffer> {
    const page = await this.browser!.newPage();
    
    try {
      // Set content
      await page.setContent(html, { waitUntil: 'networkidle0' });
      
      // Wait for charts to render
      if (config.includeCharts) {
        await page.waitForTimeout(2000);
      }
      
      // Generate PDF
      const pdf = await page.pdf({
        format: config.pageSize || 'A4',
        landscape: config.orientation === 'landscape',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm'
        },
        displayHeaderFooter: true,
        headerTemplate: config.headerText ? `
          <div style="font-size: 10px; text-align: center; width: 100%;">
            ${config.headerText}
          </div>
        ` : '',
        footerTemplate: `
          <div style="font-size: 10px; text-align: center; width: 100%;">
            Page <span class="pageNumber"></span> of <span class="totalPages"></span>
          </div>
        `
      });
      
      return pdf;
    } finally {
      await page.close();
    }
  }

  /**
   * Generate recommendations based on data
   */
  private async generateRecommendations(data: ReportData): Promise<string[]> {
    const recommendations: string[] = [];
    const balance = data.demographicBalance;
    const metrics = data.sessionMetrics;

    // Gender balance recommendations
    if (balance.gender < 70) {
      recommendations.push(
        'Gender balance is below optimal levels. Consider implementing speaker rotation policies to ensure equal representation.'
      );
    }

    // Age diversity recommendations
    if (balance.age < 60) {
      recommendations.push(
        'Age diversity could be improved. Encourage participation from underrepresented age groups through targeted outreach.'
      );
    }

    // Participation rate recommendations
    if (metrics && metrics.participationRate < 50) {
      recommendations.push(
        'Overall participation rate is low. Consider reducing barriers to participation and implementing engagement strategies.'
      );
    }

    // Queue management recommendations
    if (metrics && metrics.queueLength > 15) {
      recommendations.push(
        'Queue length is high. Consider implementing time limits or session breaks to manage speaker flow more effectively.'
      );
    }

    // Speaking time recommendations
    if (metrics && metrics.averageSpeakingTime > 180) {
      recommendations.push(
        'Average speaking time exceeds 3 minutes. Consider implementing gentle time reminders to ensure more delegates can participate.'
      );
    }

    // Peak hour recommendations
    if (data.peakHours) {
      const peakVariance = this.calculatePeakVariance(data.peakHours);
      if (peakVariance > 0.5) {
        recommendations.push(
          'Activity is highly concentrated in specific hours. Consider distributing sessions more evenly throughout the day.'
        );
      }
    }

    return recommendations;
  }

  /**
   * Get balance description
   */
  private getBalanceDescription(score: number): string {
    if (score >= 80) return 'excellent demographic balance';
    if (score >= 60) return 'good demographic balance with room for improvement';
    if (score >= 40) return 'moderate demographic balance requiring attention';
    return 'poor demographic balance requiring immediate intervention';
  }

  /**
   * Calculate peak variance
   */
  private calculatePeakVariance(peakHours: any[]): number {
    const values = peakHours.map(h => h.speaking_instances);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance) / mean;
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

export default PDFReportService;