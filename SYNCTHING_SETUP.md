# Syncthing Server Setup - Complete ✓

## Server Status
✅ **Syncthing is running on your VPS**

**Server Details:**
- Location: `sn-69-16.tll07.zoneas.eu`
- Device ID: `QFQXN4R-GH3DMUX-K5CCR35-K6QVSBC-5CSVY2K-FM22WFU-3K5SJYI-JZUGOAX`
- Home Directory: `/data02/virt137413/syncthing/`
- Config: `/data02/virt137413/syncthing/config.xml`
- Sync Folder: `/data02/virt137413/syncthing/sync/`
- GUI Port: `8384`
- API Key: `Jj6Su39m7vmGAXmjPg3wH7tuDby6cspF`
- Logs: `/data02/virt137413/syncthing/syncthing.log`

---

## Next Steps: Connect Your 3 Machines

### Step 1: Install Syncthing on Mac mini + MacBook
```bash
brew install syncthing
syncthing  # starts and opens http://localhost:8384
```

### Step 2: Install on Windows
- Download: https://syncthing.net/downloads/
- Run installer, launch Syncthing

### Step 3: Add Server as Remote Device (on each machine)

In Syncthing UI on each machine:
1. **Settings → Devices → Add Device**
2. Enter:
   - Device ID: `QFQXN4R-GH3DMUX-K5CCR35-K6QVSBC-5CSVY2K-FM22WFU-3K5SJYI-JZUGOAX`
   - Name: "VPS Server"
   - Address: `sn-69-16.tll07.zoneas.eu:22000`
3. Click **Add Device**
4. Accept on server (or auto-accept is enabled)

### Step 4: Create Sync Folder

On each machine, create/add folder:
1. **Settings → Folders → Add Folder**
2. Path: (same on all 3, e.g., `~/Documents/sync` or `~/work`)
3. Folder ID: `work` (same on all 3)
4. Devices: check all 3 machines
5. Type: **Send & Receive**

---

## How It Works

```
Mac mini (office WiFi)
    ↓ (encrypted)
[VPS Server]
    ↓ (encrypted)
MacBook Air (coffee WiFi)
    ↓ (encrypted)
Windows (home WiFi)
```

- Edit file on Mac mini → syncs to VPS → appears on MacBook + Windows (in seconds)
- Network changes? Doesn't matter. Relays automatically.
- All end-to-end encrypted.

---

## Monitoring

**Check if server is running:**
```bash
ps aux | grep syncthing | grep -v grep
# should see: /data02/virt137413/bin/syncthing
```

**View live logs:**
```bash
tail -f ~/syncthing/syncthing.log
```

**Web UI (via SSH tunnel):**
```bash
ssh -L 8384:localhost:8384 ron@clawd.ai
# then open: http://localhost:8384
```

---

## If Issues

**Devices can't connect:**
- Make sure firewall allows port 22000 (TCP + UDP)
- Check logs: `tail -f ~/syncthing/syncthing.log`

**Folders not syncing:**
- Verify Folder ID matches on all devices
- Check path exists on all machines
- Confirm all 3 devices are "Connected"

**Server not discoverable:**
- Syncthing uses global discovery + relays (built-in)
- Should work even if server IP changes
- Patience: first connection can take 30-60 seconds

---

## Notes

- Syncthing runs in background (set via nohup)
- Config auto-generates and persists
- Auto-accept enabled: new devices approved automatically
- Relay enabled: works across any network
- No data ever leaves encrypted tunnel

**You're all set!** Just install Syncthing on your 3 machines, add the server, and sync folders.
