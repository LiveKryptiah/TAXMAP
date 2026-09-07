# Provincial Government of Isabela — Office of the Provincial Assessor
## Real Property Tax Mapping System (TM-RPAIS)

A specialized Real Property Tax Mapping and Cadastral Information System built for the **Provincial Government of Isabela (Office of the Provincial Assessor)**, adhering strictly to an engineered-restraint design philosophy inspired by minimalist frontier lab interfaces.

---

## Design System Specifications

| Token / Attribute | Implementation Value | Notes |
|---|---|---|
| **Canvas** | `#0a0a0a` | Edge-to-edge near-black page surface. Dark-only canvas. |
| **Canvas Soft** | `#1a1c20` | Input backgrounds and subtle hover fills. |
| **Canvas Card** | `#191919` | 8px card fill with 1px hairline border `#212327`. |
| **Borders** | `#212327` & `rgba(255,255,255,0.25)` | 1px hairline elevation. No box shadows. |
| **Typography** | `Inter` (Weight 400) | Negative tracking ladder (`-2.4px`, `-1.8px`, `-1.2px`). No bolding. |
| **Eyebrows & Labels** | `Geist Mono` (Weight 400) | Uppercase, positive tracking `1.4px` / `1.2px`. |
| **Interactive Shape** | `{rounded.pill}` 9999px | Outline pills with translucent white border. |
| **Primary Action** | White-filled pill | `#ffffff` fill, `#0a0a0a` text on key submit action. |

---

## Quick Start

### 1. Launch the Server
Double-click `run.bat` or execute in PowerShell / Terminal:
```powershell
python app.py
```
The server will start at:
👉 **`http://127.0.0.1:5000`**

### 2. Pre-seeded Assessment Accounts

| Role | Username / Badge | Password | Jurisdiction / Authority |
|---|---|---|---|
| **Provincial Assessor** | `assessor.pgi` | `IsabelaAssessor2026!` | Provincial Capitol, Ilagan City (Full Admin) |
| **GIS Tax Mapping Lead** | `taxmapper.gis` | `IsabelaGIS#2026` | Cadastre 211 / Sectional Parcel Mapping |
| **LGU Appraiser** | `appraiser.ilagan` | `Appraise2026!` | City Assessor Office, Ilagan |
| **Records Officer** | `records.inquiry` | `Records2026!` | Public Inquiries & Tax Declarations |

*Tip: On the login screen, you can click any of the role pills or the **"Autofill Default"** button to automatically load valid test credentials.*

---

## Project Structure

```
TAXMAP/
├── app.py                      # Flask backend (Auth routes, API endpoints, session logic)
├── database.py                 # SQLite initialization, 37 Isabela LGUs, password hashing
├── taxmap.db                   # SQLite database (Users, Audit logs, Municipalities)
├── test_app.py                 # Automated verification test suite
├── run.bat                     # Windows launch script
├── templates/
│   ├── login.html              # Login view with strict design system implementation
│   └── dashboard.html          # Authenticated assessment portal & vector cadastral map preview
└── static/
    ├── css/
    │   ├── design-tokens.css   # Color palette, strict weight 400 typography ladder, resets
    │   ├── components.css      # Pill buttons, hairline cards, inputs, toasts, nav bar
    │   └── login.css           # Split grid layout, telemetry monitor, security notice
    ├── js/
    │   └── login.js            # Dynamic credentials loader, password peek, PST live clock
    └── img/
        └── isabela_seal.svg    # Minimalist vector emblem for Isabela Assessor
```

---

## Verification

To run the automated test suite:
```powershell
python test_app.py
```
All 6 tests verify template rendering, credential validation, role authorization, and database synchronization.

# TAXMAP
