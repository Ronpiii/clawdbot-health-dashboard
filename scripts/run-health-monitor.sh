#!/bin/bash
cd /data02/virt137413/clawd
/usr/bin/node /data02/virt137413/clawd/services/self-health-monitor.mjs >> /data02/virt137413/clawd/memory/health-monitor.log 2>&1