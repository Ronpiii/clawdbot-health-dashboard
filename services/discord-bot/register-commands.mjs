#!/usr/bin/env node
/**
 * Register Discord slash commands for Ventok
 */

import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load token from discord-voice-bot .env (reuse existing creds)
const envPath = resolve(__dirname, '../../discord-voice-bot/.env');
const envContent = readFileSync(envPath, 'utf8');
const tokenMatch = envContent.match(/DISCORD_TOKEN=(\S+)/);
const token = tokenMatch?.[1];

if (!token) {
  console.error('DISCORD_TOKEN not found in', envPath);
  process.exit(1);
}

// Extract client ID from token (first segment is base64 client ID)
const clientId = Buffer.from(token.split('.')[0], 'base64').toString();
const guildId = '1464611456858456259'; // Ventok

const commands = [
  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Show workspace status (git, tasks, memory)')
    .toJSON(),
  
  new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Set a reminder')
    .addStringOption(opt =>
      opt.setName('message')
        .setDescription('What to remind you about')
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName('when')
        .setDescription('When to remind (e.g., "in 1h", "tomorrow 9am")')
        .setRequired(true))
    .toJSON(),
  
  new SlashCommandBuilder()
    .setName('search')
    .setDescription('Search workspace memory')
    .addStringOption(opt =>
      opt.setName('query')
        .setDescription('Search terms')
        .setRequired(true))
    .toJSON(),
  
  new SlashCommandBuilder()
    .setName('task')
    .setDescription('Quick task management')
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List active tasks'))
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add a new task')
        .addStringOption(opt =>
          opt.setName('text')
            .setDescription('Task description')
            .setRequired(true)))
    .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log(`registering ${commands.length} commands for guild ${guildId}...`);
    
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );
    
    console.log('✓ commands registered successfully');
  } catch (error) {
    console.error('failed to register commands:', error);
    process.exit(1);
  }
})();
