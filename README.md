# MUN Delegate Verification System

A production-ready QR-based delegate verification and attendance tracking system for Model United Nations conferences.

![Tech Stack](https://img.shields.io/badge/Next.js-14-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38bdf8?logo=tailwindcss)
![Google Sheets](https://img.shields.io/badge/Google%20Sheets-API-34a853?logo=google-sheets)

---

## Features

- 📸 **Instant QR scanning** — camera opens automatically on page load
- ✅ **Real-time verification** — delegate info displayed in under a second
- 💰 **Fee status enforcement** — unpaid delegates require manual approval before check-in
- 🔒 **Duplicate check-in protection** — server-side guard prevents overwriting existing records
- 📊 **Google Sheets as database** — no external database needed
- 📱 **Mobile-first** — works on Android Chrome and iPhone Safari
- 🔊 **Audio feedback** — success and error sounds via Web Audio API
- 🖨️ **QR generation script** — idempotent, batch generates PNG images for email distribution

---

## Required Google Sheet Structure

Your sheet must have the following column headers (exact names, case-sensitive):

| Column | Description |
|--------|-------------|
| `UUID` | Auto-generated unique identifier |
| `Name` | Delegate full name |
| `Committee` | Committee name |
| `Portfolio` | Country / portfolio |
| `Fee Status` | `Paid` triggers auto check-in; anything else requires manual approval |
| `Contact` | Phone number |
| `Email` | Email address |
| `Checked In` | Updated to `TRUE` on check-in |
| `Check In Time` | Timestamp of check-in |
| `Device` | Browser user-agent of scanning device |

> ℹ️ Additional columns can be added freely — the system only reads/writes the columns above.

---

## Quick Start

### 1. Prerequisites

- Node.js 18+
- A Google Cloud project with Sheets API enabled
- A Google Service Account with Editor access to your sheet

### 2. Clone & Install

```bash
git clone https://github.com/Shaurya-S-Pundir/MUNchecker.git
cd MUNchecker
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
GOOGLE_SHEET_ID=your_sheet_id_here
GOOGLE_SHEET_TAB_NAME=Sheet1
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

### 4. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) on your phone (use your local IP or ngrok for mobile testing).

---

## Google Service Account Setup

### Step 1: Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click **New Project** → give it a name → **Create**

### Step 2: Enable the Sheets API

1. In your project, go to **APIs & Services → Library**
2. Search for **Google Sheets API**
3. Click **Enable**

### Step 3: Create a Service Account

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → Service Account**
3. Give it a name (e.g. `mun-scanner`) → **Create and Continue**
4. Grant role: **Editor** → **Continue → Done**

### Step 4: Download the JSON Key

1. Click on the service account you just created
2. Go to the **Keys** tab
3. Click **Add Key → Create new key → JSON**
4. Download the `.json` file

### Step 5: Share the Sheet

1. Open your Google Sheet
2. Click **Share**
3. Paste the service account email (found in the JSON as `client_email`)
4. Give it **Editor** access → **Send**

### Step 6: Add to Environment

Copy the entire contents of the downloaded JSON file and paste it as a single line in `.env.local`:

```env
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"..."}
```

> ⚠️ **Never commit this file to version control.**

---

## QR Code Generation

Run the generation script:

```bash
npm run generate-qrs
```

This will:
1. Read all delegates from your Google Sheet
2. Assign a UUID to any delegate that doesn't have one (writes back to sheet)
3. Generate `<Name>_<Committee>.png` QR images in the `generated-qrs/` folder

**The script is idempotent** — running it multiple times will never reassign UUIDs or overwrite existing ones.

### Output

```
generated-qrs/
├── Alice_Smith_Security_Council.png
├── Bob_Jones_General_Assembly.png
└── ...
```

These files can be attached to emails using Gmail Mail Merge.

---

## API Reference

### `GET /api/delegate/:uuid`

Look up a delegate by UUID.

**Response:**

```json
// Found, not checked in
{ "status": "verified", "delegate": { ... } }

// Already checked in
{ "status": "already_checked_in", "delegate": { ... } }

// Not found
{ "status": "invalid" }

// Server error
{ "status": "error", "message": "..." }
```

### `POST /api/attendance`

Record attendance for a delegate.

**Request body:**
```json
{ "uuid": "550e8400-e29b-41d4-a716-446655440000" }
```

**Response:**
```json
{ "success": true, "delegate": { ... } }
```

**Error responses:**
- `400` — UUID missing
- `404` — Delegate not found
- `409` — Already checked in
- `500` — Server/Sheets error

---

## Project Structure

```
├── app/
│   ├── api/
│   │   ├── delegate/[uuid]/route.ts   # Delegate lookup endpoint
│   │   └── attendance/route.ts        # Attendance recording endpoint
│   ├── globals.css                    # Global styles + animations
│   ├── layout.tsx                     # Root layout
│   └── page.tsx                       # Scanner home page
├── components/
│   ├── Scanner.tsx                    # Camera QR reader
│   ├── VerifiedScreen.tsx             # Successful scan result
│   ├── AlreadyCheckedIn.tsx           # Duplicate scan screen
│   ├── InvalidQR.tsx                  # Unknown QR screen
│   └── LoadingScreen.tsx              # Fetching spinner
├── lib/
│   ├── googleSheets.ts                # Sheets API client
│   └── sounds.ts                      # Web Audio API sound effects
├── services/
│   └── delegateService.ts             # Business logic
├── scripts/
│   └── generateQRs.ts                 # QR generation script
├── types/
│   └── delegate.ts                    # TypeScript interfaces
├── generated-qrs/                     # QR image output (gitignored)
├── .env.example
└── README.md
```

---

## Vercel Deployment

### Step 1: Push to GitHub

```bash
git add .
git commit -m "Initial commit"
git push
```

### Step 2: Import to Vercel

1. Go to [vercel.com](https://vercel.com) → **New Project**
2. Import your GitHub repository
3. Framework: **Next.js** (auto-detected)
4. Click **Deploy**

### Step 3: Add Environment Variables

In Vercel dashboard → **Settings → Environment Variables**, add:

| Variable | Value |
|----------|-------|
| `GOOGLE_SHEET_ID` | Your sheet ID |
| `GOOGLE_SHEET_TAB_NAME` | Sheet tab name (default: `Sheet1`) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Full JSON string (one line) |

### Step 4: Redeploy

After adding env vars, trigger a redeployment from the Vercel dashboard.

---

## Mobile Testing (Local)

To test on a real phone without deploying:

```bash
# Install ngrok
npx ngrok http 3000
```

Open the HTTPS ngrok URL on your phone. Camera access requires HTTPS.

---

## Concurrency & Performance

- Designed for up to **10 simultaneous scanners**
- Each scan triggers one Sheets API call (read + conditional write)
- No caching layer — all reads go directly to Sheets for accuracy
- Google Sheets API quota: 300 requests/minute (shared across all scanners)
- At 10 simultaneous scanners with ~6 second scan intervals: ~100 req/min — well within limits

---

## Security Notes

- The `GOOGLE_SERVICE_ACCOUNT_JSON` env var is **server-side only** — never exposed to the browser
- UUIDs are opaque random identifiers — no PII is encoded in the QR
- The attendance API validates UUID existence before writing

---

## License

MIT — built for Model United Nations conferences.
