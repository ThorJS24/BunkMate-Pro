<div align="center">

<img src="build/icon.png" width="96" height="96" alt="HolyAttendance icon — a halo over a checkmark" />

# BunkMate Pro

**Offline attendance tracking, prediction, and academic planning for CHRIST University students.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.3.0-blue.svg)](package.json)
[![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)](#getting-started)
[![Built with Electron](https://img.shields.io/badge/Electron-43-9feaf9?logo=electron&logoColor=black)](https://www.electronjs.org/)
[![Built with React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)

</div>

---

BunkMate Pro is a local-first desktop app that tells you exactly how many classes you can safely miss — and which ones you can't — without waiting on a college portal to catch up. Every timetable, attendance mark, exam, and yellow form lives in a single SQLite file on your own machine. No account, no server, no internet required.

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Available Scripts](#available-scripts)
- [Project Structure](#project-structure)
- [How Attendance Is Calculated](#how-attendance-is-calculated)
- [Data & Privacy](#data--privacy)
- [Native Module ABI Note](#native-module-abi-note)
- [Known Limitations](#known-limitations)
- [Contributing](#contributing)
- [License](#license)

## Features

**Attendance tracking**
- Per-period present/absent marking, plus batch "mark whole day" and date-range bulk marking
- Merge-not-overwrite CSV import for reconciling against an official register
- Undo for the last attendance action
- A "safe bunk" calculator: how many more classes you can miss per subject before falling below your target %

**Analytics & planning**
- Dashboard with overall/per-subject attendance, at-risk warnings, and a weekly teaching-load "week shape" card
- Streaks, end-of-term attendance projection, and trend sparklines
- A concrete recovery plan generator for subjects that have dropped below target
- What-if leave simulation in the Planner

**Timetable & semesters**
- Drag-and-drop weekly timetable grid with per-period type (class, project, mentoring, meeting, minor, lunch)
- Auto-allocate period clock times evenly across the day, or set them by hand
- Semester rollover: copy a timetable/subject structure into a new semester without dragging attendance history along
- Copy a whole day or an entire semester's grid from another semester

**Exams**
- Exam entity tracking (code, date, time, venue) with Dashboard and Calendar integration
- Import exams directly from a CHRIST hall-ticket PDF via offline OCR (tesseract.js) — no text layer required
- Desktop reminders the evening before and the morning of
- Export a semester's exams to `.ics` for your phone's calendar

**Calendar**
- Holiday and working-Saturday management that timetable generation respects
- Yellow form (leave application) tracking, grouped by date, with one-click filing from any class row

**Reminders & notifications**
- Class-start desktop notifications a configurable number of minutes before each period (main-process background check while the app is running)
- In-app notification center: read/unread, dismiss, clear, and per-category muting
- System tray icon showing live overall attendance %, with close-to-tray so reminders keep running

**Quality of life**
- Global `Ctrl+K` command palette
- Light/dark/system theme, compact/comfortable density
- Configurable launch view (Today or Dashboard)
- Scheduled + on-demand local backup and restore
- PDF/Excel/CSV export for attendance and timetables

**ESPRO sync** *(experimental, see [Known Limitations](#known-limitations))*
- Encrypted local storage for your ESPRO portal login (OS keychain-backed via Electron's `safeStorage`)
- Scaffolding for pulling official attendance automatically — not yet wired to a confirmed portal endpoint

## Tech Stack

| Layer | Choice |
|---|---|
| Shell | [Electron](https://www.electronjs.org/) — chosen over Tauri to avoid a Rust/Cargo toolchain dependency |
| Frontend | React 19 + TypeScript + Vite, bundled with the Electron main/preload processes via `vite-plugin-electron` |
| UI | Tailwind CSS v4 + hand-rolled shadcn/ui-style primitives (Radix + `class-variance-authority`), Recharts for charts |
| Database | SQLite via `better-sqlite3`, accessed only from the Electron main process (renderer talks to it over `contextBridge`/IPC) |
| ORM | [Drizzle ORM](https://orm.drizzle.team/) — schema in `src/db/schema.ts`, generated migrations in `electron/db/migrations` |
| State | [Zustand](https://github.com/pmndrs/zustand) |
| OCR | `tesseract.js` (offline, bundled trained data) for hall-ticket import |
| Export | `jspdf` / `jspdf-autotable`, `exceljs`, native CSV, `.ics` calendar generation |
| Testing | [Vitest](https://vitest.dev/) |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20 or later
- Windows (the only packaging target currently configured — see `build.win` in `package.json`)

### Installation

```bash
git clone https://github.com/ThorJS24/HolyAttendance.git
cd HolyAttendance
npm install
```

### Development

```bash
npm run dev
```

This rebuilds `better-sqlite3` for Electron's ABI, then launches Vite + Electron with hot module reload.

### Building a distributable

```bash
npm run package
```

Produces a Windows NSIS installer under `release/`.

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Rebuild `better-sqlite3` for Electron's ABI, then launch Vite + Electron with HMR |
| `npm run build` | Typecheck (renderer, node config, and Electron main/preload) and produce production bundles |
| `npm run package` | Build and package a distributable via `electron-builder` |
| `npm test` | Rebuild `better-sqlite3` for the system Node ABI, then run the Vitest suite |
| `npm run lint` | Run `oxlint` |
| `npm run db:generate` | Generate a new Drizzle migration from `src/db/schema.ts` |
| `npm run db:migrate` | Apply pending Drizzle migrations |

## Project Structure

```
HolyAttendance/
├─ electron/                  # Main process (Node context, has DB/filesystem access)
│  ├─ db/
│  │  ├─ migrations/          # Generated Drizzle SQL migrations
│  │  └─ repositories/        # One repository per entity (semesters, subjects, exams, ...)
│  ├─ espro/                  # ESPRO portal sync: credential storage, login, parsing
│  ├─ ipc/                    # Typed IPC contract + handler registration
│  ├─ main.ts                 # App entrypoint: window, tray, reminders, backup scheduling
│  ├─ preload.ts              # contextBridge surface exposed to the renderer as `window.bunkmate`
│  ├─ reminders.ts            # Background class/exam reminder scheduler
│  ├─ tray.ts                 # System tray icon + live attendance %
│  └─ backup.ts               # Scheduled + on-demand backup/restore
│
├─ src/                       # Renderer process (React app)
│  ├─ components/
│  │  └─ ui/                  # shadcn/ui-style primitives (button, dialog, select, ...)
│  ├─ db/
│  │  └─ schema.ts            # Drizzle schema — source of truth for the data model
│  ├─ hooks/                  # Shared React hooks (e.g. attendance queries)
│  ├─ layout/                 # App shell: sidebar, top bar, command palette
│  ├─ lib/                    # Pure, DB-free logic — attendance engine, exclusion rules,
│  │                          #   reminder window math, timetable rules, import/export
│  ├─ pages/                  # One file per route (Today, Dashboard, Timetable, ...)
│  ├─ store/                  # Zustand stores, one per domain
│  └─ types/                  # Shared ambient types
│
├─ resources/
│  └─ tessdata/                # Bundled offline OCR model (packaged outside asar)
│
├─ build/                      # electron-builder assets (app icon)
├─ public/                     # Static assets served by Vite
└─ drizzle.config.ts            # Drizzle Kit config for migration generation
```

Business logic lives in `src/lib/` as plain, dependency-free functions wherever possible (attendance math, exclusion rules, reminder scheduling windows) — this keeps the hardest-to-get-right logic unit-testable without spinning up Electron or a real database.

## How Attendance Is Calculated

Every timetable period has a **type** (`class`, `project`, `mentoring`, `meeting`, `minor`, `lunch`), and each type falls into one of three buckets, driven by a table so new types don't require code changes:

- **normal** — counts toward the subject's attendance total (e.g. `class`)
- **project** — counts toward both the subject total and a separate "Project Work" sub-total (e.g. `mentoring`, `minor`)
- **excluded** — happened, but never counts toward attendance (e.g. `meeting`)
- **ignored** — not a class at all (`lunch`)

This bucket table is the single source of truth used by the Dashboard, Calendar, batch-mark, CSV import, and class-start reminders, so a policy change (like retiring mentoring from the attendance count) only has to happen in one place.

## Data & Privacy

All data — subjects, timetables, attendance records, exams, yellow forms, ESPRO credentials — lives in a single SQLite file inside the OS's per-user application data directory. Nothing is sent to a server. ESPRO credentials, when stored, are encrypted at rest via Electron's `safeStorage` (Windows DPAPI / macOS Keychain / Linux libsecret) and never written to the SQLite database itself, so they can't ride along in a backup or CSV export.

## Native Module ABI Note

`better-sqlite3` is a native addon and must be compiled against whichever runtime loads it. Electron and the system Node.js use different ABIs, so:

- `predev` / `prepackage` rebuild it for Electron before running or packaging the app.
- `pretest` rebuilds it for plain Node before running Vitest.

Switching contexts (e.g. running `npm test` right after `npm run dev`) triggers a rebuild automatically via these hooks.

## Known Limitations

- **ESPRO sync is unfinished.** Encrypted credential storage works and is verified; the actual login flow and attendance-table parsing are scaffolding waiting on a confirmed portal HTML sample (see the `TODO`s in `electron/espro/`).
- **Reminders only fire while the app is running.** Class and exam notifications are a main-process background check, not a true OS-level background service — if BunkMate is fully quit (not just closed to tray), nothing fires until it's reopened.
- **Windows-only packaging today.** `electron-builder` is only configured with a `win`/NSIS target; macOS/Linux would need their own `build` config added.

## Contributing

This started as a personal tool for tracking my own attendance, but issues and pull requests are welcome — especially around ESPRO portal integration, since that piece needs real portal markup to finish.

1. Fork the repo and create a feature branch
2. `npm install` and `npm run dev` to get running
3. `npm test` before opening a PR
4. Open a PR describing the change and why

## License

Distributed under the MIT License. See [`LICENSE`](LICENSE) for the full text.

---

<div align="center">

Built by [Jefferson N](https://github.com/ThorJS24)

</div>
