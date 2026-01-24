import express from 'express';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';

class HealthDashboard {
  constructor(port = process.env.PORT || 3000) {
    this.app = express();
    this.port = port;
    this.setupRoutes();
  }

  setupRoutes() {
    // Serve static files
    this.app.use(express.static(path.join(process.cwd(), 'public')));

    // Live system metrics API
    this.app.get('/api/system-metrics', async (req, res) => {
      try {
        const metrics = {
          timestamp: new Date(),
          hostname: os.hostname(),
          uptime: os.uptime(),
          load_average: os.loadavg(),
          memory: this.getMemoryUsage(),
          disk: await this.getDiskUsage()
        };
        res.json(metrics);
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

  start() {
    return new Promise((resolve, reject) => {
      try {
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
}

// Run dashboard if called directly
async function startHealthDashboard() {
  const dashboard = new HealthDashboard();
  await dashboard.start();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startHealthDashboard().catch(console.error);
}

export default HealthDashboard;