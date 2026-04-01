# Project Hub — User & Operative Manual

> **Version:** 1.0 (April 2026)
> **For:** Site managers, operatives, and team members

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Logging In](#2-logging-in)
3. [The Dashboard](#3-the-dashboard)
4. [Viewing a Project](#4-viewing-a-project)
5. [Creating a Diary Entry](#5-creating-a-diary-entry)
6. [Editing a Diary Entry](#6-editing-a-diary-entry)
7. [Taking & Uploading Photos](#7-taking--uploading-photos)
8. [Generating Reports](#8-generating-reports)
9. [Working Offline](#9-working-offline)
10. [Installing the App on Your Phone](#10-installing-the-app-on-your-phone)
11. [Settings](#11-settings)
12. [Tips & Troubleshooting](#12-tips--troubleshooting)

---

## 1. Getting Started

Project Hub is a web app for logging daily site activity. You can use it on your phone, tablet, or computer — no app store download needed.

**What you'll need:**
- A login (email + password) — your admin will create this for you
- A modern web browser (Chrome, Safari, Edge, or Firefox)
- Internet connection (the app also works offline — see Section 9)

**Web address:** `https://maintainlondon.co.uk/project-hub/`

---

## 2. Logging In

1. Go to `https://maintainlondon.co.uk/project-hub/login`
2. Enter your **email** and **password**
3. Tap **Sign In**

You'll stay logged in for 7 days. After that, you'll need to sign in again.

**Forgot your password?** Contact your admin to reset it.

---

## 3. The Dashboard

After logging in, you'll see the **Dashboard**. This is your home screen.

**What's on the dashboard:**
- **Welcome message** with your name
- **Weekly stats** — how many diary entries, photos, and delays have been logged this week (only shows if there's data)
- **Project cards** — each active project is shown as a card with the project name, address, and client name

**To open a project:** Tap the project card.

---

## 4. Viewing a Project

When you open a project, you'll see:

- **Project name, address, and client** at the top
- **Quick stats** — total entries, project status, and date of the last entry
- **Recent entries** — the last 5 diary entries, showing the date, time, and site manager
- **Action buttons:**
  - **Reports** — generate a summary report
  - **New Diary Entry** — start today's log

**To view all entries:** Tap "View all" next to "Recent Entries".

---

## 5. Creating a Diary Entry

This is the main thing you'll do each day. A diary entry records everything that happened on site.

### Step-by-step:

1. Open a project from the dashboard
2. Tap **New Diary Entry**
3. Fill in the sections (each section expands when you tap it):

| Section | What to fill in |
|---|---|
| **Date & Time** | Date, start time, end time (auto-calculates duration) |
| **Site Manager** | Who's in charge today (auto-filled with your name) |
| **Personnel** | Add each person on site — name, role (operative/visitor), hours worked |
| **Activities** | What work was done — task description and status (active/complete/on hold) |
| **Delays** | Any delays — what was affected, reason, hours lost |
| **Weather** | Auto-fills from weather data. Shows temperature, wind, humidity, and conditions |
| **Variations** | Scope changes — description and estimated hours |
| **Materials Required** | Materials to order — supplier, items, date needed |
| **Equipment Hire** | Equipment being hired — equipment name and supplier |
| **Materials Delivered** | What arrived on site — supplier and delivery notes |
| **Photos** | Site photos and documents (see Section 7) |
| **Notes** | Any additional notes or comments |

4. Tap **Save Entry** at the bottom

### Copy Yesterday's Entry

If today's entry is similar to yesterday's, tap the **Copy Yesterday** button at the top of the form. This pre-fills personnel, activities, and equipment from the previous day. You can then edit as needed.

### Auto-save

The form saves a draft automatically. If you navigate away and come back, your draft will be there.

---

## 6. Editing a Diary Entry

1. Open a project
2. Tap on an entry from the "Recent Entries" list (or tap "View all" to see all entries)
3. Make your changes
4. Tap **Save Entry**

---

## 7. Taking & Uploading Photos

Photos are attached to a diary entry. You must save the entry first before adding photos.

### To add photos:

1. Open or create a diary entry and save it
2. Scroll to the **Photos** section and tap to expand it
3. Tap **Take Photo** (opens your camera) or **Upload** (pick from your gallery)
4. The photo uploads automatically with a progress bar
5. You can add a caption by tapping on the photo

### Supported file types:
- JPEG, PNG, WebP, HEIC (iPhone photos), PDF
- Maximum file size: 10MB per file

### To view a photo full-screen:
Tap on any photo thumbnail to open the lightbox. Swipe or use arrows to navigate.

---

## 8. Generating Reports

Reports create a professional summary of diary entries that you can print or save as PDF.

### To generate a report:

1. Open a project
2. Tap **Reports**
3. Choose report type:
   - **Daily** — summary of a single diary entry
   - **Weekly** — summary of all entries for a given week
4. Select the entry or week you want
5. The report preview loads automatically
6. Tap **Print** to print or save as PDF
7. Tap **Download HTML** to save the file

---

## 9. Working Offline

Project Hub works even without internet. This is useful on sites with poor signal.

### What works offline:
- Viewing entries you've already loaded
- Creating new diary entries
- Taking photos (queued for upload)

### What needs internet:
- Logging in/out
- Weather data
- Uploading photos to the server
- Generating reports

### How it works:

1. When you go offline, a **yellow banner** appears at the top: "You are offline"
2. Any entries you save are **queued** — you'll see "Queued — will sync when online"
3. When you reconnect, the banner shows the number of pending changes
4. Tap **Sync now** to push your changes, or they'll sync automatically

### Sync status:
| Banner colour | Meaning |
|---|---|
| **Yellow** | Offline or changes waiting to sync |
| **Blue** | Currently syncing |
| **No banner** | All synced, you're online |

---

## 10. Installing the App on Your Phone

You can install Project Hub on your home screen so it opens like a normal app.

### iPhone (Safari):
1. Open `https://maintainlondon.co.uk/project-hub/` in Safari
2. Tap the **Share** button (square with arrow)
3. Scroll down and tap **Add to Home Screen**
4. Tap **Add**

### Android (Chrome):
1. Open `https://maintainlondon.co.uk/project-hub/` in Chrome
2. Tap the **three dots** menu (top right)
3. Tap **Add to Home Screen** (or you may see an install banner)
4. Tap **Add**

Once installed, the app opens in full screen without the browser bar.

---

## 11. Settings

Tap **Settings** in the sidebar (desktop) or bottom bar (mobile).

**What's in Settings:**
- **Your profile** — your name, email, and role
- **PWA status** — whether the app is installed
- **Service Worker** — whether offline support is active
- **Sign Out** — logs you out

---

## 12. Tips & Troubleshooting

### The page won't load
- Check your internet connection
- Try refreshing the page (pull down on mobile, or press F5)
- Clear your browser cache and try again

### I can't see any projects
- Ask your admin to add you to a project or check that projects exist

### Photos won't upload
- Check file size (max 10MB)
- Check file type (JPEG, PNG, WebP, HEIC, or PDF only)
- Make sure you've saved the diary entry first

### The sync banner won't go away
- Tap "Sync now" — if it doesn't clear, the server may have rejected the entry (e.g. duplicate date)
- Check your internet connection
- Try refreshing the page

### I can't log in
- Double-check your email and password (case-sensitive)
- Contact your admin to verify your account exists

---

*This manual covers the current version of Project Hub. New sections will be added as features are released.*

<!-- FUTURE SECTIONS (uncomment as features ship)

## Client Portal
## Document Hub
## Weekly Summary Emails
## Gantt Chart
## Labour Cost Tracking
## Stage Payments
## AI Summaries
## Email Notifications

-->
