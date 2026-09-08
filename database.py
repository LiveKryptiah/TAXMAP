# -*- coding: utf-8 -*-
"""
Database management for Isabela Provincial Assessor Tax Mapping System
"""
import sqlite3
import os
import json
import math
import secrets
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "taxmap.db")

# In Vercel serverless environment, root directory is read-only; use /tmp
if os.environ.get("VERCEL"):
    import shutil
    tmp_db = "/tmp/taxmap.db"
    bundled_db = DB_PATH
    if not os.path.exists(tmp_db) and os.path.exists(bundled_db):
        try:
            shutil.copy2(bundled_db, tmp_db)
        except Exception:
            pass
    DB_PATH = tmp_db

ISABELA_LGUS = [
    ("03201", "Alicia", 18450, 16.7831, 121.7003),
    ("03202", "Angadanan", 14200, 16.8167, 121.7667),
    ("03203", "Aurora", 12890, 16.9667, 121.5833),
    ("03204", "Benito Soliven", 9340, 16.9833, 121.9333),
    ("03205", "Burgos", 8120, 17.0833, 121.7167),
    ("03206", "Cabagan", 21400, 17.4278, 121.8111),
    ("03207", "Cabatuan", 16800, 16.9583, 121.6667),
    ("03208", "Cauayan City", 42100, 16.9317, 121.7744),
    ("03209", "Cordon", 15600, 16.6667, 121.4667),
    ("03210", "Delfin Albano", 11200, 17.3167, 121.7833),
    ("03211", "Dinapigue", 5400, 16.5333, 122.3500),
    ("03212", "Divilacan", 4900, 17.3333, 122.3000),
    ("03213", "Echague", 29800, 16.7111, 121.6667),
    ("03214", "Gamu", 11950, 17.0333, 121.8333),
    ("03215", "Ilagan City", 58400, 16.9749, 121.8153),
    ("03216", "Jones", 17300, 16.5667, 121.7000),
    ("03217", "Luna", 9850, 16.9667, 121.6167),
    ("03218", "Maconacon", 4120, 17.5833, 122.2500),
    ("03219", "Mallig", 13700, 17.2000, 121.6000),
    ("03220", "Naguilian", 12450, 17.0167, 121.8333),
    ("03221", "Palanan", 6800, 17.0500, 122.4333),
    ("03222", "Quezon", 10900, 17.3167, 121.6000),
    ("03223", "Quirino", 10150, 17.1500, 121.5167),
    ("03224", "Ramon", 19200, 16.7833, 121.5167),
    ("03225", "Reina Mercedes", 9750, 16.9833, 121.8167),
    ("03226", "Roxas", 24600, 17.1189, 121.6192),
    ("03227", "San Agustin", 11300, 16.5500, 121.9000),
    ("03228", "San Guillermo", 8950, 16.8000, 121.8667),
    ("03229", "San Isidro", 10400, 16.7333, 121.6000),
    ("03230", "San Manuel", 13200, 17.0167, 121.6333),
    ("03231", "San Mariano", 22500, 16.9833, 122.0167),
    ("03232", "San Mateo", 26100, 16.8833, 121.5833),
    ("03233", "San Pablo", 10700, 17.4333, 121.8000),
    ("03234", "Santa Maria", 11800, 17.4667, 121.7500),
    ("03235", "Santiago City", 48900, 16.6917, 121.5486),
    ("03236", "Santo Tomas", 9650, 17.4833, 121.7833),
    ("03237", "Tumauini", 24200, 17.2792, 121.8083)
]

PROVINCIAL_SMV_RATES = {
    "Residential": {
        "assessment_level": 20.0,
        "description": "Lands principally devoted to habitation",
        "benchmark_unit_values": [
            {"sub_class": "Residential - Urban Center / Poblacion", "unit_value": 4500.0},
            {"sub_class": "Residential - First Class Subdivision", "unit_value": 3500.0},
            {"sub_class": "Residential - Standard Urban / Barangay", "unit_value": 2500.0},
            {"sub_class": "Residential - Rural / Agricultural Fringe", "unit_value": 1200.0}
        ]
    },
    "Commercial": {
        "assessment_level": 50.0,
        "description": "Lands devoted for trading, commerce, services, and business",
        "benchmark_unit_values": [
            {"sub_class": "Commercial - Central Business District (CBD)", "unit_value": 12000.0},
            {"sub_class": "Commercial - Maharlika National Highway Frontage", "unit_value": 8500.0},
            {"sub_class": "Commercial - Secondary Arterial Commercial Zone", "unit_value": 6000.0},
            {"sub_class": "Commercial - Neighborhood Commercial / Market", "unit_value": 4000.0}
        ]
    },
    "Industrial": {
        "assessment_level": 50.0,
        "description": "Lands devoted to manufacturing, agro-industrial processing, warehousing",
        "benchmark_unit_values": [
            {"sub_class": "Industrial - Heavy Manufacturing / Processing", "unit_value": 7500.0},
            {"sub_class": "Industrial - Agro-Processing & Warehousing Park", "unit_value": 5500.0},
            {"sub_class": "Industrial - Light Industrial / Grain Storage Hub", "unit_value": 3800.0}
        ]
    },
    "Agricultural": {
        "assessment_level": 40.0,
        "description": "Lands devoted principally to agriculture, planting of crops, raising livestock",
        "benchmark_unit_values": [
            {"sub_class": "Agricultural - First Class Irrigated Riceland", "unit_value": 450.0},
            {"sub_class": "Agricultural - Second Class Rainfed Riceland", "unit_value": 280.0},
            {"sub_class": "Agricultural - Upland Corn / Tobacco Field", "unit_value": 180.0},
            {"sub_class": "Agricultural - Orchard / Fruit Plantation", "unit_value": 320.0},
            {"sub_class": "Agricultural - Pasture / Grazing Land", "unit_value": 120.0}
        ]
    },
    "Institutional": {
        "assessment_level": 50.0,
        "description": "Lands devoted for government, educational, scientific, cultural, and religious use",
        "benchmark_unit_values": [
            {"sub_class": "Institutional - Government Civic Center Complex", "unit_value": 5000.0},
            {"sub_class": "Institutional - Educational / University Campus", "unit_value": 4000.0},
            {"sub_class": "Institutional - Hospital / Public Health Facility", "unit_value": 4500.0}
        ]
    },
    "Special": {
        "assessment_level": 10.0,
        "description": "Lands owned by local water districts, GOCCs, and economic zones",
        "benchmark_unit_values": [
            {"sub_class": "Special - Local Water District Utility Compound", "unit_value": 2500.0},
            {"sub_class": "Special - Special Economic / Processing Zone", "unit_value": 3000.0}
        ]
    }
}

PROVINCIAL_SPATIAL_PRESETS = [
    {
        "id": "maharlika_highway",
        "name": "Maharlika National Highway (AH26) Corridor",
        "type": "corridor",
        "category": "National Infrastructure & ROW",
        "statutory_basis": "R.A. 10752 (Right-of-Way Act for National Infrastructure)",
        "default_buffer_m": 500,
        "description": "Primary national transport corridor traversing Ilagan City north-to-south. Used for road widening, setback compliance, and commercial frontage taxation.",
        "coordinates": [
            [16.9790, 121.8150],
            [16.9760, 121.8153],
            [16.9730, 121.8156],
            [16.9700, 121.8158]
        ]
    },
    {
        "id": "cagayan_river",
        "name": "Cagayan River / Pinacanauan Riparian Hazard Zone",
        "type": "corridor",
        "category": "Flood Hazard & Water Code Easement",
        "statutory_basis": "P.D. 1067 (Water Code of the Philippines - Article 51 Environmental Easement)",
        "default_buffer_m": 300,
        "description": "Major river basin corridor subject to seasonal monsoon inundation and statutory riparian 40-meter public easement.",
        "coordinates": [
            [16.9795, 121.8105],
            [16.9765, 121.8115],
            [16.9730, 121.8112],
            [16.9695, 121.8108]
        ]
    },
    {
        "id": "bypass_road",
        "name": "Proposed Isabela Agro-Industrial Bypass Alignment",
        "type": "corridor",
        "category": "Proposed Provincial Road Project",
        "statutory_basis": "Provincial Sangguniang Panlalawigan Infrastructure Plan 2026",
        "default_buffer_m": 200,
        "description": "Planned bypass road corridor traversing the eastern agro-industrial expansion district of Ilagan City.",
        "coordinates": [
            [16.9770, 121.8230],
            [16.9740, 121.8210],
            [16.9710, 121.8190]
        ]
    }
]

DEFAULT_USERS = [
    {
        "username": "assessor.pgi",
        "password": "IsabelaAssessor2026!",
        "full_name": "Atty. Rodolfo V. Ramos",
        "role": "PROVINCIAL_ASSESSOR",
        "role_title": "Provincial Assessor",
        "badge_no": "PGI-ASR-001",
        "lgu": "Provincial Capitol, Ilagan City"
    },
    {
        "username": "taxmapper.gis",
        "password": "IsabelaGIS#2026",
        "full_name": "Engr. Marites D. Pascual",
        "role": "GIS_TAX_MAPPER",
        "role_title": "Senior Tax Mapping Officer / GIS Lead",
        "badge_no": "PGI-GIS-014",
        "lgu": "Office of the Provincial Assessor"
    },
    {
        "username": "appraiser.ilagan",
        "password": "Appraise2026!",
        "full_name": "Christian B. Salvador",
        "role": "MUNICIPAL_APPRAISER",
        "role_title": "Local Assessment & Appraisal Officer",
        "badge_no": "LGU-ILG-089",
        "lgu": "City Assessor Office, Ilagan"
    },
    {
        "username": "records.inquiry",
        "password": "Records2026!",
        "full_name": "Elena M. Castillo",
        "role": "RECORDS_OFFICER",
        "role_title": "Tax Declaration Records & Inquiries",
        "badge_no": "PGI-REC-005",
        "lgu": "Public Records Division, PGI"
    }
]

SAMPLE_PARCELS = [
    {
        "pin": "032-15-0001-042-18",
        "td_no": "TD-2026-03215-00891",
        "lgu_code": "03215",
        "lgu_name": "Ilagan City",
        "section_no": "014-A",
        "lot_no": "Lot 42-18",
        "block_no": "Blk 04",
        "survey_no": "Cad 211",
        "owner_name": "Provincial Government of Isabela",
        "owner_address": "Alibagu, City of Ilagan, Isabela",
        "classification": "Institutional",
        "actual_use": "Government Capitol & Provincial Administrative Offices",
        "area_sqm": 14250.0,
        "unit_value": 12000.0,
        "market_value": 171000000.0,
        "assessment_level": 50.0,
        "assessed_value": 85500000.0,
        "tax_due": 0.0,
        "lat": 16.9754,
        "lng": 121.8155,
        "geo_coords": json.dumps([
            [16.9758, 121.8142],
            [16.9765, 121.8162],
            [16.9748, 121.8168],
            [16.9742, 121.8148]
        ]),
        "status": "Exempt - Provincial Government",
        "delinquency_status": "EXEMPT",
        "overdue_months": 0
    },
    {
        "pin": "032-15-0001-042-19",
        "td_no": "TD-2026-03215-00892",
        "lgu_code": "03215",
        "lgu_name": "Ilagan City",
        "section_no": "014-A",
        "lot_no": "Lot 42-19",
        "block_no": "Blk 04",
        "survey_no": "Cad 211",
        "owner_name": "Isabela Sports Commission",
        "owner_address": "Sports Complex Compound, Ilagan City",
        "classification": "Special",
        "actual_use": "Provincial Athletics Arena & Gymnasium",
        "area_sqm": 32400.0,
        "unit_value": 4000.0,
        "market_value": 129600000.0,
        "assessment_level": 50.0,
        "assessed_value": 64800000.0,
        "tax_due": 0.0,
        "lat": 16.9742,
        "lng": 121.8181,
        "geo_coords": json.dumps([
            [16.9748, 121.8168],
            [16.9754, 121.8188],
            [16.9736, 121.8194],
            [16.9730, 121.8174]
        ]),
        "status": "Exempt - Sports Facility",
        "delinquency_status": "EXEMPT",
        "overdue_months": 0
    },
    {
        "pin": "032-15-0001-043-01",
        "td_no": "TD-2026-03215-01420",
        "lgu_code": "03215",
        "lgu_name": "Ilagan City",
        "section_no": "014-A",
        "lot_no": "Lot 43-01",
        "block_no": "Blk 05",
        "survey_no": "Cad 211",
        "owner_name": "North Luzon Agro-Commercial Corp.",
        "owner_address": "Maharlika Highway, Ilagan City",
        "classification": "Commercial",
        "actual_use": "Commercial Grain Trading & Retail Plaza",
        "area_sqm": 8910.0,
        "unit_value": 10000.0,
        "market_value": 89100000.0,
        "assessment_level": 50.0,
        "assessed_value": 44550000.0,
        "tax_due": 891000.0,
        "lat": 16.9735,
        "lng": 121.8152,
        "geo_coords": json.dumps([
            [16.9738, 121.8138],
            [16.9746, 121.8160],
            [16.9732, 121.8165],
            [16.9724, 121.8144]
        ]),
        "status": "Taxable - Delinquent (2 Yrs Overdue)",
        "delinquency_status": "DELINQUENT",
        "overdue_months": 24
    },
    {
        "pin": "032-15-0001-039-11",
        "td_no": "TD-2026-03215-00204",
        "lgu_code": "03215",
        "lgu_name": "Ilagan City",
        "section_no": "014-A",
        "lot_no": "Lot 39-11",
        "block_no": "Blk 01",
        "survey_no": "Cad 211",
        "owner_name": "Heirs of Mariano Bautista",
        "owner_address": "Barangay Alibagu, Ilagan City",
        "classification": "Agricultural",
        "actual_use": "Irrigated Riceland & Corn Crop",
        "area_sqm": 24500.0,
        "unit_value": 375.0,
        "market_value": 9187500.0,
        "assessment_level": 40.0,
        "assessed_value": 3675000.0,
        "tax_due": 73500.0,
        "lat": 16.9733,
        "lng": 121.8120,
        "geo_coords": json.dumps([
            [16.9740, 121.8105],
            [16.9748, 121.8128],
            [16.9725, 121.8135],
            [16.9718, 121.8112]
        ]),
        "status": "Taxable - Paid / Current",
        "delinquency_status": "CURRENT",
        "overdue_months": 0
    },
    {
        "pin": "032-15-0001-044-05",
        "td_no": "TD-2026-03215-03118",
        "lgu_code": "03215",
        "lgu_name": "Ilagan City",
        "section_no": "014-A",
        "lot_no": "Lot 44-05",
        "block_no": "Blk 06",
        "survey_no": "Cad 211",
        "owner_name": "Villa Alibagu Homeowners Assn.",
        "owner_address": "Capitol Ridge Subd., Ilagan City",
        "classification": "Residential",
        "actual_use": "Single-Family Residential Estate",
        "area_sqm": 18200.0,
        "unit_value": 2000.0,
        "market_value": 36400000.0,
        "assessment_level": 20.0,
        "assessed_value": 7280000.0,
        "tax_due": 145600.0,
        "lat": 16.9723,
        "lng": 121.8182,
        "geo_coords": json.dumps([
            [16.9728, 121.8168],
            [16.9736, 121.8190],
            [16.9718, 121.8196],
            [16.9710, 121.8175]
        ]),
        "status": "Taxable - Paid / Current",
        "delinquency_status": "CURRENT",
        "overdue_months": 0
    },
    {
        "pin": "032-15-0001-045-02",
        "td_no": "TD-2026-03215-04512",
        "lgu_code": "03215",
        "lgu_name": "Ilagan City",
        "section_no": "014-A",
        "lot_no": "Lot 45-02",
        "block_no": "Blk 07",
        "survey_no": "Cad 211",
        "owner_name": "Cagayan Valley Agro-Industrial Depot",
        "owner_address": "Industrial Highway, Ilagan City",
        "classification": "Industrial",
        "actual_use": "Cold Storage & Rice Milling Plant",
        "area_sqm": 21000.0,
        "unit_value": 3500.0,
        "market_value": 73500000.0,
        "assessment_level": 50.0,
        "assessed_value": 36750000.0,
        "tax_due": 735000.0,
        "lat": 16.9727,
        "lng": 121.8212,
        "geo_coords": json.dumps([
            [16.9732, 121.8198],
            [16.9740, 121.8220],
            [16.9722, 121.8226],
            [16.9715, 121.8204]
        ]),
        "status": "Taxable - Delinquent (1 Yr Overdue)",
        "delinquency_status": "DELINQUENT",
        "overdue_months": 12
    },
    {
        "pin": "032-15-0001-041-09",
        "td_no": "TD-2026-03215-00045",
        "lgu_code": "03215",
        "lgu_name": "Ilagan City",
        "section_no": "014-A",
        "lot_no": "Lot 41-09",
        "block_no": "Blk 03",
        "survey_no": "Cad 211",
        "owner_name": "Provincial Ecological Reserve",
        "owner_address": "Cagayan Riverfront Buffer, Ilagan",
        "classification": "Special",
        "actual_use": "Riverbank Watershed Buffer Zone",
        "area_sqm": 15800.0,
        "unit_value": 500.0,
        "market_value": 7900000.0,
        "assessment_level": 10.0,
        "assessed_value": 790000.0,
        "tax_due": 0.0,
        "lat": 16.9757,
        "lng": 121.8126,
        "geo_coords": json.dumps([
            [16.9762, 121.8112],
            [16.9770, 121.8135],
            [16.9752, 121.8140],
            [16.9745, 121.8118]
        ]),
        "status": "Exempt - Environmental",
        "delinquency_status": "EXEMPT",
        "overdue_months": 0
    }
]

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL,
        role_title TEXT NOT NULL,
        badge_no TEXT NOT NULL,
        lgu TEXT NOT NULL,
        active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        action TEXT NOT NULL,
        details TEXT,
        ip_address TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tax_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        or_no TEXT UNIQUE NOT NULL,
        pin TEXT NOT NULL,
        td_no TEXT NOT NULL,
        payor_name TEXT NOT NULL,
        payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        tax_year INTEGER DEFAULT 2026,
        period_covered TEXT DEFAULT 'Annual 2026',
        basic_rpt REAL NOT NULL,
        sef REAL NOT NULL,
        penalties REAL DEFAULT 0.0,
        discount REAL DEFAULT 0.0,
        total_amount_paid REAL NOT NULL,
        payment_mode TEXT DEFAULT 'CASH',
        reference_no TEXT,
        collecting_officer TEXT NOT NULL,
        officer_badge TEXT NOT NULL,
        lgu_code TEXT NOT NULL
    )
    """)

    cursor.execute("DROP TABLE IF EXISTS lgus")
    cursor.execute("DROP TABLE IF EXISTS parcels")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS lgus (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        total_parcels INTEGER NOT NULL,
        lat REAL DEFAULT 16.9749,
        lng REAL DEFAULT 121.8153,
        status TEXT DEFAULT 'Active - Synced'
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS parcels (
        pin TEXT PRIMARY KEY,
        td_no TEXT NOT NULL,
        lgu_code TEXT NOT NULL,
        lgu_name TEXT NOT NULL,
        section_no TEXT NOT NULL,
        lot_no TEXT NOT NULL,
        block_no TEXT NOT NULL,
        survey_no TEXT NOT NULL,
        owner_name TEXT NOT NULL,
        owner_address TEXT NOT NULL,
        classification TEXT NOT NULL,
        actual_use TEXT NOT NULL,
        area_sqm REAL NOT NULL,
        unit_value REAL NOT NULL,
        market_value REAL NOT NULL,
        assessment_level REAL NOT NULL,
        assessed_value REAL NOT NULL,
        tax_due REAL NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        geo_coords TEXT NOT NULL,
        status TEXT NOT NULL,
        delinquency_status TEXT DEFAULT 'CURRENT',
        overdue_months INTEGER DEFAULT 0
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ownership_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pin TEXT NOT NULL,
        sequence_no INTEGER NOT NULL,
        owner_name TEXT NOT NULL,
        owner_address TEXT NOT NULL,
        owner_tin TEXT,
        td_no TEXT NOT NULL,
        deed_type TEXT,
        deed_no TEXT,
        deed_date TEXT,
        registry_of_deeds TEXT,
        tct_oct_no TEXT,
        inscription_date TEXT,
        bir_car_no TEXT,
        bir_car_date TEXT,
        transfer_tax_or_no TEXT,
        transfer_tax_amount REAL DEFAULT 0.0,
        transfer_tax_date TEXT,
        transferred_by TEXT,
        officer_badge TEXT,
        transfer_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        remarks TEXT
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS assessment_revisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        revision_no TEXT UNIQUE NOT NULL,
        pin TEXT NOT NULL,
        td_no TEXT NOT NULL,
        lot_no TEXT NOT NULL,
        owner_name TEXT NOT NULL,
        old_classification TEXT NOT NULL,
        new_classification TEXT NOT NULL,
        old_actual_use TEXT NOT NULL,
        new_actual_use TEXT NOT NULL,
        area_sqm REAL NOT NULL,
        old_unit_value REAL NOT NULL,
        new_unit_value REAL NOT NULL,
        old_market_value REAL NOT NULL,
        new_market_value REAL NOT NULL,
        old_assessment_level REAL NOT NULL,
        new_assessment_level REAL NOT NULL,
        old_assessed_value REAL NOT NULL,
        new_assessed_value REAL NOT NULL,
        old_tax_due REAL NOT NULL,
        new_tax_due REAL NOT NULL,
        tax_variance REAL NOT NULL,
        tax_variance_pct REAL NOT NULL,
        reason TEXT NOT NULL,
        ordinance_no TEXT NOT NULL,
        effective_year INTEGER DEFAULT 2026,
        effective_quarter TEXT DEFAULT '1st Quarter, 2026',
        appraiser_username TEXT NOT NULL,
        appraiser_badge TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Seed users if empty
    cursor.execute("SELECT COUNT(*) FROM users")
    if cursor.fetchone()[0] == 0:
        for u in DEFAULT_USERS:
            pw_hash = generate_password_hash(u["password"])
            cursor.execute("""
            INSERT INTO users (username, password_hash, full_name, role, role_title, badge_no, lgu)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (u["username"], pw_hash, u["full_name"], u["role"], u["role_title"], u["badge_no"], u["lgu"]))

    # Seed or update LGUs
    cursor.execute("DELETE FROM lgus")
    for code, name, parcels, lat, lng in ISABELA_LGUS:
        cursor.execute("""
        INSERT INTO lgus (code, name, total_parcels, lat, lng)
        VALUES (?, ?, ?, ?, ?)
        """, (code, name, parcels, lat, lng))

    # Seed parcels
    cursor.execute("DELETE FROM parcels")
    for p in SAMPLE_PARCELS:
        cursor.execute("""
        INSERT INTO parcels (
            pin, td_no, lgu_code, lgu_name, section_no, lot_no, block_no, survey_no,
            owner_name, owner_address, classification, actual_use, area_sqm, unit_value,
            market_value, assessment_level, assessed_value, tax_due, lat, lng,
            geo_coords, status, delinquency_status, overdue_months
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            p["pin"], p["td_no"], p["lgu_code"], p["lgu_name"], p["section_no"],
            p["lot_no"], p["block_no"], p["survey_no"], p["owner_name"], p["owner_address"],
            p["classification"], p["actual_use"], p["area_sqm"], p["unit_value"],
            p["market_value"], p["assessment_level"], p["assessed_value"], p["tax_due"],
            p["lat"], p["lng"], p["geo_coords"], p["status"],
            p.get("delinquency_status", "CURRENT"), p.get("overdue_months", 0)
        ))

    conn.commit()
    conn.close()

def authenticate_user(username_or_badge, password):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT * FROM users 
    WHERE (LOWER(username) = LOWER(?) OR LOWER(badge_no) = LOWER(?)) 
      AND active = 1
    """, (username_or_badge, username_or_badge))
    user = cursor.fetchone()
    conn.close()

    if user and check_password_hash(user["password_hash"], password):
        return dict(user)
    return None

def log_audit(username, action, details=None, ip=None):
    try:
        conn = get_db()
        conn.execute("""
        INSERT INTO audit_logs (username, action, details, ip_address)
        VALUES (?, ?, ?, ?)
        """, (username, action, details, ip))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error logging audit: {e}")

def calculate_delinquency_breakdown(p):
    """
    Computes statutory Real Property Tax delinquency and penalty schedule
    pursuant to Section 255 of Republic Act No. 7160 (Local Government Code of 1991).
    Penalty: 2% per month on unpaid basic RPT and SEF, capped at 72% (36 months).
    """
    av = float(p.get("assessed_value", 0.0))
    status = p.get("status", "")
    delinq_status = p.get("delinquency_status", "CURRENT")
    is_exempt = "Exempt" in status or delinq_status == "EXEMPT" or p.get("classification", "").lower() in ["institutional", "special"]

    if is_exempt:
        return {
            "status": "EXEMPT",
            "basic_tax": 0.0,
            "sef_tax": 0.0,
            "annual_tax": 0.0,
            "principal_due": 0.0,
            "years_count": 0,
            "overdue_months": 0,
            "penalty_rate_pct": 0.0,
            "penalty_amount": 0.0,
            "total_delinquent_due": 0.0,
            "is_delinquent": False,
            "delinquent_years_str": "None (Exempt)"
        }

    # Annual Basic RPT (2%) and SEF (1%)
    basic_tax = round(av * 0.02, 2)
    sef_tax = round(av * 0.01, 2)
    annual_tax = round(basic_tax + sef_tax, 2)

    overdue_months = int(p.get("overdue_months", 0))
    is_delinquent = delinq_status == "DELINQUENT" or overdue_months > 0 or "Delinquent" in status

    if not is_delinquent:
        return {
            "status": "CURRENT",
            "basic_tax": basic_tax,
            "sef_tax": sef_tax,
            "annual_tax": annual_tax,
            "principal_due": annual_tax,
            "years_count": 0,
            "overdue_months": 0,
            "penalty_rate_pct": 0.0,
            "penalty_amount": 0.0,
            "total_delinquent_due": annual_tax,
            "is_delinquent": False,
            "delinquent_years_str": "Current / Paid (2026)"
        }

    if overdue_months <= 0:
        overdue_months = 24

    penalty_rate_pct = min(round(overdue_months * 2.0, 1), 72.0)
    years_count = max(1, round(overdue_months / 12.0))
    principal_base = round(annual_tax * years_count, 2)
    penalty_amount = round(principal_base * (penalty_rate_pct / 100.0), 2)
    total_due = round(principal_base + penalty_amount, 2)

    return {
        "status": "DELINQUENT",
        "basic_tax": round(basic_tax * years_count, 2),
        "sef_tax": round(sef_tax * years_count, 2),
        "annual_tax": annual_tax,
        "principal_due": principal_base,
        "years_count": years_count,
        "overdue_months": overdue_months,
        "penalty_rate_pct": penalty_rate_pct,
        "penalty_amount": penalty_amount,
        "total_delinquent_due": total_due,
        "is_delinquent": True,
        "delinquent_years_str": f"{years_count} Year{'s' if years_count > 1 else ''} Overdue ({overdue_months} Mos)"
    }

def get_parcels(lgu_code=None, query=None, classification=None, include_cancelled=False):
    conn = get_db()
    cursor = conn.cursor()

    sql = "SELECT * FROM parcels WHERE 1=1"
    params = []

    if not include_cancelled:
        sql += " AND status NOT LIKE 'Cancelled%'"

    if lgu_code and lgu_code != "ALL":
        sql += " AND lgu_code = ?"
        params.append(lgu_code)

    if classification and classification != "ALL":
        sql += " AND LOWER(classification) = LOWER(?)"
        params.append(classification)

    if query:
        q = f"%{query.strip()}%"
        sql += " AND (pin LIKE ? OR owner_name LIKE ? OR lot_no LIKE ? OR td_no LIKE ?)"
        params.extend([q, q, q, q])

    sql += " ORDER BY lot_no ASC"
    cursor.execute(sql, params)
    
    rows = []
    for r in cursor.fetchall():
        d = dict(r)
        try:
            d["coordinates"] = json.loads(d["geo_coords"])
        except:
            d["coordinates"] = []
        d["delinquency"] = calculate_delinquency_breakdown(d)
        d["delinquency_status"] = d["delinquency"]["status"]
        d["penalty_amount"] = d["delinquency"]["penalty_amount"]
        d["total_delinquent_due"] = d["delinquency"]["total_delinquent_due"]
        rows.append(d)

    conn.close()
    return rows

def get_parcel_by_pin(pin):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM parcels WHERE pin = ?", (pin,))
    row = cursor.fetchone()
    conn.close()
    if row:
        d = dict(row)
        try:
            d["coordinates"] = json.loads(d["geo_coords"])
        except:
            d["coordinates"] = []
        d["delinquency"] = calculate_delinquency_breakdown(d)
        d["delinquency_status"] = d["delinquency"]["status"]
        d["penalty_amount"] = d["delinquency"]["penalty_amount"]
        d["total_delinquent_due"] = d["delinquency"]["total_delinquent_due"]
        return d
    return None

def subdivide_parcel(parent_pin, children_data, officer_username="system", officer_badge="PGI-GIS-014", ip=None):
    """
    Subdivides a parent parcel into 2 or more child parcels.
    Parent parcel is marked 'Cancelled - Subdivided'.
    Child parcels are inserted with new sub-PINs, proportional values, and geometries.
    """
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM parcels WHERE pin = ?", (parent_pin,))
    parent_row = cursor.fetchone()
    if not parent_row:
        conn.close()
        return {"success": False, "message": f"Parent parcel with PIN {parent_pin} not found."}

    parent = dict(parent_row)
    if "Cancelled" in parent.get("status", ""):
        conn.close()
        return {"success": False, "message": f"Parcel {parent_pin} is already cancelled or previously subdivided."}

    created_parcels = []
    unit_value = float(parent.get("unit_value", 0.0))
    assessment_level = float(parent.get("assessment_level", 0.0))

    try:
        for idx, child in enumerate(children_data):
            suffix = child.get("suffix") or chr(65 + idx) # 'A', 'B', etc.
            child_pin = child.get("pin") or f"{parent['pin']}-{suffix}"
            child_lot = child.get("lot_no") or f"{parent['lot_no']}-{suffix}"
            child_td = child.get("td_no") or f"{parent['td_no']}-{suffix}"
            owner_name = child.get("owner_name") or parent["owner_name"]
            owner_address = child.get("owner_address") or parent["owner_address"]
            classification = child.get("classification") or parent["classification"]
            actual_use = child.get("actual_use") or parent["actual_use"]
            area_sqm = round(float(child.get("area_sqm", 0.0)), 2)

            market_value = round(area_sqm * unit_value, 2)
            assessed_value = round(market_value * (assessment_level / 100.0), 2)
            
            if "Exempt" in parent.get("status", ""):
                tax_due = 0.0
                status = f"Exempt - Subdivided ({suffix})"
            else:
                tax_rate = (parent["tax_due"] / parent["assessed_value"]) if parent.get("assessed_value", 0) > 0 else 0.02
                tax_due = round(assessed_value * tax_rate, 2)
                status = "Taxable - Current"

            coords = child.get("coordinates", [])
            geo_coords_str = json.dumps(coords)

            if coords and len(coords) > 0:
                child_lat = sum(p[0] for p in coords) / len(coords)
                child_lng = sum(p[1] for p in coords) / len(coords)
            else:
                child_lat = parent["lat"]
                child_lng = parent["lng"]

            cursor.execute("""
            INSERT INTO parcels (
                pin, td_no, lgu_code, lgu_name, section_no, lot_no, block_no, survey_no,
                owner_name, owner_address, classification, actual_use, area_sqm, unit_value,
                market_value, assessment_level, assessed_value, tax_due, lat, lng,
                geo_coords, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                child_pin, child_td, parent["lgu_code"], parent["lgu_name"], parent["section_no"],
                child_lot, parent["block_no"], parent["survey_no"], owner_name, owner_address,
                classification, actual_use, area_sqm, unit_value, market_value, assessment_level,
                assessed_value, tax_due, child_lat, child_lng, geo_coords_str, status
            ))

            child_dict = {
                "pin": child_pin,
                "td_no": child_td,
                "lgu_code": parent["lgu_code"],
                "lgu_name": parent["lgu_name"],
                "section_no": parent["section_no"],
                "lot_no": child_lot,
                "block_no": parent["block_no"],
                "survey_no": parent["survey_no"],
                "owner_name": owner_name,
                "owner_address": owner_address,
                "classification": classification,
                "actual_use": actual_use,
                "area_sqm": area_sqm,
                "unit_value": unit_value,
                "market_value": market_value,
                "assessment_level": assessment_level,
                "assessed_value": assessed_value,
                "tax_due": tax_due,
                "lat": child_lat,
                "lng": child_lng,
                "coordinates": coords,
                "geo_coords": geo_coords_str,
                "status": status
            }
            created_parcels.append(child_dict)

        cursor.execute("""
        UPDATE parcels 
        SET status = 'Cancelled - Subdivided' 
        WHERE pin = ?
        """, (parent_pin,))

        cursor.execute("""
        UPDATE lgus 
        SET total_parcels = total_parcels + ? 
        WHERE code = ?
        """, (len(created_parcels) - 1, parent["lgu_code"]))

        sub_pins_str = ", ".join([c["pin"] for c in created_parcels])
        audit_details = f"Cadastral subdivision of {parent_pin} ({parent['lot_no']}) into {len(created_parcels)} lots: [{sub_pins_str}]. Handled by {officer_badge}."
        cursor.execute("""
        INSERT INTO audit_logs (username, action, details, ip_address)
        VALUES (?, 'PARCEL_SUBDIVISION', ?, ?)
        """, (officer_username, audit_details, ip))

        conn.commit()
        conn.close()

        return {
            "success": True,
            "message": f"Successfully subdivided {parent_pin} into {len(created_parcels)} sub-lots.",
            "parent_pin": parent_pin,
            "created_parcels": created_parcels
        }
    except Exception as e:
        conn.rollback()
        conn.close()
        return {"success": False, "message": f"Subdivision failed: {str(e)}"}

def add_parcel(parcel_data, officer_username="system", officer_badge="PGI-GIS-014", ip=None):
    """
    Inserts a newly drawn/registered parcel into the cadastre.
    Computes market value, assessed value, tax dues, and updates LGU count & audit logs.
    """
    conn = get_db()
    cursor = conn.cursor()

    pin = parcel_data.get("pin", "").strip()
    if not pin:
        cursor.execute("SELECT COUNT(*) FROM parcels")
        count = cursor.fetchone()[0] + 1
        pin = f"032-15-0001-0{count:02d}-01"

    cursor.execute("SELECT pin FROM parcels WHERE pin = ?", (pin,))
    if cursor.fetchone():
        conn.close()
        return {"success": False, "message": f"Parcel with PIN '{pin}' already exists in Cadastre 211."}

    lot_no = parcel_data.get("lot_no", "").strip() or f"Lot {pin.split('-')[-2]}-{pin.split('-')[-1]}"
    td_no = parcel_data.get("td_no", "").strip() or f"TD-2026-03215-{pin.replace('-', '')[-5:]}"
    lgu_code = parcel_data.get("lgu_code", "03215")
    lgu_name = parcel_data.get("lgu_name", "Ilagan City")
    section_no = parcel_data.get("section_no", "014-A")
    block_no = parcel_data.get("block_no", "Blk 08")
    survey_no = parcel_data.get("survey_no", "Cad 211")
    owner_name = parcel_data.get("owner_name", "").strip() or "Declared Property Owner"
    owner_address = parcel_data.get("owner_address", "").strip() or "Barangay Alibagu, Ilagan City, Isabela"
    classification = parcel_data.get("classification", "Residential")
    actual_use = parcel_data.get("actual_use", "").strip() or f"{classification} Real Property"
    area_sqm = round(float(parcel_data.get("area_sqm", 500.0)), 2)
    unit_value = round(float(parcel_data.get("unit_value", 2500.0)), 2)

    level_defaults = {
        "residential": 20.0,
        "commercial": 50.0,
        "agricultural": 40.0,
        "industrial": 50.0,
        "institutional": 50.0,
        "special": 10.0
    }
    assessment_level = float(parcel_data.get("assessment_level") or level_defaults.get(classification.lower(), 20.0))
    if "market_value" in parcel_data and parcel_data["market_value"] is not None and str(parcel_data["market_value"]).strip() != "":
        market_value = round(float(parcel_data["market_value"]), 2)
    else:
        market_value = round(area_sqm * unit_value, 2)

    if "assessed_value" in parcel_data and parcel_data["assessed_value"] is not None and str(parcel_data["assessed_value"]).strip() != "":
        assessed_value = round(float(parcel_data["assessed_value"]), 2)
    else:
        assessed_value = round(market_value * (assessment_level / 100.0), 2)

    status = parcel_data.get("status", "Taxable - Current")
    if "tax_due" in parcel_data and parcel_data["tax_due"] is not None and str(parcel_data["tax_due"]).strip() != "":
        tax_due = round(float(parcel_data["tax_due"]), 2)
    elif "Exempt" in status or classification.lower() in ["institutional", "special"]:
        tax_due = 0.0
    else:
        tax_due = round(assessed_value * 0.02, 2)

    coords = parcel_data.get("coordinates", [])
    geo_coords_str = json.dumps(coords)

    if coords and len(coords) > 0:
        lat = sum(p[0] for p in coords) / len(coords)
        lng = sum(p[1] for p in coords) / len(coords)
    else:
        lat = float(parcel_data.get("lat", 16.9749))
        lng = float(parcel_data.get("lng", 121.8153))

    try:
        cursor.execute("""
        INSERT INTO parcels (
            pin, td_no, lgu_code, lgu_name, section_no, lot_no, block_no, survey_no,
            owner_name, owner_address, classification, actual_use, area_sqm, unit_value,
            market_value, assessment_level, assessed_value, tax_due, lat, lng,
            geo_coords, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            pin, td_no, lgu_code, lgu_name, section_no, lot_no, block_no, survey_no,
            owner_name, owner_address, classification, actual_use, area_sqm, unit_value,
            market_value, assessment_level, assessed_value, tax_due, lat, lng,
            geo_coords_str, status
        ))

        cursor.execute("UPDATE lgus SET total_parcels = total_parcels + 1 WHERE code = ?", (lgu_code,))

        audit_details = f"Registered new cadastral lot {pin} ({lot_no}, {area_sqm} sq.m.) under '{owner_name}'. Performed by {officer_badge}."
        cursor.execute("""
        INSERT INTO audit_logs (username, action, details, ip_address)
        VALUES (?, 'PARCEL_CREATED', ?, ?)
        """, (officer_username, audit_details, ip))

        conn.commit()
        conn.close()

        created_dict = {
            "pin": pin,
            "td_no": td_no,
            "lgu_code": lgu_code,
            "lgu_name": lgu_name,
            "section_no": section_no,
            "lot_no": lot_no,
            "block_no": block_no,
            "survey_no": survey_no,
            "owner_name": owner_name,
            "owner_address": owner_address,
            "classification": classification,
            "actual_use": actual_use,
            "area_sqm": area_sqm,
            "unit_value": unit_value,
            "market_value": market_value,
            "assessment_level": assessment_level,
            "assessed_value": assessed_value,
            "tax_due": tax_due,
            "lat": lat,
            "lng": lng,
            "coordinates": coords,
            "geo_coords": geo_coords_str,
            "status": status
        }
        return {"success": True, "message": f"Successfully registered lot {pin} ({lot_no}).", "parcel": created_dict}
    except Exception as e:
        conn.rollback()
        conn.close()
        return {"success": False, "message": f"Failed to register parcel: {str(e)}"}

def delete_parcel(pin, officer_username="system", officer_badge="PGI-GIS-014", ip=None):
    """
    Deletes/removes a parcel from the cadastre and logs an audit trail record.
    """
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM parcels WHERE pin = ?", (pin,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return {"success": False, "message": f"Parcel with PIN '{pin}' not found."}

    p = dict(row)
    lgu_code = p.get("lgu_code", "03215")

    try:
        cursor.execute("DELETE FROM parcels WHERE pin = ?", (pin,))
        cursor.execute("UPDATE lgus SET total_parcels = MAX(0, total_parcels - 1) WHERE code = ?", (lgu_code,))

        audit_details = f"Deleted cadastral parcel {pin} ({p.get('lot_no')}, {p.get('owner_name')}, {p.get('area_sqm')} sq.m.). Action taken by {officer_badge}."
        cursor.execute("""
        INSERT INTO audit_logs (username, action, details, ip_address)
        VALUES (?, 'PARCEL_DELETED', ?, ?)
        """, (officer_username, audit_details, ip))

        conn.commit()
        conn.close()

        return {"success": True, "message": f"Parcel {pin} ({p.get('lot_no')}) removed from Cadastre 211.", "deleted_pin": pin}
    except Exception as e:
        conn.rollback()
        conn.close()
        return {"success": False, "message": f"Failed to delete parcel: {str(e)}"}

def issue_tax_declaration(pin, officer_username="system", officer_badge="PGI-GIS-014", ip=None):
    """
    Issues/validates an official Real Property Tax Declaration (RPTD) for a parcel.
    Computes breakdown (Basic RPT 2%, SEF 1%), sets effectivity, and logs audit trail.
    """
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM parcels WHERE pin = ?", (pin,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return {"success": False, "message": f"Parcel with PIN '{pin}' not found."}

    p = dict(row)
    
    # Generate TD Number if not present or placeholder
    td_no = p.get("td_no")
    if not td_no or td_no.startswith("TD-PENDING"):
        pin_clean = pin.replace("-", "")
        seq = pin_clean[-5:]
        td_no = f"TD-2026-{p.get('lgu_code', '03215')}-{seq}"
        cursor.execute("UPDATE parcels SET td_no = ? WHERE pin = ?", (td_no, pin))
        conn.commit()
        p["td_no"] = td_no

    # Detailed tax computations
    mv = p.get("market_value", 0.0)
    av = p.get("assessed_value", 0.0)
    status = p.get("status", "Taxable - Current")
    is_exempt = "Exempt" in status or p.get("classification", "").lower() in ["institutional", "special"]

    if is_exempt:
        basic_tax = 0.0
        sef_tax = 0.0
        total_tax = 0.0
    else:
        basic_tax = round(av * 0.02, 2)
        sef_tax = round(av * 0.01, 2)
        total_tax = round(basic_tax + sef_tax, 2)

    # Log audit event
    audit_details = f"Issued official Tax Declaration {td_no} for PIN {pin} ({p.get('lot_no')}, {p.get('owner_name')}) by {officer_badge}."
    cursor.execute("""
    INSERT INTO audit_logs (username, action, details, ip_address)
    VALUES (?, 'TD_ISSUED', ?, ?)
    """, (officer_username, audit_details, ip))
    conn.commit()
    conn.close()

    td_data = {
        "td_no": td_no,
        "pin": pin,
        "lgu_code": p.get("lgu_code", "03215"),
        "lgu_name": p.get("lgu_name", "Ilagan City"),
        "lot_no": p.get("lot_no", ""),
        "block_no": p.get("block_no", ""),
        "section_no": p.get("section_no", ""),
        "survey_no": p.get("survey_no", "Cad 211"),
        "owner_name": p.get("owner_name", ""),
        "owner_address": p.get("owner_address", ""),
        "classification": p.get("classification", "Residential"),
        "actual_use": p.get("actual_use", ""),
        "area_sqm": p.get("area_sqm", 0.0),
        "area_ha": round(p.get("area_sqm", 0.0) / 10000.0, 4),
        "unit_value": p.get("unit_value", 0.0),
        "market_value": mv,
        "assessment_level": p.get("assessment_level", 20.0),
        "assessed_value": av,
        "basic_tax": basic_tax,
        "sef_tax": sef_tax,
        "total_tax": total_tax,
        "status": status,
        "effectivity": "1st Quarter, 2026 (GR-2026)",
        "lat": p.get("lat", 16.9749),
        "lng": p.get("lng", 121.8153),
        "examiner_name": "Engr. Marites D. Pascual",
        "examiner_title": "GIS Tax Mapper / Assessment Examiner",
        "examiner_badge": officer_badge if officer_badge else "PGI-GIS-014",
        "assessor_name": "ATTY. RODOLFO V. RAMOS, REA, REB",
        "assessor_title": "Provincial Assessor",
        "assessor_badge": "PGI-ASR-001"
    }

    return {
        "success": True,
        "message": f"Tax Declaration {td_no} successfully generated.",
        "tax_declaration": td_data
    }

# ==========================================================================
# CADASTRAL GEODETIC COMPUTATION ENGINE & SURVEY TECHNICAL DESCRIPTIONS
# PRS92 / Philippines Zone 3 (EPSG:3123) Reference Cadastre 211
# ==========================================================================

DEFAULT_BLLM = {
    "name": "BLLM No. 1, Cad 211, Ilagan Cadastre",
    "lat": 16.9740,
    "lng": 121.8120,
    "northing": 1877420.50,
    "easting": 586310.20
}

def lat_lng_to_prs92_grid(lat, lng):
    # Projects WGS84 lat/lng to approximate PRS92 Zone 3 (EPSG:3123) grid coordinates in meters
    lat_rad = math.radians(lat)
    meters_per_lat_deg = 110574.0
    meters_per_lng_deg = 111320.0 * math.cos(lat_rad)
    
    northing = round(lat * meters_per_lat_deg, 2)
    easting = round(500000.0 + ((lng - 121.0) * meters_per_lng_deg), 2)
    return northing, easting

def compute_bearing_and_distance(lat1, lng1, lat2, lng2):
    # Computes geodetic distance (meters) and quadrant bearing from Point 1 to Point 2
    n1, e1 = lat_lng_to_prs92_grid(lat1, lng1)
    n2, e2 = lat_lng_to_prs92_grid(lat2, lng2)
    
    dn = n2 - n1
    de = e2 - e1
    
    dist = math.sqrt(dn * dn + de * de)
    if dist < 0.001:
        return "N 00-00 E", 0.0, 0.0
    
    azimuth_rad = math.atan2(de, dn)
    azimuth_deg = math.degrees(azimuth_rad)
    if azimuth_deg < 0:
        azimuth_deg += 360.0
        
    # Standard Philippine quadrant bearing convention
    if 0 <= azimuth_deg < 90:
        prefix = "N"
        angle = azimuth_deg
        suffix = "E"
    elif 90 <= azimuth_deg < 180:
        prefix = "S"
        angle = 180.0 - azimuth_deg
        suffix = "E"
    elif 180 <= azimuth_deg < 270:
        prefix = "S"
        angle = azimuth_deg - 180.0
        suffix = "W"
    else:
        prefix = "N"
        angle = 360.0 - azimuth_deg
        suffix = "W"
        
    deg = int(angle)
    mins = int(round((angle - deg) * 60))
    if mins == 60:
        deg += 1
        mins = 0
    bearing_str = f"{prefix} {deg:02d}d {mins:02d}' {suffix}"
    return bearing_str, round(dist, 2), round(azimuth_deg, 2)

def calculate_metes_and_bounds(coords, tie_bllm=None):
    """
    Calculates technical metes & bounds for a polygon ring of [lat, lng] coordinates.
    Returns:
      - tie_line: from BLLM No. 1 to Corner 1
      - lines: list of boundary lines (Line 1-2, 2-3... N-1) with bearings and distances
      - corners: list of corners with Northing, Easting, lat, lng, and monument description
      - perimeter_m: total perimeter in meters
    """
    if not coords or len(coords) < 3:
        return None

    clean_coords = list(coords)
    if len(clean_coords) > 3 and clean_coords[0][0] == clean_coords[-1][0] and clean_coords[0][1] == clean_coords[-1][1]:
        clean_coords = clean_coords[:-1]
        
    n_corners = len(clean_coords)
    bllm = tie_bllm or DEFAULT_BLLM
    
    # Tie line from BLLM to Corner 1
    c1_lat, c1_lng = clean_coords[0]
    tie_bearing, tie_dist, tie_az = compute_bearing_and_distance(bllm["lat"], bllm["lng"], c1_lat, c1_lng)
    
    tie_line = {
        "from_monument": bllm["name"],
        "to_corner": "Corner 1",
        "bearing": tie_bearing,
        "distance_m": tie_dist,
        "azimuth_deg": tie_az,
        "bllm_northing": bllm["northing"],
        "bllm_easting": bllm["easting"]
    }
    
    lines = []
    corners = []
    total_perimeter = 0.0
    
    adjoining_features = [
        "Cadastral Lot adjacent / Access Alley",
        "Cadastral Section Survey Boundary",
        "Adjacent Lot (Private Landholding)",
        "Public Right-of-Way / Road Access",
        "Drainage Easement / Public Trail",
        "Government Reservation Boundary"
    ]
    
    for i in range(n_corners):
        cur_lat, cur_lng = clean_coords[i]
        next_idx = (i + 1) % n_corners
        next_lat, next_lng = clean_coords[next_idx]
        
        bearing_str, dist_m, az_deg = compute_bearing_and_distance(cur_lat, cur_lng, next_lat, next_lng)
        total_perimeter += dist_m
        
        northing, easting = lat_lng_to_prs92_grid(cur_lat, cur_lng)
        
        corners.append({
            "corner_no": i + 1,
            "lat": cur_lat,
            "lng": cur_lng,
            "northing": northing,
            "easting": easting,
            "monument": "P.S. Cyl. Conc. Mons. 15 x 50 cm"
        })
        
        lines.append({
            "line_no": f"{i + 1} - {next_idx + 1}",
            "from_corner": i + 1,
            "to_corner": next_idx + 1,
            "bearing": bearing_str,
            "distance_m": dist_m,
            "azimuth_deg": az_deg,
            "adjoining": adjoining_features[i % len(adjoining_features)]
        })
        
    return {
        "tie_line": tie_line,
        "lines": lines,
        "corners": corners,
        "perimeter_m": round(total_perimeter, 2),
        "closure_ratio": "1:25,000 (First Order Cadastral Standard)"
    }

def get_survey_sheet(pin, officer_username="system", officer_badge="PGI-GIS-014", ip=None):
    """
    Retrieves full Cadastral Survey Sheet & Metes and Bounds data for a parcel.
    Logs SURVEY_SHEET_VIEWED in audit_logs.
    """
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM parcels WHERE pin = ?", (pin,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return {"success": False, "message": f"Parcel with PIN '{pin}' not found."}

    p = dict(row)
    try:
        coords = json.loads(p.get("geo_coords", "[]"))
    except:
        coords = []

    # If coordinates are empty or single point, generate standard cadastral polygon box
    if not coords or len(coords) < 3:
        lat = float(p.get("lat", 16.9749))
        lng = float(p.get("lng", 121.8153))
        d_lat = 0.0004
        d_lng = 0.0004
        coords = [
            [lat + d_lat, lng - d_lng],
            [lat + d_lat, lng + d_lng],
            [lat - d_lat, lng + d_lng],
            [lat - d_lat, lng - d_lng]
        ]

    mb = calculate_metes_and_bounds(coords)

    # Log audit event
    audit_details = f"Generated Cadastral Survey Sheet for PIN {pin} ({p.get('lot_no')}, {p.get('owner_name')}) by {officer_badge}."
    cursor.execute("""
    INSERT INTO audit_logs (username, action, details, ip_address)
    VALUES (?, 'SURVEY_SHEET_VIEWED', ?, ?)
    """, (officer_username, audit_details, ip))
    conn.commit()
    conn.close()

    survey_data = {
        "pin": pin,
        "td_no": p.get("td_no", ""),
        "lot_no": p.get("lot_no", ""),
        "block_no": p.get("block_no", "Blk 01"),
        "section_no": p.get("section_no", "014-A"),
        "survey_no": p.get("survey_no", "Cad 211"),
        "owner_name": p.get("owner_name", ""),
        "owner_address": p.get("owner_address", ""),
        "lgu_code": p.get("lgu_code", "03215"),
        "lgu_name": p.get("lgu_name", "Ilagan City"),
        "classification": p.get("classification", "Residential"),
        "actual_use": p.get("actual_use", ""),
        "area_sqm": p.get("area_sqm", 0.0),
        "area_ha": round(p.get("area_sqm", 0.0) / 10000.0, 4),
        "status": p.get("status", "Active"),
        "coordinates": coords,
        "metes_and_bounds": mb,
        "survey_date": "March 2026",
        "surveyor_name": "ENGR. MARITES D. PASCUAL, GE",
        "surveyor_title": "Cadastral Survey Tax Mapper / Examiner",
        "surveyor_prc": "PRC License No. 005921",
        "approver_name": "ENGR. DANILO C. BALISI, GE",
        "approver_title": "Chief, Surveys & Mapping Division, DENR-LMB Region 02",
        "approver_prc": "PRC License No. 004812"
    }

    return {
        "success": True,
        "message": f"Cadastral survey sheet for {pin} generated successfully.",
        "survey_sheet": survey_data
    }

def get_lgu_collection_telemetry(lgu_code="03215"):
    """
    Computes real-time collection, delinquency, and revenue telemetry for a given LGU (or all LGUs).
    Returns total collectibles, total collected, delinquency counts, delinquent tax and penalties,
    collection rate %, and delinquency rate %.
    """
    conn = get_db()
    cursor = conn.cursor()

    if lgu_code and lgu_code != "ALL":
        cursor.execute("SELECT name FROM lgus WHERE code = ?", (lgu_code,))
        lgu_row = cursor.fetchone()
        lgu_name = lgu_row["name"] if lgu_row else "Selected LGU"
        cursor.execute("SELECT * FROM parcels WHERE lgu_code = ? AND status NOT LIKE 'Cancelled%'", (lgu_code,))
    else:
        lgu_name = "All Isabela LGUs (Province-Wide)"
        cursor.execute("SELECT * FROM parcels WHERE status NOT LIKE 'Cancelled%'")

    rows = cursor.fetchall()
    conn.close()

    total_lots = len(rows)
    current_count = 0
    delinquent_count = 0
    exempt_count = 0

    total_market_value = 0.0
    total_assessed_value = 0.0

    total_annual_collectibles = 0.0
    total_collected = 0.0
    delinquent_principal = 0.0
    delinquent_penalties = 0.0
    total_delinquent_due = 0.0

    delinquent_parcels_summary = []

    for r in rows:
        p = dict(r)
        d = calculate_delinquency_breakdown(p)
        mv = float(p.get("market_value", 0.0))
        av = float(p.get("assessed_value", 0.0))
        total_market_value += mv
        total_assessed_value += av

        status = d["status"]
        if status == "EXEMPT":
            exempt_count += 1
        elif status == "DELINQUENT":
            delinquent_count += 1
            delinquent_principal += d["principal_due"]
            delinquent_penalties += d["penalty_amount"]
            total_delinquent_due += d["total_delinquent_due"]
            total_annual_collectibles += d["principal_due"] + d["penalty_amount"]
            delinquent_parcels_summary.append({
                "pin": p.get("pin"),
                "lot_no": p.get("lot_no"),
                "owner_name": p.get("owner_name"),
                "classification": p.get("classification"),
                "assessed_value": av,
                "overdue_months": d["overdue_months"],
                "years_count": d["years_count"],
                "penalty_amount": d["penalty_amount"],
                "total_due": d["total_delinquent_due"]
            })
        else: # CURRENT
            current_count += 1
            total_collected += d["annual_tax"]
            total_annual_collectibles += d["annual_tax"]

    taxable_lots = current_count + delinquent_count
    collection_rate_pct = round((total_collected / total_annual_collectibles * 100.0), 2) if total_annual_collectibles > 0 else 100.0
    delinquency_rate_pct = round((delinquent_count / taxable_lots * 100.0), 2) if taxable_lots > 0 else 0.0

    return {
        "lgu_code": lgu_code,
        "lgu_name": lgu_name,
        "total_lots": total_lots,
        "taxable_lots": taxable_lots,
        "current_count": current_count,
        "delinquent_count": delinquent_count,
        "exempt_count": exempt_count,
        "total_market_value": round(total_market_value, 2),
        "total_assessed_value": round(total_assessed_value, 2),
        "total_collectibles": round(total_annual_collectibles, 2),
        "total_collected": round(total_collected, 2),
        "delinquent_principal": round(delinquent_principal, 2),
        "delinquent_penalties": round(delinquent_penalties, 2),
        "total_delinquent_due": round(total_delinquent_due, 2),
        "collection_rate_pct": collection_rate_pct,
        "delinquency_rate_pct": delinquency_rate_pct,
        "delinquent_parcels": delinquent_parcels_summary
    }

def issue_notice_of_delinquency(pin, officer_username="system", officer_badge="PGI-GIS-014", ip=None):
    """
    Issues an official Notice of Assessment & Real Property Tax Delinquency
    pursuant to Republic Act No. 7160 (Local Government Code of 1991), Section 254-258.
    Logs DELINQUENCY_NOTICE_ISSUED into audit_logs.
    Returns the complete document payload formatted for formal rendering and printing.
    """
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM parcels WHERE pin = ?", (pin,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return {"success": False, "message": f"Parcel with PIN '{pin}' not found."}

    p = dict(row)
    delinq = calculate_delinquency_breakdown(p)

    if delinq["status"] != "DELINQUENT":
        conn.close()
        return {
            "success": False,
            "message": f"Parcel '{pin}' is currently {delinq['status']}. Notice of Delinquency can only be issued for delinquent accounts."
        }

    clean_pin = pin.replace("-", "")
    notice_no = f"NOD-2026-{p.get('lgu_code', '03215')}-{clean_pin[-6:]}"

    years_count = delinq["years_count"]
    overdue_months = delinq["overdue_months"]
    annual_base = delinq["annual_tax"]
    schedule = []
    
    current_year = 2026
    for y_idx in range(years_count):
        tax_year = current_year - (years_count - 1 - y_idx)
        y_penalty_pct = min(round(overdue_months * 2.0 / years_count, 1), 72.0)
        y_basic = round(annual_base * (2/3), 2)
        y_sef = round(annual_base * (1/3), 2)
        y_penalty = round(annual_base * (y_penalty_pct / 100.0), 2)
        y_total = round(annual_base + y_penalty, 2)
        schedule.append({
            "tax_year": tax_year,
            "basic_tax": y_basic,
            "sef_tax": y_sef,
            "subtotal_tax": annual_base,
            "penalty_rate_pct": y_penalty_pct,
            "penalty_amount": y_penalty,
            "total_due": y_total
        })

    # Log audit event
    audit_details = f"Issued Official Notice of Delinquency #{notice_no} for PIN {pin} ({p.get('lot_no')}, {p.get('owner_name')}) - Total Due: PHP {delinq['total_delinquent_due']:,.2f} by {officer_badge}."
    cursor.execute("""
    INSERT INTO audit_logs (username, action, details, ip_address)
    VALUES (?, 'DELINQUENCY_NOTICE_ISSUED', ?, ?)
    """, (officer_username, audit_details, ip))
    conn.commit()
    conn.close()

    notice_doc = {
        "notice_no": notice_no,
        "date_issued": "March 8, 2026",
        "jurisdiction": {
            "republic": "Republic of the Philippines",
            "province": "Province of Isabela",
            "office_treasurer": "Office of the Provincial / City Treasurer",
            "office_assessor": "Office of the Provincial Assessor",
            "lgu_name": p.get("lgu_name", "City of Ilagan"),
            "lgu_code": p.get("lgu_code", "03215")
        },
        "taxpayer": {
            "owner_name": p.get("owner_name"),
            "owner_address": p.get("owner_address"),
            "pin": p.get("pin"),
            "td_no": p.get("td_no"),
            "lot_no": p.get("lot_no"),
            "block_no": p.get("block_no"),
            "survey_no": p.get("survey_no"),
            "classification": p.get("classification"),
            "actual_use": p.get("actual_use"),
            "area_sqm": p.get("area_sqm"),
            "market_value": p.get("market_value"),
            "assessment_level": p.get("assessment_level"),
            "assessed_value": p.get("assessed_value")
        },
        "delinquency": {
            "years_overdue": years_count,
            "months_overdue": overdue_months,
            "penalty_rate_pct": delinq["penalty_rate_pct"],
            "principal_due": delinq["principal_due"],
            "penalty_amount": delinq["penalty_amount"],
            "total_delinquent_due": delinq["total_delinquent_due"],
            "schedule": schedule
        },
        "statutory_basis": {
            "law": "Republic Act No. 7160 (The Local Government Code of 1991)",
            "section_notice": "Section 254 - Notice of Delinquency in the Payment of the Real Property Tax",
            "section_interest": "Section 255 - Interest on Unpaid Real Property Tax (2% per month up to 72% maximum)",
            "section_remedies": "Sections 256-258 - Remedies for Collection: Administrative Distraint, Levy on Real Property, and Public Auction"
        },
        "legal_notice_text": (
            "NOTICE IS HEREBY GIVEN that the real property described above is delinquent in the payment of "
            "Real Property Tax (Basic RPT and Special Education Fund) for the calendar year(s) stated herein. "
            "Pursuant to Section 255 of Republic Act No. 7160, interest at the rate of two percent (2%) per month "
            "has accrued on the unpaid tax until paid or until maximum interest of seventy-two percent (72%) is reached.\n\n"
            "DEMAND IS HEREBY MADE upon you to pay the total amount due of PHP {:,.2f} within THIRTY (30) DAYS "
            "from service of this notice. Failure to do so will constrain this Office to enforce collection through "
            "administrative distraint of personal property or summary levy upon the delinquent real property and "
            "subsequent advertisement and public auction pursuant to Sections 256, 257, and 258 of R.A. 7160."
        ).format(delinq["total_delinquent_due"]),
        "signatories": {
            "provincial_treasurer": {
                "name": "HON. MARIA CORAZON G. PUA",
                "title": "Provincial Treasurer",
                "office": "Office of the Provincial Treasurer, Isabela"
            },
            "provincial_assessor": {
                "name": "ATTY. RODOLFO V. RAMOS",
                "title": "Provincial Assessor",
                "office": "Office of the Provincial Assessor, Isabela"
            },
            "issuing_officer": {
                "username": officer_username,
                "badge": officer_badge,
                "date": "March 8, 2026"
            }
        }
    }

    return {
        "success": True,
        "message": f"Official Notice of Delinquency #{notice_no} generated successfully.",
        "notice": notice_doc
    }


def transfer_ownership(pin, transfer_data, officer_username="system", officer_badge="PGI-REC-005", ip=None):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM parcels WHERE pin = ?", (pin,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return {"success": False, "message": f"Parcel '{pin}' not found."}
    
    p = dict(row)
    if p.get("status", "").startswith("Cancelled"):
        conn.close()
        return {"success": False, "message": f"Parcel '{pin}' has been cancelled and cannot be transferred."}
        
    delinq = calculate_delinquency_breakdown(p)
    if delinq["status"] == "DELINQUENT":
        conn.close()
        return {"success": False, "message": f"Parcel '{pin}' has delinquent taxes. A Certificate of Tax Clearance is required before transfer of ownership can be processed."}
        
    new_owner_name = transfer_data.get("new_owner_name", "")
    if not new_owner_name.strip():
        conn.close()
        return {"success": False, "message": "New owner name is required."}
        
    old_owner = p['owner_name']
    old_address = p['owner_address']
    old_td = p['td_no']
    
    cursor.execute("SELECT MAX(sequence_no) as max_seq FROM ownership_history WHERE pin = ?", (pin,))
    res = cursor.fetchone()
    max_seq = res["max_seq"] if res and res["max_seq"] is not None else None
    
    if max_seq is None:
        cursor.execute("INSERT INTO ownership_history (pin, sequence_no, owner_name, owner_address, td_no, deed_type, remarks) VALUES (?, 1, ?, ?, ?, 'Original Title', 'Initial owner record seeded on first transfer')",
            (pin, old_owner, old_address, old_td))
        current_seq = 1
    else:
        current_seq = max_seq
        
    new_seq = current_seq + 1
    new_td = f"TD-2026-{p.get('lgu_code', '03215')}-TR{str(new_seq).zfill(3)}"
    
    cursor.execute("""
        INSERT INTO ownership_history (
            pin, sequence_no, owner_name, owner_address, owner_tin, td_no,
            deed_type, deed_no, deed_date, registry_of_deeds, tct_oct_no,
            inscription_date, bir_car_no, bir_car_date, transfer_tax_or_no,
            transfer_tax_amount, transfer_tax_date, transferred_by, officer_badge, remarks
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        pin, new_seq, new_owner_name, transfer_data.get("new_owner_address", ""),
        transfer_data.get("new_owner_tin", ""), new_td,
        transfer_data.get("deed_type", "Deed of Absolute Sale"),
        transfer_data.get("deed_no", ""), transfer_data.get("deed_date", ""),
        transfer_data.get("registry_of_deeds", ""), transfer_data.get("tct_oct_no", ""),
        transfer_data.get("inscription_date", ""), transfer_data.get("bir_car_no", ""),
        transfer_data.get("bir_car_date", ""), transfer_data.get("transfer_tax_or_no", ""),
        float(transfer_data.get("transfer_tax_amount", 0)), transfer_data.get("transfer_tax_date", ""),
        officer_username, officer_badge, "Transferred ownership"
    ))
    
    cursor.execute("UPDATE parcels SET owner_name = ?, owner_address = ?, td_no = ? WHERE pin = ?", (new_owner_name, transfer_data.get("new_owner_address", ""), new_td, pin))
    
    transfer_ref = f"TOT-2026-{p.get('lgu_code', '03215')}-{pin.replace('-', '')[-6:]}"
    
    audit_details = f"Transferred ownership of {pin} from {old_owner} to {new_owner_name} via {transfer_data.get('deed_type', 'Deed of Absolute Sale')} ref {transfer_ref}. Officer: {officer_badge}."
    cursor.execute("INSERT INTO audit_logs (username, action, details, ip_address) VALUES (?, 'OWNERSHIP_TRANSFERRED', ?, ?)", (officer_username, audit_details, ip))
    
    conn.commit()
    conn.close()
    
    transfer_doc = {
        "transfer_ref": transfer_ref,
        "pin": pin,
        "lot_no": p.get("lot_no"),
        "block_no": p.get("block_no"),
        "section_no": p.get("section_no"),
        "survey_no": p.get("survey_no"),
        "lgu_code": p.get("lgu_code"),
        "lgu_name": p.get("lgu_name"),
        "classification": p.get("classification"),
        "actual_use": p.get("actual_use"),
        "area_sqm": p.get("area_sqm"),
        "market_value": p.get("market_value"),
        "assessed_value": p.get("assessed_value"),
        "old_owner_name": old_owner,
        "old_owner_address": old_address,
        "old_td_no": old_td,
        "new_owner_name": new_owner_name,
        "new_owner_address": transfer_data.get("new_owner_address", ""),
        "new_owner_tin": transfer_data.get("new_owner_tin", ""),
        "new_td_no": new_td,
        "deed_type": transfer_data.get("deed_type", "Deed of Absolute Sale"),
        "deed_no": transfer_data.get("deed_no", ""),
        "deed_date": transfer_data.get("deed_date", ""),
        "registry_of_deeds": transfer_data.get("registry_of_deeds", ""),
        "tct_oct_no": transfer_data.get("tct_oct_no", ""),
        "inscription_date": transfer_data.get("inscription_date", ""),
        "bir_car_no": transfer_data.get("bir_car_no", ""),
        "bir_car_date": transfer_data.get("bir_car_date", ""),
        "transfer_tax_or_no": transfer_data.get("transfer_tax_or_no", ""),
        "transfer_tax_amount": transfer_data.get("transfer_tax_amount", 0),
        "transfer_tax_date": transfer_data.get("transfer_tax_date", ""),
        "sequence_no": new_seq,
        "officer_username": officer_username,
        "officer_badge": officer_badge,
        "assessor_name": "ATTY. RODOLFO V. RAMOS, REA, REB",
        "date_issued": datetime.now().strftime("%B %d, %Y")
    }
    return {"success": True, "message": f"Transfer of ownership processed. New TD {new_td} issued to {new_owner_name}.", "transfer": transfer_doc}

def get_ownership_history(pin):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM ownership_history WHERE pin = ? ORDER BY sequence_no ASC", (pin,))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows


def reclassify_parcel(pin, revision_data, officer_username="system", officer_badge="PGI-ASR-001", ip=None):
    """
    Reclassifies a parcel's actual land use and updates assessment metrics pursuant to R.A. 7160 Sec. 219-224.
    Computes new market value, assessed value, annual tax due, and incremental variance.
    Logs audit trail, saves record in assessment_revisions, and generates official Notice of Assessment.
    """
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM parcels WHERE pin = ?", (pin,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return {"success": False, "message": f"Parcel '{pin}' not found."}

    p = dict(row)
    if p.get("status", "").startswith("Cancelled"):
        conn.close()
        return {"success": False, "message": f"Parcel '{pin}' is cancelled and cannot be reassessed."}

    new_class = revision_data.get("new_classification", p["classification"]).strip()
    new_use = revision_data.get("new_actual_use", p["actual_use"]).strip()
    area_sqm = float(p["area_sqm"])

    # Unit value
    try:
        new_unit_val = float(revision_data.get("new_unit_value", p["unit_value"]))
    except (ValueError, TypeError):
        new_unit_val = float(p["unit_value"])

    # Default assessment levels per classification
    level_defaults = {
        "residential": 20.0,
        "commercial": 50.0,
        "agricultural": 40.0,
        "industrial": 50.0,
        "institutional": 50.0,
        "special": 10.0
    }
    try:
        new_level = float(revision_data.get("new_assessment_level") or level_defaults.get(new_class.lower(), 20.0))
    except (ValueError, TypeError):
        new_level = level_defaults.get(new_class.lower(), 20.0)

    # Compute valuations
    old_mv = float(p["market_value"])
    old_av = float(p["assessed_value"])
    old_tax = float(p["tax_due"])

    new_mv = round(area_sqm * new_unit_val, 2)
    new_av = round(new_mv * (new_level / 100.0), 2)

    is_exempt = "Exempt" in p.get("status", "") or new_class.lower() in ["institutional", "special"]
    if is_exempt:
        new_basic = 0.0
        new_sef = 0.0
        new_tax = 0.0
    else:
        new_basic = round(new_av * 0.02, 2)
        new_sef = round(new_av * 0.01, 2)
        new_tax = round(new_basic + new_sef, 2)

    tax_var = round(new_tax - old_tax, 2)
    tax_var_pct = round((tax_var / old_tax * 100.0), 2) if old_tax > 0 else 0.0

    reason = revision_data.get("reason", "Land Use Reclassification / General Revision").strip()
    ordinance_no = revision_data.get("ordinance_no", "Sangguniang Panlalawigan Ordinance No. 2026-04 (General Revision SMV)").strip()

    # Generate revision serial reference
    cursor.execute("SELECT COUNT(*) FROM assessment_revisions WHERE pin = ?", (pin,))
    rev_count = cursor.fetchone()[0] + 1
    revision_no = f"NAR-2026-{p.get('lgu_code', '03215')}-{pin.replace('-', '')[-6:]}-R{rev_count:02d}"

    # Generate next TD version or append revision
    current_td = p.get("td_no", "")
    if "-R" in current_td:
        base_td = current_td.split("-R")[0]
        new_td = f"{base_td}-R{rev_count:02d}"
    else:
        new_td = f"{current_td}-R{rev_count:02d}"

    # Insert into assessment_revisions
    cursor.execute("""
    INSERT INTO assessment_revisions (
        revision_no, pin, td_no, lot_no, owner_name,
        old_classification, new_classification, old_actual_use, new_actual_use,
        area_sqm, old_unit_value, new_unit_value, old_market_value, new_market_value,
        old_assessment_level, new_assessment_level, old_assessed_value, new_assessed_value,
        old_tax_due, new_tax_due, tax_variance, tax_variance_pct,
        reason, ordinance_no, effective_year, effective_quarter,
        appraiser_username, appraiser_badge
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2026, '1st Quarter, 2026', ?, ?)
    """, (
        revision_no, pin, new_td, p.get("lot_no", ""), p.get("owner_name", ""),
        p["classification"], new_class, p["actual_use"], new_use,
        area_sqm, float(p["unit_value"]), new_unit_val, old_mv, new_mv,
        float(p["assessment_level"]), new_level, old_av, new_av,
        old_tax, new_tax, tax_var, tax_var_pct,
        reason, ordinance_no, officer_username, officer_badge
    ))

    # Update parcels table
    cursor.execute("""
    UPDATE parcels
    SET td_no = ?, classification = ?, actual_use = ?, unit_value = ?,
        market_value = ?, assessment_level = ?, assessed_value = ?, tax_due = ?
    WHERE pin = ?
    """, (new_td, new_class, new_use, new_unit_val, new_mv, new_level, new_av, new_tax, pin))

    # Audit log
    audit_details = (
        f"Reclassified {pin} ({p.get('lot_no')}) from {p['classification']} to {new_class}. "
        f"AV updated PHP {old_av:,.2f} -> PHP {new_av:,.2f} (Tax Variance: PHP {tax_var:+,.2f}). "
        f"Notice: {revision_no}. Officer: {officer_badge}."
    )
    cursor.execute("""
    INSERT INTO audit_logs (username, action, details, ip_address)
    VALUES (?, 'ASSESSMENT_REVISED', ?, ?)
    """, (officer_username, audit_details, ip))

    conn.commit()
    conn.close()

    notice_doc = {
        "revision_no": revision_no,
        "pin": pin,
        "td_no": new_td,
        "old_td_no": current_td,
        "lot_no": p.get("lot_no", ""),
        "block_no": p.get("block_no", ""),
        "section_no": p.get("section_no", ""),
        "survey_no": p.get("survey_no", ""),
        "lgu_code": p.get("lgu_code", "03215"),
        "lgu_name": p.get("lgu_name", "Ilagan City"),
        "owner_name": p.get("owner_name", ""),
        "owner_address": p.get("owner_address", ""),
        "area_sqm": area_sqm,
        "area_ha": round(area_sqm / 10000.0, 4),
        "comparison": {
            "classification": {"old": p["classification"], "new": new_class},
            "actual_use": {"old": p["actual_use"], "new": new_use},
            "unit_value": {"old": float(p["unit_value"]), "new": new_unit_val, "diff": round(new_unit_val - float(p["unit_value"]), 2)},
            "market_value": {"old": old_mv, "new": new_mv, "diff": round(new_mv - old_mv, 2)},
            "assessment_level": {"old": float(p["assessment_level"]), "new": new_level, "diff": round(new_level - float(p["assessment_level"]), 2)},
            "assessed_value": {"old": old_av, "new": new_av, "diff": round(new_av - old_av, 2)},
            "basic_tax": {"old": round(old_av * 0.02, 2) if not is_exempt else 0.0, "new": new_basic},
            "sef_tax": {"old": round(old_av * 0.01, 2) if not is_exempt else 0.0, "new": new_sef},
            "tax_due": {"old": old_tax, "new": new_tax, "diff": tax_var, "diff_pct": tax_var_pct}
        },
        "reason": reason,
        "ordinance_no": ordinance_no,
        "effectivity": "1st Quarter, 2026 (General Revision Cycle)",
        "appeal_deadline": "60 days from receipt of this notice pursuant to Sec. 226, R.A. 7160",
        "date_issued": datetime.now().strftime("%B %d, %Y"),
        "appraiser_name": "ENGR. MARITES D. PASCUAL",
        "appraiser_title": "GIS Tax Mapper / Assessment Examiner",
        "appraiser_badge": officer_badge,
        "assessor_name": "ATTY. RODOLFO V. RAMOS, REA, REB",
        "assessor_title": "Provincial Assessor",
        "assessor_badge": "PGI-ASR-001"
    }

    return {
        "success": True,
        "message": f"Parcel '{pin}' successfully reassessed to {new_class}. Notice #{revision_no} generated.",
        "revision": {
            "revision_no": revision_no,
            "pin": pin,
            "td_no": new_td,
            "new_classification": new_class,
            "new_market_value": new_mv,
            "new_assessed_value": new_av,
            "new_tax_due": new_tax,
            "tax_variance": tax_var,
            "tax_variance_pct": tax_var_pct
        },
        "notice": notice_doc
    }


def get_assessment_revisions(pin=None, limit=50):
    """
    Retrieves assessment revision history for a parcel or all revisions in the LGU.
    """
    conn = get_db()
    cursor = conn.cursor()
    if pin:
        cursor.execute("SELECT * FROM assessment_revisions WHERE pin = ? ORDER BY created_at DESC LIMIT ?", (pin, limit))
    else:
        cursor.execute("SELECT * FROM assessment_revisions ORDER BY created_at DESC LIMIT ?", (limit,))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows


def get_smv_rates():
    """
    Returns benchmark Schedule of Market Values (SMV) reference table.
    """
    return PROVINCIAL_SMV_RATES


def get_audit_logs(limit=100, offset=0, action=None, query=None):
    """
    Retrieves audit trail records with optional action filtering, search, and pagination.
    """
    conn = get_db()
    cursor = conn.cursor()

    sql = "SELECT * FROM audit_logs WHERE 1=1"
    params = []

    if action and action != "ALL":
        sql += " AND action = ?"
        params.append(action)

    if query:
        q = f"%{query.strip()}%"
        sql += " AND (username LIKE ? OR action LIKE ? OR details LIKE ? OR ip_address LIKE ?)"
        params.extend([q, q, q, q])

    count_sql = f"SELECT COUNT(*) FROM ({sql})"
    cursor.execute(count_sql, params)
    total_count = cursor.fetchone()[0]

    sql += " ORDER BY id DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    cursor.execute(sql, params)
    logs = [dict(r) for r in cursor.fetchall()]
    conn.close()

    return {
        "total": total_count,
        "limit": limit,
        "offset": offset,
        "logs": logs
    }

def get_tax_declarations_registry(lgu_code=None, query=None, status=None, classification=None, limit=100, offset=0):
    """
    Retrieves Tax Declarations with computed market/assessed values and delinquency telemetry.
    """
    conn = get_db()
    cursor = conn.cursor()

    sql = "SELECT * FROM parcels WHERE status NOT LIKE 'Cancelled%'"
    params = []

    if lgu_code and lgu_code != "ALL":
        sql += " AND lgu_code = ?"
        params.append(lgu_code)

    if classification and classification != "ALL":
        sql += " AND LOWER(classification) = LOWER(?)"
        params.append(classification)

    if query:
        q = f"%{query.strip()}%"
        sql += " AND (td_no LIKE ? OR pin LIKE ? OR owner_name LIKE ? OR lot_no LIKE ? OR owner_address LIKE ?)"
        params.extend([q, q, q, q, q])

    count_sql = f"SELECT COUNT(*) FROM ({sql})"
    cursor.execute(count_sql, params)
    total_count = cursor.fetchone()[0]

    sql += " ORDER BY td_no ASC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    cursor.execute(sql, params)
    rows = []
    for r in cursor.fetchall():
        d = dict(r)
        d["delinquency"] = calculate_delinquency_breakdown(d)
        d["delinquency_status"] = d["delinquency"]["status"]
        d["penalty_amount"] = d["delinquency"]["penalty_amount"]
        d["total_delinquent_due"] = d["delinquency"]["total_delinquent_due"]
        try:
            d["coordinates"] = json.loads(d["geo_coords"])
        except:
            d["coordinates"] = []
        rows.append(d)

    conn.close()

    if status and status != "ALL":
        rows = [r for r in rows if r["delinquency_status"] == status]
        total_count = len(rows)

    return {
        "total": total_count,
        "limit": limit,
        "offset": offset,
        "tax_declarations": rows
    }

def get_assessment_roll_data(lgu_code=None, classification=None):
    """
    Generates official General Revision Assessment Roll data pursuant to Section 248, R.A. 7160.
    Aggregates metrics by classification and compiles individual assessment roll entries.
    """
    conn = get_db()
    cursor = conn.cursor()

    lgu_name = "Province of Isabela (All 37 LGUs)"
    if lgu_code and lgu_code != "ALL":
        cursor.execute("SELECT name FROM lgus WHERE code = ?", (lgu_code,))
        row = cursor.fetchone()
        if row:
            lgu_name = row["name"]

    sql = "SELECT * FROM parcels WHERE status NOT LIKE 'Cancelled%'"
    params = []

    if lgu_code and lgu_code != "ALL":
        sql += " AND lgu_code = ?"
        params.append(lgu_code)

    if classification and classification != "ALL":
        sql += " AND LOWER(classification) = LOWER(?)"
        params.append(classification)

    sql += " ORDER BY section_no ASC, block_no ASC, lot_no ASC"
    cursor.execute(sql, params)
    
    raw_parcels = cursor.fetchall()
    conn.close()

    total_parcels = len(raw_parcels)
    total_area_sqm = 0.0
    total_market_value = 0.0
    total_assessed_value = 0.0
    total_basic_tax = 0.0
    total_sef_tax = 0.0
    total_annual_tax = 0.0

    taxable_count = 0
    exempt_count = 0
    delinquent_count = 0

    class_breakdown = {}
    roll_items = []

    for idx, r in enumerate(raw_parcels):
        p = dict(r)
        delinq = calculate_delinquency_breakdown(p)
        p["delinquency"] = delinq
        p["delinquency_status"] = delinq["status"]
        
        area = float(p.get("area_sqm", 0.0))
        mv = float(p.get("market_value", 0.0))
        av = float(p.get("assessed_value", 0.0))
        cls_name = p.get("classification", "Residential")
        
        total_area_sqm += area
        total_market_value += mv
        total_assessed_value += av

        is_exempt = delinq["status"] == "EXEMPT"
        if is_exempt:
            exempt_count += 1
            basic_tax = 0.0
            sef_tax = 0.0
            tax_due = 0.0
        else:
            taxable_count += 1
            basic_tax = round(av * 0.02, 2)
            sef_tax = round(av * 0.01, 2)
            tax_due = round(basic_tax + sef_tax, 2)
            if delinq["status"] == "DELINQUENT":
                delinquent_count += 1

        total_basic_tax += basic_tax
        total_sef_tax += sef_tax
        total_annual_tax += tax_due

        if cls_name not in class_breakdown:
            class_breakdown[cls_name] = {
                "classification": cls_name,
                "count": 0,
                "area_sqm": 0.0,
                "area_ha": 0.0,
                "market_value": 0.0,
                "assessed_value": 0.0,
                "tax_due": 0.0,
                "share_pct": 0.0
            }

        class_breakdown[cls_name]["count"] += 1
        class_breakdown[cls_name]["area_sqm"] += area
        class_breakdown[cls_name]["market_value"] += mv
        class_breakdown[cls_name]["assessed_value"] += av
        class_breakdown[cls_name]["tax_due"] += tax_due

        roll_items.append({
            "item_no": idx + 1,
            "pin": p.get("pin"),
            "td_no": p.get("td_no"),
            "lot_no": p.get("lot_no"),
            "block_no": p.get("block_no"),
            "section_no": p.get("section_no"),
            "survey_no": p.get("survey_no"),
            "owner_name": p.get("owner_name"),
            "owner_address": p.get("owner_address"),
            "classification": cls_name,
            "actual_use": p.get("actual_use"),
            "area_sqm": area,
            "area_ha": round(area / 10000.0, 4),
            "unit_value": float(p.get("unit_value", 0.0)),
            "market_value": mv,
            "assessment_level": float(p.get("assessment_level", 20.0)),
            "assessed_value": av,
            "basic_tax": basic_tax,
            "sef_tax": sef_tax,
            "annual_tax": tax_due,
            "delinquency_status": delinq["status"],
            "status": p.get("status")
        })

    class_list = []
    for cls_name, data in class_breakdown.items():
        data["area_ha"] = round(data["area_sqm"] / 10000.0, 4)
        data["market_value"] = round(data["market_value"], 2)
        data["assessed_value"] = round(data["assessed_value"], 2)
        data["tax_due"] = round(data["tax_due"], 2)
        data["share_pct"] = round((data["assessed_value"] / total_assessed_value * 100.0), 2) if total_assessed_value > 0 else 0.0
        class_list.append(data)

    class_list.sort(key=lambda x: x["assessed_value"], reverse=True)

    return {
        "lgu_code": lgu_code or "ALL",
        "lgu_name": lgu_name,
        "summary": {
            "total_parcels": total_parcels,
            "taxable_parcels": taxable_count,
            "exempt_parcels": exempt_count,
            "delinquent_parcels": delinquent_count,
            "total_area_sqm": round(total_area_sqm, 2),
            "total_area_ha": round(total_area_sqm / 10000.0, 4),
            "total_market_value": round(total_market_value, 2),
            "total_assessed_value": round(total_assessed_value, 2),
            "total_basic_tax": round(total_basic_tax, 2),
            "total_sef_tax": round(total_sef_tax, 2),
            "total_annual_tax": round(total_annual_tax, 2),
            "effective_assessment_level_pct": round((total_assessed_value / total_market_value * 100.0), 2) if total_market_value > 0 else 0.0
        },
        "classification_breakdown": class_list,
        "roll_items": roll_items
    }

def post_tax_payment(pin, payment_data, officer_username="system", officer_badge="PGI-TRS-008", ip=None):
    # Records a Real Property Tax payment pursuant to Sections 246-258 of R.A. 7160
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM parcels WHERE pin = ?", (pin,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return {"success": False, "message": f"Parcel with PIN '{pin}' not found."}

    p = dict(row)
    delinq = calculate_delinquency_breakdown(p)

    if delinq["status"] == "EXEMPT":
        conn.close()
        return {"success": False, "message": f"Parcel '{pin}' is classified as Exempt from Real Property Tax."}

    cursor.execute("SELECT COUNT(*) FROM tax_payments")
    seq = cursor.fetchone()[0] + 1001
    or_no = f"OR-2026-{p.get('lgu_code', '03215')}-{seq:05d}"

    payor_name = payment_data.get("payor_name", "").strip() or p.get("owner_name", "Declared Property Owner")
    payment_mode = payment_data.get("payment_mode", "CASH").upper()
    reference_no = payment_data.get("reference_no", "").strip()
    
    basic_rpt = float(payment_data.get("basic_rpt", delinq["basic_tax"]))
    sef = float(payment_data.get("sef", delinq["sef_tax"]))
    penalties = float(payment_data.get("penalties", delinq["penalty_amount"]))
    discount = float(payment_data.get("discount", 0.0))
    total_amount_paid = round(basic_rpt + sef + penalties - discount, 2)
    period_covered = payment_data.get("period_covered", delinq.get("delinquent_years_str", "Annual 2026"))

    try:
        cursor.execute("""
        INSERT INTO tax_payments (
            or_no, pin, td_no, payor_name, tax_year, period_covered,
            basic_rpt, sef, penalties, discount, total_amount_paid,
            payment_mode, reference_no, collecting_officer, officer_badge, lgu_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            or_no, pin, p["td_no"], payor_name, 2026, period_covered,
            basic_rpt, sef, penalties, discount, total_amount_paid,
            payment_mode, reference_no, officer_username, officer_badge, p["lgu_code"]
        ))

        cursor.execute("""
        UPDATE parcels 
        SET delinquency_status = 'CURRENT',
            overdue_months = 0,
            status = 'Taxable - Paid / Current'
        WHERE pin = ?
        """, (pin,))

        audit_details = (
            f"Posted RPT Payment for {pin} ({p.get('lot_no')}, {payor_name}) under O.R. #{or_no}. "
            f"Total Paid: PHP {total_amount_paid:,.2f} via {payment_mode}. Collecting Officer: {officer_badge}."
        )
        cursor.execute("""
        INSERT INTO audit_logs (username, action, details, ip_address)
        VALUES (?, 'RPT_PAYMENT_POSTED', ?, ?)
        """, (officer_username, audit_details, ip))

        conn.commit()
        conn.close()

        receipt_doc = get_official_receipt(or_no)

        return {
            "success": True,
            "message": f"Payment of PHP {total_amount_paid:,.2f} successfully posted under O.R. #{or_no}.",
            "or_no": or_no,
            "receipt": receipt_doc.get("receipt") if receipt_doc else None
        }
    except Exception as e:
        conn.rollback()
        conn.close()
        return {"success": False, "message": f"Failed to post payment: {str(e)}"}

def get_official_receipt(or_no):
    # Retrieves full Accountable Form No. 51-C document payload for a given Official Receipt
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM tax_payments WHERE or_no = ?", (or_no,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None

    pay = dict(row)
    cursor.execute("SELECT * FROM parcels WHERE pin = ?", (pay["pin"],))
    p_row = cursor.fetchone()
    p = dict(p_row) if p_row else {}

    cursor.execute("SELECT name FROM lgus WHERE code = ?", (pay.get("lgu_code", "03215"),))
    lgu_row = cursor.fetchone()
    lgu_name = lgu_row["name"] if lgu_row else "City of Ilagan"
    conn.close()

    total_paid = pay["total_amount_paid"]

    receipt_doc = {
        "or_no": pay["or_no"],
        "payment_date": pay["payment_date"],
        "lgu_code": pay["lgu_code"],
        "lgu_name": lgu_name,
        "province": "Province of Isabela",
        "agency": "Office of the Provincial / City Treasurer",
        "payor_name": pay["payor_name"],
        "pin": pay["pin"],
        "td_no": pay["td_no"],
        "lot_no": p.get("lot_no", "-"),
        "block_no": p.get("block_no", "-"),
        "section_no": p.get("section_no", "-"),
        "survey_no": p.get("survey_no", "Cad 211"),
        "classification": p.get("classification", "Residential"),
        "actual_use": p.get("actual_use", "Real Property"),
        "assessed_value": p.get("assessed_value", 0.0),
        "period_covered": pay["period_covered"],
        "basic_rpt": pay["basic_rpt"],
        "sef": pay["sef"],
        "penalties": pay["penalties"],
        "discount": pay["discount"],
        "total_amount_paid": total_paid,
        "payment_mode": pay["payment_mode"],
        "reference_no": pay["reference_no"] or "N/A",
        "collecting_officer": pay["collecting_officer"],
        "officer_badge": pay["officer_badge"],
        "treasurer_name": "HON. MARIA CORAZON G. PUA",
        "treasurer_title": "Provincial Treasurer",
        "statutory_form": "Republic of the Philippines - Accountable Form No. 51-C (Revised Jan. 2008)"
    }
    return {"success": True, "receipt": receipt_doc}

def issue_tax_clearance(pin, purpose=None, officer_username="system", officer_badge="PGI-TRS-008", ip=None):
    # Issues an official Republic of the Philippines Certificate of Real Property Tax Clearance
    # pursuant to Title II, Book II of Republic Act No. 7160.
    # Strictly verifies that the property has NO DELINQUENT tax liabilities.
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM parcels WHERE pin = ?", (pin,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return {"success": False, "message": f"Parcel with PIN '{pin}' not found."}

    p = dict(row)
    delinq = calculate_delinquency_breakdown(p)

    if delinq["status"] == "DELINQUENT":
        conn.close()
        return {
            "success": False,
            "message": (
                f"Cannot issue Tax Clearance: Parcel '{pin}' has an outstanding delinquent tax liability of "
                f"PHP {delinq['total_delinquent_due']:,.2f} ({delinq['delinquent_years_str']}). "
                f"Please settle all outstanding dues in the RPT Collection module first."
            ),
            "delinquency": delinq
        }

    cursor.execute("SELECT * FROM tax_payments WHERE pin = ? ORDER BY id DESC LIMIT 1", (pin,))
    latest_pay_row = cursor.fetchone()
    latest_payment = dict(latest_pay_row) if latest_pay_row else None

    clean_pin = pin.replace("-", "")
    seq_no = f"RPTC-2026-{p.get('lgu_code', '03215')}-{clean_pin[-6:]}"
    valid_purpose = purpose.strip() if purpose and purpose.strip() else "Transfer of Ownership / BIR eCAR Application / LRA Title Registration"

    if delinq["status"] == "EXEMPT":
        tax_status_statement = "EXEMPT FROM REAL PROPERTY TAXATION PURSUANT TO SECTION 234 OF REPUBLIC ACT NO. 7160 (GOVERNMENT / PUBLIC USE)"
        payment_info = {
            "status": "EXEMPT",
            "latest_or_no": "N/A (Exempt Government/Public Land)",
            "date_paid": "N/A",
            "amount_paid": 0.0,
            "period_covered": "Current Year 2026 (Exempt)"
        }
    else:
        tax_status_statement = "FULLY PAID AND SETTLED OF ALL REAL PROPERTY TAXES AND SPECIAL EDUCATION FUND UP TO AND INCLUDING CALENDAR YEAR 2026"
        payment_info = {
            "status": "PAID / CURRENT",
            "latest_or_no": latest_payment["or_no"] if latest_payment else f"OR-2026-{p.get('lgu_code', '03215')}-00892",
            "date_paid": latest_payment["payment_date"] if latest_payment else "March 2026",
            "amount_paid": latest_payment["total_amount_paid"] if latest_payment else delinq["annual_tax"],
            "period_covered": latest_payment["period_covered"] if latest_payment else "Annual 2026"
        }

    audit_details = (
        f"Issued Real Property Tax Clearance Certificate #{seq_no} for PIN {pin} ({p.get('lot_no')}, {p.get('owner_name')}) - "
        f"Purpose: {valid_purpose} by {officer_badge}."
    )
    cursor.execute("""
    INSERT INTO audit_logs (username, action, details, ip_address)
    VALUES (?, 'TAX_CLEARANCE_ISSUED', ?, ?)
    """, (officer_username, audit_details, ip))
    conn.commit()
    conn.close()

    clearance_doc = {
        "clearance_no": seq_no,
        "date_issued": "March 8, 2026",
        "valid_until": "June 6, 2026 (Valid for 90 days from issuance)",
        "purpose": valid_purpose,
        "jurisdiction": {
            "republic": "Republic of the Philippines",
            "province": "Province of Isabela",
            "office": "Office of the Provincial / City Treasurer",
            "lgu_name": p.get("lgu_name", "City of Ilagan"),
            "lgu_code": p.get("lgu_code", "03215")
        },
        "property": {
            "pin": p.get("pin"),
            "td_no": p.get("td_no"),
            "lot_no": p.get("lot_no"),
            "block_no": p.get("block_no", "Blk 01"),
            "section_no": p.get("section_no", "014-A"),
            "survey_no": p.get("survey_no", "Cad 211"),
            "owner_name": p.get("owner_name"),
            "owner_address": p.get("owner_address"),
            "classification": p.get("classification"),
            "actual_use": p.get("actual_use"),
            "area_sqm": p.get("area_sqm", 0.0),
            "area_ha": round(p.get("area_sqm", 0.0) / 10000.0, 4),
            "market_value": p.get("market_value", 0.0),
            "assessed_value": p.get("assessed_value", 0.0)
        },
        "tax_status": delinq["status"],
        "tax_status_statement": tax_status_statement,
        "payment_info": payment_info,
        "certification_text": (
            "THIS IS TO CERTIFY that according to the Official Real Property Tax Roll, Assessment Register, "
            "and Treasury Collection Records of this Office, the real property described above is "
            f"{tax_status_statement}.\n\n"
            "THEREFORE, the said real property is hereby declared FREE FROM ANY TAX LIEN, ENCUMBRANCE, OR "
            "DELINQUENT LIABILITY in favor of the Province of Isabela and the City/Municipality concerned as of this date.\n\n"
            f"This Certification of Tax Clearance is issued upon the request of the declared property owner or authorized "
            f"representative for the specific purpose of: {valid_purpose}."
        ),
        "fees": {
            "clearance_fee": 150.00,
            "doc_stamp_tax": 30.00,
            "total_fees": 180.00,
            "fee_or_no": f"OR-FEE-2026-{clean_pin[-5:]}",
            "fee_date": "March 8, 2026"
        },
        "signatories": {
            "provincial_treasurer": {
                "name": "HON. MARIA CORAZON G. PUA",
                "title": "Provincial Treasurer",
                "office": "Office of the Provincial Treasurer, Isabela"
            },
            "city_treasurer": {
                "name": "ENGR. MARITES D. PASCUAL",
                "title": "City / Municipal Treasurer (OIC)",
                "office": f"Office of the Treasurer · {p.get('lgu_name', 'City of Ilagan')}"
            },
            "issuing_officer": {
                "username": officer_username,
                "badge": officer_badge,
                "date": "March 8, 2026"
            }
        }
    }

    return {
        "success": True,
        "message": f"Official Tax Clearance Certificate #{seq_no} issued successfully.",
        "clearance": clearance_doc
    }

def export_cadastre_geojson(lgu_code="ALL"):
    # Generates a valid GeoJSON FeatureCollection of all active parcels for the given LGU
    parcels = get_parcels(lgu_code=lgu_code)
    features = []

    for p in parcels:
        coords = p.get("coordinates") or []
        if not coords:
            continue

        geojson_coords = [[[pt[1], pt[0]] for pt in coords]]
        if geojson_coords[0][0] != geojson_coords[0][-1]:
            geojson_coords[0].append(geojson_coords[0][0])

        feature = {
            "type": "Feature",
            "id": p["pin"],
            "geometry": {
                "type": "Polygon",
                "coordinates": geojson_coords
            },
            "properties": {
                "pin": p["pin"],
                "td_no": p["td_no"],
                "lgu_code": p["lgu_code"],
                "lgu_name": p["lgu_name"],
                "lot_no": p["lot_no"],
                "block_no": p["block_no"],
                "section_no": p["section_no"],
                "survey_no": p["survey_no"],
                "owner_name": p["owner_name"],
                "owner_address": p["owner_address"],
                "classification": p["classification"],
                "actual_use": p["actual_use"],
                "area_sqm": p["area_sqm"],
                "unit_value": p["unit_value"],
                "market_value": p["market_value"],
                "assessment_level": p["assessment_level"],
                "assessed_value": p["assessed_value"],
                "annual_tax_due": p["tax_due"],
                "delinquency_status": p["delinquency_status"],
                "status": p["status"],
                "projection": "PRS92 / Philippines Zone 3 (EPSG:3123)"
            }
        }
        features.append(feature)

    return {
        "type": "FeatureCollection",
        "crs": {
            "type": "name",
            "properties": {
                "name": "urn:ogc:def:crs:OGC:1.3:CRS84"
            }
        },
        "name": f"Isabela_Cadastre_211_{lgu_code}",
        "features": features
    }

def export_cadastre_csv(lgu_code="ALL"):
    # Generates a structured CSV string of the assessment roll for the given LGU
    import io
    import csv

    parcels = get_parcels(lgu_code=lgu_code)
    output = io.StringIO()
    writer = csv.writer(output)

    headers = [
        "PIN", "TD_NO", "LGU_CODE", "LGU_NAME", "SECTION", "BLOCK", "LOT_NO", "SURVEY_NO",
        "OWNER_NAME", "OWNER_ADDRESS", "CLASSIFICATION", "ACTUAL_USE", "AREA_SQM",
        "UNIT_VALUE_PHP", "MARKET_VALUE_PHP", "ASSESSMENT_LEVEL_PCT", "ASSESSED_VALUE_PHP",
        "ANNUAL_TAX_DUE_PHP", "DELINQUENCY_STATUS", "STATUS", "LATITUDE", "LONGITUDE"
    ]
    writer.writerow(headers)

    for p in parcels:
        writer.writerow([
            p.get("pin"),
            p.get("td_no"),
            p.get("lgu_code"),
            p.get("lgu_name"),
            p.get("section_no"),
            p.get("block_no"),
            p.get("lot_no"),
            p.get("survey_no"),
            p.get("owner_name"),
            p.get("owner_address"),
            p.get("classification"),
            p.get("actual_use"),
            p.get("area_sqm"),
            p.get("unit_value"),
            p.get("market_value"),
            p.get("assessment_level"),
            p.get("assessed_value"),
            p.get("tax_due"),
            p.get("delinquency_status"),
            p.get("status"),
            p.get("lat"),
            p.get("lng")
        ])

    return output.getvalue()

def polygon_area_sqm(coords):
    """
    Computes geodesic area in square meters using Shoelace formula scaled by meters-per-degree.
    """
    if not coords or len(coords) < 3:
        return 0.0
    pts = list(coords)
    if pts[0] == pts[-1]:
        pts = pts[:-1]
    n = len(pts)
    if n < 3:
        return 0.0
    area_deg = 0.0
    mid_lat = sum(p[0] for p in pts) / n
    for i in range(n):
        j = (i + 1) % n
        area_deg += pts[i][1] * pts[j][0] - pts[j][1] * pts[i][0]
    area_deg = abs(area_deg) * 0.5
    m_lat = 111320.0
    m_lng = 111320.0 * math.cos(math.radians(mid_lat))
    return round(area_deg * m_lat * m_lng, 2)

def line_segment_intersection(p1, p2, cp1, cp2):
    dc = [cp1[0] - cp2[0], cp1[1] - cp2[1]]
    dp = [p1[0] - p2[0], p1[1] - p2[1]]
    n1 = cp1[0] * cp2[1] - cp1[1] * cp2[0]
    n2 = p1[0] * p2[1] - p1[1] * p2[0]
    denom = dc[0] * dp[1] - dc[1] * dp[0]
    if abs(denom) < 1e-12:
        return [p1[0], p1[1]]
    n3 = 1.0 / denom
    return [(n1 * dp[0] - n2 * dc[0]) * n3, (n1 * dp[1] - n2 * dc[1]) * n3]

def is_point_inside_halfplane(cp1, cp2, p):
    return (cp2[0] - cp1[0]) * (p[1] - cp1[1]) - (cp2[1] - cp1[1]) * (p[0] - cp1[0]) >= -1e-12

def compute_polygon_intersection(poly1, poly2):
    """
    Computes geometric intersection polygon of two 2D polygons [[lat, lng], ...]
    using Sutherland-Hodgman clipping algorithm.
    Returns (intersection_coords, overlap_sqm).
    """
    if not poly1 or not poly2 or len(poly1) < 3 or len(poly2) < 3:
        return None, 0.0

    p1 = list(poly1)[:-1] if poly1[0] == poly1[-1] else list(poly1)
    p2 = list(poly2)[:-1] if poly2[0] == poly2[-1] else list(poly2)

    # Bounding box quick rejection
    min_lat_1 = min(p[0] for p in p1)
    max_lat_1 = max(p[0] for p in p1)
    min_lng_1 = min(p[1] for p in p1)
    max_lng_1 = max(p[1] for p in p1)

    min_lat_2 = min(p[0] for p in p2)
    max_lat_2 = max(p[0] for p in p2)
    min_lng_2 = min(p[1] for p in p2)
    max_lng_2 = max(p[1] for p in p2)

    if (max_lat_1 < min_lat_2 or min_lat_1 > max_lat_2 or
        max_lng_1 < min_lng_2 or min_lng_1 > max_lng_2):
        return None, 0.0

    # Ensure clip polygon is counter-clockwise
    area_c = 0.0
    for i in range(len(p2)):
        j = (i + 1) % len(p2)
        area_c += p2[i][0] * p2[j][1] - p2[j][0] * p2[i][1]
    clip_pts = list(reversed(p2)) if area_c < 0 else list(p2)

    output_list = list(p1)
    for i in range(len(clip_pts)):
        cp1 = clip_pts[i]
        cp2 = clip_pts[(i + 1) % len(clip_pts)]
        input_list = list(output_list)
        output_list = []
        if not input_list:
            break
        s = input_list[-1]
        for e in input_list:
            if is_point_inside_halfplane(cp1, cp2, e):
                if not is_point_inside_halfplane(cp1, cp2, s):
                    output_list.append(line_segment_intersection(s, e, cp1, cp2))
                output_list.append(e)
            elif is_point_inside_halfplane(cp1, cp2, s):
                output_list.append(line_segment_intersection(s, e, cp1, cp2))
            s = e

    if not output_list or len(output_list) < 3:
        return None, 0.0

    overlap_area = polygon_area_sqm(output_list)
    # Threshold: filter float precision noise (< 1.0 sq.m.)
    if overlap_area < 1.0:
        return None, 0.0

    clean_intersection = [[round(pt[0], 6), round(pt[1], 6)] for pt in output_list]
    return clean_intersection, overlap_area

def find_cadastral_overlaps(candidate_coords, lgu_code="03215", exclude_pin=None):
    """
    Scans existing active cadastre records in the specified LGU to find any overlapping
    lot boundaries with candidate_coords.
    Returns { has_conflict: bool, conflicts_count: int, candidate_area_sqm: float, conflicts: list }
    """
    if not candidate_coords or len(candidate_coords) < 3:
        return {"has_conflict": False, "conflicts_count": 0, "candidate_area_sqm": 0.0, "conflicts": []}

    candidate_area = polygon_area_sqm(candidate_coords)
    parcels = get_parcels(lgu_code=lgu_code)
    conflicts = []

    for p in parcels:
        pin = p.get("pin")
        if exclude_pin and pin == exclude_pin:
            continue
        p_coords = p.get("coordinates") or []
        if not p_coords or len(p_coords) < 3:
            continue

        intersection_poly, overlap_area = compute_polygon_intersection(candidate_coords, p_coords)
        if overlap_area >= 1.0:
            existing_area = float(p.get("area_sqm") or polygon_area_sqm(p_coords) or 1.0)
            overlap_pct_candidate = min(round((overlap_area / candidate_area * 100.0), 2), 100.0) if candidate_area > 0 else 0.0
            overlap_pct_existing = min(round((overlap_area / existing_area * 100.0), 2), 100.0)

            conflicts.append({
                "pin": pin,
                "td_no": p.get("td_no"),
                "lot_no": p.get("lot_no"),
                "block_no": p.get("block_no", "Blk 01"),
                "section_no": p.get("section_no", "014-A"),
                "owner_name": p.get("owner_name"),
                "classification": p.get("classification"),
                "status": p.get("status"),
                "existing_area_sqm": round(existing_area, 2),
                "overlap_area_sqm": overlap_area,
                "overlap_pct_candidate": overlap_pct_candidate,
                "overlap_pct_existing": overlap_pct_existing,
                "intersection_polygon": intersection_poly
            })

    conflicts.sort(key=lambda x: x["overlap_area_sqm"], reverse=True)
    return {
        "has_conflict": len(conflicts) > 0,
        "conflicts_count": len(conflicts),
        "candidate_area_sqm": candidate_area,
        "conflicts": conflicts
    }

def audit_cadastre_topology(lgu_code="03215"):
    """
    Performs a comprehensive cadastre-wide topology audit across all active parcels
    in an LGU to detect pairwise boundary overlaps, double-titling, and encroachment zones.
    """
    parcels = get_parcels(lgu_code=lgu_code)
    n = len(parcels)
    disputes = []
    unique_conflicted = set()

    for i in range(n):
        p1 = parcels[i]
        c1 = p1.get("coordinates") or []
        if len(c1) < 3:
            continue
        for j in range(i + 1, n):
            p2 = parcels[j]
            c2 = p2.get("coordinates") or []
            if len(c2) < 3:
                continue

            intersection_poly, overlap_area = compute_polygon_intersection(c1, c2)
            if overlap_area >= 1.0:
                unique_conflicted.add(p1["pin"])
                unique_conflicted.add(p2["pin"])
                disputes.append({
                    "lot_a": {
                        "pin": p1["pin"],
                        "lot_no": p1["lot_no"],
                        "owner_name": p1["owner_name"],
                        "area_sqm": p1.get("area_sqm", 0.0)
                    },
                    "lot_b": {
                        "pin": p2["pin"],
                        "lot_no": p2["lot_no"],
                        "owner_name": p2["owner_name"],
                        "area_sqm": p2.get("area_sqm", 0.0)
                    },
                    "overlap_area_sqm": overlap_area,
                    "intersection_polygon": intersection_poly
                })

    disputes.sort(key=lambda x: x["overlap_area_sqm"], reverse=True)
    health_pct = round(((n - len(unique_conflicted)) / n * 100.0), 1) if n > 0 else 100.0

    return {
        "lgu_code": lgu_code,
        "total_parcels": n,
        "conflicts_found": len(disputes),
        "conflicted_parcels_count": len(unique_conflicted),
        "topology_health_pct": health_pct,
        "disputes": disputes
    }


def prs92_grid_to_lat_lng(northing, easting):
    lat = northing / 110574.0
    lat_rad = math.radians(lat)
    meters_per_lng_deg = 111320.0 * math.cos(lat_rad)
    lng = 121.0 + ((easting - 500000.0) / meters_per_lng_deg)
    return round(lat, 6), round(lng, 6)


def haversine_distance_m(lat1, lng1, lat2, lng2):
    R = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lng2 - lng1)
    a = math.sin(delta_phi / 2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0)**2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(R * c, 2)


def point_to_line_segment_distance_m(p_lat, p_lng, a_lat, a_lng, b_lat, b_lng):
    pn, pe = lat_lng_to_prs92_grid(p_lat, p_lng)
    an, ae = lat_lng_to_prs92_grid(a_lat, a_lng)
    bn, be = lat_lng_to_prs92_grid(b_lat, b_lng)
    dx = be - ae
    dy = bn - an
    seg_len_sq = dx * dx + dy * dy
    if seg_len_sq < 1e-6:
        return math.sqrt((pe - ae)**2 + (pn - an)**2)
    t = max(0.0, min(1.0, ((pe - ae) * dx + (pn - an) * dy) / seg_len_sq))
    proj_e = ae + t * dx
    proj_n = an + t * dy
    return round(math.sqrt((pe - proj_e)**2 + (pn - proj_n)**2), 2)


def generate_point_buffer_polygon(lat, lng, radius_m, num_points=36):
    pts = []
    lat_rad = math.radians(lat)
    m_per_lat = 110574.0
    m_per_lng = 111320.0 * math.cos(lat_rad)
    for i in range(num_points):
        angle = math.radians(i * (360.0 / num_points))
        d_lat = (radius_m * math.cos(angle)) / m_per_lat
        d_lng = (radius_m * math.sin(angle)) / m_per_lng
        pts.append([round(lat + d_lat, 6), round(lng + d_lng, 6)])
    pts.append(pts[0])
    return pts


def generate_corridor_buffer_polygon(coords, buffer_m):
    if not coords or len(coords) < 2:
        return []
    left_pts = []
    right_pts = []
    grid_pts = [lat_lng_to_prs92_grid(c[0], c[1]) for c in coords]
    n = len(grid_pts)
    for i in range(n - 1):
        n1, e1 = grid_pts[i]
        n2, e2 = grid_pts[i + 1]
        dn = n2 - n1
        de = e2 - e1
        length = math.sqrt(dn * dn + de * de)
        if length < 1e-6:
            continue
        un = -de / length
        ue = dn / length
        left_pts.append((n1 + buffer_m * un, e1 + buffer_m * ue))
        right_pts.append((n1 - buffer_m * un, e1 - buffer_m * ue))
        if i == n - 2:
            left_pts.append((n2 + buffer_m * un, e2 + buffer_m * ue))
            right_pts.append((n2 - buffer_m * un, e2 - buffer_m * ue))

    corridor_grid = left_pts + list(reversed(right_pts))
    result_lat_lng = [prs92_grid_to_lat_lng(pt[0], pt[1]) for pt in corridor_grid]
    if result_lat_lng and result_lat_lng[0] != result_lat_lng[-1]:
        result_lat_lng.append(result_lat_lng[0])
    return [[pt[0], pt[1]] for pt in result_lat_lng]


def get_spatial_presets():
    """
    Returns available predefined spatial reference corridors and hazard lines.
    """
    return PROVINCIAL_SPATIAL_PRESETS


def query_spatial_buffer(buffer_params, officer_username="system", officer_badge="PGI-GIS-014", ip=None):
    """
    Executes geodetic spatial proximity query for a corridor or radial point against active cadastral parcels.
    Computes intersected lots, distance offsets, and aggregated impact telemetry.
    """
    preset_id = buffer_params.get("preset_id")
    feature_type = buffer_params.get("feature_type", "corridor")
    buffer_distance_m = float(buffer_params.get("buffer_distance_m", 500.0))
    lgu_code = buffer_params.get("lgu_code", "03215")
    target_pin = buffer_params.get("target_pin")

    source_name = "Custom Spatial Buffer"
    source_category = "Spatial Proximity Zone"
    source_statutory = "R.A. 7160 Local Government Code"
    source_coords = []

    # 1. Resolve source geometry
    if preset_id:
        norm_id = str(preset_id).lower().replace("preset-", "").replace("-", "_")
        preset = next((p for p in PROVINCIAL_SPATIAL_PRESETS if p["id"] == preset_id or p["id"] == norm_id), None)
        if preset:
            source_name = preset["name"]
            source_category = preset["category"]
            source_statutory = preset["statutory_basis"]
            source_coords = preset["coordinates"]
            feature_type = preset["type"]
    elif target_pin:
        target_p = get_parcel_by_pin(target_pin)
        if target_p:
            source_name = f"Radial Buffer from {target_p.get('lot_no', target_pin)} ({target_p.get('owner_name')})"
            source_category = "Parcel Proximity Analysis"
            feature_type = "point"
            center_lat = target_p["lat"]
            center_lng = target_p["lng"]
            source_coords = [[center_lat, center_lng]]
    elif buffer_params.get("center_lat") and buffer_params.get("center_lng"):
        center_lat = float(buffer_params["center_lat"])
        center_lng = float(buffer_params["center_lng"])
        source_name = f"Radial Point ({center_lat:.4f}° N, {center_lng:.4f}° E)"
        source_category = "Point Proximity Radius"
        feature_type = "point"
        source_coords = [[center_lat, center_lng]]
    elif buffer_params.get("custom_coords"):
        source_coords = buffer_params["custom_coords"]
        source_name = "User-Delineated Corridor"
        feature_type = "corridor"

    # Fallback to Maharlika highway if empty
    if not source_coords:
        preset = PROVINCIAL_SPATIAL_PRESETS[0]
        source_name = preset["name"]
        source_category = preset["category"]
        source_statutory = preset["statutory_basis"]
        source_coords = preset["coordinates"]
        feature_type = "corridor"

    # 2. Generate buffer polygon
    if feature_type == "point" and len(source_coords) > 0:
        c_lat, c_lng = source_coords[0]
        buffer_polygon = generate_point_buffer_polygon(c_lat, c_lng, buffer_distance_m)
    else:
        buffer_polygon = generate_corridor_buffer_polygon(source_coords, buffer_distance_m)

    # 3. Intersect against active parcels
    all_parcels = get_parcels(lgu_code=lgu_code)
    intersected_parcels = []

    for p in all_parcels:
        p_lat = p.get("lat")
        p_lng = p.get("lng")
        coords = p.get("coordinates") or []

        # Compute min distance
        min_dist = 999999.0
        if feature_type == "point" and len(source_coords) > 0:
            c_lat, c_lng = source_coords[0]
            if p_lat is not None and p_lng is not None:
                d_cent = haversine_distance_m(c_lat, c_lng, p_lat, p_lng)
                min_dist = min(min_dist, d_cent)
            for pt in coords:
                d_pt = haversine_distance_m(c_lat, c_lng, pt[0], pt[1])
                min_dist = min(min_dist, d_pt)
        else:
            test_points = []
            if p_lat is not None and p_lng is not None:
                test_points.append([p_lat, p_lng])
            test_points.extend(coords)

            for tp in test_points:
                for k in range(len(source_coords) - 1):
                    a = source_coords[k]
                    b = source_coords[k + 1]
                    d_seg = point_to_line_segment_distance_m(tp[0], tp[1], a[0], a[1], b[0], b[1])
                    min_dist = min(min_dist, d_seg)

        # Check intersection condition
        if min_dist <= buffer_distance_m:
            impact_status = "Direct Right-of-Way" if min_dist <= (buffer_distance_m * 0.35) else "Buffer Impact Zone"
            intersected_parcels.append({
                "pin": p["pin"],
                "lot_no": p.get("lot_no", ""),
                "block_no": p.get("block_no", ""),
                "section_no": p.get("section_no", ""),
                "survey_no": p.get("survey_no", ""),
                "owner_name": p.get("owner_name", ""),
                "owner_address": p.get("owner_address", ""),
                "classification": p.get("classification", "Residential"),
                "actual_use": p.get("actual_use", ""),
                "area_sqm": float(p.get("area_sqm", 0.0)),
                "area_ha": round(float(p.get("area_sqm", 0.0)) / 10000.0, 4),
                "market_value": float(p.get("market_value", 0.0)),
                "assessed_value": float(p.get("assessed_value", 0.0)),
                "tax_due": float(p.get("tax_due", 0.0)),
                "delinquency_status": p.get("delinquency_status", "CURRENT"),
                "distance_to_source_m": round(min_dist, 1),
                "distance_m": round(min_dist, 1),
                "impact_status": impact_status
            })

    # Sort by distance
    intersected_parcels.sort(key=lambda x: x["distance_to_source_m"])

    # 4. Aggregate telemetry
    tot_parcels = len(intersected_parcels)
    tot_area_sqm = sum(x["area_sqm"] for x in intersected_parcels)
    tot_mv = sum(x["market_value"] for x in intersected_parcels)
    tot_av = sum(x["assessed_value"] for x in intersected_parcels)
    tot_tax = sum(x["tax_due"] for x in intersected_parcels)
    unique_owners = len(set(x["owner_name"] for x in intersected_parcels))

    class_counts = {}
    for x in intersected_parcels:
        c_name = x["classification"]
        class_counts[c_name] = class_counts.get(c_name, 0) + 1

    clean_lgu = lgu_code if lgu_code != "ALL" else "03215"
    report_no = f"SP-2026-{clean_lgu}-{secrets.token_hex(3).upper()}"

    summary = {
        "report_no": report_no,
        "source_name": source_name,
        "source_category": source_category,
        "statutory_basis": source_statutory,
        "buffer_distance_m": buffer_distance_m,
        "lgu_code": lgu_code,
        "total_impacted_parcels": tot_parcels,
        "total_intersected_parcels": tot_parcels,
        "total_affected_area_sqm": round(tot_area_sqm, 2),
        "total_affected_area_ha": round(tot_area_sqm / 10000.0, 4),
        "total_affected_market_value": round(tot_mv, 2),
        "total_market_value": round(tot_mv, 2),
        "total_affected_assessed_value": round(tot_av, 2),
        "total_assessed_value": round(tot_av, 2),
        "total_affected_tax_due": round(tot_tax, 2),
        "unique_owners_count": unique_owners,
        "classification_breakdown": class_counts,
        "breakdown_by_classification": class_counts
    }

    # GeoJSON Feature for Map Rendering
    buffer_geojson = {
        "type": "Feature",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[pt[1], pt[0]] for pt in buffer_polygon]]
        },
        "properties": {
            "report_no": report_no,
            "source_name": source_name,
            "buffer_distance_m": buffer_distance_m,
            "feature_type": feature_type,
            "impacted_count": tot_parcels
        }
    }

    # Audit log
    audit_details = (
        f"Executed spatial buffer query on '{source_name}' ({buffer_distance_m}m radius). "
        f"Detected {tot_parcels} intersected cadastral parcels ({summary['total_affected_area_ha']} ha, "
        f"AV: PHP {tot_av:,.2f}). Report #{report_no}. Officer: {officer_badge}."
    )
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO audit_logs (username, action, details, ip_address)
    VALUES (?, 'SPATIAL_BUFFER_QUERIED', ?, ?)
    """, (officer_username, audit_details, ip))
    conn.commit()
    conn.close()

    return {
        "success": True,
        "report_no": report_no,
        "source_name": source_name,
        "source_category": source_category,
        "statutory_basis": source_statutory,
        "buffer_distance_m": buffer_distance_m,
        "date_generated": datetime.now().strftime("%B %d, %Y"),
        "buffer_geojson": buffer_geojson,
        "intersected_parcels": intersected_parcels,
        "summary": summary
    }


if __name__ == "__main__":
    init_db()
    print("Database initialized successfully at:", DB_PATH)
