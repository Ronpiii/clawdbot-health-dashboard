import express from 'express';
import os from 'os';

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from public directory
app.use(express.static('public'));

// System metrics API endpoint
app.get('/api/system-metrics', (req, res) => {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();

  res.json({
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
});

// Start server
app.listen(PORT, () => {
  console.log(`🤖 Clawdbot Health Dashboard running on port ${PORT}`);
});