import os from 'os';

export default function handler(req, res) {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();

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
    }
  });
}