import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

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
const server = app.listen(PORT, () => {
  console.log(`🤖 Clawdbot Health Dashboard running on port ${PORT}`);
});

export default server;