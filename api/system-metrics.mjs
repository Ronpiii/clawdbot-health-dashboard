import os from 'os';
import { exec } from 'child_process';

export default async function handler(req, res) {
  try {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    
    // Promisify disk usage check
    const getDiskUsage = () => {
      return new Promise((resolve) => {
        exec('df -h / 2>/dev/null', (err, stdout) => {
          if (err || !stdout) {
            resolve({ total: 'N/A', free: 'N/A', usedPercentage: 0 });
            return;
          }

          try {
            const lines = stdout.trim().split('\n');
            if (lines.length < 2) {
              resolve({ total: 'N/A', free: 'N/A', usedPercentage: 0 });
              return;
            }
            const diskInfo = lines[1].split(/\s+/);
            const usedPercent = parseInt(diskInfo[4]?.replace('%', '') || '0', 10);
            resolve({
              total: diskInfo[1] || 'N/A',
              free: diskInfo[3] || 'N/A',
              usedPercentage: isNaN(usedPercent) ? 0 : usedPercent
            });
          } catch (e) {
            resolve({ total: 'N/A', free: 'N/A', usedPercentage: 0 });
          }
        });
      });
    };

    const diskUsage = await getDiskUsage();

    res.status(200).json({
      timestamp: new Date(),
      hostname: os.hostname(),
      platform: os.platform(),
      uptime: os.uptime(),
      loadAverage: os.loadavg(),
      memory: {
        total: totalMemory,
        free: freeMemory,
        usedPercentage: ((totalMemory - freeMemory) / totalMemory) * 100
      },
      disk: {
        total: diskUsage.total,
        free: diskUsage.free,
        usedPercentage: diskUsage.usedPercentage
      }
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to retrieve system metrics',
      message: error.message 
    });
  }
}