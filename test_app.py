import sys
from app import app

client = app.test_client()

print("Running automated verification tests...")

# 1. Test Login Page GET & Video Integration
resp = client.get('/login')
assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
assert b"Tax Mapping System" in resp.data
assert b"Inter" in resp.data
assert b"Geist+Mono" in resp.data
assert b"taxmap-video" in resp.data
assert b"taxmap.mp4" in resp.data
print("[PASS] /login GET test passed with taxmap.mp4 video integration")

# 1b. Test Video Stream Endpoint
resp_vid = client.get('/taxmap.mp4')
assert resp_vid.status_code in [200, 206], f"Expected 200/206, got {resp_vid.status_code}"
assert "video/mp4" in resp_vid.headers.get("Content-Type", "")
print("[PASS] /taxmap.mp4 video stream endpoint verified")

# 2. Test Invalid Login
resp_bad = client.post('/api/login', json={'username': 'wrong', 'password': 'bad'})
assert resp_bad.status_code == 401
print("[PASS] Invalid login rejection test passed")

# 3. Test Valid Login for each seeded role
roles_to_test = [
    ("assessor.pgi", "IsabelaAssessor2026!", "PGI-ASR-001"),
    ("taxmapper.gis", "IsabelaGIS#2026", "PGI-GIS-014"),
    ("appraiser.ilagan", "Appraise2026!", "LGU-ILG-089"),
    ("records.inquiry", "Records2026!", "PGI-REC-005")
]

for username, password, expected_badge in roles_to_test:
    resp_good = client.post('/api/login', json={'username': username, 'password': password})
    assert resp_good.status_code == 200
    data = resp_good.get_json()
    assert data['success'] is True
    assert data['user']['badge_no'] == expected_badge
    print(f"[PASS] Valid login test passed for {username} -> {data['user']['full_name']} ({expected_badge})")

# 4. Test System Status API
resp_sys = client.get('/api/system/status')
assert resp_sys.status_code == 200
sys_data = resp_sys.get_json()
assert sys_data['lgus_online'] == 37
assert sys_data['total_parcels_indexed'] > 400000
print(f"[PASS] /api/system/status test passed: {sys_data['lgus_online']} LGUs, {sys_data['total_parcels_indexed']} parcels")

# 5. Test LGUs API
resp_lgus = client.get('/api/lgus')
assert resp_lgus.status_code == 200
lgu_data = resp_lgus.get_json()
assert len(lgu_data['lgus']) == 37
print(f"[PASS] /api/lgus test passed: 37 LGUs retrieved successfully")

# 6. Test Dashboard GET with Left Sidebar & Leaflet Map
resp_dash = client.get('/dashboard')
assert resp_dash.status_code == 200
assert b"app-sidebar" in resp_dash.data
assert b"Cadastral Tax Map" in resp_dash.data
assert b"sidebar-lgu-select" in resp_dash.data
assert b"parcel-inspector-panel" in resp_dash.data
assert b"leaflet-map" in resp_dash.data
assert b"leaflet.js" in resp_dash.data
assert b"leaflet.css" in resp_dash.data
print("[PASS] /dashboard with Left Sidebar Navigation & Leaflet Map passed")

# 7. Test Parcels API (Query all with geographic coordinates)
resp_parcels = client.get('/api/parcels?lgu=03215')
assert resp_parcels.status_code == 200
pdata = resp_parcels.get_json()
assert pdata['count'] > 0
assert 'coordinates' in pdata['parcels'][0]
assert len(pdata['parcels'][0]['coordinates']) > 0
print(f"[PASS] /api/parcels test passed: {pdata['count']} parcels with geographic coordinates in Ilagan City")

# 8. Test Single Parcel Lookup API
target_pin = "032-15-0001-042-18"
resp_single = client.get(f'/api/parcels/{target_pin}')
assert resp_single.status_code == 200
sdata = resp_single.get_json()
assert sdata['success'] is True
assert sdata['parcel']['lot_no'] == "Lot 42-18"
assert sdata['parcel']['owner_name'] == "Provincial Government of Isabela"
# 9. Test Cadastral Workbench Elements in /dashboard
resp_dash_wb = client.get('/dashboard')
assert resp_dash_wb.status_code == 200
assert b"Cadastral Workbench" in resp_dash_wb.data
assert b"turf.min.js" in resp_dash_wb.data
assert b"workbench-panel" in resp_dash_wb.data
assert b"btn-open-workbench" in resp_dash_wb.data
assert b"workbench-hud" in resp_dash_wb.data
print("[PASS] /dashboard Cadastral Workbench UI & Turf.js integration verified")

# 10. Test Subdivision API Validation Rejections
resp_wb_bad = client.post('/api/parcels/subdivide', json={'parent_pin': ''})
assert resp_wb_bad.status_code == 400
resp_wb_bad2 = client.post('/api/parcels/subdivide', json={'parent_pin': '032-15-0001-042-19', 'subdivisions': [{'suffix': 'A'}]})
assert resp_wb_bad2.status_code == 400
print("[PASS] /api/parcels/subdivide payload validation tests passed")

# 11. Test Successful Parcel Subdivision Transaction
parent_test_pin = "032-15-0001-042-19"
subdivide_payload = {
    "parent_pin": parent_test_pin,
    "subdivisions": [
        {
            "suffix": "A",
            "pin": f"{parent_test_pin}-A",
            "lot_no": "Lot 42-19-A",
            "owner_name": "Isabela Sports Commission - Arena North",
            "area_sqm": 16200.0,
            "coordinates": [
                [16.9748, 121.8168],
                [16.9754, 121.8188],
                [16.9745, 121.8191],
                [16.9739, 121.8171]
            ]
        },
        {
            "suffix": "B",
            "pin": f"{parent_test_pin}-B",
            "lot_no": "Lot 42-19-B",
            "owner_name": "Provincial Youth & Athletics Training Center",
            "area_sqm": 16200.0,
            "coordinates": [
                [16.9739, 121.8171],
                [16.9745, 121.8191],
                [16.9736, 121.8194],
                [16.9730, 121.8174]
            ]
        }
    ]
}

resp_sub = client.post('/api/parcels/subdivide', json=subdivide_payload)
assert resp_sub.status_code == 200, f"Expected 200, got {resp_sub.status_code}: {resp_sub.data}"
sub_data = resp_sub.get_json()
assert sub_data['success'] is True
assert len(sub_data['created_parcels']) == 2
assert sub_data['created_parcels'][0]['pin'] == f"{parent_test_pin}-A"
assert sub_data['created_parcels'][1]['pin'] == f"{parent_test_pin}-B"
assert sub_data['created_parcels'][0]['area_sqm'] == 16200.0
assert sub_data['created_parcels'][1]['area_sqm'] == 16200.0
print(f"[PASS] /api/parcels/subdivide successfully subdivided {parent_test_pin} into 2 child parcels")

# Verify parent parcel cancelled
resp_parent = client.get(f'/api/parcels/{parent_test_pin}')
assert resp_parent.status_code == 200
pdata = resp_parent.get_json()
assert "Cancelled" in pdata['parcel']['status']
print(f"[PASS] Parent parcel status verified as '{pdata['parcel']['status']}'")

# Verify active cadastre roll has children but not cancelled parent
resp_active = client.get('/api/parcels?lgu=03215')
active_pins = [p['pin'] for p in resp_active.get_json()['parcels']]
assert f"{parent_test_pin}-A" in active_pins
assert f"{parent_test_pin}-B" in active_pins
assert parent_test_pin not in active_pins
print("[PASS] Active cadastre correctly displays new child parcels and filters cancelled parent")

# Verify audit trail logged
from database import get_db
conn = get_db()
cur = conn.cursor()
cur.execute("SELECT * FROM audit_logs WHERE action = 'PARCEL_SUBDIVISION' ORDER BY id DESC LIMIT 1")
audit_entry = cur.fetchone()
conn.close()
assert audit_entry is not None
assert parent_test_pin in audit_entry['details']
print(f"[PASS] Audit trail verified: '{audit_entry['details']}'")

# 12. Test Add New Cadastral Parcel (Square Lot) API
new_lot_payload = {
    "pin": "032-15-0001-046-01",
    "lot_no": "Lot 46-01",
    "section_no": "014-A",
    "block_no": "Blk 09",
    "survey_no": "Cad 211",
    "owner_name": "Gabriel M. Mendoza & Family",
    "owner_address": "Capitol Ridge Extension, Ilagan City",
    "classification": "Residential",
    "actual_use": "Residential Home Lot",
    "unit_value": 3000.0,
    "area_sqm": 2500.0,
    "coordinates": [
        [16.9710, 121.8150],
        [16.9715, 121.8150],
        [16.9715, 121.8155],
        [16.9710, 121.8155]
    ]
}

resp_add = client.post('/api/parcels', json=new_lot_payload)
assert resp_add.status_code == 201, f"Expected 201, got {resp_add.status_code}: {resp_add.data}"
add_data = resp_add.get_json()
assert add_data['success'] is True
assert add_data['parcel']['pin'] == "032-15-0001-046-01"
assert add_data['parcel']['area_sqm'] == 2500.0
assert add_data['parcel']['market_value'] == 7500000.0 # 2500 * 3000
assert add_data['parcel']['assessed_value'] == 1500000.0 # 20% of 7.5M
print("[PASS] /api/parcels POST (Add New Lot) test passed")

# Verify query includes newly created parcel
resp_lookup = client.get('/api/parcels/032-15-0001-046-01')
assert resp_lookup.status_code == 200
assert resp_lookup.get_json()['parcel']['owner_name'] == "Gabriel M. Mendoza & Family"
print("[PASS] Newly added parcel verified via GET /api/parcels/032-15-0001-046-01")

# Verify audit log for parcel creation
conn = get_db()
cur = conn.cursor()
cur.execute("SELECT * FROM audit_logs WHERE action = 'PARCEL_CREATED' ORDER BY id DESC LIMIT 1")
log_created = cur.fetchone()
assert log_created is not None
assert "032-15-0001-046-01" in log_created['details']
print(f"[PASS] Audit trail verified for PARCEL_CREATED: '{log_created['details']}'")

# 13. Test Delete Cadastral Parcel API
resp_del = client.delete('/api/parcels/032-15-0001-046-01')
assert resp_del.status_code == 200, f"Expected 200, got {resp_del.status_code}: {resp_del.data}"
del_data = resp_del.get_json()
assert del_data['success'] is True
assert del_data['deleted_pin'] == "032-15-0001-046-01"
print("[PASS] /api/parcels/<pin> DELETE test passed")

# Verify parcel is removed
resp_lookup_deleted = client.get('/api/parcels/032-15-0001-046-01')
assert resp_lookup_deleted.status_code == 404
print("[PASS] Deleted parcel confirmed removed from active cadastre lookup")

# Verify audit log for parcel deletion
cur.execute("SELECT * FROM audit_logs WHERE action = 'PARCEL_DELETED' ORDER BY id DESC LIMIT 1")
log_deleted = cur.fetchone()
conn.close()
assert log_deleted is not None
assert "032-15-0001-046-01" in log_deleted['details']
print(f"[PASS] Audit trail verified for PARCEL_DELETED: '{log_deleted['details']}'")

# 14. Test Map Details Registration (with LGU code, name, and geodetic coordinates)
map_lot_payload = {
    "pin": "032-08-0001-046-02",
    "lot_no": "Lot 46-02",
    "section_no": "014-A",
    "block_no": "Blk 08",
    "survey_no": "Cad 211",
    "owner_name": "Cauayan Agro-Commercial Holdings",
    "owner_address": "Barangay District 1, Cauayan City, Isabela",
    "classification": "Commercial",
    "actual_use": "Commercial Real Property",
    "unit_value": 4500.0,
    "area_sqm": 3200.0,
    "lgu_code": "03208",
    "lgu_name": "Cauayan City",
    "lat": 16.9338,
    "lng": 121.7672,
    "coordinates": [
        [16.9335, 121.7668],
        [16.9341, 121.7669],
        [16.9340, 121.7676],
        [16.9334, 121.7674]
    ]
}

resp_map_lot = client.post('/api/parcels', json=map_lot_payload)
assert resp_map_lot.status_code == 201, f"Expected 201, got {resp_map_lot.status_code}: {resp_map_lot.data}"
map_lot_data = resp_map_lot.get_json()
assert map_lot_data['success'] is True
assert map_lot_data['parcel']['pin'] == "032-08-0001-046-02"
assert map_lot_data['parcel']['lgu_code'] == "03208"
assert map_lot_data['parcel']['lgu_name'] == "Cauayan City"
assert map_lot_data['parcel']['market_value'] == 3200.0 * 4500.0
assert map_lot_data['parcel']['assessed_value'] == (3200.0 * 4500.0) * 0.50
print("[PASS] Registration based on map details (Cauayan City 03208) verified")

# Clean up test parcel
resp_del_map_lot = client.delete('/api/parcels/032-08-0001-046-02')
assert resp_del_map_lot.status_code == 200

# 15. Test Registration with Custom Market Value, Assessed Value, and Estimated Tax Due
custom_val_payload = {
    "pin": "032-15-0001-046-03",
    "lot_no": "Lot 46-03",
    "section_no": "014-A",
    "block_no": "Blk 08",
    "survey_no": "Cad 211",
    "owner_name": "Don Teodoro V. Albano",
    "owner_address": "Barangay Alibagu, City of Ilagan, Isabela",
    "classification": "Residential",
    "actual_use": "Residential Estate",
    "unit_value": 3000.0,
    "area_sqm": 1200.0,
    "market_value": 4500000.0,    # Custom override
    "assessed_value": 900000.0,    # Custom override
    "tax_due": 18000.0,            # Custom override
    "lgu_code": "03215",
    "lgu_name": "Ilagan City",
    "coordinates": [
        [16.9740, 121.8140],
        [16.9745, 121.8140],
        [16.9745, 121.8145],
        [16.9740, 121.8145]
    ]
}

resp_custom_val = client.post('/api/parcels', json=custom_val_payload)
assert resp_custom_val.status_code == 201, f"Expected 201, got {resp_custom_val.status_code}: {resp_custom_val.data}"
custom_val_data = resp_custom_val.get_json()
assert custom_val_data['success'] is True
assert custom_val_data['parcel']['market_value'] == 4500000.0
assert custom_val_data['parcel']['assessed_value'] == 900000.0
assert custom_val_data['parcel']['tax_due'] == 18000.0
print("[PASS] Registration with custom market_value, assessed_value, and tax_due verified")

# Clean up
resp_del_custom = client.delete('/api/parcels/032-15-0001-046-03')
assert resp_del_custom.status_code == 200

# 16. Test Official Printable Real Property Tax Declaration (TD Certificate) Issuance & Audit Trail
td_test_pin = "032-15-0001-042-18"
resp_td = client.post(f'/api/parcels/{td_test_pin}/issue-td')
assert resp_td.status_code == 200, f"Expected 200, got {resp_td.status_code}: {resp_td.data}"
td_res = resp_td.get_json()
assert td_res['success'] is True
td = td_res['tax_declaration']
assert td['pin'] == td_test_pin
assert td['lot_no'] == "Lot 42-18"
assert td['td_no'].startswith("TD-2026-")
assert td['market_value'] > 0
assert td['assessed_value'] > 0
assert 'basic_tax' in td
assert 'sef_tax' in td
assert 'total_tax' in td
assert td['examiner_name'] == "Engr. Marites D. Pascual"
assert td['assessor_name'] == "ATTY. RODOLFO V. RAMOS, REA, REB"
print(f"[PASS] /api/parcels/{td_test_pin}/issue-td returned valid TD: {td['td_no']}")

# Verify Audit Trail for TD_ISSUED
conn = get_db()
cur = conn.cursor()
cur.execute("SELECT * FROM audit_logs WHERE action = 'TD_ISSUED' ORDER BY id DESC LIMIT 1")
log_td = cur.fetchone()
conn.close()
assert log_td is not None
assert td_test_pin in log_td['details']
assert td['td_no'] in log_td['details']
print(f"[PASS] Audit trail verified for TD_ISSUED: '{log_td['details']}'")

# Verify Dashboard HTML contains Tax Declaration modal, certificate sheet, and print engine
resp_dash_td = client.get('/dashboard')
assert resp_dash_td.status_code == 200
assert b"modal-tax-declaration" in resp_dash_td.data
assert b"btn-print-td" in resp_dash_td.data
assert b"btn-issue-td" in resp_dash_td.data
assert b"tax-declaration-document" in resp_dash_td.data
assert b"td-doc-header" in resp_dash_td.data
assert b"td-signatures-row" in resp_dash_td.data
print("[PASS] /dashboard Tax Declaration certificate sheet and print buttons verified in HTML")

# 17. Test Cadastral Survey Sheet & Metes and Bounds Engine
survey_test_pin = "032-15-0001-042-18"
resp_ss = client.get(f'/api/parcels/{survey_test_pin}/survey-sheet')
assert resp_ss.status_code == 200, f"Expected 200, got {resp_ss.status_code}: {resp_ss.data}"
ss_res = resp_ss.get_json()
assert ss_res['success'] is True
ss = ss_res['survey_sheet']
assert ss['pin'] == survey_test_pin
assert ss['lot_no'] == "Lot 42-18"
assert ss['survey_no'] == "Cad 211"
assert 'metes_and_bounds' in ss
mb = ss['metes_and_bounds']
assert 'tie_line' in mb
assert 'bearing' in mb['tie_line']
assert mb['tie_line']['distance_m'] > 0
assert len(mb['lines']) >= 3
assert len(mb['corners']) >= 3
assert 'N' in mb['lines'][0]['bearing'] or 'S' in mb['lines'][0]['bearing']
print(f"[PASS] /api/parcels/{survey_test_pin}/survey-sheet verified with {len(mb['lines'])} metes & bounds lines, tie line: {mb['tie_line']['bearing']}")

# Verify Audit Trail for SURVEY_SHEET_VIEWED
conn = get_db()
cur = conn.cursor()
cur.execute("SELECT * FROM audit_logs WHERE action = 'SURVEY_SHEET_VIEWED' ORDER BY id DESC LIMIT 1")
log_ss = cur.fetchone()
conn.close()
assert log_ss is not None
assert survey_test_pin in log_ss['details']
print(f"[PASS] Audit trail verified for SURVEY_SHEET_VIEWED: '{log_ss['details']}'")

# Verify Dashboard HTML contains Survey Sheet modal, canvas diagram, and action buttons
resp_dash_ss = client.get('/dashboard')
assert resp_dash_ss.status_code == 200
assert b"btn-open-survey-sheet" in resp_dash_ss.data
assert b"modal-survey-sheet" in resp_dash_ss.data
assert b"survey-document" in resp_dash_ss.data
assert b"survey-lot-diagram-canvas" in resp_dash_ss.data
assert b"btn-copy-tech-desc" in resp_dash_ss.data
assert b"btn-print-survey-sheet" in resp_dash_ss.data
# 18. Test LGU Revenue & Collection Telemetry API & Dashboard HUD
resp_telem = client.get('/api/lgus/03215/collection-telemetry')
assert resp_telem.status_code == 200, f"Expected 200, got {resp_telem.status_code}: {resp_telem.data}"
telem_data = resp_telem.get_json()
assert telem_data['success'] is True
t = telem_data['telemetry']
assert t['lgu_code'] == "03215"
assert t['total_lots'] > 0
assert t['delinquent_count'] >= 1
assert t['total_collectibles'] > 0
assert t['delinquent_principal'] > 0
assert t['delinquent_penalties'] > 0
assert t['total_delinquent_due'] > t['delinquent_principal']
assert 0.0 <= t['collection_rate_pct'] <= 100.0
assert 0.0 <= t['delinquency_rate_pct'] <= 100.0
print(f"[PASS] /api/lgus/03215/collection-telemetry verified: Collectibles PHP {t['total_collectibles']:,.2f}, Delinquent Arrears PHP {t['total_delinquent_due']:,.2f} ({t['delinquent_count']} lots, {t['delinquency_rate_pct']}%)")

# Verify Dashboard HTML contains Collection HUD and Thematic Toggle
resp_dash_thematic = client.get('/dashboard')
assert resp_dash_thematic.status_code == 200
assert b"btn-toggle-thematic" in resp_dash_thematic.data
assert b"collection-hud" in resp_dash_thematic.data
assert b"hud-thematic-legend" in resp_dash_thematic.data
assert b"insp-delinquency-box" in resp_dash_thematic.data
assert b"btn-issue-delinquency" in resp_dash_thematic.data
assert b"modal-tax-delinquency" in resp_dash_thematic.data
assert b"btn-print-delinquency" in resp_dash_thematic.data
assert b"delinquency-document" in resp_dash_thematic.data
print("[PASS] /dashboard Collection HUD, Thematic toggle, and Notice of Delinquency modal verified in HTML")

# 19. Test Official Notice of Real Property Tax Delinquency Issuance & Audit Trail
delinq_test_pin = "032-15-0001-043-01" # North Luzon Agro-Commercial Corp. (2 Yrs Overdue)
resp_nod = client.post(f'/api/parcels/{delinq_test_pin}/issue-delinquency')
assert resp_nod.status_code == 200, f"Expected 200, got {resp_nod.status_code}: {resp_nod.data}"
nod_res = resp_nod.get_json()
assert nod_res['success'] is True
nod = nod_res['notice']
assert nod['notice_no'].startswith("NOD-2026-03215-")
assert nod['taxpayer']['pin'] == delinq_test_pin
assert nod['taxpayer']['owner_name'] == "North Luzon Agro-Commercial Corp."
assert nod['delinquency']['years_overdue'] == 2
assert nod['delinquency']['months_overdue'] == 24
assert nod['delinquency']['penalty_rate_pct'] == 48.0 # 24 mos * 2%/mo
assert nod['delinquency']['penalty_amount'] > 0
assert nod['delinquency']['total_delinquent_due'] == round(nod['delinquency']['principal_due'] + nod['delinquency']['penalty_amount'], 2)
assert len(nod['delinquency']['schedule']) == 2
print(f"[PASS] /api/parcels/{delinq_test_pin}/issue-delinquency issued Notice #{nod['notice_no']} with total due PHP {nod['delinquency']['total_delinquent_due']:,.2f}")

# Verify non-delinquent parcel rejection
exempt_test_pin = "032-15-0001-042-18" # Exempt Government Lot
resp_nod_bad = client.post(f'/api/parcels/{exempt_test_pin}/issue-delinquency')
assert resp_nod_bad.status_code == 400
print(f"[PASS] Notice of Delinquency correctly rejected for exempt lot {exempt_test_pin}")

# Verify Audit Trail for DELINQUENCY_NOTICE_ISSUED
conn = get_db()
cur = conn.cursor()
cur.execute("SELECT * FROM audit_logs WHERE action = 'DELINQUENCY_NOTICE_ISSUED' ORDER BY id DESC LIMIT 1")
log_nod = cur.fetchone()
conn.close()
assert log_nod is not None
assert delinq_test_pin in log_nod['details']
assert nod['notice_no'] in log_nod['details']
print(f"[PASS] Audit trail verified for DELINQUENCY_NOTICE_ISSUED: '{log_nod['details']}'")

# 20. Test Tax Declarations Registry API
resp_td_reg = client.get('/api/tax-declarations?lgu=03215')
assert resp_td_reg.status_code == 200
td_reg_data = resp_td_reg.get_json()
assert td_reg_data['success'] is True
assert len(td_reg_data['tax_declarations']) > 0
first_td = td_reg_data['tax_declarations'][0]
assert 'td_no' in first_td
assert 'pin' in first_td
assert 'owner_name' in first_td
assert 'assessed_value' in first_td
assert 'delinquency_status' in first_td
print(f"[PASS] /api/tax-declarations verified with {len(td_reg_data['tax_declarations'])} declarations indexed for LGU 03215")

# Test filtering by status
resp_td_delinq = client.get('/api/tax-declarations?lgu=03215&status=DELINQUENT')
assert resp_td_delinq.status_code == 200
delinq_tds = resp_td_delinq.get_json()['tax_declarations']
for d in delinq_tds:
    assert d['delinquency_status'] == 'DELINQUENT'
print(f"[PASS] /api/tax-declarations status=DELINQUENT filter verified ({len(delinq_tds)} delinquent records)")

# 21. Test Assessment Roll API
resp_roll = client.get('/api/assessment-roll?lgu=03215')
assert resp_roll.status_code == 200
roll_data = resp_roll.get_json()
assert roll_data['success'] is True
assert 'summary' in roll_data
assert roll_data['summary']['total_parcels'] > 0
assert roll_data['summary']['total_assessed_value'] > 0
assert roll_data['summary']['total_market_value'] > 0
assert roll_data['summary']['taxable_parcels'] > 0
assert roll_data['summary']['exempt_parcels'] > 0
assert len(roll_data['classification_breakdown']) > 0
assert len(roll_data['roll_items']) > 0
print(f"[PASS] /api/assessment-roll verified for {roll_data['lgu_name']} (Total AV: PHP {roll_data['summary']['total_assessed_value']:,.2f}, {len(roll_data['roll_items'])} roll items)")

# 22. Test Audit Logs API
resp_audit = client.get('/api/audit-logs?limit=50')
assert resp_audit.status_code == 200
audit_data = resp_audit.get_json()
assert audit_data['success'] is True
assert audit_data['total'] > 0
assert len(audit_data['logs']) > 0
first_log = audit_data['logs'][0]
assert 'username' in first_log
assert 'action' in first_log
assert 'details' in first_log
assert 'timestamp' in first_log
print(f"[PASS] /api/audit-logs verified with {audit_data['total']} total transaction logs recorded")

# Test Audit Logs action filter
resp_audit_filter = client.get('/api/audit-logs?action=DELINQUENCY_NOTICE_ISSUED')
assert resp_audit_filter.status_code == 200
filtered_logs = resp_audit_filter.get_json()['logs']
assert len(filtered_logs) > 0
for l in filtered_logs:
    assert l['action'] == 'DELINQUENCY_NOTICE_ISSUED'
print(f"[PASS] /api/audit-logs action filter verified ({len(filtered_logs)} DELINQUENCY_NOTICE_ISSUED events)")

# 23. Test Real Property Tax Payment Posting & Audit Trail
pay_pin = "032-15-0001-043-01"
pay_payload = {
    "payor_name": "Atty. Renato C. Panganiban (Legal Counsel)",
    "payment_mode": "MANAGERS_CHECK",
    "reference_no": "LBP-CHK-2026-88912",
    "basic_rpt": 594000.0,
    "sef": 297000.0,
    "penalties": 427680.0,
    "discount": 0.0,
    "period_covered": "Annual 2024-2026 (Delinquent Arrears)"
}

resp_pay = client.post(f'/api/parcels/{pay_pin}/pay-tax', json=pay_payload)
assert resp_pay.status_code == 200, f"Expected 200, got {resp_pay.status_code}: {resp_pay.data}"
pay_result = resp_pay.get_json()
assert pay_result['success'] is True
assert 'or_no' in pay_result
assert pay_result['or_no'].startswith("OR-2026-")
assert pay_result['receipt'] is not None
receipt = pay_result['receipt']
assert receipt['or_no'] == pay_result['or_no']
assert receipt['pin'] == pay_pin
assert receipt['total_amount_paid'] == 1318680.0
assert receipt['payment_mode'] == "MANAGERS_CHECK"
print(f"[PASS] /api/parcels/{pay_pin}/pay-tax posted payment O.R. #{receipt['or_no']} (Total: PHP {receipt['total_amount_paid']:,.2f})")

# Verify parcel status updated to CURRENT / PAID
resp_paid_parcel = client.get(f'/api/parcels/{pay_pin}')
assert resp_paid_parcel.status_code == 200
paid_p = resp_paid_parcel.get_json()['parcel']
assert paid_p['delinquency_status'] == 'CURRENT'
assert paid_p['overdue_months'] == 0
assert 'Paid' in paid_p['status'] or 'Current' in paid_p['status']
print(f"[PASS] Parcel {pay_pin} status verified as '{paid_p['delinquency_status']}' / '{paid_p['status']}'")

# Verify Audit Trail for RPT_PAYMENT_POSTED
conn = get_db()
cur = conn.cursor()
cur.execute("SELECT * FROM audit_logs WHERE action = 'RPT_PAYMENT_POSTED' ORDER BY id DESC LIMIT 1")
log_pay = cur.fetchone()
conn.close()
assert log_pay is not None
assert pay_pin in log_pay['details']
assert receipt['or_no'] in log_pay['details']
print(f"[PASS] Audit trail verified for RPT_PAYMENT_POSTED: '{log_pay['details']}'")

# 24. Test Official Receipt Retrieval API (Accountable Form No. 51-C)
target_or = receipt['or_no']
resp_or = client.get(f'/api/receipts/{target_or}')
assert resp_or.status_code == 200, f"Expected 200, got {resp_or.status_code}: {resp_or.data}"
or_res = resp_or.get_json()
assert or_res['success'] is True
r_data = or_res['receipt']
assert r_data['or_no'] == target_or
assert r_data['pin'] == pay_pin
assert r_data['payor_name'] == "Atty. Renato C. Panganiban (Legal Counsel)"
assert r_data['total_amount_paid'] == 1318680.0
assert "Accountable Form No. 51-C" in r_data['statutory_form']
print(f"[PASS] /api/receipts/{target_or} verified with statutory form: {r_data['statutory_form']}")

# 25. Test Cadastral Vector GeoJSON Export API
resp_geojson = client.get('/api/cadastre/export/geojson?lgu=03215')
assert resp_geojson.status_code == 200, f"Expected 200, got {resp_geojson.status_code}"
assert "attachment;" in resp_geojson.headers.get("Content-Disposition", "")
assert "isabela_cadastre_03215.geojson" in resp_geojson.headers.get("Content-Disposition", "")
geojson = resp_geojson.get_json()
assert geojson['type'] == "FeatureCollection"
assert len(geojson['features']) > 0
first_f = geojson['features'][0]
assert first_f['type'] == "Feature"
assert first_f['geometry']['type'] == "Polygon"
assert len(first_f['geometry']['coordinates'][0]) >= 4 # Closed linear ring
assert 'pin' in first_f['properties']
assert 'assessed_value' in first_f['properties']
assert 'delinquency_status' in first_f['properties']
print(f"[PASS] /api/cadastre/export/geojson verified with {len(geojson['features'])} vector polygons for QGIS/ArcGIS")

# 26. Test Assessment Roll CSV Export API
resp_csv = client.get('/api/cadastre/export/csv?lgu=03215')
assert resp_csv.status_code == 200, f"Expected 200, got {resp_csv.status_code}"
assert "text/csv" in resp_csv.headers.get("Content-Type", "")
assert "isabela_assessment_roll_03215.csv" in resp_csv.headers.get("Content-Disposition", "")
csv_lines = resp_csv.data.decode('utf-8').strip().split("\r\n")
if len(csv_lines) <= 1:
    csv_lines = resp_csv.data.decode('utf-8').strip().split("\n")
assert len(csv_lines) > 1, f"Expected header + rows, got {len(csv_lines)}"
header = csv_lines[0]
assert "PIN" in header
assert "TD_NO" in header
assert "LGU_CODE" in header
assert "OWNER_NAME" in header
assert "ASSESSED_VALUE_PHP" in header
assert "DELINQUENCY_STATUS" in header
print(f"[PASS] /api/cadastre/export/csv verified with header and {len(csv_lines)-1} parcel entries for Excel/Sanggunian")

# 27. Test Real Property Tax Clearance Rejection on Delinquent Parcel
delinq_tc_pin = "032-15-0001-045-02"
resp_tc_bad = client.post(f'/api/parcels/{delinq_tc_pin}/tax-clearance', json={
    "purpose": "Transfer of Ownership / BIR eCAR Application"
})
assert resp_tc_bad.status_code == 400, f"Expected 400, got {resp_tc_bad.status_code}: {resp_tc_bad.data}"
tc_bad_res = resp_tc_bad.get_json()
assert tc_bad_res['success'] is False
assert "Cannot issue Tax Clearance" in tc_bad_res['message']
assert "delinquent" in tc_bad_res['message'].lower()
print(f"[PASS] /api/parcels/{delinq_tc_pin}/tax-clearance properly rejected for delinquent parcel")

# 28. Test Real Property Tax Clearance Issuance for Settled/Paid Parcel
paid_tc_pin = "032-15-0001-043-01"
resp_tc_good = client.post(f'/api/parcels/{paid_tc_pin}/tax-clearance', json={
    "purpose": "Transfer of Ownership / BIR eCAR Application / LRA Title Registration"
})
assert resp_tc_good.status_code == 200, f"Expected 200, got {resp_tc_good.status_code}: {resp_tc_good.data}"
tc_good_res = resp_tc_good.get_json()
assert tc_good_res['success'] is True
clearance = tc_good_res['clearance']
assert clearance['clearance_no'].startswith("RPTC-2026-03215-")
assert clearance['property']['pin'] == paid_tc_pin
assert clearance['tax_status'] == "CURRENT"
assert "FULLY PAID AND SETTLED" in clearance['tax_status_statement']
assert clearance['payment_info']['status'] == "PAID / CURRENT"
assert clearance['payment_info']['latest_or_no'].startswith("OR-2026-")
assert clearance['fees']['clearance_fee'] == 150.00
assert clearance['fees']['doc_stamp_tax'] == 30.00
assert "HON. MARIA CORAZON G. PUA" in clearance['signatories']['provincial_treasurer']['name']
print(f"[PASS] /api/parcels/{paid_tc_pin}/tax-clearance issued Certificate #{clearance['clearance_no']} referencing O.R. #{clearance['payment_info']['latest_or_no']}")

# 29. Verify Audit Trail for TAX_CLEARANCE_ISSUED
conn = get_db()
cur = conn.cursor()
cur.execute("SELECT * FROM audit_logs WHERE action = 'TAX_CLEARANCE_ISSUED' ORDER BY id DESC LIMIT 1")
log_tc = cur.fetchone()
conn.close()
assert log_tc is not None
assert paid_tc_pin in log_tc['details']
assert clearance['clearance_no'] in log_tc['details']
print(f"[PASS] Audit trail verified for TAX_CLEARANCE_ISSUED: '{log_tc['details']}'")

# 30. Test Real Property Tax Clearance Issuance for Exempt Government Parcel
exempt_tc_pin = "032-15-0001-042-18"
resp_tc_exempt = client.post(f'/api/parcels/{exempt_tc_pin}/tax-clearance', json={
    "purpose": "Government Administrative Reference & Record Verification"
})
assert resp_tc_exempt.status_code == 200, f"Expected 200, got {resp_tc_exempt.status_code}: {resp_tc_exempt.data}"
tc_exempt_res = resp_tc_exempt.get_json()
assert tc_exempt_res['success'] is True
exempt_doc = tc_exempt_res['clearance']
assert exempt_doc['tax_status'] == "EXEMPT"
assert "SECTION 234" in exempt_doc['tax_status_statement']
assert exempt_doc['payment_info']['status'] == "EXEMPT"
print(f"[PASS] /api/parcels/{exempt_tc_pin}/tax-clearance verified for exempt entity (Section 234 R.A. 7160)")

# 31. Test Geometry Validation with Clean Disjoint Polygon
clean_coords = [
    [16.9950, 121.8350],
    [16.9960, 121.8350],
    [16.9960, 121.8360],
    [16.9950, 121.8360]
]
resp_geom_clean = client.post('/api/parcels/validate-geometry', json={
    "coordinates": clean_coords,
    "lgu": "03215"
})
assert resp_geom_clean.status_code == 200, f"Expected 200, got {resp_geom_clean.status_code}"
geom_clean_data = resp_geom_clean.get_json()
assert geom_clean_data['success'] is True
assert geom_clean_data['has_conflict'] is False
assert geom_clean_data['conflicts_count'] == 0
assert len(geom_clean_data['conflicts']) == 0
assert geom_clean_data['candidate_area_sqm'] > 0
print(f"[PASS] /api/parcels/validate-geometry passed with clean non-overlapping polygon ({geom_clean_data['candidate_area_sqm']:.2f} sq.m.)")

# 32. Test Geometry Validation with Overlapping Polygon (Encroachment Detection)
# Coordinates overlapping Isabela Provincial Capitol parcel (032-15-0001-042-18)
overlap_coords = [
    [16.9740, 121.8140],
    [16.9760, 121.8140],
    [16.9760, 121.8160],
    [16.9740, 121.8160]
]
resp_geom_overlap = client.post('/api/parcels/validate-geometry', json={
    "coordinates": overlap_coords,
    "lgu": "03215"
})
assert resp_geom_overlap.status_code == 200, f"Expected 200, got {resp_geom_overlap.status_code}"
geom_overlap_data = resp_geom_overlap.get_json()
assert geom_overlap_data['success'] is True
assert geom_overlap_data['has_conflict'] is True
assert geom_overlap_data['conflicts_count'] >= 1
conflicted_pins = [c['pin'] for c in geom_overlap_data['conflicts']]
assert "032-15-0001-042-18" in conflicted_pins, f"Expected Capitol PIN in conflicts, got {conflicted_pins}"
primary_conflict = next(c for c in geom_overlap_data['conflicts'] if c['pin'] == "032-15-0001-042-18")
assert primary_conflict['overlap_area_sqm'] > 1.0
assert primary_conflict['owner_name'] == "Provincial Government of Isabela"
assert len(primary_conflict['intersection_polygon']) >= 3
print(f"[PASS] /api/parcels/validate-geometry accurately detected {primary_conflict['overlap_area_sqm']:.2f} sq.m. encroachment on {primary_conflict['pin']} ({primary_conflict['owner_name']})")

# 33. Test Cadastre Topology Audit API
resp_conflicts = client.get('/api/cadastre/conflicts?lgu=03215')
assert resp_conflicts.status_code == 200, f"Expected 200, got {resp_conflicts.status_code}"
conflicts_data = resp_conflicts.get_json()
assert conflicts_data['success'] is True
report = conflicts_data['report']
assert report['lgu_code'] == "03215"
assert report['total_parcels'] > 0
assert 'topology_health_pct' in report
assert 'conflicts_found' in report
assert 'disputes' in report
print(f"[PASS] /api/cadastre/conflicts verified: {report['total_parcels']} parcels audited, {report['topology_health_pct']}% topology health, {report['conflicts_found']} conflicts")

# 34. Test Dashboard UI Integration for Topology Engine Elements
resp_dash_topo = client.get('/dashboard')
assert resp_dash_topo.status_code == 200
assert b"btn-scan-conflicts" in resp_dash_topo.data
assert b"modal-cadastral-conflicts" in resp_dash_topo.data
assert b"reg-encroachment-alert" in resp_dash_topo.data
assert b"reg-dispute-waiver" in resp_dash_topo.data
print("[PASS] Dashboard UI verified with #btn-scan-conflicts, #modal-cadastral-conflicts, and #reg-encroachment-alert")

print("\nALL 34 VERIFICATION TESTS PASSED SUCCESSFULLY!")
