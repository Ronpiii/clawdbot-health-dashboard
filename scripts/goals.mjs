#!/usr/bin/env node
/**
 * goals.mjs - quick goal status check
 * 
 * parses GOALS.md and shows current status
 * 
 * usage: node scripts/goals.mjs
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const WORKSPACE = '/data02/virt137413/clawd';
const GOALS_FILE = join(WORKSPACE, 'GOALS.md');

async function parseGoals() {
  if (!existsSync(GOALS_FILE)) {
    console.log('no GOALS.md found');
    return;
  }

  const content = await readFile(GOALS_FILE, 'utf-8');
  const lines = content.split('\n');
  
  const goals = {
    active: [],
    blocked: [],
    completed: []
  };
  
  let currentSection = null;
  let currentGoal = null;
  
  for (const line of lines) {
    // detect section
    if (line.startsWith('## Active')) currentSection = 'active';
    else if (line.startsWith('## Backlog')) currentSection = 'backlog';
    else if (line.startsWith('## Completed')) currentSection = 'completed';
    
    // detect goal header
    if (line.startsWith('### ')) {
      currentGoal = {
        name: line.replace('### ', '').trim(),
        status: null,
        objective: null
      };
    }
    
    // detect status
    if (line.includes('**status:**')) {
      const status = line.split('**status:**')[1].trim();
      if (currentGoal) {
        currentGoal.status = status;
        
        // categorize
        if (status.includes('✅')) {
          goals.active.push({ ...currentGoal, achieved: true });
        } else if (status.includes('🔄') || status.includes('blocked')) {
          goals.blocked.push(currentGoal);
        } else {
          goals.active.push(currentGoal);
        }
      }
    }
    
    // detect objective
    if (line.includes('**objective:**') && currentGoal) {
      currentGoal.objective = line.split('**objective:**')[1].trim();
    }
  }
  
  return goals;
}

async function showGoals() {
  const goals = await parseGoals();
  if (!goals) return;
  
  console.log('=== goal status ===\n');
  
  // active/achieved
  const achieved = goals.active.filter(g => g.achieved);
  const inProgress = goals.active.filter(g => !g.achieved);
  
  if (achieved.length > 0) {
    console.log('✅ achieved:');
    achieved.forEach(g => console.log(`  • ${g.name}`));
  }
  
  if (inProgress.length > 0) {
    console.log('\n🔄 in progress:');
    inProgress.forEach(g => {
      console.log(`  • ${g.name}`);
      if (g.objective) console.log(`    → ${g.objective}`);
    });
  }
  
  if (goals.blocked.length > 0) {
    console.log('\n⚠️ blocked:');
    goals.blocked.forEach(g => {
      console.log(`  • ${g.name}`);
    });
  }
  
  console.log('\n===================');
  console.log(`see GOALS.md for details`);
}

await showGoals();
