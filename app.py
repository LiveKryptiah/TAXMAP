"""
Provincial Government of Isabela — Office of the Provincial Assessor
Tax Mapping Information System (TM-RPAIS) Server
"""
import os
import secrets
from flask import Flask, render_template, request, jsonify, redirect, url_for, session, send_from_directory, Response
from database import (
    init_db, authenticate_user, log_audit, get_db, 
    get_parcels, get_parcel_by_pin, subdivide_parcel,
    add_parcel, delete_parcel, issue_tax_declaration,
    get_survey_sheet, get_lgu_collection_telemetry,
    issue_notice_of_delinquency, get_audit_logs,
    get_tax_declarations_registry, get_assessment_roll_data,
    post_tax_payment, get_official_receipt,
    export_cadastre_geojson, export_cadastre_csv
)

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", secrets.token_hex(24))

# Ensure database is initialized
init_db()

@app.route("/taxmap.mp4")
def serve_taxmap_video():
    return send_from_directory(app.root_path, "taxmap.mp4", mimetype="video/mp4")

@app.route("/")
def index():
    if "user" in session:
        return redirect(url_for("dashboard"))
    return redirect(url_for("login"))

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        client_ip = request.remote_addr

        user = authenticate_user(username, password)
        if user:
            session["user"] = {
                "id": user["id"],
                "username": user["username"],
                "full_name": user["full_name"],
                "role": user["role"],
                "role_title": user["role_title"],
                "badge_no": user["badge_no"],
                "lgu": user["lgu"]
            }
            log_audit(username, "LOGIN_SUCCESS", f"Role: {user['role']}", client_ip)
            return redirect(url_for("dashboard"))
        else:
            log_audit(username, "LOGIN_FAILED", "Invalid credentials", client_ip)
            return render_template("login.html", error="Invalid credentials. Please verify your officer username or password.")

    return render_template("login.html")

@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json(force=True, silent=True) or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")
    client_ip = request.remote_addr

    if not username or not password:
        return jsonify({
            "success": False, 
            "message": "Both Officer ID / Username and Password are required."
        }), 400

    user = authenticate_user(username, password)
    if user:
        session["user"] = {
            "id": user["id"],
            "username": user["username"],
            "full_name": user["full_name"],
            "role": user["role"],
            "role_title": user["role_title"],
            "badge_no": user["badge_no"],
            "lgu": user["lgu"]
        }
        log_audit(username, "LOGIN_SUCCESS", f"API Auth for {user['badge_no']}", client_ip)
        return jsonify({
            "success": True,
            "message": "Authentication successful.",
            "user": session["user"],
            "redirect_url": url_for("dashboard")
        })
    else:
        log_audit(username, "LOGIN_FAILED", "Invalid credentials", client_ip)
        return jsonify({
            "success": False, 
            "message": "Authentication failed. Invalid Officer ID or password."
        }), 401

@app.route("/dashboard")
def dashboard():
    # If no active session, show default guest assessment officer for inspection
    current_user = session.get("user", {
        "full_name": "Atty. Rodolfo V. Ramos",
        "role": "PROVINCIAL_ASSESSOR",
        "role_title": "Provincial Assessor",
        "badge_no": "PGI-ASR-001",
        "lgu": "Office of the Provincial Assessor, Capitol Compound, Ilagan City"
    })

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM lgus ORDER BY name ASC")
    lgus = [dict(r) for r in cursor.fetchall()]
    conn.close()

    initial_parcels = get_parcels(lgu_code="03215") # Default to Ilagan City Capitol District

    return render_template(
        "dashboard.html", 
        user=current_user,
        lgus=lgus,
        initial_parcels=initial_parcels,
        active_lgu_code="03215"
    )

@app.route("/logout")
def logout():
    user = session.pop("user", None)
    if user:
        log_audit(user.get("username"), "LOGOUT", "User logged out", request.remote_addr)
    return redirect(url_for("login"))

@app.route("/api/system/status")
def system_status():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) as lgu_count, SUM(total_parcels) as total_parcels FROM lgus")
    row = cursor.fetchone()
    conn.close()

    return jsonify({
        "status": "OPERATIONAL",
        "province": "Province of Isabela",
        "cadastre": "Cad 211",
        "projection": "PRS92 / Philippines Zone 3 (EPSG:3123)",
        "lgus_online": row["lgu_count"] if row else 37,
        "total_parcels_indexed": row["total_parcels"] if row else 482910,
        "active_session": "user" in session
    })

@app.route("/api/lgus")
def get_lgus():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM lgus ORDER BY name ASC")
    lgus = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify({"lgus": lgus})

@app.route("/api/parcels")
def api_parcels():
    lgu = request.args.get("lgu", "03215")
    query = request.args.get("query", "").strip()
    classification = request.args.get("classification", "ALL")

    parcels = get_parcels(lgu_code=lgu, query=query, classification=classification)
    return jsonify({
        "count": len(parcels),
        "parcels": parcels
    })

@app.route("/api/parcels", methods=["POST"])
def api_add_parcel():
    data = request.get_json(force=True, silent=True) or {}
    user = session.get("user", {
        "username": "taxmapper.gis",
        "badge_no": "PGI-GIS-014",
        "role": "GIS_TAX_MAPPER"
    })
    result = add_parcel(
        parcel_data=data,
        officer_username=user.get("username", "taxmapper.gis"),
        officer_badge=user.get("badge_no", "PGI-GIS-014"),
        ip=request.remote_addr
    )
    if result.get("success"):
        return jsonify(result), 201
    return jsonify(result), 400

@app.route("/api/parcels/<path:pin>", methods=["GET", "DELETE"])
def api_parcel_detail(pin):
    if request.method == "DELETE":
        user = session.get("user", {
            "username": "taxmapper.gis",
            "badge_no": "PGI-GIS-014",
            "role": "GIS_TAX_MAPPER"
        })
        result = delete_parcel(
            pin=pin,
            officer_username=user.get("username", "taxmapper.gis"),
            officer_badge=user.get("badge_no", "PGI-GIS-014"),
            ip=request.remote_addr
        )
        if result.get("success"):
            return jsonify(result), 200
        return jsonify(result), 400

    parcel = get_parcel_by_pin(pin)
    if parcel:
        return jsonify({"success": True, "parcel": parcel})
    return jsonify({"success": False, "message": "Parcel not found"}), 404

@app.route("/api/parcels/subdivide", methods=["POST"])
def api_subdivide_parcel():
    data = request.get_json(force=True, silent=True) or {}
    parent_pin = data.get("parent_pin", "").strip()
    subdivisions = data.get("subdivisions", [])

    if not parent_pin:
        return jsonify({"success": False, "message": "Parent parcel PIN is required."}), 400

    if not subdivisions or len(subdivisions) < 2:
        return jsonify({"success": False, "message": "At least 2 child parcel subdivisions are required."}), 400

    # Get active session officer or default to GIS lead
    user = session.get("user", {
        "username": "taxmapper.gis",
        "badge_no": "PGI-GIS-014",
        "role": "GIS_TAX_MAPPER",
        "full_name": "Engr. Marites D. Pascual"
    })

    result = subdivide_parcel(
        parent_pin=parent_pin,
        children_data=subdivisions,
        officer_username=user.get("username", "taxmapper.gis"),
        officer_badge=user.get("badge_no", "PGI-GIS-014"),
        ip=request.remote_addr
    )

    if result.get("success"):
        return jsonify(result), 200
    else:
        return jsonify(result), 400

@app.route("/api/parcels/<path:pin>/issue-td", methods=["POST", "GET"])
def api_issue_td(pin):
    user = session.get("user", {
        "username": "taxmapper.gis",
        "badge_no": "PGI-GIS-014",
        "role": "GIS_TAX_MAPPER"
    })
    result = issue_tax_declaration(
        pin=pin,
        officer_username=user.get("username", "taxmapper.gis"),
        officer_badge=user.get("badge_no", "PGI-GIS-014"),
        ip=request.remote_addr
    )
    if result.get("success"):
        return jsonify(result), 200
    return jsonify(result), 404

@app.route("/api/parcels/<path:pin>/survey-sheet", methods=["GET"])
def api_survey_sheet(pin):
    user = session.get("user", {
        "username": "taxmapper.gis",
        "badge_no": "PGI-GIS-014",
        "role": "GIS_TAX_MAPPER"
    })
    result = get_survey_sheet(
        pin=pin,
        officer_username=user.get("username", "taxmapper.gis"),
        officer_badge=user.get("badge_no", "PGI-GIS-014"),
        ip=request.remote_addr
    )
    if result.get("success"):
        return jsonify(result), 200
    return jsonify(result), 404

@app.route("/api/lgus/<lgu_code>/collection-telemetry", methods=["GET"])
def api_collection_telemetry(lgu_code):
    telemetry = get_lgu_collection_telemetry(lgu_code=lgu_code)
    return jsonify({
        "success": True,
        "telemetry": telemetry
    })

@app.route("/api/parcels/<path:pin>/issue-delinquency", methods=["POST"])
def api_issue_delinquency(pin):
    user = session.get("user", {
        "username": "assessor.pgi",
        "badge_no": "PGI-ASR-001",
        "role": "PROVINCIAL_ASSESSOR"
    })
    result = issue_notice_of_delinquency(
        pin=pin,
        officer_username=user.get("username", "assessor.pgi"),
        officer_badge=user.get("badge_no", "PGI-ASR-001"),
        ip=request.remote_addr
    )
    if result.get("success"):
        return jsonify(result), 200
    return jsonify(result), 400

@app.route("/api/tax-declarations", methods=["GET"])
def api_tax_declarations():
    lgu = request.args.get("lgu", "ALL")
    query = request.args.get("query", "").strip()
    status = request.args.get("status", "ALL")
    classification = request.args.get("classification", "ALL")
    limit = int(request.args.get("limit", 150))
    offset = int(request.args.get("offset", 0))

    result = get_tax_declarations_registry(
        lgu_code=lgu,
        query=query,
        status=status,
        classification=classification,
        limit=limit,
        offset=offset
    )
    return jsonify({
        "success": True,
        **result
    })

@app.route("/api/assessment-roll", methods=["GET"])
def api_assessment_roll():
    lgu = request.args.get("lgu", "03215")
    classification = request.args.get("classification", "ALL")

    result = get_assessment_roll_data(
        lgu_code=lgu,
        classification=classification
    )
    return jsonify({
        "success": True,
        **result
    })

@app.route("/api/audit-logs", methods=["GET"])
def api_audit_logs():
    limit = int(request.args.get("limit", 100))
    offset = int(request.args.get("offset", 0))
    action = request.args.get("action", "ALL")
    query = request.args.get("query", "").strip()

    result = get_audit_logs(
        limit=limit,
        offset=offset,
        action=action,
        query=query
    )
    return jsonify({
        "success": True,
        **result
    })

@app.route("/api/parcels/<path:pin>/pay-tax", methods=["POST"])
def api_pay_tax(pin):
    data = request.get_json(force=True, silent=True) or {}
    user = session.get("user", {
        "username": "treasurer.pgi",
        "badge_no": "PGI-TRS-008",
        "role": "MUNICIPAL_APPRAISER"
    })
    result = post_tax_payment(
        pin=pin,
        payment_data=data,
        officer_username=user.get("username", "treasurer.pgi"),
        officer_badge=user.get("badge_no", "PGI-TRS-008"),
        ip=request.remote_addr
    )
    if result.get("success"):
        return jsonify(result), 200
    return jsonify(result), 400

@app.route("/api/receipts/<path:or_no>", methods=["GET"])
def api_get_receipt(or_no):
    receipt = get_official_receipt(or_no)
    if receipt:
        return jsonify(receipt), 200
    return jsonify({"success": False, "message": "Official Receipt not found"}), 404

@app.route("/api/cadastre/export/geojson", methods=["GET"])
def api_export_geojson():
    lgu = request.args.get("lgu", "ALL")
    geojson_data = export_cadastre_geojson(lgu_code=lgu)
    response = jsonify(geojson_data)
    filename = f"isabela_cadastre_{lgu}.geojson"
    response.headers["Content-Disposition"] = f"attachment; filename={filename}"
    return response

@app.route("/api/cadastre/export/csv", methods=["GET"])
def api_export_csv():
    lgu = request.args.get("lgu", "ALL")
    csv_text = export_cadastre_csv(lgu_code=lgu)
    filename = f"isabela_assessment_roll_{lgu}.csv"
    return Response(
        csv_text,
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"Starting Isabela Tax Map System on http://127.0.0.1:{port}")
    app.run(host="127.0.0.1", port=port, debug=True)
