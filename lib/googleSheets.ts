import { google, sheets_v4 } from 'googleapis';
import { Delegate } from '@/types/delegate';

// ─── Auth ────────────────────────────────────────────────────────────────────

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON environment variable is not set.');
  }

  let credentials: object;
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.');
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return auth;
}

function getSheetsClient(): sheets_v4.Sheets {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

function getSheetId(): string {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error('GOOGLE_SHEET_ID environment variable is not set.');
  return id;
}

function getTabName(): string {
  return process.env.GOOGLE_SHEET_TAB_NAME ?? 'Sheet1';
}

// ─── Column header mapping ────────────────────────────────────────────────────

// Canonical column names used in business logic.
// Map our internal keys to the expected sheet header strings.
const COLUMN_MAP = {
  uuid: 'UUID',
  name: 'Name',
  committee: 'Committee',
  portfolio: 'Portfolio',
  feeStatus: 'Fee Status',
  contact: 'Contact',
  email: 'Email',
  checkedIn: 'Checked In',
  checkInTime: 'Check In Time',
  device: 'Device',
} as const;

type ColumnKey = keyof typeof COLUMN_MAP;

// ─── Raw sheet helpers ────────────────────────────────────────────────────────

/**
 * Fetch all rows from the sheet as an array of objects keyed by header name.
 * Returns header row separately so callers can compute column indices.
 */
export async function getSheetData(): Promise<{
  headers: string[];
  rows: Record<string, string>[];
  rawRows: string[][];
}> {
  const sheets = getSheetsClient();
  const sheetId = getSheetId();
  const tab = getTabName();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: tab,
  });

  const values = response.data.values ?? [];
  if (values.length === 0) {
    return { headers: [], rows: [], rawRows: [] };
  }

  const [headerRow, ...dataRows] = values;
  const headers: string[] = headerRow.map((h: unknown) => String(h ?? '').trim());

  const rows = dataRows.map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((header, i) => {
      obj[header] = String(row[i] ?? '').trim();
    });
    return obj;
  });

  return { headers, rows, rawRows: dataRows };
}

// ─── Delegate lookup ──────────────────────────────────────────────────────────

/**
 * Find a delegate by UUID. Returns the delegate and their 1-based row index
 * (row 1 = headers, row 2 = first data row).
 */
export async function findDelegateByUUID(
  uuid: string
): Promise<Delegate | null> {
  const { headers, rows } = await getSheetData();

  const uuidHeader = COLUMN_MAP.uuid;
  const uuidColIndex = headers.indexOf(uuidHeader);
  if (uuidColIndex === -1) {
    throw new Error(`Column "${uuidHeader}" not found in sheet headers.`);
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row[uuidHeader]?.toLowerCase() === uuid.toLowerCase()) {
      return rowToDelegate(row, i + 2); // +2: 1-based, skip header
    }
  }

  return null;
}

function rowToDelegate(row: Record<string, string>, rowIndex: number): Delegate {
  const checkedInRaw = row[COLUMN_MAP.checkedIn]?.toUpperCase();
  return {
    uuid: row[COLUMN_MAP.uuid] ?? '',
    name: row[COLUMN_MAP.name] ?? '',
    committee: row[COLUMN_MAP.committee] ?? '',
    portfolio: row[COLUMN_MAP.portfolio] ?? '',
    feeStatus: row[COLUMN_MAP.feeStatus] ?? '',
    contact: row[COLUMN_MAP.contact] ?? '',
    email: row[COLUMN_MAP.email] ?? '',
    checkedIn: checkedInRaw === 'TRUE' || checkedInRaw === '1' || checkedInRaw === 'YES',
    checkInTime: row[COLUMN_MAP.checkInTime] || null,
    device: row[COLUMN_MAP.device] || null,
    rowIndex,
  };
}

// ─── Attendance update ────────────────────────────────────────────────────────

/**
 * Update specific columns in a delegate's row by header name.
 * Only modifies the supplied fields; leaves all other columns untouched.
 */
export async function updateDelegateRow(
  rowIndex: number,
  fields: Partial<Record<ColumnKey, string>>
): Promise<void> {
  const sheets = getSheetsClient();
  const sheetId = getSheetId();
  const tab = getTabName();

  // We need the current headers to compute column letters
  const { headers } = await getSheetData();

  const data: sheets_v4.Schema$ValueRange[] = [];

  for (const [key, value] of Object.entries(fields) as [ColumnKey, string][]) {
    const headerName = COLUMN_MAP[key];
    const colIndex = headers.indexOf(headerName);
    if (colIndex === -1) continue; // Column doesn't exist yet — skip gracefully

    const colLetter = columnIndexToLetter(colIndex);
    const range = `${tab}!${colLetter}${rowIndex}`;

    data.push({
      range,
      values: [[value]],
    });
  }

  if (data.length === 0) return;

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data,
    },
  });
}

// ─── UUID write-back (used by QR generation script) ──────────────────────────

/**
 * Write a UUID into a specific cell identified by row index.
 */
export async function writeUUID(rowIndex: number, uuid: string): Promise<void> {
  const sheets = getSheetsClient();
  const sheetId = getSheetId();
  const tab = getTabName();

  const { headers } = await getSheetData();
  const colIndex = headers.indexOf(COLUMN_MAP.uuid);
  if (colIndex === -1) {
    throw new Error(`Column "${COLUMN_MAP.uuid}" not found in sheet.`);
  }

  const colLetter = columnIndexToLetter(colIndex);
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${tab}!${colLetter}${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[uuid]] },
  });
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Convert 0-based column index to sheet column letter (A, B, ..., Z, AA, ...) */
function columnIndexToLetter(index: number): string {
  let letter = '';
  let n = index;
  while (n >= 0) {
    letter = String.fromCharCode((n % 26) + 65) + letter;
    n = Math.floor(n / 26) - 1;
  }
  return letter;
}
