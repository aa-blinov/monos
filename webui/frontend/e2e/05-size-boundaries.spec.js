import { test, expect } from '@playwright/test';
import { openBoardCard, prepareMonos } from './support/monos.js';

const testViewports = [
  { w: 280, h: 400, label: 'tiny-280x400' },
  { w: 320, h: 480, label: 'small-320x480' },
  { w: 360, h: 640, label: 'electron-min-360x640' },
  { w: 480, h: 640, label: 'narrow-480x640' },
  { w: 640, h: 480, label: 'short-wide-640x480' },
  { w: 800, h: 400, label: 'wide-short-800x400' },
  { w: 800, h: 600, label: 'small-laptop-800x600' },
  { w: 1024, h: 500, label: 'netbook-1024x500' },
  { w: 1024, h: 600, label: 'laptop-short-1024x600' },
  { w: 1024, h: 768, label: 'laptop-1024x768' },
  { w: 1280, h: 720, label: 'hd-1280x720' },
  { w: 1280, h: 800, label: '1280x800' },
  { w: 1440, h: 900, label: 'macbook-1440x900' },
  { w: 1600, h: 900, label: '1600x900' },
  { w: 1920, h: 1080, label: 'fhd-1920x1080' },
  { w: 1920, h: 600, label: 'ultrawide-short-1920x600' },
  { w: 1920, h: 480, label: 'ultrawide-1920x480' },
  { w: 2560, h: 1080, label: 'uwqhd-2560x1080' },
  { w: 2560, h: 1440, label: 'qhd-2560x1440' },
  { w: 2560, h: 800, label: 'ultrawide-2560x800' },
  { w: 2560, h: 600, label: 'ultrawide-2560x600' },
  { w: 3000, h: 1440, label: '5k-3000x1440' },
  { w: 3840, h: 2160, label: '4k-3840x2160' },
  { w: 3840, h: 1080, label: '4k-ultrawide-3840x1080' },
  { w: 3840, h: 600, label: '4k-short-3840x600' },
];

async function checkLayoutIssues(page) {
  return page.evaluate(() => {
    const issues = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const doc = document.documentElement;
    const body = document.body;

    const sw = Math.max(doc.scrollWidth, body.scrollWidth);
    if (sw > vw + 4) {
      issues.push(`HORIZONTAL_OVERFLOW scrollW=${sw} viewW=${vw}`);
    }

    const allText = document.querySelectorAll('h1, h2, h3, p, span, button, a, label, div');
    for (const el of allText) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right > vw + 2) {
        issues.push(`CLIPPED_RIGHT "${el.textContent?.slice(0, 40)}" right=${Math.round(rect.right)} vw=${vw}`);
        break;
      }
    }

    const inputs = document.querySelectorAll('input, textarea');
    for (const el of inputs) {
      const rect = el.getBoundingClientRect();
      if (rect.width > vw) {
        issues.push(`INPUT_TOO_WIDE type=${el.tagName} w=${Math.round(rect.width)} vw=${vw}`);
      }
    }

    return issues;
  });
}

test.describe('window size boundaries', () => {
  test.beforeEach(async ({ page }) => {
    await prepareMonos(page);
    await page.addInitScript(() => {
      localStorage.setItem('noteView', 'board');
      localStorage.setItem('boardColumns', '3');
    });
  });

  for (const vp of testViewports) {
    test(`check layout at ${vp.label} (${vp.w}x${vp.h})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.goto('/');
      await page.waitForTimeout(300);

      const homeIssues = await checkLayoutIssues(page);
      console.log(`HOME  ${vp.label}: ${homeIssues.length ? homeIssues.join(' | ') : 'OK'}`);

      if (vp.w >= 1024) {
        const openSidebar = page.getByRole('button', { name: 'Open sidebar' });
        if (await openSidebar.isVisible().catch(() => false)) {
          await openSidebar.click();
          await page.waitForTimeout(100);
          await page.getByRole('button', { name: 'Close sidebar' }).click();
          await page.waitForTimeout(100);
        }
      }

      await openBoardCard(page, 'Welcome', 'notes/Welcome.md');
      await page.waitForTimeout(300);

      const noteIssues = await checkLayoutIssues(page);
      console.log(`NOTE  ${vp.label}: ${noteIssues.length ? noteIssues.join(' | ') : 'OK'}`);

      await page.goto('/settings');
      await page.waitForTimeout(300);
      const settingsIssues = await checkLayoutIssues(page);
      console.log(`SETTINGS ${vp.label}: ${settingsIssues.length ? settingsIssues.join(' | ') : 'OK'}`);

      const allIssues = [...homeIssues, ...noteIssues, ...settingsIssues];
      if (allIssues.length > 0) {
        console.log(`\n>>> ${vp.label} (${vp.w}x${vp.h}) PROBLEMS:`, allIssues);
      }
    });
  }
});
