#!/usr/bin/env node

import { Command } from 'commander';
import Conf from 'conf';
import chalk from 'chalk';
import ora from 'ora';
import { table } from 'table';

const config = new Conf({ projectName: 'ctx' });
const API_URL = config.get('apiUrl', 'https://api.ctxmem.dev') as string;

const program = new Command();

program
  .name('ctx')
  .description('Persistent memory for AI workflows')
  .version('0.1.0');

// Config commands
program
  .command('config')
  .description('Manage configuration')
  .option('--api-key <key>', 'Set API key')
  .option('--api-url <url>', 'Set API URL')
  .option('--show', 'Show current config')
  .action((opts) => {
    if (opts.apiKey) {
      config.set('apiKey', opts.apiKey);
      console.log(chalk.green('✓ API key saved'));
    }
    if (opts.apiUrl) {
      config.set('apiUrl', opts.apiUrl);
      console.log(chalk.green(`✓ API URL set to ${opts.apiUrl}`));
    }
    if (opts.show) {
      console.log('API Key:', config.get('apiKey') ? '***' + (config.get('apiKey') as string).slice(-8) : 'not set');
      console.log('API URL:', config.get('apiUrl', 'https://api.ctxmem.dev'));
    }
  });

// Helper for API calls
async function api(path: string, options: RequestInit = {}) {
  const apiKey = config.get('apiKey') as string;
  if (!apiKey) {
    console.error(chalk.red('No API key configured. Run: ctx config --api-key YOUR_KEY'));
    process.exit(1);
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || 'API request failed');
  }

  return res.json();
}

// Namespace commands
const ns = program.command('ns').description('Manage namespaces');

ns.command('list')
  .description('List namespaces')
  .action(async () => {
    const spinner = ora('Fetching namespaces...').start();
    try {
      const { namespaces } = await api('/v1/namespaces');
      spinner.stop();
      
      if (namespaces.length === 0) {
        console.log(chalk.yellow('No namespaces yet. Create one with: ctx ns create <slug>'));
        return;
      }

      const data = [
        ['Slug', 'Name', 'Entries', 'Created'],
        ...namespaces.map((n: any) => [
          n.slug,
          n.name || '-',
          n.entry_count,
          new Date(n.created_at).toLocaleDateString(),
        ]),
      ];
      console.log(table(data));
    } catch (err: any) {
      spinner.fail(err.message);
    }
  });

ns.command('create <slug>')
  .description('Create a namespace')
  .option('-n, --name <name>', 'Display name')
  .option('-d, --desc <description>', 'Description')
  .action(async (slug, opts) => {
    const spinner = ora('Creating namespace...').start();
    try {
      await api('/v1/namespaces', {
        method: 'POST',
        body: JSON.stringify({ slug, name: opts.name, description: opts.desc }),
      });
      spinner.succeed(`Namespace '${slug}' created`);
    } catch (err: any) {
      spinner.fail(err.message);
    }
  });

ns.command('delete <slug>')
  .description('Delete a namespace')
  .action(async (slug) => {
    const spinner = ora('Deleting namespace...').start();
    try {
      await api(`/v1/namespaces/${slug}`, { method: 'DELETE' });
      spinner.succeed(`Namespace '${slug}' deleted`);
    } catch (err: any) {
      spinner.fail(err.message);
    }
  });

// Entry commands
program
  .command('get <namespace> <key>')
  .description('Get an entry')
  .action(async (namespace, key) => {
    try {
      const entry = await api(`/v1/namespaces/${namespace}/entries/${key}`);
      console.log(JSON.stringify(entry.value, null, 2));
    } catch (err: any) {
      console.error(chalk.red(err.message));
    }
  });

program
  .command('set <namespace> <key> <value>')
  .description('Set an entry')
  .option('-t, --tags <tags>', 'Comma-separated tags')
  .option('--ttl <seconds>', 'Time to live in seconds')
  .option('--no-embed', 'Skip embedding generation')
  .action(async (namespace, key, value, opts) => {
    const spinner = ora('Saving entry...').start();
    try {
      // Try to parse as JSON
      let parsedValue;
      try {
        parsedValue = JSON.parse(value);
      } catch {
        parsedValue = value;
      }

      await api(`/v1/namespaces/${namespace}/entries/${key}`, {
        method: 'PUT',
        body: JSON.stringify({
          value: parsedValue,
          tags: opts.tags?.split(',').map((t: string) => t.trim()),
          ttl: opts.ttl ? parseInt(opts.ttl, 10) : undefined,
          embed: opts.embed,
        }),
      });
      spinner.succeed(`Entry '${key}' saved`);
    } catch (err: any) {
      spinner.fail(err.message);
    }
  });

program
  .command('delete <namespace> <key>')
  .alias('rm')
  .description('Delete an entry')
  .action(async (namespace, key) => {
    const spinner = ora('Deleting entry...').start();
    try {
      await api(`/v1/namespaces/${namespace}/entries/${key}`, { method: 'DELETE' });
      spinner.succeed(`Entry '${key}' deleted`);
    } catch (err: any) {
      spinner.fail(err.message);
    }
  });

program
  .command('list <namespace>')
  .alias('ls')
  .description('List entries in a namespace')
  .option('-t, --tag <tag>', 'Filter by tag')
  .option('-l, --limit <n>', 'Limit results', '20')
  .action(async (namespace, opts) => {
    const spinner = ora('Fetching entries...').start();
    try {
      const params = new URLSearchParams();
      if (opts.tag) params.set('tag', opts.tag);
      params.set('limit', opts.limit);

      const { entries } = await api(`/v1/namespaces/${namespace}/entries?${params}`);
      spinner.stop();

      if (entries.length === 0) {
        console.log(chalk.yellow('No entries'));
        return;
      }

      const data = [
        ['Key', 'Tags', 'Updated'],
        ...entries.map((e: any) => [
          e.key.length > 30 ? e.key.slice(0, 30) + '...' : e.key,
          (e.tags || []).join(', ') || '-',
          new Date(e.updated_at).toLocaleString(),
        ]),
      ];
      console.log(table(data));
    } catch (err: any) {
      spinner.fail(err.message);
    }
  });

// Search
program
  .command('search <query>')
  .description('Semantic search across entries')
  .option('-n, --namespace <ns>', 'Limit to namespace')
  .option('-l, --limit <n>', 'Limit results', '10')
  .option('--threshold <n>', 'Similarity threshold (0-1)', '0.7')
  .action(async (query, opts) => {
    const spinner = ora('Searching...').start();
    try {
      const { results } = await api('/v1/search', {
        method: 'POST',
        body: JSON.stringify({
          query,
          namespace: opts.namespace,
          limit: parseInt(opts.limit, 10),
          threshold: parseFloat(opts.threshold),
        }),
      });
      spinner.stop();

      if (results.length === 0) {
        console.log(chalk.yellow('No results found'));
        return;
      }

      for (const r of results) {
        console.log(chalk.cyan(`[${r.namespace}/${r.key}]`) + ` (${(r.similarity * 100).toFixed(1)}%)`);
        const preview = typeof r.value === 'string' 
          ? r.value.slice(0, 100) 
          : JSON.stringify(r.value).slice(0, 100);
        console.log(`  ${preview}${preview.length >= 100 ? '...' : ''}`);
        console.log();
      }
    } catch (err: any) {
      spinner.fail(err.message);
    }
  });

// Account info
program
  .command('whoami')
  .description('Show account info and usage')
  .action(async () => {
    try {
      const data = await api('/v1/account');
      console.log(chalk.bold('Account:'), data.account.email);
      console.log(chalk.bold('Tier:'), data.account.tier);
      console.log();
      console.log(chalk.bold('Usage:'));
      console.log(`  Namespaces: ${data.usage.namespaces.current}/${data.usage.namespaces.limit === -1 ? '∞' : data.usage.namespaces.limit}`);
      console.log(`  Entries: ${data.usage.entries.current}/${data.usage.entries.limit === -1 ? '∞' : data.usage.entries.limit}`);
      console.log(`  Requests: ${data.usage.requests.current}/${data.usage.requests.limit === -1 ? '∞' : data.usage.requests.limit}/mo`);
    } catch (err: any) {
      console.error(chalk.red(err.message));
    }
  });

program.parse();
