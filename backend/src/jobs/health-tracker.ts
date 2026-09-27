/**
 * Job health tracking for scheduled background jobs.
 * 
 * Tracks last run time, last outcome, error count, and expected intervals
 * for all scheduled jobs to expose health and readiness information via
 * the /health endpoint.
 */

import { logger } from "../logger";

export interface JobHealthStatus {
  /** Last time the job completed a full cycle (ISO timestamp) */
  lastRunAt: string | null;
  /** Last outcome: "success", "error", or null if never run */
  lastOutcome: "success" | "error" | null;
  /** Number of consecutive errors */
  errorCount: number;
  /** Expected interval in milliseconds */
  expectedIntervalMs: number;
  /** Whether the job is currently running */
  isRunning: boolean;
  /** Optional error message from last failure */
  lastError?: string;
}

export interface JobHealthReport {
  [jobName: string]: JobHealthStatus;
}

class JobHealthTracker {
  private healthStatus: Map<string, JobHealthStatus> = new Map();

  /**
   * Register a job with its expected interval.
   */
  registerJob(jobName: string, expectedIntervalMs: number): void {
    this.healthStatus.set(jobName, {
      lastRunAt: null,
      lastOutcome: null,
      errorCount: 0,
      expectedIntervalMs,
      isRunning: false,
    });
    logger.info({ jobName, expectedIntervalMs }, "Registered job for health tracking");
  }

  /**
   * Mark a job as starting.
   */
  markJobStart(jobName: string): void {
    const status = this.healthStatus.get(jobName);
    if (status) {
      status.isRunning = true;
    }
  }

  /**
   * Mark a job as completing successfully.
   */
  markJobSuccess(jobName: string): void {
    const status = this.healthStatus.get(jobName);
    if (status) {
      status.lastRunAt = new Date().toISOString();
      status.lastOutcome = "success";
      status.errorCount = 0;
      status.isRunning = false;
      status.lastError = undefined;
    }
  }

  /**
   * Mark a job as failing.
   */
  markJobError(jobName: string, error: string): void {
    const status = this.healthStatus.get(jobName);
    if (status) {
      status.lastRunAt = new Date().toISOString();
      status.lastOutcome = "error";
      status.errorCount++;
      status.isRunning = false;
      status.lastError = error;
    }
  }

  /**
   * Get health status for all registered jobs.
   */
  getHealthReport(): JobHealthReport {
    const report: JobHealthReport = {};
    for (const [jobName, status] of this.healthStatus) {
      report[jobName] = { ...status };
    }
    return report;
  }

  /**
   * Check if a job is healthy (ran within expected interval and not wedged).
   */
  isJobHealthy(jobName: string): boolean {
    const status = this.healthStatus.get(jobName);
    if (!status) return true; // Unregistered jobs are considered healthy

    // If never run, consider healthy
    if (!status.lastRunAt) return true;

    // If job is currently running, give it grace period
    if (status.isRunning) {
      const lastRun = new Date(status.lastRunAt);
      const now = new Date();
      const elapsed = now.getTime() - lastRun.getTime();
      // Allow up to 2x expected interval for running jobs
      return elapsed < status.expectedIntervalMs * 2;
    }

    // Check if job ran within expected interval
    const lastRun = new Date(status.lastRunAt);
    const now = new Date();
    const elapsed = now.getTime() - lastRun.getTime();
    
    // Allow up to 1.5x expected interval before marking unhealthy
    const isStale = elapsed > status.expectedIntervalMs * 1.5;
    
    // Consider unhealthy if stale or has too many consecutive errors
    return !isStale && status.errorCount < 5;
  }

  /**
   * Check overall system readiness based on job health.
   */
  isSystemReady(): boolean {
    const report = this.getHealthReport();
    for (const [jobName, status] of Object.entries(report)) {
      if (!this.isJobHealthy(jobName)) {
        logger.warn({ jobName, status }, "Job health check failed - system not ready");
        return false;
      }
    }
    return true;
  }
}

// Singleton instance
export const jobHealthTracker = new JobHealthTracker();
