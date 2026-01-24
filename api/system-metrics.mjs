import os from 'os';
import { exec } from 'child_process';

export default async function handler(req, res) {
  try {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    
    // Promisify disk usage check
    const getDiskUsage = () => {
      return new Promise((resolve, reject) => {
        exec('df -h /', (err, stdout) => {
          if (err) {
            resolve({ total: '0GB', free: '0GB', usedPercentage: 0 });
            return;
          }

          const lines = stdout.split('\n');
          const diskInfo = lines[1].split(/\s+/);
          resolve({
            total: diskInfo[1],
            free: diskInfo[3],
            usedPercentage: Number(diskInfo[4].replace('%', ''))
          });
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