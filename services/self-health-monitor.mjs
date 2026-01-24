import { exec } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

class SelfHealthMonitor {
  constructor() {
    this.logPath = '/data02/virt137413/clawd/memory/self-health-logs.json';
    this.alertThresholds = {
      memory_usage: 80,  // percentage
      disk_usage: 90,    // percentage
      load_average: 10,  // 1-minute load average
      error_count: 5     // recent errors
    };
  }

  async runHealthCheck() {
    const metrics = await this.collectHealthMetrics();
    await this.evaluateHealthStatus(metrics);
    return metrics;
  }

  async collectHealthMetrics() {
    const systemMetrics = {
      timestamp: new Date(),
      hostname: os.hostname(),
      uptime: os.uptime(),
      load_average: os.loadavg(),
      memory: this.getMemoryUsage(),
      disk: await this.getDiskUsage(),
      process: await this.getProcessMetrics()
    };

    await this.logHealthMetrics(systemMetrics);
    return systemMetrics;
  }

  getMemoryUsage() {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    return {
      total: totalMemory,
      free: freeMemory,
      used_percentage: ((totalMemory - freeMemory) / totalMemory) * 100
    };
  }

  getDiskUsage() {
    return new Promise((resolve) => {
      exec('df -k /', (err, stdout) => {
        if (err) {
          resolve({ total: 0, free: 0, used_percentage: 0 });
          return;
        }

        const lines = stdout.split('\n');
        const diskInfo = lines[1].split(/\s+/);
        const total = Number(diskInfo[1]) * 1024;
        const free = Number(diskInfo[3]) * 1024;
        const usedPercentage = Number(diskInfo[4].replace('%', ''));

        resolve({ total, free, used_percentage: usedPercentage });
      });
    });
  }

  async getProcessMetrics() {
    return {
      pid: process.pid,
      memory_usage: process.memoryUsage(),
      cpu_usage: process.cpuUsage()
    };
  }

  async evaluateHealthStatus(metrics) {
    const alerts = [];

    // Check memory usage
    if (metrics.memory.used_percentage > this.alertThresholds.memory_usage) {
      alerts.push(`High memory usage: ${metrics.memory.used_percentage.toFixed(2)}%`);
    }

    // Check disk usage
    if (metrics.disk.used_percentage > this.alertThresholds.disk_usage) {
      alerts.push(`High disk usage: ${metrics.disk.used_percentage}%`);
    }

    // Check load average
    if (metrics.load_average[0] > this.alertThresholds.load_average) {
      alerts.push(`High system load: ${metrics.load_average[0]}`);
    }

    // Check recent errors (placeholder)
    const recentErrors = await this.checkRecentErrors();
    if (recentErrors.count > this.alertThresholds.error_count) {
      alerts.push(`High error count: ${recentErrors.count} recent errors`);
    }

    if (alerts.length > 0) {
      await this.sendAlerts(alerts);
    }

    return alerts;
  }

  async checkRecentErrors() {
    const errorLogPath = '/data02/virt137413/clawd/memory/error-log.json';
    try {
      const errorLog = JSON.parse(await fs.readFile(errorLogPath, 'utf-8'));
      // Consider errors in last 24 hours
      const recent = errorLog.filter(err => 
        new Date(err.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000)
      );
      return {
        count: recent.length,
        recent: recent
      };
    } catch {
      return { count: 0, recent: [] };
    }
  }

  async sendAlerts(alerts) {
    // Multiple alert mechanisms
    const alertMethods = [
      this.logAlertsToFile,
      this.sendTelegramAlert
    ];

    for (const method of alertMethods) {
      try {
        await method(alerts);
      } catch (error) {
        console.error(`Alert method failed: ${method.name}`, error);
      }
    }
  }

  async logAlertsToFile(alerts) {
    const alertLogPath = '/data02/virt137413/clawd/memory/health-alerts.json';
    try {
      const existingAlerts = await fs.readFile(alertLogPath, 'utf-8')
        .then(JSON.parse)
        .catch(() => []);

      const newAlertLog = [
        ...existingAlerts,
        ...alerts.map(alert => ({
          timestamp: new Date(),
          message: alert
        }))
      ];

      // Keep only last 100 alerts
      const trimmedAlertLog = newAlertLog.slice(-100);

      await fs.writeFile(alertLogPath, JSON.stringify(trimmedAlertLog, null, 2));
    } catch (error) {
      console.error('Failed to log alerts:', error);
    }
  }

  async sendTelegramAlert(alerts) {
    // Use message tool to send alerts to Telegram
    const alertMessage = `🚨 Clawdbot Health Alerts:\n${alerts.map(a => `- ${a}`).join('\n')}`;
    
    try {
      await new Promise((resolve, reject) => {
        exec(`message send --target "@Ronvelttt" "${alertMessage}"`, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    } catch (error) {
      console.error('Telegram alert failed:', error);
    }
  }

  async logHealthMetrics(metrics) {
    try {
      const logs = await this.readHealthLogs();
      logs.push(metrics);
      
      // Keep only last 100 logs
      if (logs.length > 100) {
        logs.shift();
      }

      await fs.writeFile(this.logPath, JSON.stringify(logs, null, 2));
    } catch (error) {
      console.error('Health log writing failed:', error);
    }
  }

  async readHealthLogs() {
    try {
      const content = await fs.readFile(this.logPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  }
}

// Continuous health monitoring
async function startContinuousHealthMonitoring() {
  const healthMonitor = new SelfHealthMonitor();
  
  // Initial health check
  console.log('🩺 Initial health check starting...');
  await healthMonitor.runHealthCheck();

  // Schedule periodic health checks
  const checkInterval = 15 * 60 * 1000; // 15 minutes
  setInterval(async () => {
    try {
      console.log('🕒 Performing scheduled health check...');
      await healthMonitor.runHealthCheck();
    } catch (error) {
      console.error('Health check failed:', error);
    }
  }, checkInterval);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startContinuousHealthMonitoring().catch(console.error);
}