# Project Hub — Admin Manual

> **Version:** 1.0 (April 2026)
> **For:** Business owners and administrators

---

## Table of Contents

1. [Overview](#1-overview)
2. [Admin vs User — What's Different?](#2-admin-vs-user--whats-different)
3. [Managing Projects](#3-managing-projects)
4. [Managing Users](#4-managing-users)
5. [Understanding Roles](#5-understanding-roles)
6. [Viewing & Reviewing Diary Entries](#6-viewing--reviewing-diary-entries)
7. [Generating Reports](#7-generating-reports)
8. [Data & Storage](#8-data--storage)
9. [Security](#9-security)
10. [Common Admin Tasks (Quick Reference)](#10-common-admin-tasks-quick-reference)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Overview

Project Hub is Maintain London's internal project management platform. It runs at:

**`https://maintainlondon.co.uk/project-hub/`**

It's used by your site team to log daily progress, take photos, record materials and delays, and generate reports. As an admin, you can manage projects, control user access, and oversee all activity across every project.

**No software to install** — it works in any web browser and can be installed on phones as an app (see User Manual Section 10).

---

## 2. Admin vs User — What's Different?

| Feature | Operative | Manager | Admin |
|---|---|---|---|
| View assigned projects | Yes | Yes | Yes |
| Create diary entries | Own entries | Project entries | All entries |
| Upload photos | Yes | Yes | Yes |
| Generate reports | Yes | Yes | Yes |
| **Create new projects** | No | No | **Yes** |
| **Edit project details** | No | No | **Yes** |
| **Delete projects** | No | No | **Yes** |
| **Manage users** | No | No | **Yes** |

As an admin, you'll see extra buttons that other users don't see:
- **"New Project"** button on the Dashboard
- **"Edit Project"** button on each project page

---

## 3. Managing Projects

### Creating a New Project

1. Log in and go to the **Dashboard**
2. Tap the green **New Project** button (top right)
3. Fill in the form:

| Field | Required? | Example |
|---|---|---|
| Project Name | Yes | Kitchen Renovation - 42 Oak Lane |
| Site Address | Yes | 42 Oak Lane, Wandsworth, London |
| Postcode | Yes | SW18 1AA |
| Client Name | No | Mr & Mrs Smith |
| Client Email | No | smith@email.com |

4. Tap **Create Project**

The project immediately appears on the dashboard and is available to all team members.

### Editing a Project

1. Open the project from the Dashboard
2. Tap the **Edit Project** button (pencil icon, top right)
3. Change any details — name, address, client info, or status
4. Tap **Save Changes**

### Changing Project Status

Projects have three statuses:

| Status | Meaning | Visible on dashboard? |
|---|---|---|
| **Active** | Currently in progress | Yes |
| **On Hold** | Paused temporarily | No (hidden from dashboard) |
| **Completed** | Finished | No (hidden from dashboard) |

To change status: Edit the project and select the new status from the dropdown.

**Note:** Changing to "On Hold" or "Completed" hides the project from the dashboard, but all data is preserved. Change it back to "Active" to show it again.

---

## 4. Managing Users

### How Users Get Accounts

Currently, new users are created by your developer using command-line tools. Here's what to tell them:

**To add a new team member:**
1. They need a **name**, **email address**, and a **password**
2. Your developer runs a signup command and assigns their role

**To change someone's role:**
Your developer can promote or demote users between operative, manager, and admin.

**To remove a user:**
Your developer can deactivate or delete the account.

> **Coming soon:** A user management screen inside Project Hub where you can add, edit, and remove users yourself.

### Current Users

To see who has access, ask your developer to check the user list. They can provide you with a list of all accounts and their roles.

---

## 5. Understanding Roles

| Role | Who | What they can do |
|---|---|---|
| **Operative** | Site workers, tradespeople | Create their own diary entries, upload photos, view their projects |
| **Manager** | Site managers, supervisors | Create entries for any assigned project, view all project entries |
| **Admin** | Business owner, office staff | Everything above, plus: create/edit/delete projects, manage users |

**Recommendation:** Keep the number of admins small (1-2 people). Give managers to your site supervisors and operatives to your crew.

---

## 6. Viewing & Reviewing Diary Entries

As an admin, you can see every diary entry across all projects.

### To review an entry:

1. Open a project from the Dashboard
2. Tap "View all" to see every diary entry
3. Tap an entry to open it
4. Review all sections — personnel, activities, delays, photos, notes

### What to look for:
- **Are entries being completed daily?** Check the "Recent Entries" list
- **Any delays logged?** The dashboard shows a weekly delay count
- **Photos attached?** Good entries have photos documenting progress
- **Notes section** — operatives often flag issues here

---

## 7. Generating Reports

Reports are useful for client updates, internal reviews, and record-keeping.

### Daily Report
Shows everything from a single diary entry — personnel, activities, delays, weather, photos, and notes. Use this for individual day reviews.

### Weekly Report
Summarises all entries for a given week across a project. Shows:
- Total days worked
- All personnel and hours
- Activities completed
- Delays and hours lost
- Summary statistics

### To generate:

1. Open a project
2. Tap **Reports**
3. Choose **Daily** or **Weekly**
4. Select the entry or week
5. Preview loads automatically
6. Tap **Print** (saves to PDF from the print dialog)

**Tip:** Weekly reports work well for client updates — print to PDF and email them.

---

## 8. Data & Storage

### Where is the data stored?

All data is stored securely on **Cloudflare's infrastructure**:

| Data | Location | Capacity |
|---|---|---|
| User accounts, entries, project data | Cloudflare D1 (database) | 10GB free |
| Photos and documents | Cloudflare R2 (file storage) | 10GB free |
| User sessions | Cloudflare KV (key-value) | Included |

### Data limits

- **Photos:** 10MB per file
- **File types:** JPEG, PNG, WebP, HEIC, PDF
- **Entries:** No practical limit within free tier

### Backups

Cloudflare D1 handles database redundancy automatically. For additional safety, ask your developer about periodic data exports.

---

## 9. Security

### How the system is protected

| Layer | Protection |
|---|---|
| **Login** | Email + password, encrypted with industry-standard hashing |
| **Sessions** | Secure cookies, expire after 7 days, auto-refresh |
| **Data in transit** | HTTPS encryption (enforced by Cloudflare) |
| **Data at rest** | Encrypted on Cloudflare's servers |
| **Photos** | Private by default — only accessible to logged-in users |
| **API access** | Every request checked for valid session |

### Best practices

- Use **strong passwords** (mix of letters, numbers, symbols, 8+ characters)
- **Don't share accounts** — each person should have their own login
- **Log out on shared devices** (Settings > Sign Out)
- The **BETTER_AUTH_SECRET** in the Cloudflare dashboard should never be shared

### What the admin sees

Admins can see all data across all projects, including:
- All diary entries
- All uploaded photos
- All user activity

Admins **cannot** see user passwords (they're encrypted).

---

## 10. Common Admin Tasks (Quick Reference)

| Task | How |
|---|---|
| **Create a project** | Dashboard > New Project > Fill form > Create |
| **Edit a project** | Open project > Edit Project > Change details > Save |
| **Pause a project** | Edit Project > Status: On Hold > Save |
| **Complete a project** | Edit Project > Status: Completed > Save |
| **Re-activate a project** | Ask developer to set status back to "active" (or use Cloudflare dashboard) |
| **Add a user** | Contact your developer with name, email, password, and role |
| **Change a user's role** | Contact your developer |
| **View all entries** | Open project > View all |
| **Generate a report** | Open project > Reports > Choose type > Print |
| **Check weekly activity** | Dashboard shows stats: entries, photos, delays this week |

---

## 11. Troubleshooting

### "No projects yet" on the dashboard
You need to create a project first. Tap "New Project".

### A team member can't log in
- Verify their email is correct (case-sensitive)
- Ask your developer to check the account exists and is active
- Reset their password if needed

### Entries aren't appearing
- Check the team member is creating entries for the correct project
- Entries created offline will appear after they sync (when back online)

### Photos aren't showing
- Photos need internet to upload — if taken offline, they sync when back online
- Check file size (max 10MB) and type (JPEG, PNG, WebP, HEIC, PDF)

### The sync banner is stuck
- The team member should tap "Sync now" while connected to internet
- If it persists, refreshing the page usually clears stale queue items

### I need to delete an entry
- Currently entries can be deleted by your developer via the database
- A delete button inside the app is coming in a future update

### I need help with something not listed here
- Contact your developer (Digital Visibility) for technical support

---

## What's Coming Next

These features are planned for future releases. This manual will be updated with new sections as each feature ships.

| Feature | Description |
|---|---|
| **User Management UI** | Add, edit, and remove users from within the app |
| **Client Portal** | Give clients read-only access to view progress and approve entries |
| **Document Hub** | Central storage for contracts, quotes, invoices, and drawings |
| **Weekly Email Summaries** | Automated weekly reports sent to clients |
| **Gantt Chart** | Visual project schedule |
| **Labour Cost Tracking** | Hours x rates for each operative |
| **Stage Payments** | Track value of works completed |
| **AI Summaries** | Auto-generate client-friendly narratives from daily logs |

---

*This manual covers the current version of Project Hub. Contact Digital Visibility for support or feature requests.*

<!-- FUTURE SECTIONS (uncomment as features ship)

## User Management UI
## Client Portal
## Document Hub
## Weekly Email Summaries
## Gantt Chart
## Labour Cost Tracking
## Stage Payments
## AI Summaries
## Email Notifications

-->
