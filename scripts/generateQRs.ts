#!/usr/bin/env node
/**
 * QR Code Generation Script for MUN Delegate Verification
 *
 * Usage:
 *   npx tsx scripts/generateQRs.ts
 *
 * Scans ALL tabs in the spreadsheet and generates QR codes for every delegate.
 * Set GOOGLE_SHEET_TAB_NAME to restrict to a single tab.
 *
 * Idempotent: delegates with existing UUIDs are never re-assigned.
 * Output: generated-qrs/<Name>_<Committee>.png
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import QRCode from 'qrcode';
import { google } from 'googleapis';

// ─── Load env ────────────────────────────────────────────────────────────────
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

// ─── Config ──────────────────────────────────────────────────────────────────
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const TAB_FILTER = process.env.GOOGLE_SHEET_TAB_NAME?.trim();
const OUTPUT_DIR = path.resolve(process.cwd(), 'generated-qrs');

const COLUMN_MAP = {
  uuid: 'UUID',
  name: 'Name',
  committee: 'Committee',
};

// ─── Validation ───────────────────────────────────────────────────────────────
if (!SHEET_ID) { console.error('❌  GOOGLE_SHEET_ID is not set.'); process.exit(1); }
if (!SERVICE_ACCOUNT_JSON) { console.error('❌  GOOGLE_SERVICE_ACCOUNT_JSON is not set.'); process.exit(1); }

let credentials: object;
try { credentials = JSON.parse(SERVICE_ACCOUNT_JSON); }
catch { console.error('❌  GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.'); process.exit(1); }

// ─── Auth ─────────────────────────────────────────────────────────────────────
const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const sheets = google.sheets({ version: 'v4', auth });

// ─── Helpers ──────────────────────────────────────────────────────────────────
function columnIndexToLetter(index: number): string {
  let letter = '';
  let n = index;
  while (n >= 0) {
    letter = String.fromCharCode((n % 26) + 65) + letter;
    n = Math.floor(n / 26) - 1;
  }
  return letter;
}

function sanitiseFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-. ]/g, '_').replace(/\s+/g, '_').replace(/_+/g, '_').substring(0, 80);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  // Get all tab names
  console.log('📋  Fetching spreadsheet info…');
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID! });
  let allTabs = (meta.data.sheets ?? []).map((s) => s.properties?.title ?? '').filter(Boolean);

  // Filter to specific tab if configured
  if (TAB_FILTER && TAB_FILTER.toUpperCase() !== 'ALL' && TAB_FILTER !== '') {
    allTabs = allTabs.filter((t) => t === TAB_FILTER);
    if (allTabs.length === 0) {
      console.error(`❌  Tab "${TAB_FILTER}" not found. Available: ${(meta.data.sheets ?? []).map(s => s.properties?.title).join(', ')}`);
      process.exit(1);
    }
  }

  console.log(`📂  Processing ${allTabs.length} tab(s): ${allTabs.join(', ')}\n`);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`📁  Created output directory: ${OUTPUT_DIR}\n`);
  }

  let totalGenerated = 0;
  let totalUUIDs = 0;

  for (const tabName of allTabs) {
    console.log(`\n━━━ Tab: ${tabName} ━━━`);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID!,
      range: tabName,
    });

    const values = response.data.values ?? [];
    if (values.length < 2) { console.log('  ⚠️   No data rows found — skipping.'); continue; }

    const [headerRow, ...dataRows] = values;
    const headers: string[] = headerRow.map((h: unknown) => String(h ?? '').trim());

    const uuidColIndex = headers.indexOf(COLUMN_MAP.uuid);
    const nameColIndex = headers.indexOf(COLUMN_MAP.name);
    const committeeColIndex = headers.indexOf(COLUMN_MAP.committee);

    if (uuidColIndex === -1) { console.log(`  ⚠️   No "${COLUMN_MAP.uuid}" column — skipping tab.`); continue; }
    if (nameColIndex === -1) { console.log(`  ⚠️   No "${COLUMN_MAP.name}" column — skipping tab.`); continue; }

    const uuidUpdates: { rowIndex: number; uuid: string }[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const sheetRowIndex = i + 2;
      const name = String(row[nameColIndex] ?? '').trim();
      const committee = committeeColIndex !== -1 ? String(row[committeeColIndex] ?? '').trim() : tabName;
      let uuid = String(row[uuidColIndex] ?? '').trim();

      if (!name) { console.log(`  ⚠️   Row ${sheetRowIndex}: skipping — no name.`); continue; }

      if (!uuid) {
        uuid = crypto.randomUUID();
        uuidUpdates.push({ rowIndex: sheetRowIndex, uuid });
        totalUUIDs++;
        console.log(`  🆔  Row ${sheetRowIndex} (${name}): assigned UUID`);
      }

      const safeFilename = `${sanitiseFilename(name)}_${sanitiseFilename(committee || tabName)}.png`;
      const outputPath = path.join(OUTPUT_DIR, safeFilename);

      await QRCode.toFile(outputPath, uuid, {
        type: 'png',
        width: 400,
        margin: 2,
        errorCorrectionLevel: 'H',
        color: { dark: '#0f172a', light: '#ffffff' },
      });

      console.log(`  ✅  ${safeFilename}`);
      totalGenerated++;
    }

    // Batch write new UUIDs back
    if (uuidUpdates.length > 0) {
      const uuidColLetter = columnIndexToLetter(uuidColIndex);
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID!,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: uuidUpdates.map(({ rowIndex, uuid }) => ({
            range: `${tabName}!${uuidColLetter}${rowIndex}`,
            values: [[uuid]],
          })),
        },
      });
      console.log(`  ✏️   Wrote ${uuidUpdates.length} new UUID(s) to sheet.`);
    }
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 QR Generation Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 QR images generated : ${totalGenerated}
 New UUIDs assigned  : ${totalUUIDs}
 Output directory    : ${OUTPUT_DIR}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

main().catch((err) => {
  console.error('❌  Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
