# Performance Monitoring and Measurement Strategies for InstaTranscribe

## Overview

This document outlines comprehensive performance monitoring strategies to track, measure, and optimize the InstaTranscribe application's performance across development, staging, and production environments.

## Performance Monitoring Framework

### 1. **Core Web Vitals Monitoring**

#### Implementation Strategy
```typescript
// src/utils/webVitals.ts
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

interface WebVitalMetric {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  id: string;
}

class WebVitalsMonitor {
  private metrics: WebVitalMetric[] = [];
  private analyticsEndpoint: string;

  constructor(analyticsEndpoint: string = '/api/analytics') {
    this.analyticsEndpoint = analyticsEndpoint;
    this.initializeMonitoring();
  }

  private initializeMonitoring() {
    getCLS(this.handleMetric.bind(this));
    getFID(this.handleMetric.bind(this));
    getFCP(this.handleMetric.bind(this));
    getLCP(this.handleMetric.bind(this));
    getTTFB(this.handleMetric.bind(this));
  }

  private handleMetric(metric: any) {
    const webVital: WebVitalMetric = {
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      delta: metric.delta,
      id: metric.id
    };

    this.metrics.push(webVital);
    this.sendToAnalytics(webVital);
    
    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`Web Vital: ${metric.name} = ${metric.value}ms (${metric.rating})`);
    }
  }

  private async sendToAnalytics(metric: WebVitalMetric) {
    try {
      await fetch(this.analyticsEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'web-vital',
          metric,
          timestamp: Date.now(),
          userAgent: navigator.userAgent,
          url: window.location.href
        })
      });
    } catch (error) {
      console.error('Failed to send web vital metric:', error);
    }
  }

  public getMetrics(): WebVitalMetric[] {
    return this.metrics;
  }

  public getAverageMetric(name: string): number {
    const values = this.metrics
      .filter(m => m.name === name)
      .map(m => m.value);
    
    return values.length > 0 
      ? values.reduce((a, b) => a + b, 0) / values.length 
      : 0;
  }
}

// Initialize monitoring
export const webVitalsMonitor = new WebVitalsMonitor();
```

#### Web Vitals Targets
```typescript
// src/utils/performanceTargets.ts
export const PERFORMANCE_TARGETS = {
  CLS: { good: 0.1, poor: 0.25 },      // Cumulative Layout Shift
  FID: { good: 100, poor: 300 },        // First Input Delay
  FCP: { good: 1800, poor: 3000 },      // First Contentful Paint
  LCP: { good: 2500, poor: 4000 },      // Largest Contentful Paint
  TTFB: { good: 800, poor: 1800 }       // Time to First Byte
};

export const checkPerformance = (metric: WebVitalMetric): boolean => {
  const target = PERFORMANCE_TARGETS[metric.name as keyof typeof PERFORMANCE_TARGETS];
  if (!target) return true;
  
  return metric.value <= target.good;
};
```

### 2. **Custom Performance Metrics**

#### File Processing Performance
```typescript
// src/utils/fileProcessingMonitor.ts
export class FileProcessingMonitor {
  private processingTimes: number[] = [];
  private errorCount: number = 0;
  private successCount: number = 0;

  startProcessing(fileSize: number): string {
    const id = `process_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Track file size distribution
    this.trackFileSize(fileSize);
    
    return id;
  }

  endProcessing(id: string, duration: number, success: boolean) {
    this.processingTimes.push(duration);
    
    if (success) {
      this.successCount++;
      console.log(`File processing completed in ${duration}ms`);
    } else {
      this.errorCount++;
      console.error(`File processing failed after ${duration}ms`);
    }
    
    this.sendProcessingMetric(id, duration, success);
  }

  private trackFileSize(fileSize: number) {
    const sizeCategory = fileSize < 1024 * 1024 ? 'small' : 
                        fileSize < 10 * 1024 * 1024 ? 'medium' : 'large';
    
    this.sendCustomMetric('file_size_category', sizeCategory, fileSize);
  }

  private async sendProcessingMetric(id: string, duration: number, success: boolean) {
    try {
      await fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'file_processing',
          id,
          duration,
          success,
          timestamp: Date.now()
        })
      });
    } catch (error) {
      console.error('Failed to send processing metric:', error);
    }
  }

  private async sendCustomMetric(name: string, value: any, metadata?: any) {
    try {
      await fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'custom_metric',
          name,
          value,
          metadata,
          timestamp: Date.now()
        })
      });
    } catch (error) {
      console.error('Failed to send custom metric:', error);
    }
  }

  public getStats() {
    const avgTime = this.processingTimes.length > 0 
      ? this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length 
      : 0;
    
    const successRate = this.successCount + this.errorCount > 0
      ? (this.successCount / (this.successCount + this.errorCount)) * 100
      : 0;

    return {
      averageProcessingTime: avgTime,
      successRate,
      totalProcessed: this.successCount + this.errorCount,
      errorCount: this.errorCount
    };
  }
}

export const fileProcessingMonitor = new FileProcessingMonitor();
```

#### API Performance Monitoring
```typescript
// src/utils/apiMonitor.ts
export class ApiMonitor {
  private requestTimes: Map<string, number[]> = new Map();
  private errorCounts: Map<string, number> = new Map();

  async trackRequest<T>(
    endpoint: string,
    requestFn: () => Promise<T>
  ): Promise<T> {
    const startTime = performance.now();
    let success = false;

    try {
      const result = await requestFn();
      success = true;
      return result;
    } finally {
      const duration = performance.now() - startTime;
      this.recordRequest(endpoint, duration, success);
    }
  }

  private recordRequest(endpoint: string, duration: number, success: boolean) {
    if (!this.requestTimes.has(endpoint)) {
      this.requestTimes.set(endpoint, []);
    }

    this.requestTimes.get(endpoint)!.push(duration);

    if (!success) {
      const currentErrors = this.errorCounts.get(endpoint) || 0;
      this.errorCounts.set(endpoint, currentErrors + 1);
    }

    this.sendApiMetric(endpoint, duration, success);
  }

  private async sendApiMetric(endpoint: string, duration: number, success: boolean) {
    try {
      await fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'api_request',
          endpoint,
          duration,
          success,
          timestamp: Date.now()
        })
      });
    } catch (error) {
      console.error('Failed to send API metric:', error);
    }
  }

  public getEndpointStats(endpoint: string) {
    const times = this.requestTimes.get(endpoint) || [];
    const avgTime = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    const errorCount = this.errorCounts.get(endpoint) || 0;
    const totalRequests = times.length + errorCount;

    return {
      averageResponseTime: avgTime,
      errorRate: totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0,
      totalRequests,
      errorCount
    };
  }
}

export const apiMonitor = new ApiMonitor();
```

### 3. **Real User Monitoring (RUM)**

#### User Experience Tracking
```typescript
// src/utils/userExperienceMonitor.ts
export class UserExperienceMonitor {
  private sessionStart: number;
  private interactions: any[] = [];
  private errors: any[] = [];

  constructor() {
    this.sessionStart = Date.now();
    this.setupErrorTracking();
    this.setupInteractionTracking();
  }

  private setupErrorTracking() {
    window.addEventListener('error', (event) => {
      this.recordError({
        type: 'javascript_error',
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        timestamp: Date.now()
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.recordError({
        type: 'promise_rejection',
        message: event.reason?.toString(),
        timestamp: Date.now()
      });
    });
  }

  private setupInteractionTracking() {
    ['click', 'keydown', 'scroll'].forEach(eventType => {
      document.addEventListener(eventType, (event) => {
        this.recordInteraction({
          type: eventType,
          target: (event.target as Element)?.tagName,
          timestamp: Date.now()
        });
      }, { passive: true });
    });
  }

  private recordError(error: any) {
    this.errors.push(error);
    this.sendErrorMetric(error);
  }

  private recordInteraction(interaction: any) {
    this.interactions.push(interaction);
    
    // Send interaction metrics periodically
    if (this.interactions.length % 10 === 0) {
      this.sendInteractionMetrics();
    }
  }

  private async sendErrorMetric(error: any) {
    try {
      await fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'user_error',
          error,
          sessionDuration: Date.now() - this.sessionStart,
          timestamp: Date.now()
        })
      });
    } catch (e) {
      console.error('Failed to send error metric:', e);
    }
  }

  private async sendInteractionMetrics() {
    try {
      await fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'user_interactions',
          interactions: this.interactions.slice(-10), // Last 10 interactions
          sessionDuration: Date.now() - this.sessionStart,
          timestamp: Date.now()
        })
      });
    } catch (e) {
      console.error('Failed to send interaction metrics:', e);
    }
  }

  public getSessionStats() {
    return {
      sessionDuration: Date.now() - this.sessionStart,
      interactionCount: this.interactions.length,
      errorCount: this.errors.length,
      lastInteraction: this.interactions[this.interactions.length - 1]?.timestamp
    };
  }
}

export const userExperienceMonitor = new UserExperienceMonitor();
```

### 4. **Performance Dashboard**

#### Dashboard Component
```typescript
// src/components/PerformanceDashboard.tsx
import React, { useState, useEffect } from 'react';
import { webVitalsMonitor } from '../utils/webVitals';
import { fileProcessingMonitor } from '../utils/fileProcessingMonitor';
import { apiMonitor } from '../utils/apiMonitor';
import { userExperienceMonitor } from '../utils/userExperienceMonitor';

interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  status: 'good' | 'warning' | 'error';
}

const PerformanceDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<PerformanceMetric[]>([]);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const updateMetrics = () => {
      const newMetrics: PerformanceMetric[] = [];

      // Web Vitals
      const webVitals = webVitalsMonitor.getMetrics();
      webVitals.forEach(vital => {
        newMetrics.push({
          name: vital.name,
          value: vital.value,
          unit: vital.name === 'CLS' ? '' : 'ms',
          status: vital.rating === 'good' ? 'good' : vital.rating === 'needs-improvement' ? 'warning' : 'error'
        });
      });

      // File Processing
      const fileStats = fileProcessingMonitor.getStats();
      newMetrics.push({
        name: 'Avg Processing Time',
        value: fileStats.averageProcessingTime,
        unit: 'ms',
        status: fileStats.averageProcessingTime < 5000 ? 'good' : 'warning'
      });

      newMetrics.push({
        name: 'Success Rate',
        value: fileStats.successRate,
        unit: '%',
        status: fileStats.successRate > 95 ? 'good' : fileStats.successRate > 80 ? 'warning' : 'error'
      });

      // API Performance
      const endpoints = ['/api/instagram', '/api/youtube', '/api/gemini'];
      endpoints.forEach(endpoint => {
        const stats = apiMonitor.getEndpointStats(endpoint);
        newMetrics.push({
          name: `${endpoint} Avg Response`,
          value: stats.averageResponseTime,
          unit: 'ms',
          status: stats.averageResponseTime < 2000 ? 'good' : 'warning'
        });

        newMetrics.push({
          name: `${endpoint} Error Rate`,
          value: stats.errorRate,
          unit: '%',
          status: stats.errorRate < 5 ? 'good' : stats.errorRate < 10 ? 'warning' : 'error'
        });
      });

      // User Experience
      const uxStats = userExperienceMonitor.getSessionStats();
      newMetrics.push({
        name: 'Session Duration',
        value: uxStats.sessionDuration / 1000,
        unit: 's',
        status: 'good'
      });

      newMetrics.push({
        name: 'Interaction Count',
        value: uxStats.interactionCount,
        unit: '',
        status: uxStats.interactionCount > 0 ? 'good' : 'warning'
      });

      setMetrics(newMetrics);
    };

    updateMetrics();
    const interval = setInterval(updateMetrics, 5000);

    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'good': return 'text-green-600 bg-green-100';
      case 'warning': return 'text-yellow-600 bg-yellow-100';
      case 'error': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed bottom-4 right-4 p-3 bg-purple-600 text-white rounded-full shadow-lg hover:bg-purple-700 transition-colors"
        title="Show Performance Dashboard"
      >
        📊
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl p-4 max-h-96 overflow-y-auto z-50">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Performance Dashboard</h3>
        <button
          onClick={() => setIsVisible(false)}
          className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          ✕
        </button>
      </div>
      
      <div className="space-y-2">
        {metrics.map((metric, index) => (
          <div key={index} className="flex justify-between items-center p-2 bg-slate-50 dark:bg-slate-700 rounded">
            <span className="text-sm text-slate-600 dark:text-slate-300">{metric.name}</span>
            <div className="flex items-center space-x-2">
              <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(metric.status)}`}>
                {metric.status}
              </span>
              <span className="text-sm font-mono text-slate-700 dark:text-slate-300">
                {metric.value.toFixed(2)}{metric.unit}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PerformanceDashboard;
```

### 5. **Automated Performance Testing**

#### Lighthouse CI Integration
```yaml
# .lighthouserc.js
module.exports = {
  ci: {
    collect: {
      url: ['http://localhost:3000'],
      startServerCommand: 'npm run dev',
      startServerReadyPattern: 'Local:',
      startServerReadyTimeout: 20000,
      numberOfRuns: 3
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['error', { minScore: 0.9 }],
        'categories:seo': ['error', { minScore: 0.9 }],
        'categories:pwa': ['warn', { minScore: 0.8 }],
        
        // Core Web Vitals
        'first-contentful-paint': ['error', { maxNumericValue: 1800 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['error', { maxNumericValue: 300 }],
        
        // Custom assertions
        'resource-summary:document:size': ['error', { maxNumericValue: 50000 }],
        'resource-summary:script:size': ['error', { maxNumericValue: 500000 }],
        'resource-summary:stylesheet:size': ['error', { maxNumericValue: 100000 }],
      }
    },
    upload: {
      target: 'temporary-public-storage'
    }
  }
};
```

#### Performance Testing Script
```typescript
// scripts/performance-test.ts
import lighthouse from 'lighthouse';
import chromeLauncher from 'chrome-launcher';
import fs from 'fs';
import path from 'path';

interface PerformanceReport {
  url: string;
  scores: {
    performance: number;
    accessibility: number;
    bestPractices: number;
    seo: number;
    pwa: number;
  };
  metrics: {
    fcp: number;
    lcp: number;
    cls: number;
    fid: number;
    ttfb: number;
  };
}

class PerformanceTester {
  private results: PerformanceReport[] = [];

  async testUrl(url: string): Promise<PerformanceReport> {
    const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });
    
    try {
      const runnerResult = await lighthouse(url, {
        port: chrome.port,
        output: 'json',
        logLevel: 'info'
      });

      const report: PerformanceReport = {
        url,
        scores: {
          performance: runnerResult.lhr.categories.performance.score * 100,
          accessibility: runnerResult.lhr.categories.accessibility.score * 100,
          bestPractices: runnerResult.lhr.categories['best-practices'].score * 100,
          seo: runnerResult.lhr.categories.seo.score * 100,
          pwa: runnerResult.lhr.categories.pwa.score * 100
        },
        metrics: {
          fcp: runnerResult.lhr.audits['first-contentful-paint'].numericValue,
          lcp: runnerResult.lhr.audits['largest-contentful-paint'].numericValue,
          cls: runnerResult.lhr.audits['cumulative-layout-shift'].numericValue,
          fid: runnerResult.lhr.audits['max-potential-fid'].numericValue,
          ttfb: runnerResult.lhr.audits['server-response-time'].numericValue
        }
      };

      this.results.push(report);
      return report;
    } finally {
      await chrome.kill();
    }
  }

  async runFullTest() {
    const urls = [
      'http://localhost:3000',
      'http://localhost:3000/dashboard',
      'http://localhost:3000/settings'
    ];

    console.log('Starting performance tests...');
    
    for (const url of urls) {
      console.log(`Testing ${url}...`);
      const result = await this.testUrl(url);
      console.log(`Completed: ${url} - Performance: ${result.scores.performance}%`);
    }

    this.generateReport();
  }

  private generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      results: this.results,
      summary: {
        avgPerformance: this.results.reduce((acc, r) => acc + r.scores.performance, 0) / this.results.length,
        avgLCP: this.results.reduce((acc, r) => acc + r.metrics.lcp, 0) / this.results.length,
        avgFCP: this.results.reduce((acc, r) => acc + r.metrics.fcp, 0) / this.results.length,
        avgCLS: this.results.reduce((acc, r) => acc + r.metrics.cls, 0) / this.results.length
      }
    };

    const outputPath = path.join(process.cwd(), 'performance-report.json');
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    
    console.log('Performance report generated:', outputPath);
    console.log('Summary:', report.summary);
  }
}

// Run tests
const tester = new PerformanceTester();
tester.runFullTest().catch(console.error);
```

## Implementation Roadmap

### Phase 1: Basic Monitoring (Week 1)
- [ ] Implement Web Vitals monitoring
- [ ] Add custom performance metrics
- [ ] Set up API performance tracking
- [ ] Create basic performance dashboard

### Phase 2: Advanced Monitoring (Week 2)
- [ ] Implement user experience tracking
- [ ] Add error tracking and reporting
- [ ] Set up automated performance testing
- [ ] Create performance alerts

### Phase 3: Analytics Integration (Week 3)
- [ ] Integrate with analytics platform
- [ ] Set up performance budgets
- [ ] Create performance regression detection
- [ ] Implement performance optimization suggestions

### Phase 4: Production Monitoring (Week 4)
- [ ] Deploy monitoring to production
- [ ] Set up real-time alerts
- [ ] Create performance dashboards
- [ ] Implement automated performance reports

## Performance Targets and Alerts

### Core Web Vitals Targets
- **LCP**: < 2.5s (Good), 2.5-4s (Needs Improvement), > 4s (Poor)
- **FID**: < 100ms (Good), 100-300ms (Needs Improvement), > 300ms (Poor)
- **CLS**: < 0.1 (Good), 0.1-0.25 (Needs Improvement), > 0.25 (Poor)

### Custom Performance Targets
- **File Processing**: < 30s for 50MB files
- **API Response Time**: < 2s average
- **Bundle Size**: < 500KB JavaScript, < 100KB CSS
- **Error Rate**: < 1% for all operations

### Alert Thresholds
- **Performance Score**: Alert if < 80%
- **LCP**: Alert if > 4s
- **Error Rate**: Alert if > 5%
- **Processing Time**: Alert if > 60s

This comprehensive monitoring strategy will provide deep insights into application performance, enable proactive optimization, and ensure excellent user experience across all environments.