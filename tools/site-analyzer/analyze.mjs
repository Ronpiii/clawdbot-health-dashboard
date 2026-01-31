#!/usr/bin/env node

/**
 * Website Analyzer
 * 
 * Quick analysis of a website for design/content reference.
 * Useful for competitor analysis and design inspiration.
 * 
 * Usage:
 *   node analyze.mjs <url>
 *   node analyze.mjs https://example.com
 */

async function fetchPage(url) {
  if (!url.startsWith('http')) url = 'https://' + url
  
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      }
    })
    clearTimeout(timeout)
    
    if (!res.ok) return { error: `HTTP ${res.status}` }
    
    return { html: await res.text(), finalUrl: res.url }
  } catch (e) {
    return { error: e.message }
  }
}

function analyzeDesign(html) {
  const design = {
    colors: [],
    fonts: [],
    hasVideo: false,
    hasAnimation: false,
    layout: 'unknown',
    sections: [],
  }
  
  // Extract colors from inline styles and CSS
  const colorRegex = /#[0-9A-Fa-f]{3,6}|rgb\([^)]+\)|rgba\([^)]+\)/g
  const colors = html.match(colorRegex) || []
  const colorCounts = {}
  colors.forEach(c => {
    const normalized = c.toLowerCase()
    colorCounts[normalized] = (colorCounts[normalized] || 0) + 1
  })
  design.colors = Object.entries(colorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([color]) => color)
  
  // Extract fonts
  const fontRegex = /font-family:\s*['"]?([^'",;]+)/gi
  let fontMatch
  const fonts = new Set()
  while ((fontMatch = fontRegex.exec(html)) !== null) {
    const font = fontMatch[1].trim()
    if (!font.match(/^(inherit|initial|sans-serif|serif|monospace)$/i)) {
      fonts.add(font)
    }
  }
  design.fonts = [...fonts].slice(0, 5)
  
  // Google Fonts
  const gfMatch = html.match(/fonts\.googleapis\.com\/css2?\?family=([^"&]+)/g)
  if (gfMatch) {
    gfMatch.forEach(m => {
      const families = m.match(/family=([^&"]+)/)?.[1]?.split('|')
      if (families) {
        families.forEach(f => {
          const name = decodeURIComponent(f.split(':')[0].replace(/\+/g, ' '))
          if (!design.fonts.includes(name)) design.fonts.push(name)
        })
      }
    })
  }
  
  // Video
  design.hasVideo = html.includes('<video') || html.includes('youtube.com') || html.includes('vimeo.com')
  
  // Animation
  design.hasAnimation = html.includes('@keyframes') || html.includes('animation:') || 
    html.includes('gsap') || html.includes('framer-motion') || html.includes('aos')
  
  // Section detection
  const sectionPatterns = [
    { name: 'hero', patterns: ['hero', 'banner', 'jumbotron', 'masthead'] },
    { name: 'about', patterns: ['about', 'who-we', 'our-story'] },
    { name: 'services', patterns: ['service', 'what-we', 'offer', 'solution'] },
    { name: 'features', patterns: ['feature', 'benefit', 'why-'] },
    { name: 'testimonials', patterns: ['testimonial', 'review', 'client-say', 'quote'] },
    { name: 'team', patterns: ['team', 'people', 'staff', 'founder'] },
    { name: 'portfolio', patterns: ['portfolio', 'work', 'case-stud', 'project'] },
    { name: 'pricing', patterns: ['pricing', 'price', 'plan'] },
    { name: 'contact', patterns: ['contact', 'get-in-touch', 'reach-us'] },
    { name: 'faq', patterns: ['faq', 'question'] },
    { name: 'cta', patterns: ['cta', 'call-to-action', 'get-started'] },
    { name: 'footer', patterns: ['footer', 'foot'] },
  ]
  
  const lowerHtml = html.toLowerCase()
  sectionPatterns.forEach(({ name, patterns }) => {
    if (patterns.some(p => lowerHtml.includes(p))) {
      design.sections.push(name)
    }
  })
  
  return design
}

function analyzeContent(html) {
  const content = {
    title: null,
    description: null,
    h1: [],
    wordCount: 0,
    language: null,
    hasBlog: false,
    hasCareers: false,
  }
  
  // Title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  if (titleMatch) content.title = titleMatch[1].trim()
  
  // Meta description
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i)
  if (descMatch) content.description = descMatch[1].trim()
  
  // H1s
  const h1Regex = /<h1[^>]*>([^<]+)<\/h1>/gi
  let h1Match
  while ((h1Match = h1Regex.exec(html)) !== null) {
    const text = h1Match[1].trim()
    if (text.length > 2) content.h1.push(text)
  }
  
  // Language
  const langMatch = html.match(/<html[^>]*lang=["']([a-z]{2})/i)
  if (langMatch) content.language = langMatch[1]
  
  // Word count (rough)
  const textOnly = html.replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
  content.wordCount = textOnly.split(' ').filter(w => w.length > 2).length
  
  // Blog/careers
  content.hasBlog = html.toLowerCase().includes('/blog') || html.toLowerCase().includes('blog')
  content.hasCareers = html.toLowerCase().includes('career') || html.toLowerCase().includes('jobs') || html.toLowerCase().includes('töö')
  
  return content
}

function analyzeTech(html) {
  const tech = {
    framework: null,
    cms: null,
    analytics: [],
    marketing: [],
    other: [],
  }
  
  // Frameworks
  if (html.includes('__NEXT_DATA__') || html.includes('_next/')) tech.framework = 'Next.js'
  else if (html.includes('__NUXT__')) tech.framework = 'Nuxt.js'
  else if (html.includes('gatsby')) tech.framework = 'Gatsby'
  else if (html.includes('ng-')) tech.framework = 'Angular'
  else if (html.includes('data-v-')) tech.framework = 'Vue.js'
  
  // CMS
  if (html.includes('wp-content') || html.includes('wordpress')) tech.cms = 'WordPress'
  else if (html.includes('shopify')) tech.cms = 'Shopify'
  else if (html.includes('wix.com')) tech.cms = 'Wix'
  else if (html.includes('squarespace')) tech.cms = 'Squarespace'
  else if (html.includes('webflow')) tech.cms = 'Webflow'
  else if (html.includes('contentful')) tech.cms = 'Contentful'
  
  // Analytics
  if (html.includes('google-analytics') || html.includes('gtag')) tech.analytics.push('Google Analytics')
  if (html.includes('hotjar')) tech.analytics.push('Hotjar')
  if (html.includes('plausible')) tech.analytics.push('Plausible')
  if (html.includes('mixpanel')) tech.analytics.push('Mixpanel')
  if (html.includes('segment')) tech.analytics.push('Segment')
  
  // Marketing
  if (html.includes('hubspot')) tech.marketing.push('HubSpot')
  if (html.includes('mailchimp')) tech.marketing.push('Mailchimp')
  if (html.includes('intercom')) tech.marketing.push('Intercom')
  if (html.includes('drift')) tech.marketing.push('Drift')
  if (html.includes('crisp')) tech.marketing.push('Crisp')
  if (html.includes('calendly')) tech.marketing.push('Calendly')
  
  return tech
}

function formatOutput(url, design, content, tech) {
  const lines = []
  
  lines.push(`\n${'═'.repeat(60)}`)
  lines.push(`  ${url}`)
  lines.push(`${'═'.repeat(60)}\n`)
  
  // Content
  lines.push(`📄 CONTENT`)
  if (content.title) lines.push(`   Title: ${content.title}`)
  if (content.description) lines.push(`   Desc: ${content.description.slice(0, 80)}...`)
  if (content.h1.length) lines.push(`   H1: ${content.h1[0]}`)
  lines.push(`   Language: ${content.language || 'unknown'}`)
  lines.push(`   Words: ~${content.wordCount}`)
  if (content.hasBlog) lines.push(`   Has blog: yes`)
  if (content.hasCareers) lines.push(`   Has careers: yes`)
  lines.push('')
  
  // Design
  lines.push(`🎨 DESIGN`)
  if (design.fonts.length) lines.push(`   Fonts: ${design.fonts.join(', ')}`)
  if (design.colors.length) lines.push(`   Colors: ${design.colors.slice(0, 5).join(', ')}`)
  if (design.hasVideo) lines.push(`   Video: yes`)
  if (design.hasAnimation) lines.push(`   Animation: yes`)
  if (design.sections.length) lines.push(`   Sections: ${design.sections.join(', ')}`)
  lines.push('')
  
  // Tech
  lines.push(`🛠️  TECH`)
  if (tech.framework) lines.push(`   Framework: ${tech.framework}`)
  if (tech.cms) lines.push(`   CMS: ${tech.cms}`)
  if (tech.analytics.length) lines.push(`   Analytics: ${tech.analytics.join(', ')}`)
  if (tech.marketing.length) lines.push(`   Marketing: ${tech.marketing.join(', ')}`)
  lines.push('')
  
  return lines.join('\n')
}

async function main() {
  const args = process.argv.slice(2)
  
  if (args.length === 0) {
    console.log(`
Website Analyzer - Quick site analysis for design reference

Usage:
  node analyze.mjs <url>

Examples:
  node analyze.mjs pipedrive.com
  node analyze.mjs https://hubspot.com
`)
    process.exit(0)
  }
  
  const url = args[0]
  console.log(`  Analyzing ${url}...`)
  
  const { html, error, finalUrl } = await fetchPage(url)
  
  if (error) {
    console.log(`  ❌ Error: ${error}`)
    process.exit(1)
  }
  
  const design = analyzeDesign(html)
  const content = analyzeContent(html)
  const tech = analyzeTech(html)
  
  console.log(formatOutput(finalUrl || url, design, content, tech))
}

main().catch(console.error)
