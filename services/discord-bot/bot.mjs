#!/usr/bin/env node
/**
 * Discord slash commands bot for Ventok
 * Provides /status, /remind, /search, /task commands
 */

import { Client, GatewayIntentBits, Events } from 'discord.js';
import { execSync } from 'child_process';
import { readFileSync, existsSync, appendFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = resolve(__dirname, '../..');

// Load token
const envPath = resolve(__dirname, '../../discord-voice-bot/.env');
const envContent = readFileSync(envPath, 'utf8');
const tokenMatch = envContent.match(/DISCORD_TOKEN=(\S+)/);
const token = tokenMatch?.[1];

if (!token) {
  console.error('DISCORD_TOKEN not found');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Helper: run command in workspace
function run(cmd, cwd = WORKSPACE) {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', timeout: 10000 }).trim();
  } catch (e) {
    return `error: ${e.message}`;
  }
}

// Command handlers
const handlers = {
  async status(interaction) {
    await interaction.deferReply();
    
    // Git status
    const gitStatus = run('git status --short');
    const gitBranch = run('git branch --show-current');
    const lastCommit = run('git log -1 --oneline');
    
    // Tasks
    let taskSummary = 'no tasks file';
    const taskPath = resolve(WORKSPACE, 'tasks/active.md');
    if (existsSync(taskPath)) {
      const content = readFileSync(taskPath, 'utf8');
      const done = (content.match(/- \[x\]/g) || []).length;
      const inProgress = (content.match(/- \[~\]/g) || []).length;
      const pending = (content.match(/- \[ \]/g) || []).length;
      taskSummary = `✓ ${done} | ⏳ ${inProgress} | 📋 ${pending}`;
    }
    
    // Memory
    let memoryInfo = '';
    try {
      const indexOutput = run('node scripts/memory-index.mjs stats 2>/dev/null || echo "no index"');
      memoryInfo = indexOutput;
    } catch {
      memoryInfo = 'index unavailable';
    }
    
    const embed = {
      title: '📊 Workspace Status',
      fields: [
        { name: 'Branch', value: `\`${gitBranch}\``, inline: true },
        { name: 'Last Commit', value: `\`${lastCommit}\``, inline: true },
        { name: 'Uncommitted', value: gitStatus ? `\`\`\`\n${gitStatus.slice(0, 200)}\n\`\`\`` : 'clean', inline: false },
        { name: 'Tasks', value: taskSummary, inline: true },
      ],
      color: 0x5865F2,
      timestamp: new Date().toISOString(),
    };
    
    await interaction.editReply({ embeds: [embed] });
  },
  
  async remind(interaction) {
    const message = interaction.options.getString('message');
    const when = interaction.options.getString('when');
    
    // For now, just acknowledge - full cron integration would need gateway access
    // Log to a reminders file that heartbeat can check
    const reminderPath = resolve(WORKSPACE, 'memory/reminders.json');
    let reminders = [];
    if (existsSync(reminderPath)) {
      reminders = JSON.parse(readFileSync(reminderPath, 'utf8'));
    }
    
    reminders.push({
      message,
      when,
      createdAt: new Date().toISOString(),
      user: interaction.user.username,
      channel: interaction.channel?.name || 'dm',
    });
    
    appendFileSync(reminderPath, JSON.stringify(reminders, null, 2));
    
    await interaction.reply({
      content: `⏰ Reminder set: "${message}" (${when})\n_Note: Arc will process this on next heartbeat._`,
      ephemeral: true,
    });
  },
  
  async search(interaction) {
    const query = interaction.options.getString('query');
    await interaction.deferReply();
    
    const result = run(`node scripts/memory-index.mjs search "${query.replace(/"/g, '\\"')}"`);
    
    const lines = result.split('\n').slice(0, 10);
    const formatted = lines.length > 0 ? `\`\`\`\n${lines.join('\n')}\n\`\`\`` : 'No results found.';
    
    await interaction.editReply({
      embeds: [{
        title: `🔍 Search: "${query}"`,
        description: formatted.slice(0, 4000),
        color: 0x5865F2,
      }],
    });
  },
  
  async task(interaction) {
    const subcommand = interaction.options.getSubcommand();
    
    if (subcommand === 'list') {
      await interaction.deferReply();
      
      const taskPath = resolve(WORKSPACE, 'tasks/active.md');
      if (!existsSync(taskPath)) {
        await interaction.editReply('No tasks file found.');
        return;
      }
      
      const content = readFileSync(taskPath, 'utf8');
      // Extract in-progress and pending items
      const lines = content.split('\n');
      const relevant = lines
        .filter(l => l.match(/^- \[([ ~!])\]/))
        .slice(0, 15)
        .join('\n');
      
      await interaction.editReply({
        embeds: [{
          title: '📋 Active Tasks',
          description: `\`\`\`md\n${relevant || 'No active tasks'}\n\`\`\``,
          color: 0x5865F2,
        }],
      });
    } else if (subcommand === 'add') {
      const text = interaction.options.getString('text');
      const taskPath = resolve(WORKSPACE, 'tasks/active.md');
      
      // Append to backlog section
      appendFileSync(taskPath, `\n- [ ] ${text}`);
      
      await interaction.reply({
        content: `✓ Added task: "${text}"`,
        ephemeral: false,
      });
    }
  },
};

client.once(Events.ClientReady, (c) => {
  console.log(`✓ logged in as ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  
  const handler = handlers[interaction.commandName];
  if (handler) {
    try {
      await handler(interaction);
    } catch (error) {
      console.error(`error handling /${interaction.commandName}:`, error);
      const reply = interaction.replied || interaction.deferred
        ? interaction.editReply
        : interaction.reply;
      await reply.call(interaction, {
        content: `Error: ${error.message}`,
        ephemeral: true,
      });
    }
  }
});

client.login(token);
