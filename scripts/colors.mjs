#!/usr/bin/env node
/**
 * arc colors — color palette auditor & generator
 * 
 * extracts color palettes from project CSS, validates contrast ratios,
 * generates monochrome-first palettes. born from ron's design research
 * deep dive and strong preference for monochrome-first design.
 * 
 * usage:
 *   arc colors                     # audit all projects
 *   arc colors <project>           # audit specific project
 *   arc colors --generate          # generate monochrome palette
 *   arc colors --generate --accent blue   # with accent color
 *   arc colors --contrast          # detailed contrast matrix
 *   arc colors --short             # one-liner per project
 *   arc colors --json              # machine-readable
 * 
 * nightly build 2026-02-18
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join, basename } from 'path';

const ROOT = join(import.meta.dirname, '..');
const PROJECTS_DIR = join(ROOT, 'projects');
const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const shortMode = args.includes('--short');
const contrastMode = args.includes('--contrast');
const generateMode = args.includes('--generate');
const projectFilter = args.find(a => !a.startsWith('--'));
const accentFlag = args.indexOf('--accent');
const accentName = accentFlag !== -1 ? args[accentFlag + 1] : null;

// ── color math ───────────────────────────────────────────────────────

// oklch → sRGB conversion (simplified but accurate enough for contrast)
function oklchToRgb(l, c, h) {
  // oklch → oklab
  const hRad = (h || 0) * Math.PI / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);
  
  // oklab → linear sRGB (via LMS)
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.2914855480 * b;
  
  const lc = l_ * l_ * l_;
  const mc = m_ * m_ * m_;
  const sc = s_ * s_ * s_;
  
  const r = +4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc;
  const g = -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc;
  const bl = -0.0041960863 * lc - 0.7034186147 * mc + 1.7076147010 * sc;
  
  return [
    Math.max(0, Math.min(255, Math.round(r * 255))),
    Math.max(0, Math.min(255, Math.round(g * 255))),
    Math.max(0, Math.min(255, Math.round(bl * 255)))
  ];
}

// hex string from oklch
function oklchToHex(l, c, h) {
  const [r, g, b] = oklchToRgb(l, c, h);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// hex → rgb
function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16)
  ];
}

// relative luminance (WCAG 2.0)
function luminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

// contrast ratio between two rgb arrays
function contrastRatio(rgb1, rgb2) {
  const l1 = luminance(...rgb1);
  const l2 = luminance(...rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// WCAG rating
function wcagRating(ratio) {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA-lg';  // large text only
  return 'FAIL';
}

// perceptual color name from hue
function hueName(h) {
  if (h === undefined || h === null) return 'gray';
  h = ((h % 360) + 360) % 360;
  if (h < 15) return 'red';
  if (h < 45) return 'orange';
  if (h < 75) return 'yellow';
  if (h < 150) return 'green';
  if (h < 195) return 'teal';
  if (h < 255) return 'blue';
  if (h < 285) return 'purple';
  if (h < 330) return 'pink';
  return 'red';
}

// check if a color is chromatic (has visible color)
function isChromatic(c) {
  return c > 0.02;
}

// guess hue name from RGB values
function guessHueFromRgb(rgb) {
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 13) return 'gray';
  let h;
  if (max === r) h = 60 * (((g - b) / (max - min)) % 6);
  else if (max === g) h = 60 * ((b - r) / (max - min) + 2);
  else h = 60 * ((r - g) / (max - min) + 4);
  if (h < 0) h += 360;
  return hueName(h);
}

// ── CSS parsing ──────────────────────────────────────────────────────

function parseOklch(value) {
  // oklch(0.145 0 0) or oklch(0.577 0.245 27.325)
  const match = value.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/);
  if (!match) return null;
  return { l: parseFloat(match[1]), c: parseFloat(match[2]), h: parseFloat(match[3]) };
}

function parseHslHex(value) {
  // handle hex
  const hexMatch = value.match(/#([0-9a-fA-F]{3,8})/);
  if (hexMatch) {
    const rgb = hexToRgb(hexMatch[0]);
    return { rgb, hex: hexMatch[0] };
  }
  
  // handle hsl
  const hslMatch = value.match(/hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/);
  if (hslMatch) {
    const h = parseFloat(hslMatch[1]), s = parseFloat(hslMatch[2]) / 100, l = parseFloat(hslMatch[3]) / 100;
    // hsl → rgb (simplified)
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r, g, b;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return {
      rgb: [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
    };
  }
  
  return null;
}

function extractColors(cssContent) {
  const colors = [];
  const lines = cssContent.split('\n');
  
  for (const line of lines) {
    // match CSS custom property color declarations
    const propMatch = line.match(/--([a-z0-9-]+)\s*:\s*(.+?)\s*;/);
    if (!propMatch) continue;
    
    const name = propMatch[1];
    const value = propMatch[2];
    
    // skip non-color properties (radius, font, etc.)
    if (name.includes('radius') || name.includes('font') || name.includes('animate')) continue;
    
    // try oklch first
    const oklch = parseOklch(value);
    if (oklch) {
      const rgb = oklchToRgb(oklch.l, oklch.c, oklch.h);
      const hex = oklchToHex(oklch.l, oklch.c, oklch.h);
      colors.push({
        name,
        value,
        oklch,
        rgb,
        hex,
        chromatic: isChromatic(oklch.c),
        hueName: isChromatic(oklch.c) ? hueName(oklch.h) : 'gray'
      });
      continue;
    }
    
    // try hex/hsl
    const parsed = parseHslHex(value);
    if (parsed) {
      const rgb = parsed.rgb;
      const hex = parsed.hex || '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
      // detect if color is achromatic (r ≈ g ≈ b)
      const maxC = Math.max(...rgb);
      const minC = Math.min(...rgb);
      const saturation = maxC === 0 ? 0 : (maxC - minC) / maxC;
      const isGray = saturation < 0.05;  // <5% saturation = gray
      colors.push({
        name,
        value,
        rgb,
        hex,
        oklch: null,
        chromatic: !isGray,
        hueName: isGray ? 'gray' : guessHueFromRgb(rgb)
      });
    }
  }
  
  return colors;
}

// ── project scanning ─────────────────────────────────────────────────

function findProjects() {
  const projects = [];
  
  if (!existsSync(PROJECTS_DIR)) return projects;
  
  for (const dir of readdirSync(PROJECTS_DIR)) {
    const projectPath = join(PROJECTS_DIR, dir);
    if (!statSync(projectPath).isDirectory()) continue;
    
    // look for globals.css
    const cssPath = join(projectPath, 'src/app/globals.css');
    if (existsSync(cssPath)) {
      projects.push({
        name: dir,
        cssPath,
        css: readFileSync(cssPath, 'utf-8')
      });
    }
  }
  
  return projects;
}

function auditProject(project) {
  const colors = extractColors(project.css);
  if (colors.length === 0) return null;
  
  // split into chromatic vs achromatic
  const achromatic = colors.filter(c => !c.chromatic);
  const chromatic = colors.filter(c => c.chromatic);
  
  // group chromatic by hue
  const hueGroups = {};
  for (const c of chromatic) {
    if (!hueGroups[c.hueName]) hueGroups[c.hueName] = [];
    hueGroups[c.hueName].push(c);
  }
  
  // contrast checks (key pairs)
  const contrastPairs = [
    ['background', 'foreground', 'body text'],
    ['card', 'card-foreground', 'card text'],
    ['primary', 'primary-foreground', 'primary button'],
    ['secondary', 'secondary-foreground', 'secondary button'],
    ['muted', 'muted-foreground', 'muted text'],
    ['destructive', 'foreground', 'destructive on bg'],
    ['accent', 'accent-foreground', 'accent text'],
    ['popover', 'popover-foreground', 'popover text'],
    ['sidebar', 'sidebar-foreground', 'sidebar text'],
  ];
  
  // fuzzy name matching for non-standard naming
  const findColor = (name) => {
    // exact match first
    let c = colors.find(c => c.name === name);
    if (c) return c;
    // try partial match (bg-page → background, black-primary → foreground)
    if (name === 'background') c = colors.find(c => c.name.includes('bg-page') || c.name.includes('bg-surface'));
    if (name === 'foreground') c = colors.find(c => c.name.includes('black-primary') || c.name.includes('text-primary'));
    return c || null;
  };
  
  const contrasts = [];
  for (const [bg, fg, label] of contrastPairs) {
    const bgColor = findColor(bg);
    const fgColor = findColor(fg);
    if (!bgColor || !fgColor) continue;
    
    const ratio = contrastRatio(bgColor.rgb, fgColor.rgb);
    const rating = wcagRating(ratio);
    contrasts.push({ bg, fg, label, ratio: Math.round(ratio * 100) / 100, rating });
  }
  
  // auto-detect additional contrast pairs from naming patterns
  // match any foo / foo-foreground pairs not already covered
  const coveredBgs = new Set(contrastPairs.map(p => p[0]));
  const colorNames = new Set(colors.map(c => c.name));
  for (const c of colors) {
    if (c.name.endsWith('-foreground')) {
      const bgName = c.name.replace('-foreground', '');
      if (!coveredBgs.has(bgName) && colorNames.has(bgName)) {
        const bgColor = colors.find(x => x.name === bgName);
        const ratio = contrastRatio(bgColor.rgb, c.rgb);
        const rating = wcagRating(ratio);
        contrasts.push({ bg: bgName, fg: c.name, label: `${bgName} text`, ratio: Math.round(ratio * 100) / 100, rating });
      }
    }
  }
  
  // monochrome score: how many non-chart colors are achromatic?
  const nonChart = colors.filter(c => !c.name.startsWith('chart-'));
  const achroNonChart = nonChart.filter(c => !c.chromatic);
  const monochromeRatio = nonChart.length > 0 ? achroNonChart.length / nonChart.length : 0;
  const monochromeScore = Math.round(monochromeRatio * 100);
  
  // contrast score: % of pairs passing AA
  const aaCount = contrasts.filter(c => c.rating === 'AA' || c.rating === 'AAA').length;
  const contrastScore = contrasts.length > 0 ? Math.round((aaCount / contrasts.length) * 100) : 0;
  
  // overall palette health
  const health = Math.round(monochromeScore * 0.4 + contrastScore * 0.6);
  
  return {
    project: project.name,
    total: colors.length,
    achromatic: achromatic.length,
    chromatic: chromatic.length,
    hueGroups,
    colors,
    contrasts,
    monochromeScore,
    contrastScore,
    health,
    issues: contrasts.filter(c => c.rating === 'FAIL'),
    warnings: contrasts.filter(c => c.rating === 'AA-lg'),
  };
}

// ── palette generation ───────────────────────────────────────────────

const ACCENT_HUES = {
  blue: 250,
  indigo: 270,
  violet: 290,
  purple: 310,
  pink: 340,
  red: 25,
  orange: 50,
  amber: 70,
  yellow: 90,
  lime: 125,
  green: 150,
  teal: 175,
  cyan: 200,
  sky: 225,
};

function generatePalette(accentColor) {
  const palette = { light: {}, dark: {} };
  
  // ── light mode (monochrome-first) ──
  palette.light = {
    'background':              { l: 1.000, c: 0, h: 0 },
    'foreground':              { l: 0.145, c: 0, h: 0 },
    'card':                    { l: 1.000, c: 0, h: 0 },
    'card-foreground':         { l: 0.145, c: 0, h: 0 },
    'popover':                 { l: 1.000, c: 0, h: 0 },
    'popover-foreground':      { l: 0.145, c: 0, h: 0 },
    'primary':                 { l: 0.205, c: 0, h: 0 },
    'primary-foreground':      { l: 0.985, c: 0, h: 0 },
    'secondary':               { l: 0.960, c: 0, h: 0 },
    'secondary-foreground':    { l: 0.205, c: 0, h: 0 },
    'muted':                   { l: 0.960, c: 0, h: 0 },
    'muted-foreground':        { l: 0.450, c: 0, h: 0 },
    'accent':                  { l: 0.960, c: 0, h: 0 },
    'accent-foreground':       { l: 0.205, c: 0, h: 0 },
    'destructive':             { l: 0.577, c: 0.245, h: 27.3 },
    'border':                  { l: 0.900, c: 0, h: 0 },
    'input':                   { l: 0.900, c: 0, h: 0 },
    'ring':                    { l: 0.708, c: 0, h: 0 },
  };
  
  // ── dark mode ──
  palette.dark = {
    'background':              { l: 0.100, c: 0, h: 0 },
    'foreground':              { l: 0.935, c: 0, h: 0 },
    'card':                    { l: 0.120, c: 0, h: 0 },
    'card-foreground':         { l: 0.935, c: 0, h: 0 },
    'popover':                 { l: 0.120, c: 0, h: 0 },
    'popover-foreground':      { l: 0.935, c: 0, h: 0 },
    'primary':                 { l: 0.900, c: 0, h: 0 },
    'primary-foreground':      { l: 0.100, c: 0, h: 0 },
    'secondary':               { l: 0.170, c: 0, h: 0 },
    'secondary-foreground':    { l: 0.900, c: 0, h: 0 },
    'muted':                   { l: 0.170, c: 0, h: 0 },
    'muted-foreground':        { l: 0.550, c: 0, h: 0 },
    'accent':                  { l: 0.170, c: 0, h: 0 },
    'accent-foreground':       { l: 0.900, c: 0, h: 0 },
    'destructive':             { l: 0.577, c: 0.245, h: 27.3 },
    'border':                  { l: 0.200, c: 0, h: 0 },
    'input':                   { l: 0.200, c: 0, h: 0 },
    'ring':                    { l: 0.400, c: 0, h: 0 },
  };
  
  // add accent color if specified
  if (accentColor) {
    const hue = ACCENT_HUES[accentColor.toLowerCase()] || parseFloat(accentColor) || 250;
    
    // light mode accent overrides
    palette.light['primary'] =            { l: 0.450, c: 0.200, h: hue };
    palette.light['primary-foreground'] =  { l: 0.985, c: 0, h: 0 };
    palette.light['ring'] =               { l: 0.600, c: 0.150, h: hue };
    
    // dark mode accent overrides
    palette.dark['primary'] =             { l: 0.650, c: 0.180, h: hue };
    palette.dark['primary-foreground'] =   { l: 0.100, c: 0, h: 0 };
    palette.dark['ring'] =                { l: 0.500, c: 0.150, h: hue };
    
    // chart colors derived from accent hue
    const chartHues = [hue, (hue + 30) % 360, (hue + 150) % 360, (hue + 60) % 360, (hue + 210) % 360];
    for (let i = 0; i < 5; i++) {
      palette.light[`chart-${i + 1}`] = { l: 0.55 + i * 0.05, c: 0.180, h: chartHues[i] };
      palette.dark[`chart-${i + 1}`] =  { l: 0.60 + i * 0.04, c: 0.160, h: chartHues[i] };
    }
  }
  
  return palette;
}

// ── display ──────────────────────────────────────────────────────────

function colorBlock(hex) {
  // terminal color swatch using 24-bit ANSI
  const rgb = hexToRgb(hex);
  return `\x1b[48;2;${rgb[0]};${rgb[1]};${rgb[2]}m  \x1b[0m`;
}

function ratingIcon(rating) {
  switch (rating) {
    case 'AAA': return '\x1b[32m✓✓✓\x1b[0m';
    case 'AA': return '\x1b[32m✓✓\x1b[0m ';
    case 'AA-lg': return '\x1b[33m✓\x1b[0m  ';
    case 'FAIL': return '\x1b[31m✗\x1b[0m  ';
    default: return '   ';
  }
}

function healthBar(score, width = 20) {
  const filled = Math.round(score / 100 * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  const color = score >= 80 ? '\x1b[32m' : score >= 60 ? '\x1b[33m' : '\x1b[31m';
  return `${color}${bar}\x1b[0m ${score}/100`;
}

function printAudit(audit) {
  console.log();
  console.log(`\x1b[1m╔══ ${audit.project.toUpperCase()} ═════════════════════════════════════\x1b[0m`);
  console.log(`\x1b[1m║\x1b[0m  palette health: ${healthBar(audit.health)}`);
  console.log(`\x1b[1m║\x1b[0m  ${audit.total} colors — ${audit.achromatic} achromatic, ${audit.chromatic} chromatic`);
  console.log(`\x1b[1m║\x1b[0m  monochrome: ${audit.monochromeScore}% | contrast: ${audit.contrastScore}%`);
  
  // color swatches
  console.log(`\x1b[1m║\x1b[0m`);
  console.log(`\x1b[1m║\x1b[0m  \x1b[2m── gray scale ──\x1b[0m`);
  const grays = audit.colors.filter(c => !c.chromatic).sort((a, b) => {
    const la = a.oklch ? a.oklch.l : (a.rgb ? luminance(...a.rgb) : 0);
    const lb = b.oklch ? b.oklch.l : (b.rgb ? luminance(...b.rgb) : 0);
    return lb - la;  // lightest first
  });
  
  // show gray ramp as a continuous strip
  if (grays.length > 0) {
    let strip = '\x1b[1m║\x1b[0m  ';
    for (const c of grays) {
      strip += colorBlock(c.hex);
    }
    console.log(strip);
    
    // labels below
    let labels = '\x1b[1m║\x1b[0m  ';
    for (const c of grays) {
      const l = c.oklch ? Math.round(c.oklch.l * 100) : Math.round(luminance(...c.rgb) * 100);
      labels += `\x1b[2m${String(l).padStart(2)}\x1b[0m`;
    }
    console.log(labels);
  }
  
  // chromatic colors
  if (audit.chromatic > 0) {
    console.log(`\x1b[1m║\x1b[0m`);
    console.log(`\x1b[1m║\x1b[0m  \x1b[2m── chromatic ──\x1b[0m`);
    for (const [hue, colors] of Object.entries(audit.hueGroups)) {
      let line = `\x1b[1m║\x1b[0m  ${hue.padEnd(8)} `;
      for (const c of colors) {
        line += `${colorBlock(c.hex)} \x1b[2m${c.name}\x1b[0m  `;
      }
      console.log(line);
    }
  }
  
  // contrast matrix
  console.log(`\x1b[1m║\x1b[0m`);
  console.log(`\x1b[1m║\x1b[0m  \x1b[2m── contrast pairs ──\x1b[0m`);
  for (const c of audit.contrasts) {
    const ratio = c.ratio.toFixed(1).padStart(5);
    console.log(`\x1b[1m║\x1b[0m  ${ratingIcon(c.rating)} ${ratio}:1  ${c.label}`);
  }
  
  // issues
  if (audit.issues.length > 0) {
    console.log(`\x1b[1m║\x1b[0m`);
    console.log(`\x1b[1m║\x1b[0m  \x1b[31m⚠ ${audit.issues.length} contrast failure${audit.issues.length > 1 ? 's' : ''}:\x1b[0m`);
    for (const issue of audit.issues) {
      console.log(`\x1b[1m║\x1b[0m    \x1b[31m${issue.label}: ${issue.ratio}:1 (need 4.5:1)\x1b[0m`);
    }
  }
  
  if (audit.warnings.length > 0) {
    console.log(`\x1b[1m║\x1b[0m  \x1b[33m⚠ ${audit.warnings.length} pair${audit.warnings.length > 1 ? 's' : ''} only pass for large text\x1b[0m`);
  }
  
  console.log(`\x1b[1m╚══════════════════════════════════════════════════\x1b[0m`);
}

function printGenerated(palette, accent) {
  console.log();
  console.log(`\x1b[1m╔══ GENERATED PALETTE ═══════════════════════════════\x1b[0m`);
  console.log(`\x1b[1m║\x1b[0m  style: monochrome-first${accent ? ` + ${accent} accent` : ''}`);
  console.log(`\x1b[1m║\x1b[0m  format: oklch (modern CSS)`);
  console.log(`\x1b[1m║\x1b[0m`);
  
  for (const [mode, colors] of Object.entries(palette)) {
    console.log(`\x1b[1m║\x1b[0m  \x1b[2m── ${mode} mode ──\x1b[0m`);
    
    // show swatch strip
    let strip = '\x1b[1m║\x1b[0m  ';
    const entries = Object.entries(colors);
    for (const [name, oklch] of entries) {
      const hex = oklchToHex(oklch.l, oklch.c, oklch.h);
      strip += colorBlock(hex);
    }
    console.log(strip);
    console.log(`\x1b[1m║\x1b[0m`);
    
    // CSS output
    for (const [name, oklch] of entries) {
      const hex = oklchToHex(oklch.l, oklch.c, oklch.h);
      const val = `oklch(${oklch.l.toFixed(3)} ${oklch.c.toFixed(3)} ${oklch.h.toFixed(1)})`;
      console.log(`\x1b[1m║\x1b[0m  ${colorBlock(hex)} --${name.padEnd(24)} ${val.padEnd(30)} \x1b[2m${hex}\x1b[0m`);
    }
    
    // verify contrast
    const bg = colors['background'];
    const fg = colors['foreground'];
    if (bg && fg) {
      const bgRgb = oklchToRgb(bg.l, bg.c, bg.h);
      const fgRgb = oklchToRgb(fg.l, fg.c, fg.h);
      const ratio = contrastRatio(bgRgb, fgRgb);
      console.log(`\x1b[1m║\x1b[0m  body contrast: ${ratio.toFixed(1)}:1 ${wcagRating(ratio)}`);
    }
    
    console.log(`\x1b[1m║\x1b[0m`);
  }
  
  // copy-paste CSS
  console.log(`\x1b[1m║\x1b[0m  \x1b[2m── copy-paste CSS ──\x1b[0m`);
  console.log(`\x1b[1m║\x1b[0m`);
  console.log(`\x1b[1m║\x1b[0m  :root {`);
  for (const [name, oklch] of Object.entries(palette.light)) {
    console.log(`\x1b[1m║\x1b[0m    --${name}: oklch(${oklch.l.toFixed(3)} ${oklch.c.toFixed(3)} ${oklch.h.toFixed(1)});`);
  }
  console.log(`\x1b[1m║\x1b[0m  }`);
  console.log(`\x1b[1m║\x1b[0m`);
  console.log(`\x1b[1m║\x1b[0m  .dark {`);
  for (const [name, oklch] of Object.entries(palette.dark)) {
    console.log(`\x1b[1m║\x1b[0m    --${name}: oklch(${oklch.l.toFixed(3)} ${oklch.c.toFixed(3)} ${oklch.h.toFixed(1)});`);
  }
  console.log(`\x1b[1m║\x1b[0m  }`);
  
  console.log(`\x1b[1m╚══════════════════════════════════════════════════════\x1b[0m`);
}

// ── main ─────────────────────────────────────────────────────────────

function main() {
  // generate mode
  if (generateMode) {
    const palette = generatePalette(accentName);
    
    if (jsonMode) {
      const jsonPalette = {};
      for (const [mode, colors] of Object.entries(palette)) {
        jsonPalette[mode] = {};
        for (const [name, oklch] of Object.entries(colors)) {
          jsonPalette[mode][name] = {
            oklch: `oklch(${oklch.l.toFixed(3)} ${oklch.c.toFixed(3)} ${oklch.h.toFixed(1)})`,
            hex: oklchToHex(oklch.l, oklch.c, oklch.h)
          };
        }
      }
      console.log(JSON.stringify({ accent: accentName || 'none', palette: jsonPalette }, null, 2));
      return;
    }
    
    printGenerated(palette, accentName);
    return;
  }
  
  // audit mode
  const projects = findProjects();
  
  if (projects.length === 0) {
    console.log('no projects with globals.css found');
    process.exit(1);
  }
  
  const filtered = projectFilter
    ? projects.filter(p => p.name.includes(projectFilter))
    : projects;
  
  if (filtered.length === 0) {
    console.log(`no project matching "${projectFilter}" found`);
    console.log(`available: ${projects.map(p => p.name).join(', ')}`);
    process.exit(1);
  }
  
  const audits = filtered.map(auditProject).filter(Boolean);
  
  if (jsonMode) {
    console.log(JSON.stringify(audits, null, 2));
    return;
  }
  
  if (shortMode) {
    for (const a of audits) {
      const issues = a.issues.length > 0 ? ` \x1b[31m${a.issues.length} fail\x1b[0m` : '';
      const mono = a.monochromeScore >= 80 ? '\x1b[32mmono\x1b[0m' : `\x1b[33m${a.monochromeScore}% mono\x1b[0m`;
      console.log(`${a.project.padEnd(20)} ${a.health}/100  ${a.total} colors  ${mono}${issues}`);
    }
    return;
  }
  
  // full audit
  console.log();
  console.log('\x1b[1m  arc colors — palette auditor\x1b[0m');
  
  for (const audit of audits) {
    printAudit(audit);
  }
  
  // summary
  if (audits.length > 1) {
    console.log();
    console.log('\x1b[2m  summary:\x1b[0m');
    const avgHealth = Math.round(audits.reduce((s, a) => s + a.health, 0) / audits.length);
    const totalIssues = audits.reduce((s, a) => s + a.issues.length, 0);
    console.log(`\x1b[2m  avg health: ${avgHealth}/100 | ${totalIssues} contrast failures across ${audits.length} projects\x1b[0m`);
  }
  
  console.log();
}

main();
