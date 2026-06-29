#!/usr/bin/env node
/**
 * QR Code Generation Script for MUN Delegate Verification
 *
 * Usage:
 *   npx tsx scripts/generateQRs.ts
 *
 * Requirements:
 *   - .env.local with GOOGLE_SHEET_ID and GOOGLE_SERVICE_ACCOUNT_JSON
 *
 * Behaviour:
 *   - Idempotent: delegates with existing UUIDs are never re-assigned.
 *   - Generates <Name>_<Committee>.png inside generated-qrs/
 *   - Sanitises filenames to be filesystem-safe.
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
  dotenv.config(); // fallback to .env
}

// ─── Config ──────────────────────────────────────────────────────────────────

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const TAB_NAME = process.env.GOOGLE_SHEET_TAB_NAME ?? 'Sheet1';
const OUTPUT_DIR = path.resolve(process.cwd(), 'generated-qrs');

const COLUMN_MAP = {
  uuid: 'UUID',
  name: 'Name',
  committee: 'Committee',
};

// ─── Validation ───────────────────────────────────────────────────────────────

if (!SHEET_ID) {
  console.error('❌  GOOGLE_SHEET_ID is not set in environment.');
  process.exit(1);
}
if (!SERVICE_ACCOUNT_JSON) {
  console.error('❌  GOOGLE_SERVICE_ACCOUNT_JSON is not set in environment.');
  process.exit(1);
}

let credentials: object;
try {
  credentials = JSON.parse(SERVICE_ACCOUNT_JSON);
} catch {
  console.error('❌  GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.');
  process.exit(1);
}

// ─── Google Sheets auth ───────────────────────────────────────────────────────

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
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
  return name
    .replace(/[^a-zA-Z0-9_\-. ]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 100);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('📋  Fetching sheet data...');

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: TAB_NAME,
  });

  const values = response.data.values ?? [];
  if (values.length < 2) {
    console.log('⚠️   No delegate rows found in sheet.');
    return;
  }

  const [headerRow, ...dataRows] = values;
  const headers: string[] = headerRow.map((h: unknown) => String(h ?? '').trim());

  const uuidColIndex = headers.indexOf(COLUMN_MAP.uuid);
  const nameColIndex = headers.indexOf(COLUMN_MAP.name);
  const committeeColIndex = headers.indexOf(COLUMN_MAP.committee);

  if (uuidColIndex === -1)
    throw new Error(`Column "${COLUMN_MAP.uuid}" not found in headers: ${headers.join(', ')}`);
  if (nameColIndex === -1)
    throw new Error(`Column "${COLUMN_MAP.name}" not found in headers: ${headers.join(', ')}`);
  if (committeeColIndex === -1)
    throw new Error(`Column "${COLUMN_MAP.committee}" not found in headers: ${headers.join(', ')}`);

  // ── Ensure output directory exists ──────────────────────────────────────────
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`📁  Created output directory: ${OUTPUT_DIR}`);
  }

  // ── Batch UUID write-back data ───────────────────────────────────────────────
  const uuidUpdates: { rowIndex: number; uuid: string }[] = [];

  // ── Process each delegate ────────────────────────────────────────────────────
  let generated = 0;
  let skipped = 0;
  let uuidAssigned = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const sheetRowIndex = i + 2; // 1-based, +1 for header

    const name = String(row[nameColIndex] ?? '').trim();
    const committee = String(row[committeeColIndex] ?? '').trim();
    let uuid = String(row[uuidColIndex] ?? '').trim();

    if (!name) {
      console.log(`  ⚠️   Row ${sheetRowIndex}: skipping — no name found.`);
      continue;
    }

    // Generate UUID if missing (idempotent: never overwrite)
    if (!uuid) {
      uuid = crypto.randomUUID();
      uuidUpdates.push({ rowIndex: sheetRowIndex, uuid });
      uuidAssigned++;
      console.log(`  🆔  Row ${sheetRowIndex} (${name}): assigned UUID ${uuid}`);
    }

    // Generate QR image
    const safeFilename = `${sanitiseFilename(name)}_${sanitiseFilename(committee)}.png`;
    const outputPath = path.join(OUTPUT_DIR, safeFilename);

    await QRCode.toFile(outputPath, uuid, {
      type: 'png',
      width: 400,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });

    console.log(`  ✅  Generated: ${safeFilename}`);
    generated++;
  }

  // ── Write new UUIDs back to sheet (batch) ────────────────────────────────────
  if (uuidUpdates.length > 0) {
    console.log(`\n🔄  Writing ${uuidUpdates.length} new UUID(s) back to sheet...`);
    const uuidColLetter = columnIndexToLetter(uuidColIndex);

    const batchData = uuidUpdates.map(({ rowIndex, uuid }) => ({
      range: `${TAB_NAME}!${uuidColLetter}${rowIndex}`,
      values: [[uuid]],
    }));

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID!,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: batchData,
      },
    });
    console.log('  ✅  UUIDs written to sheet.');
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 QR Generation Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 QR images generated : ${generated}
 New UUIDs assigned  : ${uuidAssigned}
 Output directory    : ${OUTPUT_DIR}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

main().catch((err) => {
  console.error('❌  Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
