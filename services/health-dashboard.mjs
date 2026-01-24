import express from 'express';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

class HealthDashboard {
  constructor(port = process.env.PORT || 3000) {
    this.app = express();
    this.port = port;
    this.setupRoutes();
  }

  setupRoutes() {
    this.app.use(express.static(path.join(process.cwd(), 'public')));

    // Live system metrics
    this.app.get('/api/system-metrics', async (req, res) => {
      try {
        const metrics = {
          timestamp: new Date(),
          hostname: os.hostname(),
          uptime: os.uptime(),
          load_average: os.loadavg(),
          memory: this.getMemoryUsage(),
          disk: await this.getDiskUsage(),
          recent_health_logs: await this.getRecentHealthLogs(),
          recent_alerts: await this.getRecentAlerts()
        };
        res.json(metrics);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Health logs endpoint
    this.app.get('/api/health-logs', async (req, res) => {
      try {
        const logs = await this.getRecentHealthLogs();
        res.json(logs);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Alerts endpoint
    this.app.get('/api/alerts', async (req, res) => {
      try {
        const alerts = await this.getRecentAlerts();
        res.json(alerts);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
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
    return new Promise((resolve, reject) => {
      import('child_process').then(({ exec }) => {
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
    });
  }

  async getRecentHealthLogs(limit = 50) {
    const logPath = '/data02/virt137413/clawd/memory/self-health-logs.json';
    try {
      const content = await fs.readFile(logPath, 'utf-8');
      const logs = JSON.parse(content);
      return logs.slice(-limit);
    } catch {
      return [];
    }
  }

  async getRecentAlerts(limit = 20) {
    const alertPath = '/data02/virt137413/clawd/memory/health-alerts.json';
    try {
      const content = await fs.readFile(alertPath, 'utf-8');
      const alerts = JSON.parse(content);
      return alerts.slice(-limit);
    } catch {
      return [];
    }
  }

  async createDashboardFiles() {
    // Create public directory if it doesn't exist
    await fs.mkdir(path.join(process.cwd(), 'public'), { recursive: true });

    // Create index.html
    await fs.writeFile(path.join(process.cwd(), 'public', 'index.html'), `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Clawdbot Health Dashboard</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { 
            font-family: Arial, sans-serif; 
            max-width: 800px; 
            margin: 0 auto; 
            padding: 20px; 
            background: #f4f4f4; 
        }
        .metric-card {
            background: white;
            border-radius: 5px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            padding: 15px;
            margin-bottom: 15px;
        }
        .alert { color: red; }
    </style>
</head>
<body>
    <h1>🤖 Clawdbot Health Dashboard</h1>
    <div id="system-metrics"></div>
    <h2>Recent Alerts</h2>
    <div id="recent-alerts"></div>

    <script>
        async function updateDashboard() {
            try {
                const [metricsResponse, alertsResponse] = await Promise.all([
                    fetch('/api/system-metrics'),
                    fetch('/api/alerts')
                ]);
                
                const metrics = await metricsResponse.json();
                const alerts = await alertsResponse.json();

                // Update system metrics
                const metricsContainer = document.getElementById('system-metrics');
                metricsContainer.innerHTML = \`
                    <div class="metric-card">
                        <h3>System Overview</h3>
                        <p>Hostname: \${metrics.hostname}</p>
                        <p>Uptime: \${(metrics.uptime / 3600).toFixed(2)} hours</p>
                        <p>Load Average: \${metrics.load_average.join(', ')}</p>
                    </div>
                    <div class="metric-card">
                        <h3>Memory Usage</h3>
                        <p>Total: \${(metrics.memory.total / (1024 * 1024 * 1024)).toFixed(2)} GB</p>
                        <p>Free: \${(metrics.memory.free / (1024 * 1024 * 1024)).toFixed(2)} GB</p>
                        <p>Used: \${metrics.memory.used_percentage.toFixed(2)}%</p>
                    </div>
                    <div class="metric-card">
                        <h3>Disk Usage</h3>
                        <p>Total: \${(metrics.disk.total / (1024 * 1024 * 1024)).toFixed(2)} GB</p>
                        <p>Free: \${(metrics.disk.free / (1024 * 1024 * 1024)).toFixed(2)} GB</p>
                        <p>Used: \${metrics.disk.used_percentage.toFixed(2)}%</p>
                    </div>
                \`;

                // Update alerts
                const alertsContainer = document.getElementById('recent-alerts');
                alertsContainer.innerHTML = alerts.map(alert => \`
                    <div class="metric-card alert">
                        <p>\${new Date(alert.timestamp).toLocaleString()}: \${alert.message}</p>
                    </div>
                \`).join('') || '<p>No recent alerts</p>';
            } catch (error) {
                console.error('Dashboard update failed:', error);
            }
        }

        // Initial update
        updateDashboard();

        // Periodic updates
        setInterval(updateDashboard, 60000);
    </script>
</body>
</html>
    `);
  }

  start() {
    return new Promise(async (resolve, reject) => {
      try {
        // Create dashboard files
        await this.createDashboardFiles();

        // Start server
        this.server = this.app.listen(this.port, () => {
          console.log(`🌐 Health Dashboard running on http://localhost:${this.port}`);
          resolve(this.server);
        });
      } catch (error) {
        console.error('Dashboard startup failed:', error);
        reject(error);
      }
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      console.log('Health Dashboard stopped');
    }
  }
}

// Run dashboard if called directly
async function startHealthDashboard() {
  const dashboard = new HealthDashboard(3030);
  await dashboard.start();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startHealthDashboard().catch(console.error);
}