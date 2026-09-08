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

# 35. Test Transfer of Ownership (Deed of Sale Conveyance) API
xfer_test_pin = "032-15-0001-039-11"
xfer_payload = {
    "new_owner_name": "Juan D. Cruz",
    "new_owner_address": "Brgy. San Antonio, Ilagan City, Isabela",
    "new_owner_tin": "123-456-789-000",
    "deed_type": "Deed of Absolute Sale",
    "deed_no": "DS-2026-00145",
    "deed_date": "2026-08-15",
    "registry_of_deeds": "RD Ilagan City",
    "tct_oct_no": "TCT-T-123456",
    "inscription_date": "2026-08-20",
    "bir_car_no": "eCAR-2026-0891245",
    "bir_car_date": "2026-08-18",
    "transfer_tax_or_no": "OR-2026-PGI-04521",
    "transfer_tax_amount": 15000.00,
    "transfer_tax_date": "2026-08-22"
}
resp_xfer = client.post(f'/api/parcels/{xfer_test_pin}/transfer-ownership', json=xfer_payload)
assert resp_xfer.status_code == 200, f"Expected 200, got {resp_xfer.status_code}: {resp_xfer.data}"
xfer_res = resp_xfer.get_json()
assert xfer_res['success'] is True
xfer = xfer_res['transfer']
assert xfer['pin'] == xfer_test_pin
assert xfer['new_owner_name'] == "Juan D. Cruz"
assert xfer['new_td_no'].startswith("TD-2026-03215-TR")
assert xfer['transfer_ref'].startswith("TOT-2026-03215-")
assert xfer['deed_type'] == "Deed of Absolute Sale"
print(f"[PASS] /api/parcels/{xfer_test_pin}/transfer-ownership transferred title to '{xfer['new_owner_name']}' under {xfer['new_td_no']}")

# 36. Test Transfer Rejection on Delinquent Parcel
delinq_xfer_pin = "032-15-0001-045-02"
resp_xfer_bad = client.post(f'/api/parcels/{delinq_xfer_pin}/transfer-ownership', json={
    "new_owner_name": "Maria L. Santos"
})
assert resp_xfer_bad.status_code == 400, f"Expected 400, got {resp_xfer_bad.status_code}: {resp_xfer_bad.data}"
xfer_bad_res = resp_xfer_bad.get_json()
assert xfer_bad_res['success'] is False
assert "delinquent" in xfer_bad_res['message'].lower()
assert "tax clearance" in xfer_bad_res['message'].lower()
print(f"[PASS] /api/parcels/{delinq_xfer_pin}/transfer-ownership properly blocked for delinquent lot")

# 37. Test Ownership History / Chain of Title API
resp_hist = client.get(f'/api/parcels/{xfer_test_pin}/ownership-history')
assert resp_hist.status_code == 200, f"Expected 200, got {resp_hist.status_code}: {resp_hist.data}"
hist_res = resp_hist.get_json()
assert hist_res['success'] is True
assert hist_res['pin'] == xfer_test_pin
chain = hist_res['chain']
assert len(chain) >= 2
assert chain[0]['sequence_no'] == 1
assert chain[0]['deed_type'] == "Original Title"
last_record = chain[-1]
assert last_record['sequence_no'] >= 2
assert last_record['owner_name'] == "Juan D. Cruz"
assert last_record['tct_oct_no'] == "TCT-T-123456"
assert last_record['bir_car_no'] == "eCAR-2026-0891245"
print(f"[PASS] /api/parcels/{xfer_test_pin}/ownership-history verified with {len(chain)} sequential records in title chain")

# 38. Verify Audit Trail for OWNERSHIP_TRANSFERRED
conn = get_db()
cur = conn.cursor()
cur.execute("SELECT * FROM audit_logs WHERE action = 'OWNERSHIP_TRANSFERRED' ORDER BY id DESC LIMIT 1")
log_xfer = cur.fetchone()
conn.close()
assert log_xfer is not None
assert xfer_test_pin in log_xfer['details']
assert "Juan D. Cruz" in log_xfer['details']
assert "PGI-REC-005" in log_xfer['details']
print(f"[PASS] Audit trail verified for OWNERSHIP_TRANSFERRED: '{log_xfer['details']}'")

# 39. Test Dashboard UI Integration for Transfer of Ownership Modals & Buttons
resp_dash_xfer = client.get('/dashboard')
assert resp_dash_xfer.status_code == 200
assert b"btn-transfer-ownership" in resp_dash_xfer.data
assert b"modal-transfer-ownership" in resp_dash_xfer.data
assert b"modal-transfer-certificate" in resp_dash_xfer.data
assert b"modal-ownership-history" in resp_dash_xfer.data
print("[PASS] Dashboard UI verified with #btn-transfer-ownership, #modal-transfer-ownership, #modal-transfer-certificate, and #modal-ownership-history")

# 40. Test Schedule of Market Values (SMV) Benchmark Rates API
resp_smv = client.get('/api/smv/rates')
assert resp_smv.status_code == 200, f"Expected 200, got {resp_smv.status_code}: {resp_smv.data}"
smv_data = resp_smv.get_json()
assert smv_data['success'] is True
assert "rates" in smv_data
rates = smv_data['rates']
assert "Residential" in rates
assert "Commercial" in rates
assert "Agricultural" in rates
assert rates['Residential']['assessment_level'] == 20.0
assert rates['Commercial']['assessment_level'] == 50.0
assert len(rates['Commercial']['benchmark_unit_values']) >= 3
print(f"[PASS] /api/smv/rates verified with {len(rates)} standard land classifications and SMV benchmarks")

# 41. Test Land Reclassification & General Revision (GR) Adjustment API
reclass_test_pin = "032-15-0001-044-05" # Villa Alibagu Homeowners Assn. (Residential Lot)
reclass_payload = {
    "new_classification": "Commercial",
    "new_actual_use": "Commercial Retail & Warehouse Hub",
    "new_unit_value": 6500.00,
    "new_assessment_level": 50.0,
    "reason": "Land Use Reclassification / Zoning Conversion",
    "ordinance_no": "Sangguniang Panlalawigan Ordinance No. 2026-04 (General Revision SMV)"
}
resp_reclass = client.post(f'/api/parcels/{reclass_test_pin}/reclassify', json=reclass_payload)
assert resp_reclass.status_code == 200, f"Expected 200, got {resp_reclass.status_code}: {resp_reclass.data}"
reclass_res = resp_reclass.get_json()
assert reclass_res['success'] is True
rev = reclass_res['revision']
assert rev['pin'] == reclass_test_pin
assert rev['new_classification'] == "Commercial"
assert rev['new_market_value'] == round(18200.0 * 6500.0, 2)
assert rev['new_assessed_value'] == round(rev['new_market_value'] * 0.5, 2)
assert rev['new_tax_due'] == round(rev['new_assessed_value'] * 0.03, 2)
assert rev['tax_variance'] > 0
notice = reclass_res['notice']
assert notice['revision_no'].startswith("NAR-2026-03215-")
assert notice['comparison']['classification']['old'] in ["Residential", "Commercial"]
assert notice['comparison']['classification']['new'] == "Commercial"
assert "60 days" in notice['appeal_deadline']
print(f"[PASS] /api/parcels/{reclass_test_pin}/reclassify adjusted assessment: AV PHP {rev['new_assessed_value']:,.2f}, Tax Variance: +PHP {rev['tax_variance']:,.2f}")

# 42. Verify Updated Parcel Properties in Cadastre API
resp_parcel_check = client.get(f'/api/parcels/{reclass_test_pin}')
assert resp_parcel_check.status_code == 200
p_check = resp_parcel_check.get_json()['parcel']
assert p_check['classification'] == "Commercial"
assert p_check['actual_use'] == "Commercial Retail & Warehouse Hub"
assert p_check['unit_value'] == 6500.00
assert p_check['market_value'] == rev['new_market_value']
assert p_check['assessed_value'] == rev['new_assessed_value']
assert p_check['tax_due'] == rev['new_tax_due']
print(f"[PASS] Active cadastre confirmed updated for {reclass_test_pin}: Class={p_check['classification']}, Tax=PHP {p_check['tax_due']:,.2f}")

# 43. Test Assessment Revisions History API
resp_rev_hist = client.get(f'/api/parcels/{reclass_test_pin}/revisions')
assert resp_rev_hist.status_code == 200
rev_hist_res = resp_rev_hist.get_json()
assert rev_hist_res['success'] is True
assert rev_hist_res['count'] >= 1
latest_rev = rev_hist_res['revisions'][0]
assert latest_rev['pin'] == reclass_test_pin
assert latest_rev['new_classification'] == "Commercial"
assert latest_rev['tax_variance'] > 0
print(f"[PASS] /api/parcels/{reclass_test_pin}/revisions retrieved {rev_hist_res['count']} revision records")

# 44. Verify Audit Trail for ASSESSMENT_REVISED
conn = get_db()
cur = conn.cursor()
cur.execute("SELECT * FROM audit_logs WHERE action = 'ASSESSMENT_REVISED' ORDER BY id DESC LIMIT 1")
log_reclass = cur.fetchone()
conn.close()
assert log_reclass is not None
assert reclass_test_pin in log_reclass['details']
assert "Commercial" in log_reclass['details']
print(f"[PASS] Audit trail verified for ASSESSMENT_REVISED: '{log_reclass['details']}'")

# 45. Test Dashboard UI Integration for Reclassification Modal & Action Button
resp_dash_reclass = client.get('/dashboard')
assert resp_dash_reclass.status_code == 200
assert b"btn-reclassify-parcel" in resp_dash_reclass.data
assert b"modal-reclassify-parcel" in resp_dash_reclass.data
assert b"modal-notice-of-assessment" in resp_dash_reclass.data
assert b"reclass-preview-box" in resp_dash_reclass.data
print("[PASS] Dashboard UI verified with #btn-reclassify-parcel, #modal-reclassify-parcel, #modal-notice-of-assessment, and #reclass-preview-box")

# 46. Test Spatial Presets API
resp_presets = client.get('/api/spatial/presets')
assert resp_presets.status_code == 200, f"Expected 200, got {resp_presets.status_code}: {resp_presets.data}"
presets_data = resp_presets.get_json()
assert presets_data['success'] is True
presets = presets_data['presets']
assert len(presets) >= 3
preset_ids = [p['id'] for p in presets]
assert 'maharlika_highway' in preset_ids
assert 'cagayan_river' in preset_ids
assert 'bypass_road' in preset_ids
assert any('10752' in p['statutory_basis'] for p in presets)
assert any('1067' in p['statutory_basis'] for p in presets)
print(f"[PASS] /api/spatial/presets returned {len(presets)} provincial infrastructure corridors & hazard reference lines")

# 47. Test Corridor Spatial Buffer Query (Maharlika Highway ROW - R.A. 10752)
corridor_payload = {
    "preset_id": "maharlika_highway",
    "buffer_distance_m": 500,
    "lgu_code": "03215"
}
resp_buffer = client.post('/api/spatial/buffer-query', json=corridor_payload)
assert resp_buffer.status_code == 200, f"Expected 200, got {resp_buffer.status_code}: {resp_buffer.data}"
buf_res = resp_buffer.get_json()
assert buf_res['success'] is True
assert buf_res['report_no'].startswith("SP-2026-03215-")
assert "Maharlika" in buf_res['source_name']
assert buf_res['buffer_distance_m'] == 500
assert buf_res['buffer_geojson']['type'] == "Feature"
assert buf_res['buffer_geojson']['geometry']['type'] == "Polygon"
assert len(buf_res['buffer_geojson']['geometry']['coordinates'][0]) >= 4

# Check intersected parcels
parcels_affected = buf_res['intersected_parcels']
assert len(parcels_affected) > 0
first_affected = parcels_affected[0]
assert 'pin' in first_affected
assert 'lot_no' in first_affected
assert 'owner_name' in first_affected
assert 'distance_m' in first_affected
assert first_affected['distance_m'] <= 500.0

# Check summary KPIs
summary = buf_res['summary']
assert summary['total_intersected_parcels'] == len(parcels_affected)
assert summary['total_affected_area_ha'] > 0
assert summary['total_market_value'] > 0
assert summary['total_assessed_value'] > 0
assert len(summary['breakdown_by_classification']) > 0
print(f"[PASS] Corridor Buffer Query verified: {len(parcels_affected)} lots ({summary['total_affected_area_ha']} ha, AV PHP {summary['total_assessed_value']:,.2f}) within 500m of Maharlika Highway")

# 48. Test Radial Point Spatial Buffer Query (Custom Lat/Lng Radius)
radial_payload = {
    "center_lat": 16.9749,
    "center_lng": 121.8153,
    "buffer_distance_m": 300,
    "lgu_code": "03215"
}
resp_radial = client.post('/api/spatial/buffer-query', json=radial_payload)
assert resp_radial.status_code == 200
radial_res = resp_radial.get_json()
assert radial_res['success'] is True
assert "Radial Point" in radial_res['source_name']
assert radial_res['buffer_geojson']['geometry']['type'] == "Polygon"
assert len(radial_res['intersected_parcels']) > 0
capitol_found = any('042-18' in p['pin'] for p in radial_res['intersected_parcels'])
assert capitol_found, "Isabela Capitol parcel (042-18) should be intersected by 300m radial buffer from its center"
print(f"[PASS] Radial Point Buffer Query verified: {len(radial_res['intersected_parcels'])} lots within 300m radius of Capitol coordinates")

# 49. Test Target Parcel Proximity Buffer Query (Parcel PIN)
parcel_buffer_payload = {
    "target_pin": "032-15-0001-042-18",
    "buffer_distance_m": 400,
    "lgu_code": "03215"
}
resp_pbuf = client.post('/api/spatial/buffer-query', json=parcel_buffer_payload)
assert resp_pbuf.status_code == 200
pbuf_res = resp_pbuf.get_json()
assert pbuf_res['success'] is True
assert "Radial Buffer from Lot 42-18" in pbuf_res['source_name']
assert len(pbuf_res['intersected_parcels']) >= 1
self_lot = next(p for p in pbuf_res['intersected_parcels'] if p['pin'] == "032-15-0001-042-18")
assert self_lot['distance_m'] == 0.0
print(f"[PASS] Parcel Proximity Buffer verified: {len(pbuf_res['intersected_parcels'])} neighbor lots around Lot 42-18 within 400m")

# 50. Test Batch Spatial Impact Schedule CSV Export API
export_payload = {
    "report_no": buf_res['report_no'],
    "source_name": buf_res['source_name'],
    "buffer_distance_m": 500,
    "parcels": parcels_affected
}
resp_csv = client.post('/api/spatial/export-impact-csv', json=export_payload)
assert resp_csv.status_code == 200, f"Expected 200, got {resp_csv.status_code}"
assert resp_csv.mimetype == "text/csv"
assert f"impact_assessment_{buf_res['report_no']}.csv" in resp_csv.headers.get("Content-Disposition", "")
csv_content = resp_csv.data.decode('utf-8')
assert "SPATIAL PROXIMITY BUFFER & HAZARD IMPACT REPORT" in csv_content
assert "Maharlika" in csv_content
assert "PIN,Lot No,Survey No,Declared Owner" in csv_content
assert parcels_affected[0]['pin'] in csv_content
print(f"[PASS] /api/spatial/export-impact-csv successfully exported {len(parcels_affected)} parcel impact schedule rows")

# 51. Verify Audit Trail Logging & Dashboard UI Integration for Buffer Tool
conn = get_db()
cur = conn.cursor()
cur.execute("SELECT * FROM audit_logs WHERE action = 'SPATIAL_BUFFER_QUERIED' ORDER BY id DESC LIMIT 1")
log_buf = cur.fetchone()
conn.close()
assert log_buf is not None
assert "Maharlika" in log_buf['details'] or "Radial" in log_buf['details']
print(f"[PASS] Audit trail verified for SPATIAL_BUFFER_QUERIED: '{log_buf['details']}'")

resp_dash_buffer = client.get('/dashboard')
assert resp_dash_buffer.status_code == 200
assert b"btn-buffer-tool" in resp_dash_buffer.data
assert b"buffer-hud" in resp_dash_buffer.data
assert b"buffer-preset-select" in resp_dash_buffer.data
assert b"btn-run-buffer-analysis" in resp_dash_buffer.data
assert b"modal-buffer-report" in resp_dash_buffer.data
assert b"buffer-rep-no" in resp_dash_buffer.data
assert b"buffer-rep-table-body" in resp_dash_buffer.data
assert b"btn-download-buffer-csv" in resp_dash_buffer.data
assert b"btn-print-buffer-report" in resp_dash_buffer.data
print("[PASS] Dashboard UI verified with #btn-buffer-tool, #buffer-hud, #buffer-preset-select, #modal-buffer-report, and #btn-download-buffer-csv")

print("\nALL 51 VERIFICATION TESTS PASSED SUCCESSFULLY!")

