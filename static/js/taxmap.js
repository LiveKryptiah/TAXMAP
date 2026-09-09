/**
 * Isabela Provincial Assessor Tax Mapping System
 * Leaflet Dark Mode GIS & Cadastral Parcel Explorer
 * Center: Province of Isabela, Philippines (Ilagan Capitol 16.9749° N, 121.8153° E)
 */

document.addEventListener('DOMContentLoaded', () => {
  // Coordinates for Isabela Provincial Capitol, City of Ilagan
  const ISABELA_CAPITOL = [16.9749, 121.8153];
  const DEFAULT_ZOOM = 16;

  // DOM Elements
  const mapContainer = document.getElementById('leaflet-map');
  const searchInput = document.getElementById('search-input');
  const filterPills = document.querySelectorAll('.filter-pill');
  const lguSelect = document.getElementById('sidebar-lgu-select');
  const btnRecenter = document.getElementById('btn-recenter');
  const hudLguTitle = document.getElementById('hud-lgu-title');
  const liveClock = document.getElementById('sidebar-live-clock');
  const btnIssueTd = document.getElementById('btn-issue-td');

  // Top-level LGU Jurisdiction Scope
  let activeLguCode = '03215';
  let activeLguName = 'Ilagan City';

  // Inspector DOM
  const inspPin = document.getElementById('insp-pin');
  const inspTd = document.getElementById('insp-td');
  const inspOwner = document.getElementById('insp-owner');
  const inspAddress = document.getElementById('insp-address');
  const inspClass = document.getElementById('insp-class');
  const inspUse = document.getElementById('insp-use');
  const inspArea = document.getElementById('insp-area');
  const inspUnit = document.getElementById('insp-unit');
  const inspMv = document.getElementById('insp-mv');
  const inspLevel = document.getElementById('insp-level');
  const inspAv = document.getElementById('insp-av');
  const inspTax = document.getElementById('insp-tax');
  const inspStatus = document.getElementById('insp-status');
  const btnToggleInspector = document.getElementById('btn-toggle-inspector');
  const btnExpandInspector = document.getElementById('btn-expand-inspector');
  const expandBtnPinLabel = document.getElementById('expand-btn-pin-label');

  if (!mapContainer || typeof L === 'undefined') {
    console.error('Leaflet or map container not available');
    return;
  }

  // 1. Initialize Leaflet Map
  const map = L.map('leaflet-map', {
    center: ISABELA_CAPITOL,
    zoom: DEFAULT_ZOOM,
    minZoom: 8,
    maxZoom: 19,
    zoomControl: true,
    attributionControl: true
  });

  // Position zoom controls in top-left
  map.zoomControl.setPosition('topleft');
  setTimeout(() => {
    map.invalidateSize();
  }, 150);

  // 2. Zero-API-Key Base Tile Layers (No API Key Required)
  const darkOsmLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    className: 'dark-tiles',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Isabela GIS'
  }).addTo(map);

  const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    className: 'satellite-bw-tiles',
    attribution: 'Tiles &copy; Esri &mdash; Isabela Cadastre'
  });

  let currentLayerType = 'dark';

  // Layer groups
  const parcelsLayerGroup = L.layerGroup().addTo(map);
  const encroachmentLayerGroup = L.layerGroup().addTo(map);
  const spatialBufferLayerGroup = L.layerGroup().addTo(map);
  let parcelPolygonMap = new Map(); // pin -> { polygon, data }
  let activeSelectedPolygon = null;
  let activeSelectedParcelData = null;

  // 3. Polygon Styles: Default B&W and Color-Coded Thematic GIS Layer
  let thematicMode = false;

  const defaultStyle = {
    color: 'rgba(255, 255, 255, 0.45)',
    weight: 1.2,
    fillColor: '#ffffff',
    fillOpacity: 0.04,
    dashArray: null
  };

  const hoverStyle = {
    color: '#ffffff',
    weight: 2,
    fillColor: '#ffffff',
    fillOpacity: 0.16
  };

  const activeStyle = {
    color: '#ffffff',
    weight: 2.5,
    fillColor: '#ffffff',
    fillOpacity: 0.25
  };

  const dimmedStyle = {
    color: 'rgba(255, 255, 255, 0.12)',
    weight: 0.8,
    fillColor: '#000000',
    fillOpacity: 0.02
  };

  const thematicStyles = {
    CURRENT: {
      color: '#ffffff',
      weight: 1.5,
      fillColor: '#ffffff',
      fillOpacity: 0.10
    },
    DELINQUENT: {
      color: '#ffffff',
      weight: 2.2,
      dashArray: '4, 4',
      fillColor: '#ffffff',
      fillOpacity: 0.28
    },
    EXEMPT: {
      color: '#71717a',
      weight: 1.2,
      dashArray: '2, 2',
      fillColor: '#27272a',
      fillOpacity: 0.12
    }
  };

  function getParcelStyle(data, isHover = false, isSelected = false) {
    if (!thematicMode) {
      if (isSelected) return activeStyle;
      if (isHover) return hoverStyle;
      return defaultStyle;
    }

    const delinqStatus = (data.delinquency_status || (data.delinquency && data.delinquency.status) || 'CURRENT').toUpperCase();
    const base = thematicStyles[delinqStatus] || thematicStyles.CURRENT;

    if (isSelected) {
      return {
        color: '#ffffff',
        weight: 3,
        fillColor: base.fillColor,
        fillOpacity: Math.min(base.fillOpacity + 0.25, 0.75)
      };
    }
    if (isHover) {
      return {
        color: base.color,
        weight: base.weight + 1,
        fillColor: base.fillColor,
        fillOpacity: Math.min(base.fillOpacity + 0.15, 0.60)
      };
    }
    return base;
  }

  // 4. Load Initial Parcels
  let initialParcels = [];
  try {
    const rawData = document.getElementById('initial-parcels-data');
    if (rawData && rawData.textContent) {
      initialParcels = JSON.parse(rawData.textContent);
    }
  } catch (err) {
    console.warn('Could not parse embedded parcels:', err);
  }

  function renderParcels(parcels) {
    parcelsLayerGroup.clearLayers();
    parcelPolygonMap.clear();

    parcels.forEach((p, index) => {
      let coords = p.coordinates;
      if (!coords && p.geo_coords) {
        try { coords = JSON.parse(p.geo_coords); } catch (e) {}
      }

      if (!coords || !coords.length) return;

      const polygon = L.polygon(coords, getParcelStyle(p, false, false));

      // Label with minimal tooltip
      polygon.bindTooltip(p.lot_no, {
        permanent: true,
        direction: 'center',
        className: 'cadastral-lot-tooltip'
      });

      // Events
      polygon.on('mouseover', () => {
        if (polygon !== activeSelectedPolygon) {
          polygon.setStyle(getParcelStyle(p, true, false));
        }
      });

      polygon.on('mouseout', () => {
        if (polygon !== activeSelectedPolygon) {
          polygon.setStyle(getParcelStyle(p, false, false));
        }
      });

      polygon.on('click', () => {
        selectParcel(p, polygon);
      });

      polygon.addTo(parcelsLayerGroup);
      parcelPolygonMap.set(p.pin, { polygon, data: p });

      // Select first parcel by default
      if (index === 0) {
        selectParcel(p, polygon);
      }
    });
  }

  if (initialParcels.length > 0) {
    renderParcels(initialParcels);
  } else {
    // Fallback fetch from API
    fetch('/api/parcels?lgu=03215')
      .then(res => res.json())
      .then(data => {
        if (data.parcels) renderParcels(data.parcels);
      });
  }

  // 5. Select Parcel and Update Inspector
  function selectParcel(data, polygon) {
    if (activeSelectedPolygon && activeSelectedPolygon !== polygon) {
      activeSelectedPolygon.setStyle(getParcelStyle(activeSelectedParcelData, false, false));
    }

    activeSelectedPolygon = polygon;
    activeSelectedParcelData = data;
    if (polygon) {
      polygon.setStyle(getParcelStyle(data, false, true));
      polygon.bringToFront();
    }

    // Update Right Floating Glassmorph Inspector
    if (inspPin) inspPin.textContent = data.pin || '—';
    if (expandBtnPinLabel && data.pin) expandBtnPinLabel.textContent = data.pin;
    const inspectorEl = document.querySelector('.parcel-inspector-panel');
    if (inspectorEl && inspectorEl.classList.contains('collapsed')) {
      inspectorEl.classList.remove('collapsed');
      if (btnExpandInspector) btnExpandInspector.style.display = 'none';
    }
    if (inspTd) inspTd.textContent = data.td_no || '—';
    if (inspOwner) inspOwner.textContent = data.owner_name || '—';
    if (inspAddress) inspAddress.textContent = data.owner_address || '—';
    if (inspClass) inspClass.textContent = data.classification || '—';
    if (inspUse) inspUse.textContent = data.actual_use || '—';

    const areaVal = parseFloat(data.area_sqm || 0);
    const ha = (areaVal / 10000).toFixed(4);
    if (inspArea) inspArea.textContent = `${areaVal.toLocaleString('en-US', { minimumFractionDigits: 2 })} sq.m. (${ha} ha)`;

    if (inspUnit) inspUnit.textContent = `PHP ${parseFloat(data.unit_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} / sq.m.`;
    if (inspMv) inspMv.textContent = `PHP ${parseFloat(data.market_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    if (inspLevel) inspLevel.textContent = `${data.assessment_level || '0'}%`;
    if (inspAv) inspAv.textContent = `PHP ${parseFloat(data.assessed_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    if (inspTax) {
      const taxVal = parseFloat(data.tax_due || 0);
      inspTax.textContent = taxVal > 0 
        ? `PHP ${taxVal.toLocaleString('en-US', { minimumFractionDigits: 2 })}` 
        : 'PHP 0.00 (Exempt)';
      inspTax.style.color = taxVal > 0 ? '#ffffff' : 'var(--colors-body-mid)';
    }
    if (inspStatus) inspStatus.textContent = data.status || 'Active - Synced';

    // Delinquency Assessment & Statutory Telemetry Card
    const delinq = data.delinquency || {
      status: data.delinquency_status || 'CURRENT',
      penalty_amount: data.penalty_amount || 0,
      total_delinquent_due: data.total_delinquent_due || data.tax_due || 0,
      overdue_months: data.overdue_months || 0,
      penalty_rate_pct: 0,
      is_delinquent: (data.delinquency_status === 'DELINQUENT')
    };

    const inspDelinqBox = document.getElementById('insp-delinquency-box');
    const inspDelinqBadge = document.getElementById('insp-delinq-badge');
    const inspOverdueStr = document.getElementById('insp-overdue-str');
    const inspPenaltyVal = document.getElementById('insp-penalty-val');
    const inspTotalDelinq = document.getElementById('insp-total-delinq');
    const btnIssueDelinquency = document.getElementById('btn-issue-delinquency');
    const btnOpenPayment = document.getElementById('btn-open-payment');
    const btnIssueClearance = document.getElementById('btn-issue-clearance');
    if (btnIssueClearance) btnIssueClearance.style.display = 'flex';

    if (delinq.status === 'DELINQUENT') {
      if (inspDelinqBox) {
        inspDelinqBox.style.display = 'block';
        inspDelinqBox.style.background = 'rgba(255, 255, 255, 0.05)';
        inspDelinqBox.style.border = '1px solid rgba(255, 255, 255, 0.2)';
      }
      if (btnIssueDelinquency) btnIssueDelinquency.style.display = 'flex';
      if (btnOpenPayment) btnOpenPayment.style.display = 'flex';
      if (inspDelinqBadge) {
        inspDelinqBadge.textContent = 'DELINQUENT';
        inspDelinqBadge.style.color = '#0a0a0a';
        inspDelinqBadge.style.backgroundColor = '#ffffff';
        inspDelinqBadge.style.borderColor = '#ffffff';
      }
      if (inspOverdueStr) {
        inspOverdueStr.textContent = delinq.delinquent_years_str || `${delinq.overdue_months} Mos Overdue`;
        inspOverdueStr.style.color = '#ffffff';
      }
      if (inspPenaltyVal) inspPenaltyVal.textContent = `+ PHP ${parseFloat(delinq.penalty_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} (${delinq.penalty_rate_pct || 0}%)`;
      if (inspTotalDelinq) {
        inspTotalDelinq.textContent = `PHP ${parseFloat(delinq.total_delinquent_due || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        inspTotalDelinq.style.color = '#ffffff';
      }
    } else if (delinq.status === 'EXEMPT') {
      if (inspDelinqBox) inspDelinqBox.style.display = 'none';
      if (btnIssueDelinquency) btnIssueDelinquency.style.display = 'none';
      if (btnOpenPayment) btnOpenPayment.style.display = 'flex';
    } else {
      // CURRENT / PAID
      if (inspDelinqBox) {
        inspDelinqBox.style.display = 'block';
        inspDelinqBox.style.background = 'rgba(255, 255, 255, 0.03)';
        inspDelinqBox.style.border = '1px solid rgba(255, 255, 255, 0.12)';
      }
      if (btnIssueDelinquency) btnIssueDelinquency.style.display = 'none';
      if (btnOpenPayment) btnOpenPayment.style.display = 'flex';
      if (inspDelinqBadge) {
        inspDelinqBadge.textContent = 'CURRENT / PAID';
        inspDelinqBadge.style.color = '#ffffff';
        inspDelinqBadge.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
        inspDelinqBadge.style.borderColor = 'rgba(255, 255, 255, 0.25)';
      }
      if (inspOverdueStr) {
        inspOverdueStr.textContent = 'Tax Paid (Year 2026)';
        inspOverdueStr.style.color = '#a1a1aa';
      }
      if (inspPenaltyVal) inspPenaltyVal.textContent = 'PHP 0.00 (0.0%)';
      if (inspTotalDelinq) {
        inspTotalDelinq.textContent = `PHP ${parseFloat(delinq.annual_tax || data.tax_due || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        inspTotalDelinq.style.color = '#ffffff';
      }
    }
  }

  // Floating Glass Inspector Collapse / Expand Toggle
  if (btnToggleInspector) {
    btnToggleInspector.addEventListener('click', () => {
      const inspectorEl = document.querySelector('.parcel-inspector-panel');
      if (inspectorEl) {
        inspectorEl.classList.add('collapsed');
      }
      if (btnExpandInspector) {
        btnExpandInspector.style.display = 'inline-flex';
      }
    });
  }

  if (btnExpandInspector) {
    btnExpandInspector.addEventListener('click', () => {
      const inspectorEl = document.querySelector('.parcel-inspector-panel');
      if (inspectorEl) {
        inspectorEl.classList.remove('collapsed');
      }
      btnExpandInspector.style.display = 'none';
    });
  }

  // 6. Classification Filter
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');

      const filterClass = pill.getAttribute('data-class');

      parcelPolygonMap.forEach(({ polygon, data }) => {
        const matches = (filterClass === 'ALL') || 
                        (data.classification && data.classification.toLowerCase() === filterClass.toLowerCase());

        if (matches) {
          polygon.setStyle(polygon === activeSelectedPolygon ? activeStyle : defaultStyle);
        } else {
          polygon.setStyle(dimmedStyle);
        }
      });
    });
  });

  // 7. Instant Search Bar Filter
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      let firstMatch = null;

      parcelPolygonMap.forEach(({ polygon, data }) => {
        const pin = (data.pin || '').toLowerCase();
        const owner = (data.owner_name || '').toLowerCase();
        const lot = (data.lot_no || '').toLowerCase();
        const td = (data.td_no || '').toLowerCase();

        const match = !query || pin.includes(query) || owner.includes(query) || lot.includes(query) || td.includes(query);

        if (match) {
          polygon.setStyle(polygon === activeSelectedPolygon ? activeStyle : defaultStyle);
          if (!firstMatch && query.length > 1) {
            firstMatch = { data, polygon };
          }
        } else {
          polygon.setStyle(dimmedStyle);
        }
      });

      if (firstMatch) {
        selectParcel(firstMatch.data, firstMatch.polygon);
        map.panTo(firstMatch.polygon.getBounds().getCenter(), { animate: true });
      }
    });
  }

  // 8. LGU Switcher: Fly-To Municipality & Update Telemetry
  if (lguSelect) {
    lguSelect.addEventListener('change', (e) => {
      const selectedOption = e.target.options[e.target.selectedIndex];
      activeLguCode = selectedOption.value;
      activeLguName = selectedOption.text.split('(')[0].trim();
      const lat = parseFloat(selectedOption.getAttribute('data-lat') || 16.9749);
      const lng = parseFloat(selectedOption.getAttribute('data-lng') || 121.8153);
      const lguName = activeLguName;

      if (hudLguTitle) {
        hudLguTitle.textContent = `ISABELA CADASTRE 211 · ${lguName.toUpperCase()} (${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E)`;
      }

      // Smooth flyTo municipality coordinates
      const targetZoom = (selectedOption.value === '03215') ? 16 : 14;
      map.flyTo([lat, lng], targetZoom, { duration: 1.2 });

      // Fetch parcels & telemetry for selected LGU
      fetch(`/api/parcels?lgu=${selectedOption.value}`)
        .then(res => res.json())
        .then(data => {
          if (data.parcels) renderParcels(data.parcels);
        })
        .catch(err => console.warn('Error switching parcels:', err));

      loadCollectionTelemetry(selectedOption.value);
    });
  }

  // 8b. Revenue & Collection Telemetry Loader
  function formatCurrencyShort(val) {
    val = parseFloat(val || 0);
    if (val >= 1000000) {
      return 'PHP ' + (val / 1000000).toFixed(2) + 'M';
    } else if (val >= 1000) {
      return 'PHP ' + (val / 1000).toFixed(1) + 'K';
    } else {
      return 'PHP ' + val.toLocaleString('en-US', { minimumFractionDigits: 2 });
    }
  }

  function loadCollectionTelemetry(lguCode) {
    const code = lguCode || (lguSelect ? lguSelect.value : '03215');
    fetch(`/api/lgus/${code}/collection-telemetry`)
      .then(res => res.json())
      .then(res => {
        if (res.success && res.telemetry) {
          const t = res.telemetry;
          const hudLgu = document.getElementById('hud-lgu-name');
          const hudCollectibles = document.getElementById('hud-total-collectibles');
          const hudCollected = document.getElementById('hud-total-collected');
          const hudRate = document.getElementById('hud-collection-rate');
          const hudDelinqCount = document.getElementById('hud-delinq-count');
          const hudDelinqRate = document.getElementById('hud-delinq-rate');
          const hudDelinqAmt = document.getElementById('hud-delinq-amount');

          if (hudLgu) hudLgu.textContent = t.lgu_name || 'Isabela LGU';
          if (hudCollectibles) hudCollectibles.textContent = formatCurrencyShort(t.total_collectibles);
          if (hudCollected) hudCollected.textContent = formatCurrencyShort(t.total_collected);
          if (hudRate) hudRate.textContent = `${t.collection_rate_pct}%`;
          if (hudDelinqCount) hudDelinqCount.textContent = `${t.delinquent_count} Lot${t.delinquent_count === 1 ? '' : 's'}`;
          if (hudDelinqRate) hudDelinqRate.textContent = `(${t.delinquency_rate_pct}%)`;
          if (hudDelinqAmt) hudDelinqAmt.textContent = formatCurrencyShort(t.total_delinquent_due);
        }
      })
      .catch(err => console.warn('Error loading collection telemetry:', err));
  }

  // Initial Telemetry Load
  loadCollectionTelemetry('03215');

  // 8c. Thematic Heatmap Toggle
  const btnToggleThematic = document.getElementById('btn-toggle-thematic');
  const hudThematicLegend = document.getElementById('hud-thematic-legend');

  if (btnToggleThematic) {
    btnToggleThematic.addEventListener('click', () => {
      thematicMode = !thematicMode;
      if (thematicMode) {
        btnToggleThematic.textContent = 'Thematic: ON';
        btnToggleThematic.classList.add('thematic-active-btn');
        if (hudThematicLegend) hudThematicLegend.style.display = 'flex';
      } else {
        btnToggleThematic.textContent = 'Thematic: OFF';
        btnToggleThematic.classList.remove('thematic-active-btn');
        if (hudThematicLegend) hudThematicLegend.style.display = 'none';
      }

      // Re-style all polygons on map
      parcelPolygonMap.forEach(({ polygon, data }) => {
        const isSelected = (polygon === activeSelectedPolygon);
        polygon.setStyle(getParcelStyle(data, false, isSelected));
      });
    });
  }

  // 8d. Notice of Delinquency Modal & Actions
  const modalTaxDelinquency = document.getElementById('modal-tax-delinquency');
  const btnCloseDelinquencyModal = document.getElementById('btn-close-delinquency-modal');
  const btnPrintDelinquency = document.getElementById('btn-print-delinquency');
  const btnIssueDelinquency = document.getElementById('btn-issue-delinquency');

  function populateDelinquencyNotice(doc) {
    const notice = doc.notice;
    if (!notice) return;

    // Header & Meta
    const docNo = document.getElementById('delinq-doc-no');
    const docDate = document.getElementById('delinq-doc-date');
    const docLgu = document.getElementById('delinq-doc-lgu');
    if (docNo) docNo.textContent = notice.notice_no;
    if (docDate) docDate.textContent = notice.date_issued;
    if (docLgu) docLgu.textContent = `${notice.jurisdiction.lgu_name} (${notice.jurisdiction.lgu_code})`;

    // Taxpayer
    const docOwner = document.getElementById('delinq-doc-owner');
    const docAddress = document.getElementById('delinq-doc-address');
    const docLot = document.getElementById('delinq-doc-lot');
    const docPin = document.getElementById('delinq-doc-pin');
    const docTd = document.getElementById('delinq-doc-td');
    if (docOwner) docOwner.textContent = notice.taxpayer.owner_name;
    if (docAddress) docAddress.textContent = notice.taxpayer.owner_address;
    if (docLot) docLot.textContent = `${notice.taxpayer.lot_no}, ${notice.taxpayer.block_no}, ${notice.taxpayer.survey_no}`;
    if (docPin) docPin.textContent = notice.taxpayer.pin;
    if (docTd) docTd.textContent = notice.taxpayer.td_no;

    // Specifications
    const docClass = document.getElementById('delinq-doc-class');
    const docUse = document.getElementById('delinq-doc-use');
    const docArea = document.getElementById('delinq-doc-area');
    const docAv = document.getElementById('delinq-doc-av');
    if (docClass) docClass.textContent = notice.taxpayer.classification;
    if (docUse) docUse.textContent = notice.taxpayer.actual_use;
    if (docArea) docArea.textContent = `${parseFloat(notice.taxpayer.area_sqm).toLocaleString('en-US', { minimumFractionDigits: 2 })} sq.m.`;
    if (docAv) docAv.textContent = `PHP ${parseFloat(notice.taxpayer.assessed_value).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

    // Delinquency Penalty Schedule Table
    const tbody = document.getElementById('delinq-table-tbody');
    if (tbody && notice.delinquency && notice.delinquency.schedule) {
      tbody.innerHTML = '';
      notice.delinquency.schedule.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="mono-num" style="font-weight: 600;">Year ${row.tax_year}</td>
          <td class="mono-num">PHP ${row.basic_tax.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
          <td class="mono-num">PHP ${row.sef_tax.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
          <td class="mono-num" style="font-weight: 600;">PHP ${row.subtotal_tax.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
          <td class="mono-num">${row.penalty_rate_pct}%</td>
          <td class="mono-num" style="color: #000000; font-weight: 600;">PHP ${row.penalty_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
          <td class="mono-num" style="text-align: right; font-weight: 700;">PHP ${row.total_due.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    // Footers & Legal Demand
    const footBase = document.getElementById('delinq-foot-base');
    const footRate = document.getElementById('delinq-foot-rate');
    const footPenalty = document.getElementById('delinq-foot-penalty');
    const footTotal = document.getElementById('delinq-foot-total');
    const legalAmount = document.getElementById('delinq-legal-amount');

    if (footBase) footBase.textContent = `PHP ${parseFloat(notice.delinquency.principal_due).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    if (footRate) footRate.textContent = `${notice.delinquency.penalty_rate_pct}%`;
    if (footPenalty) footPenalty.textContent = `PHP ${parseFloat(notice.delinquency.penalty_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    if (footTotal) footTotal.textContent = `PHP ${parseFloat(notice.delinquency.total_delinquent_due).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    if (legalAmount) legalAmount.textContent = `PHP ${parseFloat(notice.delinquency.total_delinquent_due).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  }

  if (btnIssueDelinquency) {
    btnIssueDelinquency.addEventListener('click', () => {
      if (!activeSelectedParcelData) {
        alert('Please select a delinquent cadastral lot first.');
        return;
      }

      const pin = activeSelectedParcelData.pin;
      const originalHtml = btnIssueDelinquency.innerHTML;
      btnIssueDelinquency.disabled = true;
      btnIssueDelinquency.innerHTML = `<span>Generating Notice...</span>`;

      fetch(`/api/parcels/${encodeURIComponent(pin)}/issue-delinquency`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      .then(res => res.json())
      .then(data => {
        btnIssueDelinquency.disabled = false;
        btnIssueDelinquency.innerHTML = originalHtml;

        if (data.success && data.notice) {
          populateDelinquencyNotice(data);
          if (modalTaxDelinquency) {
            modalTaxDelinquency.style.display = 'flex';
          }
        } else {
          alert(`Could not issue notice: ${data.message || 'Unknown error'}`);
        }
      })
      .catch(err => {
        btnIssueDelinquency.disabled = false;
        btnIssueDelinquency.innerHTML = originalHtml;
        alert(`Server error issuing notice of delinquency: ${err.message}`);
      });
    });
  }

  if (btnPrintDelinquency) {
    btnPrintDelinquency.addEventListener('click', () => {
      window.print();
    });
  }

  if (btnCloseDelinquencyModal && modalTaxDelinquency) {
    btnCloseDelinquencyModal.addEventListener('click', () => {
      modalTaxDelinquency.style.display = 'none';
    });

    modalTaxDelinquency.addEventListener('click', (e) => {
      if (e.target === modalTaxDelinquency) {
        modalTaxDelinquency.style.display = 'none';
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (modalTaxDelinquency && modalTaxDelinquency.style.display === 'flex') modalTaxDelinquency.style.display = 'none';
        
        const mTransfer = document.getElementById('modal-transfer-ownership');
        if (mTransfer && mTransfer.style.display === 'flex') mTransfer.style.display = 'none';
        
        const mTransferCert = document.getElementById('modal-transfer-certificate');
        if (mTransferCert && mTransferCert.style.display === 'flex') mTransferCert.style.display = 'none';
        
        const mHistory = document.getElementById('modal-ownership-history');
        if (mHistory && mHistory.style.display === 'flex') mHistory.style.display = 'none';
      }
    });
  }

  // 9. Toggle Basemap Layer (Zero API Key)
  const btnToggleLayer = document.getElementById('btn-toggle-layer');
  if (btnToggleLayer) {
    btnToggleLayer.addEventListener('click', () => {
      if (currentLayerType === 'dark') {
        map.removeLayer(darkOsmLayer);
        map.addLayer(satelliteLayer);
        currentLayerType = 'satellite';
        btnToggleLayer.textContent = 'Layer: B&W Satellite';
        btnToggleLayer.classList.add('active');
      } else {
        map.removeLayer(satelliteLayer);
        map.addLayer(darkOsmLayer);
        currentLayerType = 'dark';
        btnToggleLayer.textContent = 'Layer: B&W Cadastre';
        btnToggleLayer.classList.remove('active');
      }
    });
  }

  // 10. Re-center on Isabela Capitol
  if (btnRecenter) {
    btnRecenter.addEventListener('click', () => {
      map.flyTo(ISABELA_CAPITOL, DEFAULT_ZOOM, { duration: 1.0 });
      if (lguSelect) lguSelect.value = '03215';
      if (hudLguTitle) {
        hudLguTitle.textContent = `ISABELA CADASTRE 211 · ILAGAN CITY (16.9749° N, 121.8153° E)`;
      }
    });
  }

  // =========================================================================
  // TRANSFER OF OWNERSHIP & CHAIN OF TITLE HANDLERS
  // =========================================================================
  const btnTransferOwnership = document.getElementById('btn-transfer-ownership');
  const modalTransfer = document.getElementById('modal-transfer-ownership');
  const modalTransferCert = document.getElementById('modal-transfer-certificate');
  const modalHistory = document.getElementById('modal-ownership-history');
  const formTransfer = document.getElementById('form-transfer-ownership');

  // Open transfer form modal
  if (btnTransferOwnership) {
    btnTransferOwnership.addEventListener('click', () => {
      if (!activeSelectedParcelData) {
        if (parcelPolygonMap.size > 0) {
          const first = parcelPolygonMap.values().next().value;
          selectParcel(first.data, first.polygon);
        } else {
          alert('Please select a cadastral parcel on the map to initiate transfer.');
          return;
        }
      }
      const d = activeSelectedParcelData;
      const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '—'; };
      setText('xfer-cur-pin', d.pin);
      setText('xfer-cur-td', d.td_no);
      setText('xfer-cur-owner', d.owner_name);
      setText('xfer-cur-status', d.status);

      // Clear form fields and set default dates
      if (formTransfer) formTransfer.reset();
      const todayIso = new Date().toISOString().split('T')[0];
      const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
      setVal('xfer-deed-date', todayIso);
      setVal('xfer-inscription-date', todayIso);
      setVal('xfer-car-date', todayIso);
      setVal('xfer-tax-date', todayIso);

      if (modalTransfer) modalTransfer.style.display = 'flex';
    });
  }

  // Close transfer form
  const btnCloseTransfer = document.getElementById('btn-close-transfer-modal');
  const btnCancelTransfer = document.getElementById('btn-cancel-transfer');
  if (btnCloseTransfer) btnCloseTransfer.addEventListener('click', () => { if (modalTransfer) modalTransfer.style.display = 'none'; });
  if (btnCancelTransfer) btnCancelTransfer.addEventListener('click', () => { if (modalTransfer) modalTransfer.style.display = 'none'; });
  if (modalTransfer) modalTransfer.addEventListener('click', (e) => { if (e.target === modalTransfer) modalTransfer.style.display = 'none'; });

  // Submit transfer
  if (formTransfer) {
    formTransfer.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!activeSelectedParcelData) return;

      const pin = activeSelectedParcelData.pin;
      const payload = {
        new_owner_name: document.getElementById('xfer-new-owner')?.value?.trim() || '',
        new_owner_address: document.getElementById('xfer-new-address')?.value?.trim() || '',
        new_owner_tin: document.getElementById('xfer-new-tin')?.value?.trim() || '',
        deed_type: document.getElementById('xfer-deed-type')?.value || 'Deed of Absolute Sale',
        deed_no: document.getElementById('xfer-deed-no')?.value?.trim() || '',
        deed_date: document.getElementById('xfer-deed-date')?.value || '',
        registry_of_deeds: document.getElementById('xfer-registry')?.value?.trim() || '',
        tct_oct_no: document.getElementById('xfer-tct-oct')?.value?.trim() || '',
        inscription_date: document.getElementById('xfer-inscription-date')?.value || '',
        bir_car_no: document.getElementById('xfer-car-no')?.value?.trim() || '',
        bir_car_date: document.getElementById('xfer-car-date')?.value || '',
        transfer_tax_or_no: document.getElementById('xfer-tax-or')?.value?.trim() || '',
        transfer_tax_amount: parseFloat(document.getElementById('xfer-tax-amount')?.value) || 0,
        transfer_tax_date: document.getElementById('xfer-tax-date')?.value || ''
      };

      if (!payload.new_owner_name) {
        alert('New owner name is required.');
        return;
      }

      const btn = document.getElementById('btn-execute-transfer');
      if (btn) { btn.disabled = true; btn.innerHTML = '<span>Processing...</span>'; }

      fetch(`/api/parcels/${encodeURIComponent(pin)}/transfer-ownership`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      .then(res => res.json())
      .then(data => {
        if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 3h5v5"></path><path d="M8 21H3v-5"></path><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg><span>Execute Transfer</span>'; }

        if (data.success && data.transfer) {
          if (modalTransfer) modalTransfer.style.display = 'none';
          populateTransferCertificate(data.transfer);
          if (modalTransferCert) modalTransferCert.style.display = 'flex';

          // Refresh inspector
          activeSelectedParcelData.owner_name = data.transfer.new_owner_name;
          activeSelectedParcelData.owner_address = data.transfer.new_owner_address;
          activeSelectedParcelData.td_no = data.transfer.new_td_no;
          if (inspOwner) inspOwner.textContent = data.transfer.new_owner_name;
          if (inspAddress) inspAddress.textContent = data.transfer.new_owner_address;
          if (inspTd) inspTd.textContent = data.transfer.new_td_no;
        } else {
          alert(data.message || 'Transfer failed.');
        }
      })
      .catch(err => {
        if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 3h5v5"></path><path d="M8 21H3v-5"></path><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg><span>Execute Transfer</span>'; }
        alert(`Network error: ${err.message}`);
      });
    });
  }

  // Populate transfer certificate
  function populateTransferCertificate(t) {
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = (val !== undefined && val !== null && val !== '') ? val : '—'; };
    const fmtPHP = (v) => `PHP ${parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    const lguUpper = (t.lgu_name || 'ILAGAN CITY').toUpperCase();
    setText('xfer-cert-lgu', lguUpper.startsWith('CITY') || lguUpper.includes('MUNICIPALITY') ? lguUpper : `MUNICIPALITY OF ${lguUpper}`);
    setText('xfer-cert-ref', t.transfer_ref);
    setText('xfer-cert-date', t.date_issued);
    setText('xfer-cert-pin', t.pin);
    setText('xfer-cert-old-td', t.old_td_no);
    setText('xfer-cert-old-owner', t.old_owner_name);
    setText('xfer-cert-old-address', t.old_owner_address);
    setText('xfer-cert-new-td', t.new_td_no);
    setText('xfer-cert-new-owner', t.new_owner_name);
    setText('xfer-cert-new-address', t.new_owner_address);
    setText('xfer-cert-new-tin', t.new_owner_tin ? `TIN: ${t.new_owner_tin}` : '');
    setText('xfer-cert-lot', t.lot_no);
    setText('xfer-cert-block', t.block_no);
    setText('xfer-cert-section', t.section_no);
    setText('xfer-cert-survey', t.survey_no);
    setText('xfer-cert-class', t.classification);
    setText('xfer-cert-use', t.actual_use);
    setText('xfer-cert-area', `${parseFloat(t.area_sqm || 0).toLocaleString('en-US', {minimumFractionDigits: 2})} sq.m.`);
    setText('xfer-cert-av', fmtPHP(t.assessed_value));
    setText('xfer-cert-deed-type', t.deed_type);
    setText('xfer-cert-deed-no', t.deed_no);
    setText('xfer-cert-deed-date', t.deed_date);
    setText('xfer-cert-registry', t.registry_of_deeds);
    setText('xfer-cert-tct', t.tct_oct_no);
    setText('xfer-cert-inscr-date', t.inscription_date);
    setText('xfer-cert-car', t.bir_car_no);
    setText('xfer-cert-car-date', t.bir_car_date);
    setText('xfer-cert-tax-or', t.transfer_tax_or_no);
    setText('xfer-cert-tax-amt', fmtPHP(t.transfer_tax_amount));
    setText('xfer-cert-officer', (t.officer_username || 'ELENA M. CASTILLO').toUpperCase());
    setText('xfer-cert-officer-badge', `Badge No. ${t.officer_badge || 'PGI-REC-005'}`);
    setText('xfer-cert-assessor', t.assessor_name || 'ATTY. RODOLFO V. RAMOS, REA, REB');
  }

  // Print transfer certificate
  const btnPrintTransfer = document.getElementById('btn-print-transfer');
  if (btnPrintTransfer) btnPrintTransfer.addEventListener('click', () => window.print());

  // Close transfer certificate
  const btnCloseTransferCert = document.getElementById('btn-close-transfer-cert');
  if (btnCloseTransferCert) btnCloseTransferCert.addEventListener('click', () => { if (modalTransferCert) modalTransferCert.style.display = 'none'; });
  if (modalTransferCert) modalTransferCert.addEventListener('click', (e) => { if (e.target === modalTransferCert) modalTransferCert.style.display = 'none'; });

  // Ownership History
  function loadOwnershipHistory(pin) {
    fetch(`/api/parcels/${encodeURIComponent(pin)}/ownership-history`)
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        const container = document.getElementById('ownership-timeline-container');
        const titleEl = document.getElementById('history-parcel-title');
        const lotEl = document.getElementById('history-parcel-lot');
        const countEl = document.getElementById('history-count');

        if (titleEl) titleEl.textContent = `PIN: ${pin}`;
        if (lotEl && activeSelectedParcelData) lotEl.textContent = `${activeSelectedParcelData.lot_no || 'Lot'} · Cad 211`;
        if (countEl) countEl.textContent = `${data.count} Record${data.count !== 1 ? 's' : ''}`;

        if (container) {
          if (data.chain.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 24px; color: #94a3b8; font-size: 13px;">No ownership history recorded for this parcel.</div>';
          } else {
            container.innerHTML = data.chain.map((h, i) => {
              const isLast = i === data.chain.length - 1;
              const badgeText = h.deed_type === 'Original Title' ? 'ORIGINAL' : 'TRANSFER';
              return `
                <div class="history-item ${isLast ? 'history-current' : ''}">
                  <div class="history-dot" style="background: #ffffff;"></div>
                  <div class="history-content">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                      <span class="history-seq">#${h.sequence_no}</span>
                      <span class="history-badge" style="background: rgba(255, 255, 255, 0.08); color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.2);">${badgeText}</span>
                      ${isLast ? '<span class="history-badge" style="background: #ffffff; color: #0a0a0a; border: 1px solid #ffffff; font-weight: 600;">CURRENT OWNER</span>' : ''}
                    </div>
                    <div class="history-owner">${h.owner_name}</div>
                    <div class="history-address">${h.owner_address || '—'}</div>
                    <div class="history-meta">
                      <span>TD: ${h.td_no}</span>
                      ${h.deed_type && h.deed_type !== 'Original Title' ? `<span>Deed: ${h.deed_type}</span>` : ''}
                      ${h.deed_no ? `<span>Doc: ${h.deed_no}</span>` : ''}
                      ${h.tct_oct_no ? `<span>TCT/OCT: ${h.tct_oct_no}</span>` : ''}
                      ${h.transfer_timestamp ? `<span>${new Date(h.transfer_timestamp).toLocaleDateString('en-US', {year: 'numeric', month: 'short', day: 'numeric'})}</span>` : ''}
                    </div>
                  </div>
                </div>
              `;
            }).join('');
          }
        }
        if (modalHistory) modalHistory.style.display = 'flex';
      }
    })
    .catch(err => alert(`Error loading history: ${err.message}`));
  }

  const btnViewHistory = document.getElementById('btn-view-history');
  if (btnViewHistory) {
    btnViewHistory.addEventListener('click', () => {
      if (activeSelectedParcelData) {
        loadOwnershipHistory(activeSelectedParcelData.pin);
      }
    });
  }

  // Close history modal
  const btnCloseHistory = document.getElementById('btn-close-history-modal');
  if (btnCloseHistory) btnCloseHistory.addEventListener('click', () => { if (modalHistory) modalHistory.style.display = 'none'; });
  if (modalHistory) modalHistory.addEventListener('click', (e) => { if (e.target === modalHistory) modalHistory.style.display = 'none'; });

  // =========================================================================
  // LAND RECLASSIFICATION & GENERAL REVISION (GR) ENGINE
  // =========================================================================
  const btnReclassifyParcel = document.getElementById('btn-reclassify-parcel');
  const modalReclassify = document.getElementById('modal-reclassify-parcel');
  const modalNoticeAssessment = document.getElementById('modal-notice-of-assessment');
  const formReclassify = document.getElementById('form-reclassify-parcel');
  const reclassNewClass = document.getElementById('reclass-new-class');
  const reclassNewUse = document.getElementById('reclass-new-use');
  const reclassUnitValue = document.getElementById('reclass-unit-value');
  const reclassAssessmentLevel = document.getElementById('reclass-assessment-level');
  const reclassSmvPresets = document.getElementById('reclass-smv-presets');
  const btnCloseReclass = document.getElementById('btn-close-reclass-modal');
  const btnCancelReclass = document.getElementById('btn-cancel-reclass');
  const btnPrintNoticeAssessment = document.getElementById('btn-print-notice-assessment');
  const btnCloseNoticeModal = document.getElementById('btn-close-notice-modal');

  let smvRatesCache = null;

  // Fetch SMV benchmark rates
  function fetchSmvRates() {
    if (smvRatesCache) return Promise.resolve(smvRatesCache);
    return fetch('/api/smv/rates')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          smvRatesCache = data.rates;
          return smvRatesCache;
        }
        return null;
      })
      .catch(() => null);
  }

  // Populate SMV preset chips for the selected classification
  function renderSmvPresets(classification) {
    if (!reclassSmvPresets) return;
    reclassSmvPresets.innerHTML = '<span style="color:#64748b; font-size:10px;">Loading benchmarks...</span>';
    
    fetchSmvRates().then(rates => {
      if (!rates || !rates[classification]) {
        reclassSmvPresets.innerHTML = '<span style="color:#64748b; font-size:10px;">No benchmark presets available.</span>';
        return;
      }
      const cat = rates[classification];
      const chips = cat.benchmark_unit_values || [];
      if (chips.length === 0) {
        reclassSmvPresets.innerHTML = '<span style="color:#64748b; font-size:10px;">No presets defined.</span>';
        return;
      }
      reclassSmvPresets.innerHTML = chips.map(c => `
        <button type="button" class="smv-chip" data-val="${c.unit_value}" data-desc="${c.sub_class}">
          <span>${c.sub_class.split(' - ')[1] || c.sub_class}</span>
          <strong style="color:#ffffff;">PHP ${c.unit_value.toLocaleString()}</strong>
        </button>
      `).join('');

      // Wire up chip click
      reclassSmvPresets.querySelectorAll('.smv-chip').forEach(btn => {
        btn.addEventListener('click', () => {
          reclassSmvPresets.querySelectorAll('.smv-chip').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const val = parseFloat(btn.getAttribute('data-val'));
          const desc = btn.getAttribute('data-desc');
          if (reclassUnitValue) reclassUnitValue.value = val;
          if (reclassNewUse) reclassNewUse.value = desc;
          updateReclassPreview();
        });
      });
    });
  }

  // Live Reactive Real-Time Telemetry Preview Calculation
  function updateReclassPreview() {
    if (!activeSelectedParcelData) return;
    const p = activeSelectedParcelData;
    const area = parseFloat(p.area_sqm || 0);
    const oldMv = parseFloat(p.market_value || 0);
    const oldLvl = parseFloat(p.assessment_level || 0);
    const oldAv = parseFloat(p.assessed_value || 0);
    const oldTax = parseFloat(p.tax_due || 0);

    const unitVal = parseFloat(reclassUnitValue ? reclassUnitValue.value : 0) || 0;
    const lvl = parseFloat(reclassAssessmentLevel ? reclassAssessmentLevel.value : 0) || 0;
    const targetClass = reclassNewClass ? reclassNewClass.value : p.classification;

    const newMv = roundNum(area * unitVal, 2);
    const newAv = roundNum(newMv * (lvl / 100.0), 2);

    const isExempt = (p.status && p.status.includes('Exempt')) || ['institutional', 'special'].includes(targetClass.toLowerCase());
    const newTax = isExempt ? 0.0 : roundNum(newAv * 0.03, 2);

    const diffMv = roundNum(newMv - oldMv, 2);
    const diffLvl = roundNum(lvl - oldLvl, 1);
    const diffAv = roundNum(newAv - oldAv, 2);
    const diffTax = roundNum(newTax - oldTax, 2);
    const diffTaxPct = oldTax > 0 ? roundNum((diffTax / oldTax) * 100.0, 1) : 0.0;

    const fmtPHP = v => `PHP ${parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const fmtDiff = (d, isCurr = true) => {
      const prefix = d > 0 ? '+' : '';
      const colorCls = d > 0 ? 'variance-positive' : (d < 0 ? 'variance-negative' : 'variance-neutral');
      return `<span class="${colorCls}">${prefix}${isCurr ? fmtPHP(d) : d}</span>`;
    };

    const setTxt = (id, html) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = html;
    };

    setTxt('prev-mv-old', fmtPHP(oldMv));
    setTxt('prev-mv-new', fmtPHP(newMv));
    setTxt('prev-mv-diff', fmtDiff(diffMv));

    setTxt('prev-lvl-old', `${oldLvl}%`);
    setTxt('prev-lvl-new', `${lvl}%`);
    setTxt('prev-lvl-diff', `<span class="${diffLvl >= 0 ? 'variance-positive' : 'variance-negative'}">${diffLvl >= 0 ? '+' : ''}${diffLvl}%</span>`);

    setTxt('prev-av-old', fmtPHP(oldAv));
    setTxt('prev-av-new', fmtPHP(newAv));
    setTxt('prev-av-diff', fmtDiff(diffAv));

    setTxt('prev-tax-old', fmtPHP(oldTax));
    setTxt('prev-tax-new', fmtPHP(newTax));
    const taxDiffHtml = `${diffTax >= 0 ? '+' : ''}${fmtPHP(diffTax)} (${diffTaxPct >= 0 ? '+' : ''}${diffTaxPct}%)`;
    setTxt('prev-tax-diff', `<span class="${diffTax >= 0 ? 'variance-positive' : 'variance-negative'}">${taxDiffHtml}</span>`);

    const badge = document.getElementById('reclass-variance-badge');
    if (badge) {
      if (diffTax > 0) {
        badge.textContent = `TAX REVENUE INCREASE: +${fmtPHP(diffTax)}/YR`;
        badge.style.background = '#ffffff';
        badge.style.color = '#0a0a0a';
        badge.style.border = '1px solid #ffffff';
        badge.style.fontWeight = '600';
      } else if (diffTax < 0) {
        badge.textContent = `TAX REVENUE DECREASE: ${fmtPHP(diffTax)}/YR`;
        badge.style.background = 'rgba(255, 255, 255, 0.08)';
        badge.style.color = '#a1a1aa';
        badge.style.border = '1px solid rgba(255, 255, 255, 0.25)';
      } else {
        badge.textContent = 'NO TAX VARIANCE (NEUTRAL)';
        badge.style.background = 'rgba(148, 163, 184, 0.2)';
        badge.style.color = '#94a3b8';
        badge.style.border = '1px solid rgba(148, 163, 184, 0.4)';
      }
    }
  }

  function roundNum(num, dec) {
    return +(Math.round(num + "e+" + dec) + "e-" + dec);
  }

  // Open Reclassification modal
  if (btnReclassifyParcel) {
    btnReclassifyParcel.addEventListener('click', () => {
      if (!activeSelectedParcelData) {
        if (parcelPolygonMap.size > 0) {
          const first = parcelPolygonMap.values().next().value;
          selectParcel(first.data, first.polygon);
        } else {
          alert('Please select a cadastral parcel on the map to reclassify.');
          return;
        }
      }
      const d = activeSelectedParcelData;
      const setEl = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt || '—'; };
      setEl('reclass-cur-pin', d.pin);
      setEl('reclass-cur-lot', d.lot_no);
      setEl('reclass-cur-area', `${parseFloat(d.area_sqm || 0).toLocaleString()} sq.m.`);
      setEl('reclass-cur-class', d.classification);
      setEl('reclass-cur-owner', d.owner_name);
      setEl('reclass-cur-tax', `PHP ${parseFloat(d.tax_due || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);

      // Initialize inputs with current or intelligent defaults
      if (reclassNewClass) {
        reclassNewClass.value = d.classification || 'Residential';
      }
      if (reclassNewUse) {
        reclassNewUse.value = d.actual_use || '';
      }
      if (reclassUnitValue) {
        reclassUnitValue.value = d.unit_value || 2500;
      }
      if (reclassAssessmentLevel) {
        const defaultLevels = { 'residential': 20, 'commercial': 50, 'industrial': 50, 'agricultural': 40, 'institutional': 50, 'special': 10 };
        reclassAssessmentLevel.value = defaultLevels[(d.classification || 'residential').toLowerCase()] || 20;
      }

      renderSmvPresets(reclassNewClass ? reclassNewClass.value : 'Residential');
      updateReclassPreview();

      if (modalReclassify) modalReclassify.style.display = 'flex';
    });
  }

  // Reclassification form input change listeners
  if (reclassNewClass) {
    reclassNewClass.addEventListener('change', () => {
      const selected = reclassNewClass.value;
      const defaultLevels = { 'residential': 20, 'commercial': 50, 'industrial': 50, 'agricultural': 40, 'institutional': 50, 'special': 10 };
      if (reclassAssessmentLevel) {
        reclassAssessmentLevel.value = defaultLevels[selected.toLowerCase()] || 20;
      }
      renderSmvPresets(selected);
      updateReclassPreview();
    });
  }

  if (reclassUnitValue) {
    reclassUnitValue.addEventListener('input', updateReclassPreview);
  }
  if (reclassAssessmentLevel) {
    reclassAssessmentLevel.addEventListener('input', updateReclassPreview);
  }

  // Close Reclassification modal
  if (btnCloseReclass) btnCloseReclass.addEventListener('click', () => { if (modalReclassify) modalReclassify.style.display = 'none'; });
  if (btnCancelReclass) btnCancelReclass.addEventListener('click', () => { if (modalReclassify) modalReclassify.style.display = 'none'; });
  if (modalReclassify) modalReclassify.addEventListener('click', (e) => { if (e.target === modalReclassify) modalReclassify.style.display = 'none'; });

  // Submit Reclassification
  if (formReclassify) {
    formReclassify.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!activeSelectedParcelData) return;

      const pin = activeSelectedParcelData.pin;
      const payload = {
        new_classification: reclassNewClass ? reclassNewClass.value : 'Residential',
        new_actual_use: reclassNewUse ? reclassNewUse.value.trim() : '',
        new_unit_value: parseFloat(reclassUnitValue ? reclassUnitValue.value : 0),
        new_assessment_level: parseFloat(reclassAssessmentLevel ? reclassAssessmentLevel.value : 0),
        reason: document.getElementById('reclass-reason')?.value || 'Land Use Reclassification / General Revision',
        ordinance_no: document.getElementById('reclass-ordinance')?.value || 'Sangguniang Panlalawigan Ordinance No. 2026-04'
      };

      const btn = document.getElementById('btn-execute-reclass');
      if (btn) { btn.disabled = true; btn.innerHTML = '<span>Processing Reassessment...</span>'; }

      fetch(`/api/parcels/${encodeURIComponent(pin)}/reclassify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      .then(res => res.json())
      .then(data => {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg><span>Apply Reclassification & Issue Notice</span>';
        }

        if (data.success && data.notice) {
          if (modalReclassify) modalReclassify.style.display = 'none';
          populateNoticeOfAssessment(data.notice);
          if (modalNoticeAssessment) modalNoticeAssessment.style.display = 'flex';

          // Update active selected parcel state & inspector
          const rev = data.revision;
          activeSelectedParcelData.classification = rev.new_classification;
          activeSelectedParcelData.actual_use = payload.new_actual_use;
          activeSelectedParcelData.unit_value = payload.new_unit_value;
          activeSelectedParcelData.market_value = rev.new_market_value;
          activeSelectedParcelData.assessment_level = payload.new_assessment_level;
          activeSelectedParcelData.assessed_value = rev.new_assessed_value;
          activeSelectedParcelData.tax_due = rev.new_tax_due;
          activeSelectedParcelData.td_no = rev.td_no;

          if (inspClass) inspClass.textContent = rev.new_classification;
          if (inspUse) inspUse.textContent = payload.new_actual_use;
          if (inspUnit) inspUnit.textContent = `PHP ${parseFloat(payload.new_unit_value).toLocaleString('en-US', { minimumFractionDigits: 2 })} / sq.m.`;
          if (inspMv) inspMv.textContent = `PHP ${parseFloat(rev.new_market_value).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
          if (inspLevel) inspLevel.textContent = `${payload.new_assessment_level}%`;
          if (inspAv) inspAv.textContent = `PHP ${parseFloat(rev.new_assessed_value).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
          if (inspTax) inspTax.textContent = `PHP ${parseFloat(rev.new_tax_due).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
          if (inspTd) inspTd.textContent = rev.td_no;
        } else {
          alert(data.message || 'Reclassification failed.');
        }
      })
      .catch(err => {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg><span>Apply Reclassification & Issue Notice</span>';
        }
        alert(`Network error: ${err.message}`);
      });
    });
  }

  // Populate Printable Official Notice of Assessment Document
  function populateNoticeOfAssessment(n) {
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = (val !== undefined && val !== null && val !== '') ? val : '—'; };
    const fmtPHP = v => `PHP ${parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const fmtDiff = (d, isCurr = true) => `${d >= 0 ? '+' : ''}${isCurr ? fmtPHP(d) : d}`;

    const lguUpper = (n.lgu_name || 'ILAGAN CITY').toUpperCase();
    setText('nar-doc-lgu', lguUpper.startsWith('CITY') || lguUpper.includes('MUNICIPALITY') ? lguUpper : `MUNICIPALITY OF ${lguUpper}`);
    setText('nar-doc-no', n.revision_no);
    setText('nar-doc-date', n.date_issued);
    setText('nar-doc-effectivity', n.effectivity);
    setText('nar-doc-owner', n.owner_name);
    setText('nar-doc-address', n.owner_address);
    setText('nar-doc-cadastral', `${n.lot_no || 'Lot'}, ${n.block_no || 'Blk'}, ${n.survey_no || 'Cad 211'}`);
    setText('nar-doc-pin', n.pin);
    setText('nar-doc-td', n.td_no);

    const c = n.comparison;
    if (c) {
      setText('nar-comp-class-old', c.classification.old);
      setText('nar-comp-class-new', c.classification.new);
      setText('nar-comp-class-diff', c.classification.old === c.classification.new ? 'Unchanged' : 'Reclassified');

      setText('nar-comp-use-old', c.actual_use.old);
      setText('nar-comp-use-new', c.actual_use.new);

      setText('nar-comp-unit-old', parseFloat(c.unit_value.old).toLocaleString('en-US', { minimumFractionDigits: 2 }));
      setText('nar-comp-unit-new', parseFloat(c.unit_value.new).toLocaleString('en-US', { minimumFractionDigits: 2 }));
      setText('nar-comp-unit-diff', fmtDiff(c.unit_value.diff));

      setText('nar-comp-mv-old', parseFloat(c.market_value.old).toLocaleString('en-US', { minimumFractionDigits: 2 }));
      setText('nar-comp-mv-new', parseFloat(c.market_value.new).toLocaleString('en-US', { minimumFractionDigits: 2 }));
      setText('nar-comp-mv-diff', fmtDiff(c.market_value.diff));

      setText('nar-comp-lvl-old', `${c.assessment_level.old}%`);
      setText('nar-comp-lvl-new', `${c.assessment_level.new}%`);
      setText('nar-comp-lvl-diff', `${c.assessment_level.diff >= 0 ? '+' : ''}${c.assessment_level.diff}%`);

      setText('nar-comp-av-old', parseFloat(c.assessed_value.old).toLocaleString('en-US', { minimumFractionDigits: 2 }));
      setText('nar-comp-av-new', parseFloat(c.assessed_value.new).toLocaleString('en-US', { minimumFractionDigits: 2 }));
      setText('nar-comp-av-diff', fmtDiff(c.assessed_value.diff));

      setText('nar-comp-tax-old', fmtPHP(c.tax_due.old));
      setText('nar-comp-tax-new', fmtPHP(c.tax_due.new));
      const pctStr = c.tax_due.diff_pct >= 0 ? `+${c.tax_due.diff_pct}%` : `${c.tax_due.diff_pct}%`;
      setText('nar-comp-tax-diff', `${fmtDiff(c.tax_due.diff)} (${pctStr})`);
    }

    setText('nar-doc-appraiser', (n.appraiser_name || 'ENGR. MARITES D. PASCUAL').toUpperCase());
    setText('nar-doc-appraiser-badge', `Badge No. ${n.appraiser_badge || 'PGI-GIS-014'}`);
    setText('nar-doc-assessor', n.assessor_name || 'ATTY. RODOLFO V. RAMOS, REA, REB');
  }

  // Print Notice of Assessment
  if (btnPrintNoticeAssessment) {
    btnPrintNoticeAssessment.addEventListener('click', () => window.print());
  }

  // Close Notice modal
  if (btnCloseNoticeModal) {
    btnCloseNoticeModal.addEventListener('click', () => {
      if (modalNoticeAssessment) modalNoticeAssessment.style.display = 'none';
    });
  }
  if (modalNoticeAssessment) {
    modalNoticeAssessment.addEventListener('click', (e) => {
      if (e.target === modalNoticeAssessment) modalNoticeAssessment.style.display = 'none';
    });
  }

  // =========================================================================
  // 12. CADASTRAL WORKBENCH & PARCEL SUBDIVISION ENGINE (TURF.JS POWERED)
  // =========================================================================
  let isWorkbenchActive = false;
  let currentMotherParcel = null;
  const workbenchLayerGroup = L.layerGroup().addTo(map);
  let isDrawingCutLine = false;
  let cutClickPoints = [];
  let cutMarkers = [];
  let currentCutAxis = 'ew'; // 'ew' or 'ns'
  let currentSplitRatio = 50; // percentage
  let currentSubLots = null;

  // DOM Elements for Workbench
  const inspectorPanel = document.querySelector('.parcel-inspector-panel');
  const workbenchPanel = document.getElementById('workbench-panel');
  const workbenchHud = document.getElementById('workbench-hud');
  const btnOpenWorkbench = document.getElementById('btn-open-workbench');
  const btnCloseWorkbench = document.getElementById('btn-close-workbench');
  const btnExitWb = document.getElementById('btn-wb-exit');
  const btnExitWbHud = document.getElementById('btn-exit-wb-hud');
  const btnCancelCut = document.getElementById('btn-cancel-cut');
  const sidebarNavWorkbench = document.getElementById('sidebar-nav-workbench');

  // Tool Buttons & Inputs
  const btnWbDrawCut = document.getElementById('btn-wb-draw-cut');
  const btnWbBisect50 = document.getElementById('btn-wb-bisect-50');
  const btnWbSplit60 = document.getElementById('btn-wb-split-60');
  const btnWbSplit70 = document.getElementById('btn-wb-split-70');
  const btnAxisEw = document.getElementById('btn-axis-ew');
  const btnAxisNs = document.getElementById('btn-axis-ns');
  const wbRatioSlider = document.getElementById('wb-ratio-slider');
  const wbRatioDisplay = document.getElementById('wb-ratio-display');
  const btnWbCommit = document.getElementById('btn-wb-commit');

  // Value Display Fields
  const wbParentPin = document.getElementById('wb-parent-pin');
  const wbParentLot = document.getElementById('wb-parent-lot');
  const wbParentArea = document.getElementById('wb-parent-area');
  const wbParentUnit = document.getElementById('wb-parent-unit');
  const wbChildAPin = document.getElementById('wb-child-a-pin');
  const wbChildAArea = document.getElementById('wb-child-a-area');
  const wbChildAAv = document.getElementById('wb-child-a-av');
  const wbChildAOwner = document.getElementById('wb-child-a-owner');
  const wbChildBPin = document.getElementById('wb-child-b-pin');
  const wbChildBArea = document.getElementById('wb-child-b-area');
  const wbChildBAv = document.getElementById('wb-child-b-av');
  const wbChildBOwner = document.getElementById('wb-child-b-owner');
  const wbBalanceBadge = document.getElementById('wb-balance-badge');

  // Geometric Coordinate Conversion Helpers
  function coordsToGeoJSON(latLngs) {
    return latLngs.map(pt => [pt[1], pt[0]]);
  }

  function geoJSONToLatLngs(coords) {
    return coords.map(pt => [pt[1], pt[0]]);
  }

  function extractPolygonRing(geom) {
    if (!geom) return null;
    if (geom.type === 'Polygon') {
      return geom.coordinates[0];
    } else if (geom.type === 'MultiPolygon') {
      let maxArea = -1;
      let largestRing = null;
      geom.coordinates.forEach(polyCoords => {
        try {
          const p = turf.polygon(polyCoords);
          const a = turf.area(p);
          if (a > maxArea) {
            maxArea = a;
            largestRing = polyCoords[0];
          }
        } catch (e) {}
      });
      return largestRing || geom.coordinates[0][0];
    }
    return null;
  }

  // Pure Client-side Polygon Slicing via Turf.js
  function sliceParcelGeometry(parentCoords, config) {
    if (!parentCoords || parentCoords.length < 3) return null;
    if (typeof turf === 'undefined') {
      console.error('Turf.js is not loaded');
      return null;
    }

    const geoCoords = coordsToGeoJSON(parentCoords);
    if (geoCoords[0][0] !== geoCoords[geoCoords.length - 1][0] ||
        geoCoords[0][1] !== geoCoords[geoCoords.length - 1][1]) {
      geoCoords.push([...geoCoords[0]]);
    }

    let parentPoly;
    try {
      parentPoly = turf.polygon([geoCoords]);
    } catch (e) {
      console.error('Failed to create parent polygon feature:', e);
      return null;
    }

    const bbox = turf.bbox(parentPoly); // [minLng, minLat, maxLng, maxLat]
    const minLng = bbox[0], minLat = bbox[1], maxLng = bbox[2], maxLat = bbox[3];
    const widthLng = maxLng - minLng;
    const heightLat = maxLat - minLat;

    let halfPlane1, halfPlane2;

    if (config.type === 'ratio') {
      const ratio = config.ratio / 100.0;
      const axis = config.axis || 'ew';
      const margin = 0.5;

      if (axis === 'ew') {
        const splitLat = minLat + heightLat * (1.0 - ratio);
        halfPlane1 = turf.polygon([[
          [minLng - margin, splitLat],
          [maxLng + margin, splitLat],
          [maxLng + margin, maxLat + margin],
          [minLng - margin, maxLat + margin],
          [minLng - margin, splitLat]
        ]]);
        halfPlane2 = turf.polygon([[
          [minLng - margin, minLat - margin],
          [maxLng + margin, minLat - margin],
          [maxLng + margin, splitLat],
          [minLng - margin, splitLat],
          [minLng - margin, minLat - margin]
        ]]);
      } else {
        const splitLng = minLng + widthLng * ratio;
        halfPlane1 = turf.polygon([[
          [minLng - margin, minLat - margin],
          [splitLng, minLat - margin],
          [splitLng, maxLat + margin],
          [minLng - margin, maxLat + margin],
          [minLng - margin, minLat - margin]
        ]]);
        halfPlane2 = turf.polygon([[
          [splitLng, minLat - margin],
          [maxLng + margin, minLat - margin],
          [maxLng + margin, maxLat + margin],
          [splitLng, maxLat + margin],
          [splitLng, minLat - margin]
        ]]);
      }
    } else if (config.type === 'line') {
      const p1 = config.p1;
      const p2 = config.p2;

      const x1 = p1[1], y1 = p1[0];
      const x2 = p2[1], y2 = p2[0];

      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 0.0001;
      const ux = dx / len;
      const uy = dy / len;
      const nx = -uy;
      const ny = ux;
      const scale = 2.0;

      const ex1x = x1 - ux * scale;
      const ex1y = y1 - uy * scale;
      const ex2x = x2 + ux * scale;
      const ex2y = y2 + uy * scale;

      halfPlane1 = turf.polygon([[
        [ex1x, ex1y],
        [ex2x, ex2y],
        [ex2x + nx * scale, ex2y + ny * scale],
        [ex1x + nx * scale, ex1y + ny * scale],
        [ex1x, ex1y]
      ]]);

      halfPlane2 = turf.polygon([[
        [ex1x, ex1y],
        [ex2x, ex2y],
        [ex2x - nx * scale, ex2y - ny * scale],
        [ex1x - nx * scale, ex1y - ny * scale],
        [ex1x, ex1y]
      ]]);
    }

    try {
      const isectA = turf.intersect(parentPoly, halfPlane1);
      const isectB = turf.intersect(parentPoly, halfPlane2);

      if (!isectA || !isectB) return null;

      const ringA = extractPolygonRing(isectA.geometry);
      const ringB = extractPolygonRing(isectB.geometry);

      if (!ringA || !ringB) return null;

      const latLngsA = geoJSONToLatLngs(ringA);
      const latLngsB = geoJSONToLatLngs(ringB);

      const areaA_m2 = turf.area(isectA);
      const areaB_m2 = turf.area(isectB);

      return {
        latLngsA,
        latLngsB,
        areaA_m2,
        areaB_m2
      };
    } catch (err) {
      console.warn('Turf intersection computation notice:', err);
      return null;
    }
  }

  // Execute Split Calculation and Refresh Visual Overlays
  function executeSubdivisionSplit(config) {
    if (!currentMotherParcel) return;

    let coords = currentMotherParcel.coordinates;
    if (!coords && currentMotherParcel.geo_coords) {
      try { coords = JSON.parse(currentMotherParcel.geo_coords); } catch (e) {}
    }

    if (!coords || coords.length < 3) return;

    const result = sliceParcelGeometry(coords, config);
    if (!result) {
      if (config.type === 'line') {
        alert('[NOTICE] Cut line did not fully intersect across the parcel polygon. Please click two points traversing across the lot.');
      }
      return;
    }

    const parentTotalArea = parseFloat(currentMotherParcel.area_sqm || 0);
    const totalAreaM2 = result.areaA_m2 + result.areaB_m2;
    const ratioA = totalAreaM2 > 0 ? (result.areaA_m2 / totalAreaM2) : 0.5;

    const areaA = Math.round(parentTotalArea * ratioA * 100) / 100;
    const areaB = Math.round((parentTotalArea - areaA) * 100) / 100;
    const pctA = ((areaA / parentTotalArea) * 100).toFixed(1);
    const pctB = ((areaB / parentTotalArea) * 100).toFixed(1);

    const unitVal = parseFloat(currentMotherParcel.unit_value || 0);
    const lvl = parseFloat(currentMotherParcel.assessment_level || 0) / 100.0;
    const avA = Math.round(areaA * unitVal * lvl * 100) / 100;
    const avB = Math.round(areaB * unitVal * lvl * 100) / 100;

    // Update form fields
    if (wbChildAPin) wbChildAPin.textContent = `${currentMotherParcel.pin}-A`;
    if (wbChildAArea) wbChildAArea.textContent = `${areaA.toLocaleString('en-US', {minimumFractionDigits: 2})} sq.m. (${pctA}%)`;
    if (wbChildAAv) wbChildAAv.textContent = `PHP ${avA.toLocaleString('en-US', {minimumFractionDigits: 2})}`;

    if (wbChildBPin) wbChildBPin.textContent = `${currentMotherParcel.pin}-B`;
    if (wbChildBArea) wbChildBArea.textContent = `${areaB.toLocaleString('en-US', {minimumFractionDigits: 2})} sq.m. (${pctB}%)`;
    if (wbChildBAv) wbChildBAv.textContent = `PHP ${avB.toLocaleString('en-US', {minimumFractionDigits: 2})}`;

    if (wbBalanceBadge) {
      wbBalanceBadge.textContent = `Balance: 100.0% (${(areaA + areaB).toFixed(2)} sq.m.)`;
    }

    // Save active child definitions
    currentSubLots = {
      childA: {
        suffix: 'A',
        pin: `${currentMotherParcel.pin}-A`,
        lot_no: `${currentMotherParcel.lot_no}-A`,
        area: areaA,
        coords: result.latLngsA
      },
      childB: {
        suffix: 'B',
        pin: `${currentMotherParcel.pin}-B`,
        lot_no: `${currentMotherParcel.lot_no}-B`,
        area: areaB,
        coords: result.latLngsB
      }
    };

    // Render Preview Polygons on Map
    workbenchLayerGroup.clearLayers();

    // Sub-Lot A: dashed hairline preview
    const polyA = L.polygon(result.latLngsA, {
      color: '#ffffff',
      weight: 1.5,
      dashArray: '4, 4',
      fillColor: '#ffffff',
      fillOpacity: 0.10
    });
    polyA.bindTooltip(`${currentMotherParcel.lot_no}-A (${pctA}%)`, {
      permanent: true,
      direction: 'center',
      className: 'cadastral-lot-tooltip'
    });
    polyA.addTo(workbenchLayerGroup);

    // Sub-Lot B: solid hairline preview
    const polyB = L.polygon(result.latLngsB, {
      color: '#ffffff',
      weight: 1.5,
      fillColor: '#ffffff',
      fillOpacity: 0.22
    });
    polyB.bindTooltip(`${currentMotherParcel.lot_no}-B (${pctB}%)`, {
      permanent: true,
      direction: 'center',
      className: 'cadastral-lot-tooltip'
    });
    polyB.addTo(workbenchLayerGroup);
  }

  // Open Workbench Mode
  function enterWorkbenchMode(parcelData) {
    if (!parcelData) {
      if (activeSelectedParcelData) {
        parcelData = activeSelectedParcelData;
      } else if (parcelPolygonMap.size > 0) {
        parcelData = parcelPolygonMap.values().next().value.data;
      }
    }

    if (!parcelData) {
      alert('Please select a parcel on the map first.');
      return;
    }

    isWorkbenchActive = true;
    currentMotherParcel = parcelData;

    // Switch panels
    if (inspectorPanel) inspectorPanel.style.display = 'none';
    if (workbenchPanel) workbenchPanel.style.display = 'flex';
    if (workbenchHud) workbenchHud.style.display = 'flex';

    // Highlight mother parcel
    const entry = parcelPolygonMap.get(parcelData.pin);
    if (entry && entry.polygon) {
      map.flyToBounds(entry.polygon.getBounds(), { padding: [60, 60], duration: 0.8 });
    }

    // Populate Mother Parcel data
    if (wbParentPin) wbParentPin.textContent = parcelData.pin || '—';
    if (wbParentLot) wbParentLot.textContent = `${parcelData.lot_no || '—'} (${parcelData.section_no || 'Sec A'})`;
    const areaVal = parseFloat(parcelData.area_sqm || 0);
    if (wbParentArea) wbParentArea.textContent = `${areaVal.toLocaleString('en-US', {minimumFractionDigits: 2})} sq.m.`;
    if (wbParentUnit) wbParentUnit.textContent = `PHP ${parseFloat(parcelData.unit_value || 0).toLocaleString('en-US', {minimumFractionDigits: 2})} / sq.m.`;

    if (wbChildAOwner) wbChildAOwner.value = `${parcelData.owner_name} (Retained)`;
    if (wbChildBOwner) wbChildBOwner.value = 'New Transferee / Buyer';

    // Reset buttons and ratio
    currentSplitRatio = 50;
    if (wbRatioSlider) wbRatioSlider.value = 50;
    if (wbRatioDisplay) wbRatioDisplay.textContent = '50% A / 50% B';

    // Execute default 50/50 split
    executeSubdivisionSplit({ type: 'ratio', ratio: 50, axis: currentCutAxis });
  }

  // Exit Workbench Mode
  function exitWorkbenchMode() {
    isWorkbenchActive = false;
    isDrawingCutLine = false;
    map.getContainer().style.cursor = '';
    clearCutMarkers();
    workbenchLayerGroup.clearLayers();

    if (workbenchPanel) workbenchPanel.style.display = 'none';
    if (workbenchHud) workbenchHud.style.display = 'none';
    if (inspectorPanel) {
      inspectorPanel.style.display = 'flex';
      inspectorPanel.classList.remove('collapsed');
    }
    if (btnExpandInspector) btnExpandInspector.style.display = 'none';
  }

  function clearCutMarkers() {
    cutMarkers.forEach(m => map.removeLayer(m));
    cutMarkers = [];
    cutClickPoints = [];
  }

  // Interactive Cut Line Map Click Handler
  function onMapCutClick(e) {
    if (!isDrawingCutLine) return;

    cutClickPoints.push([e.latlng.lat, e.latlng.lng]);

    // Add marker
    const marker = L.circleMarker(e.latlng, {
      radius: 4,
      color: '#ffffff',
      fillColor: '#ffffff',
      fillOpacity: 1
    }).addTo(map);
    cutMarkers.push(marker);

    if (cutClickPoints.length === 2) {
      const p1 = cutClickPoints[0];
      const p2 = cutClickPoints[1];

      // Draw cut guide line
      const cutLine = L.polyline([p1, p2], {
        color: '#ffffff',
        weight: 2,
        dashArray: '3, 4'
      }).addTo(map);
      cutMarkers.push(cutLine);

      // Execute slicing
      executeSubdivisionSplit({ type: 'line', p1, p2 });

      // Reset drawing state
      isDrawingCutLine = false;
      map.getContainer().style.cursor = '';
      if (btnWbDrawCut) btnWbDrawCut.classList.remove('active');
    }
  }

  map.on('click', onMapCutClick);

  // Button Listeners
  if (btnOpenWorkbench) {
    btnOpenWorkbench.addEventListener('click', () => {
      enterWorkbenchMode(activeSelectedParcelData);
    });
  }

  if (sidebarNavWorkbench) {
    sidebarNavWorkbench.addEventListener('click', (e) => {
      e.preventDefault();
      enterWorkbenchMode(activeSelectedParcelData);
    });
  }

  if (btnCloseWorkbench) btnCloseWorkbench.addEventListener('click', exitWorkbenchMode);
  if (btnExitWb) btnExitWb.addEventListener('click', exitWorkbenchMode);
  if (btnExitWbHud) btnExitWbHud.addEventListener('click', exitWorkbenchMode);

  if (btnCancelCut) {
    btnCancelCut.addEventListener('click', () => {
      clearCutMarkers();
      isDrawingCutLine = false;
      map.getContainer().style.cursor = '';
      if (btnWbDrawCut) btnWbDrawCut.classList.remove('active');
      executeSubdivisionSplit({ type: 'ratio', ratio: currentSplitRatio, axis: currentCutAxis });
    });
  }

  // Draw Cut Tool Button
  if (btnWbDrawCut) {
    btnWbDrawCut.addEventListener('click', () => {
      clearCutMarkers();
      isDrawingCutLine = true;
      map.getContainer().style.cursor = 'crosshair';
      btnWbDrawCut.classList.add('active');
    });
  }

  // Presets
  if (btnWbBisect50) {
    btnWbBisect50.addEventListener('click', () => {
      clearCutMarkers();
      currentSplitRatio = 50;
      if (wbRatioSlider) wbRatioSlider.value = 50;
      if (wbRatioDisplay) wbRatioDisplay.textContent = '50% A / 50% B';
      executeSubdivisionSplit({ type: 'ratio', ratio: 50, axis: currentCutAxis });
    });
  }

  if (btnWbSplit60) {
    btnWbSplit60.addEventListener('click', () => {
      clearCutMarkers();
      currentSplitRatio = 60;
      if (wbRatioSlider) wbRatioSlider.value = 60;
      if (wbRatioDisplay) wbRatioDisplay.textContent = '60% A / 40% B';
      executeSubdivisionSplit({ type: 'ratio', ratio: 60, axis: currentCutAxis });
    });
  }

  if (btnWbSplit70) {
    btnWbSplit70.addEventListener('click', () => {
      clearCutMarkers();
      currentSplitRatio = 70;
      if (wbRatioSlider) wbRatioSlider.value = 70;
      if (wbRatioDisplay) wbRatioDisplay.textContent = '70% A / 30% B';
      executeSubdivisionSplit({ type: 'ratio', ratio: 70, axis: currentCutAxis });
    });
  }

  // Axis Buttons
  if (btnAxisEw) {
    btnAxisEw.addEventListener('click', () => {
      btnAxisEw.classList.add('active');
      if (btnAxisNs) btnAxisNs.classList.remove('active');
      currentCutAxis = 'ew';
      clearCutMarkers();
      executeSubdivisionSplit({ type: 'ratio', ratio: currentSplitRatio, axis: currentCutAxis });
    });
  }

  if (btnAxisNs) {
    btnAxisNs.addEventListener('click', () => {
      btnAxisNs.classList.add('active');
      if (btnAxisEw) btnAxisEw.classList.remove('active');
      currentCutAxis = 'ns';
      clearCutMarkers();
      executeSubdivisionSplit({ type: 'ratio', ratio: currentSplitRatio, axis: currentCutAxis });
    });
  }

  // Ratio Slider
  if (wbRatioSlider) {
    wbRatioSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      currentSplitRatio = val;
      if (wbRatioDisplay) wbRatioDisplay.textContent = `${val}% A / ${100 - val}% B`;
      clearCutMarkers();
      executeSubdivisionSplit({ type: 'ratio', ratio: val, axis: currentCutAxis });
    });
  }

  // Commit Subdivision to Database
  if (btnWbCommit) {
    btnWbCommit.addEventListener('click', () => {
      if (!currentMotherParcel || !currentSubLots) {
        alert('Please define a valid subdivision before committing.');
        return;
      }

      const confirmMsg = `[CONFIRM CADASTRAL SUBDIVISION]\n\n` +
        `Mother Parcel: ${currentMotherParcel.pin} (${currentMotherParcel.lot_no})\n` +
        `Sub-Lot A: ${currentSubLots.childA.pin} (${currentSubLots.childA.area} sq.m.)\n` +
        `Sub-Lot B: ${currentSubLots.childB.pin} (${currentSubLots.childB.area} sq.m.)\n\n` +
        `This will cancel the mother parcel in Cadastre 211 and create 2 active sub-parcels in the Provincial Assessment Roll.\n\nProceed?`;

      if (!confirm(confirmMsg)) return;

      btnWbCommit.disabled = true;
      btnWbCommit.textContent = 'Processing Transaction...';

      const payload = {
        parent_pin: currentMotherParcel.pin,
        subdivisions: [
          {
            suffix: 'A',
            pin: currentSubLots.childA.pin,
            lot_no: currentSubLots.childA.lot_no,
            owner_name: wbChildAOwner ? wbChildAOwner.value.trim() : currentMotherParcel.owner_name,
            area_sqm: currentSubLots.childA.area,
            coordinates: currentSubLots.childA.coords
          },
          {
            suffix: 'B',
            pin: currentSubLots.childB.pin,
            lot_no: currentSubLots.childB.lot_no,
            owner_name: wbChildBOwner ? wbChildBOwner.value.trim() : 'Buyer / Transferee',
            area_sqm: currentSubLots.childB.area,
            coordinates: currentSubLots.childB.coords
          }
        ]
      };

      fetch('/api/parcels/subdivide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      .then(res => res.json())
      .then(data => {
        btnWbCommit.disabled = false;
        btnWbCommit.textContent = 'Commit Subdivision to Cadastre';

        if (data.success) {
          alert(`[TRANSACTION COMMITTED]\n${data.message}\n\nProvincial Government of Isabela · Office of the Provincial Assessor`);

          // Remove parent polygon from map
          const parentEntry = parcelPolygonMap.get(currentMotherParcel.pin);
          if (parentEntry && parentEntry.polygon) {
            parcelsLayerGroup.removeLayer(parentEntry.polygon);
            parcelPolygonMap.delete(currentMotherParcel.pin);
          }

          // Add child parcels to map
          let firstChildPoly = null;
          let firstChildData = null;

          data.created_parcels.forEach((cp, idx) => {
            const poly = L.polygon(cp.coordinates, defaultStyle);
            poly.bindTooltip(cp.lot_no, {
              permanent: true,
              direction: 'center',
              className: 'cadastral-lot-tooltip'
            });

            poly.on('mouseover', () => {
              if (poly !== activeSelectedPolygon) poly.setStyle(hoverStyle);
            });
            poly.on('mouseout', () => {
              if (poly !== activeSelectedPolygon) poly.setStyle(defaultStyle);
            });
            poly.on('click', () => {
              selectParcel(cp, poly);
            });

            poly.addTo(parcelsLayerGroup);
            parcelPolygonMap.set(cp.pin, { polygon: poly, data: cp });

            if (idx === 0) {
              firstChildPoly = poly;
              firstChildData = cp;
            }
          });

          // Exit workbench and select first child lot
          exitWorkbenchMode();
          if (firstChildPoly && firstChildData) {
            selectParcel(firstChildData, firstChildPoly);
          }
        } else {
          alert(`Subdivision failed: ${data.message || 'Unknown server error'}`);
        }
      })
      .catch(err => {
        btnWbCommit.disabled = false;
        btnWbCommit.textContent = 'Commit Subdivision to Cadastre';
        alert(`Network or Server error: ${err.message}`);
      });
    });
  }

  // =========================================================================
  // 14. INTERACTIVE PIN LOT BOUNDARY DELINEATION, ADDITION & DELETION ENGINE
  // =========================================================================
  let isDrawingPinLot = false;
  let boundaryPins = [];       // array of [lat, lng]
  let pinMarkers = [];         // array of Leaflet circle markers with pin numbers
  let boundaryPolyline = null; // connecting boundary line
  let dynamicGuideLine = null; // guideline to mouse cursor
  let pendingDrawnCoords = null;
  let pendingDrawnArea = 0;
  let pendingDrawnCentroid = null;
  let pendingDrawnPerimeter = 0;
  let previewMap = null;
  let previewLayerGroup = null;

  const btnDrawLot = document.getElementById('btn-draw-lot');
  const btnDeleteParcel = document.getElementById('btn-delete-parcel');
  const modalRegisterLot = document.getElementById('modal-register-lot');
  const btnCloseRegisterModal = document.getElementById('btn-close-register-modal');
  const btnCancelLotReg = document.getElementById('btn-cancel-lot-reg');
  const formRegisterLot = document.getElementById('form-register-lot');

  // Drawing HUD Elements
  const drawingHud = document.getElementById('drawing-hud');
  const drawingHudText = document.getElementById('drawing-hud-text');
  const btnFinishPins = document.getElementById('btn-finish-pins');
  const btnUndoPin = document.getElementById('btn-undo-pin');
  const btnCancelDraw = document.getElementById('btn-cancel-draw');

  // Registration Modal Telemetry & Fields
  const regJurisdictionDisplay = document.getElementById('reg-jurisdiction-display');
  const regCoordsDisplay = document.getElementById('reg-coords-display');
  const regAreaDisplay = document.getElementById('reg-area-display');
  const regPerimeterDisplay = document.getElementById('reg-perimeter-display');
  const regPinCountLabel = document.getElementById('reg-pin-count-label');
  const btnToggleMetes = document.getElementById('btn-toggle-metes');
  const regMetesWrapper = document.getElementById('reg-metes-table-wrapper');
  const regMetesToggleIcon = document.getElementById('reg-metes-toggle-icon');
  const regMetesTbody = document.getElementById('reg-metes-tbody');
  const regLguSelect = document.getElementById('reg-lgu-select');

  const regPin = document.getElementById('reg-pin');
  const regLotNo = document.getElementById('reg-lot-no');
  const regSurveyNo = document.getElementById('reg-survey-no');
  const regSection = document.getElementById('reg-section');
  const regBlock = document.getElementById('reg-block');
  const regOwner = document.getElementById('reg-owner');
  const regAddress = document.getElementById('reg-address');
  const regClass = document.getElementById('reg-class');
  const regUnitVal = document.getElementById('reg-unit-val');
  const regMarketVal = document.getElementById('reg-market-val');
  const regAssessedVal = document.getElementById('reg-assessed-val');
  const regTaxDue = document.getElementById('reg-tax-due');
  const btnSaveLot = document.getElementById('btn-save-lot');

  function startDrawingPinLot() {
    isDrawingPinLot = true;
    boundaryPins = [];
    clearPinMarkersAndLines();

    if (btnDrawLot) {
      btnDrawLot.classList.add('drawing-active');
      const span = btnDrawLot.querySelector('span');
      if (span) span.textContent = 'Cancel Pin Mode';
    }

    if (drawingHud) {
      drawingHud.style.display = 'flex';
      if (drawingHudText) {
        drawingHudText.textContent = 'PIN BOUNDARY: CLICK MAP TO PLACE CORNER PINS (0 PINS PLACED).';
      }
    }
    if (btnFinishPins) btnFinishPins.style.display = 'none';
    if (btnUndoPin) btnUndoPin.style.display = 'none';

    map.getContainer().style.cursor = 'crosshair';
  }

  function stopDrawingPinLot() {
    isDrawingPinLot = false;
    boundaryPins = [];
    clearPinMarkersAndLines();

    if (btnDrawLot) {
      btnDrawLot.classList.remove('drawing-active');
      const span = btnDrawLot.querySelector('span');
      if (span) span.textContent = '+ Pin Lot Boundary';
    }

    if (drawingHud) drawingHud.style.display = 'none';
    map.getContainer().style.cursor = '';
  }

  function clearPinMarkersAndLines() {
    pinMarkers.forEach(m => map.removeLayer(m));
    pinMarkers = [];

    if (boundaryPolyline) {
      map.removeLayer(boundaryPolyline);
      boundaryPolyline = null;
    }
    if (dynamicGuideLine) {
      map.removeLayer(dynamicGuideLine);
      dynamicGuideLine = null;
    }
  }

  if (btnDrawLot) {
    btnDrawLot.addEventListener('click', () => {
      if (isDrawingPinLot) {
        stopDrawingPinLot();
      } else {
        startDrawingPinLot();
      }
    });
  }

  if (btnCancelDraw) {
    btnCancelDraw.addEventListener('click', stopDrawingPinLot);
  }

  // Mouse move: dynamic rubberband line to cursor
  map.on('mousemove', (e) => {
    if (!isDrawingPinLot || boundaryPins.length === 0) {
      if (dynamicGuideLine) {
        map.removeLayer(dynamicGuideLine);
        dynamicGuideLine = null;
      }
      return;
    }

    const lastPt = boundaryPins[boundaryPins.length - 1];
    if (!dynamicGuideLine) {
      dynamicGuideLine = L.polyline([lastPt, e.latlng], {
        color: 'rgba(255, 255, 255, 0.65)',
        weight: 1.2,
        dashArray: '3, 4'
      }).addTo(map);
    } else {
      dynamicGuideLine.setLatLngs([lastPt, e.latlng]);
    }
  });

  // Click on map: place new boundary corner pin
  map.on('click', (e) => {
    if (!isDrawingPinLot) return;

    const clickPt = [e.latlng.lat, e.latlng.lng];

    // Check if clicking close to Pin 1 when at least 3 pins exist
    if (boundaryPins.length >= 3) {
      const firstPt = boundaryPins[0];
      const dist = map.latLngToLayerPoint(e.latlng).distanceTo(map.latLngToLayerPoint(L.latLng(firstPt[0], firstPt[1])));
      if (dist < 20) {
        finishPinLot();
        return;
      }
    }

    boundaryPins.push(clickPt);
    const pinIdx = boundaryPins.length;

    // Create numbered pin marker
    const pinIcon = L.divIcon({
      className: pinIdx === 1 ? 'cadastral-boundary-pin start-pin' : 'cadastral-boundary-pin',
      html: `<span>${pinIdx}</span>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });

    const marker = L.marker(e.latlng, { icon: pinIcon, zIndexOffset: 1000 }).addTo(map);

    if (pinIdx === 1) {
      marker.bindTooltip('Pin 1 (Click to close boundary)', { direction: 'top', offset: [0, -10] });
      marker.on('click', (ev) => {
        L.DomEvent.stopPropagation(ev);
        if (boundaryPins.length >= 3) {
          finishPinLot();
        }
      });
    }

    pinMarkers.push(marker);

    // Update boundary polyline
    if (!boundaryPolyline) {
      boundaryPolyline = L.polyline(boundaryPins, {
        color: '#ffffff',
        weight: 1.8,
        dashArray: '4, 4'
      }).addTo(map);
    } else {
      boundaryPolyline.setLatLngs(boundaryPins);
    }

    // Update HUD telemetry & buttons
    if (drawingHudText) {
      drawingHudText.textContent = `PIN BOUNDARY: ${pinIdx} CORNER PINS PLACED. ${pinIdx >= 3 ? 'CLICK PIN 1 OR "CLOSE & REGISTER" TO FINISH.' : 'PLACE AT LEAST 3 PINS.'}`;
    }
    if (btnFinishPins) btnFinishPins.style.display = pinIdx >= 3 ? 'inline-block' : 'none';
    if (btnUndoPin) btnUndoPin.style.display = pinIdx >= 1 ? 'inline-block' : 'none';
  });

  // Undo Last Pin Action
  function undoLastPin() {
    if (!isDrawingPinLot || boundaryPins.length === 0) return;

    boundaryPins.pop();
    const lastMarker = pinMarkers.pop();
    if (lastMarker) map.removeLayer(lastMarker);

    if (boundaryPins.length > 0) {
      boundaryPolyline.setLatLngs(boundaryPins);
    } else if (boundaryPolyline) {
      map.removeLayer(boundaryPolyline);
      boundaryPolyline = null;
    }

    const pinIdx = boundaryPins.length;
    if (drawingHudText) {
      drawingHudText.textContent = `PIN BOUNDARY: ${pinIdx} CORNER PINS PLACED. ${pinIdx >= 3 ? 'CLICK PIN 1 OR "CLOSE & REGISTER" TO FINISH.' : 'PLACE AT LEAST 3 PINS.'}`;
    }
    if (btnFinishPins) btnFinishPins.style.display = pinIdx >= 3 ? 'inline-block' : 'none';
    if (btnUndoPin) btnUndoPin.style.display = pinIdx >= 1 ? 'inline-block' : 'none';
  }

  if (btnUndoPin) btnUndoPin.addEventListener('click', undoLastPin);

  // Finish and Close Boundary Polygon
  function finishPinLot() {
    if (boundaryPins.length < 3) {
      alert('A cadastral lot requires at least 3 boundary corner pins to form a polygon.');
      return;
    }

    pendingDrawnCoords = [...boundaryPins];

    // Compute geodesic area via Turf.js
    try {
      const geoCoords = coordsToGeoJSON(pendingDrawnCoords);
      if (geoCoords[0][0] !== geoCoords[geoCoords.length - 1][0] ||
          geoCoords[0][1] !== geoCoords[geoCoords.length - 1][1]) {
        geoCoords.push([...geoCoords[0]]);
      }
      const poly = turf.polygon([geoCoords]);
      pendingDrawnArea = Math.round(turf.area(poly) * 100) / 100;
    } catch (err) {
      console.warn('Area calculation fallback:', err);
      pendingDrawnArea = 1500.0;
    }

    const totalPins = boundaryPins.length;
    stopDrawingPinLot();
    openRegistrationModal(pendingDrawnCoords, pendingDrawnArea, totalPins);
  }

  if (btnFinishPins) btnFinishPins.addEventListener('click', finishPinLot);

  // Double click to finish boundary
  map.on('dblclick', (e) => {
    if (isDrawingPinLot && boundaryPins.length >= 3) {
      L.DomEvent.preventDefault(e);
      finishPinLot();
    }
  });

  function updateRegAssessmentPreview() {
    const area = pendingDrawnArea || 0;
    const unitVal = parseFloat(regUnitVal ? regUnitVal.value : 3000) || 0;
    const cls = regClass ? regClass.value : 'Residential';

    const levels = {
      'Residential': 0.20,
      'Commercial': 0.50,
      'Agricultural': 0.40,
      'Industrial': 0.50,
      'Institutional': 0.50,
      'Special': 0.10
    };
    const level = levels[cls] || 0.20;

    const mv = Math.round(area * unitVal * 100) / 100;
    const av = Math.round(mv * level * 100) / 100;
    const tax = (cls === 'Institutional' || cls === 'Special') ? 0 : Math.round(av * 0.02 * 100) / 100;

    if (regMarketVal) regMarketVal.value = mv.toFixed(2);
    if (regAssessedVal) regAssessedVal.value = av.toFixed(2);
    if (regTaxDue) regTaxDue.value = tax.toFixed(2);
  }

  if (regUnitVal) regUnitVal.addEventListener('input', updateRegAssessmentPreview);
  if (regClass) regClass.addEventListener('change', updateRegAssessmentPreview);

  // Allow manual entry and reactive calculation for Market Value, Assessed Value, Tax Due
  if (regMarketVal) {
    regMarketVal.addEventListener('input', () => {
      const cls = regClass ? regClass.value : 'Residential';
      const levels = {
        'Residential': 0.20,
        'Commercial': 0.50,
        'Agricultural': 0.40,
        'Industrial': 0.50,
        'Institutional': 0.50,
        'Special': 0.10
      };
      const level = levels[cls] || 0.20;
      const mv = parseFloat(regMarketVal.value) || 0;
      const av = Math.round(mv * level * 100) / 100;
      const tax = (cls === 'Institutional' || cls === 'Special') ? 0 : Math.round(av * 0.02 * 100) / 100;
      if (regAssessedVal) regAssessedVal.value = av.toFixed(2);
      if (regTaxDue) regTaxDue.value = tax.toFixed(2);
    });
  }

  if (regAssessedVal) {
    regAssessedVal.addEventListener('input', () => {
      const cls = regClass ? regClass.value : 'Residential';
      const av = parseFloat(regAssessedVal.value) || 0;
      const tax = (cls === 'Institutional' || cls === 'Special') ? 0 : Math.round(av * 0.02 * 100) / 100;
      if (regTaxDue) regTaxDue.value = tax.toFixed(2);
    });
  }

  // Toggle Metes and Bounds Table
  if (btnToggleMetes && regMetesWrapper) {
    btnToggleMetes.addEventListener('click', () => {
      const isHidden = regMetesWrapper.style.display === 'none';
      regMetesWrapper.style.display = isHidden ? 'block' : 'none';
      if (regMetesToggleIcon) {
        regMetesToggleIcon.textContent = isHidden ? '[ Collapse ]' : '[ Expand ]';
      }
    });
  }

  // Update dynamic defaults when LGU selector in modal changes
  function updateLguDefaults(lguCode, lguName) {
    const muniCode = (lguCode && lguCode.length >= 5) ? lguCode.substring(3, 5) : '15';
    const nextSeq = ('0' + (parcelPolygonMap.size + 1)).slice(-2);
    
    if (regPin) regPin.value = `032-${muniCode}-0001-046-${nextSeq}`;
    if (regLotNo) regLotNo.value = `Lot 46-${nextSeq}`;
    if (regJurisdictionDisplay) {
      regJurisdictionDisplay.textContent = `${lguName} (${lguCode})`;
    }

    if (regAddress) {
      if (lguCode === '03215') {
        regAddress.value = 'Barangay Alibagu, City of Ilagan, Isabela';
      } else if (lguCode === '03208') {
        regAddress.value = 'Barangay District 1, Cauayan City, Isabela';
      } else {
        regAddress.value = `Barangay Poblacion, ${lguName}, Isabela`;
      }
    }
  }

  if (regLguSelect) {
    regLguSelect.addEventListener('change', () => {
      const selectedOpt = regLguSelect.options[regLguSelect.selectedIndex];
      const lguCode = regLguSelect.value;
      const lguName = selectedOpt.getAttribute('data-name') || selectedOpt.text.split('(')[0].trim();
      updateLguDefaults(lguCode, lguName);
    });
  }

  let activeRegistrationConflicts = [];

  function checkPolygonOverlaps(candidateCoords, excludePin = null) {
    if (!candidateCoords || candidateCoords.length < 3 || typeof turf === 'undefined') {
      return [];
    }

    let candRing = candidateCoords.map(pt => [pt[1], pt[0]]);
    if (candRing[0][0] !== candRing[candRing.length - 1][0] || candRing[0][1] !== candRing[candRing.length - 1][1]) {
      candRing.push([candRing[0][0], candRing[0][1]]);
    }

    let candidatePoly = null;
    try {
      candidatePoly = turf.polygon([candRing]);
    } catch (e) {
      console.warn('Turf candidate polygon parse error:', e);
      return [];
    }

    const conflicts = [];
    let candidateArea = 0;
    try {
      candidateArea = turf.area(candidatePoly);
    } catch(e) {
      candidateArea = 0;
    }

    parcelPolygonMap.forEach((entry, pin) => {
      if (excludePin && pin === excludePin) return;
      const p = entry.data;
      if (!p || !p.coordinates || p.coordinates.length < 3) return;

      let pRing = p.coordinates.map(pt => [pt[1], pt[0]]);
      if (pRing[0][0] !== pRing[pRing.length - 1][0] || pRing[0][1] !== pRing[pRing.length - 1][1]) {
        pRing.push([pRing[0][0], pRing[0][1]]);
      }

      try {
        const pPoly = turf.polygon([pRing]);
        const intersection = turf.intersect(candidatePoly, pPoly);
        if (intersection) {
          const overlapArea = turf.area(intersection);
          // Ignore tiny floating point slivers < 1.0 sq.m.
          if (overlapArea >= 1.0) {
            const existingArea = turf.area(pPoly);
            const pctCand = candidateArea > 0 ? Math.min(100, Math.round((overlapArea / candidateArea) * 1000) / 10) : 0;
            const pctExist = existingArea > 0 ? Math.min(100, Math.round((overlapArea / existingArea) * 1000) / 10) : 0;
            conflicts.push({
              pin: pin,
              lot_no: p.lot_no || 'Lot',
              owner_name: p.owner_name || 'Declared Owner',
              classification: p.classification || 'Residential',
              overlap_area_sqm: Math.round(overlapArea * 100) / 100,
              pct_candidate: pctCand,
              pct_existing: pctExist,
              geojson: intersection,
              parcelData: p
            });
          }
        }
      } catch (err) {
        // Skip invalid geometry
      }
    });

    conflicts.sort((a, b) => b.overlap_area_sqm - a.overlap_area_sqm);
    return conflicts;
  }

  function openRegistrationModal(coords, area, pinCount) {
    pendingDrawnCoords = coords;
    pendingDrawnArea = area;

    // 1. Calculate Geodetic Centroid & Perimeter via Turf.js
    let cLat = 16.9749;
    let cLng = 121.8153;
    let perimeterM = 0;

    try {
      const geoCoords = coords.map(pt => [pt[1], pt[0]]);
      if (geoCoords[0][0] !== geoCoords[geoCoords.length - 1][0] ||
          geoCoords[0][1] !== geoCoords[geoCoords.length - 1][1]) {
        geoCoords.push([...geoCoords[0]]);
      }
      const poly = turf.polygon([geoCoords]);
      const centroid = turf.centroid(poly);
      cLng = centroid.geometry.coordinates[0];
      cLat = centroid.geometry.coordinates[1];
      perimeterM = Math.round(turf.length(turf.polygonToLine(poly), { units: 'kilometers' }) * 1000 * 10) / 10;
    } catch (err) {
      console.warn('Geodesic extraction fallback:', err);
      cLat = coords.reduce((sum, p) => sum + p[0], 0) / coords.length;
      cLng = coords.reduce((sum, p) => sum + p[1], 0) / coords.length;
      perimeterM = 0;
      for (let i = 0; i < coords.length; i++) {
        const j = (i + 1) % coords.length;
        perimeterM += L.latLng(coords[i]).distanceTo(L.latLng(coords[j]));
      }
      perimeterM = Math.round(perimeterM * 10) / 10;
    }

    pendingDrawnCentroid = [cLat, cLng];
    pendingDrawnPerimeter = perimeterM;

    // 2. Identify active LGU from sidebar or dropdown
    if (lguSelect && lguSelect.selectedIndex >= 0) {
      const opt = lguSelect.options[lguSelect.selectedIndex];
      activeLguCode = opt.value;
      activeLguName = opt.text.split('(')[0].trim();
    }

    if (regLguSelect) {
      regLguSelect.value = activeLguCode;
    }

    // 3. Display Spatial Geometry Telemetry
    if (regJurisdictionDisplay) {
      regJurisdictionDisplay.textContent = `${activeLguName} (${activeLguCode})`;
    }
    if (regCoordsDisplay) {
      regCoordsDisplay.textContent = `${cLat.toFixed(5)}° N, ${cLng.toFixed(5)}° E`;
    }
    if (regAreaDisplay) {
      regAreaDisplay.textContent = `${area.toLocaleString('en-US', {minimumFractionDigits: 2})} sq.m. (${(area / 10000).toFixed(4)} ha)`;
    }
    if (regPerimeterDisplay) {
      regPerimeterDisplay.textContent = `${perimeterM.toLocaleString('en-US', {minimumFractionDigits: 1})} m (${coords.length} Corner Pins)`;
    }
    if (regPinCountLabel) {
      regPinCountLabel.textContent = coords.length;
    }

    // Real-time Cadastral Topology Overlap & Encroachment Detection
    activeRegistrationConflicts = checkPolygonOverlaps(coords);
    const alertBox = document.getElementById('reg-encroachment-alert');
    const badge = document.getElementById('reg-encroachment-badge');
    const summary = document.getElementById('reg-encroachment-summary');
    const dot = document.getElementById('reg-encroachment-dot');
    const details = document.getElementById('reg-encroachment-details');
    const waiverContainer = document.getElementById('reg-dispute-waiver-container');
    const waiverCheckbox = document.getElementById('reg-dispute-waiver');

    if (alertBox) {
      if (activeRegistrationConflicts.length === 0) {
        alertBox.className = 'encroachment-alert-box clean';
        if (badge) {
          badge.className = 'encroachment-status-badge clean';
          badge.textContent = 'TOPOLOGY VERIFIED';
        }
        if (summary) summary.textContent = '0 boundary conflicts detected';
        if (dot) dot.className = 'encroachment-pulse-dot clean';
        if (details) {
          details.style.display = 'none';
          details.innerHTML = '';
        }
        if (waiverContainer) waiverContainer.style.display = 'none';
        if (waiverCheckbox) waiverCheckbox.checked = false;
        if (btnSaveLot) {
          btnSaveLot.disabled = false;
          btnSaveLot.textContent = 'Save Lot to Cadastre';
        }
      } else {
        alertBox.className = 'encroachment-alert-box hazard';
        if (badge) {
          badge.className = 'encroachment-status-badge hazard';
          badge.textContent = 'BOUNDARY ENCROACHMENT DETECTED';
        }
        if (summary) summary.textContent = `${activeRegistrationConflicts.length} conflicting lot(s) detected`;
        if (dot) dot.className = 'encroachment-pulse-dot hazard';
        if (details) {
          details.style.display = 'block';
          details.innerHTML = activeRegistrationConflicts.map(c => `
            <div class="encroachment-conflict-item">
              <span>Encroachment on <strong>${c.lot_no} (${c.pin})</strong>:</span>
              <span class="mono-num" style="color: #ffffff; font-weight: 600;">${c.overlap_area_sqm.toLocaleString()} sq.m. (${c.pct_candidate}%)</span>
            </div>
            <div style="font-size: 10px; color: #94a3b8; margin-bottom: 4px;">Owner: ${c.owner_name}</div>
          `).join('');
        }
        if (waiverContainer) waiverContainer.style.display = 'flex';
        if (waiverCheckbox) {
          waiverCheckbox.checked = false;
          waiverCheckbox.onchange = () => {
            if (btnSaveLot) {
              btnSaveLot.disabled = !waiverCheckbox.checked;
              btnSaveLot.textContent = waiverCheckbox.checked ? 'Save Lot to Cadastre (With Dispute)' : 'Topology Overlap Locked';
            }
          };
        }
        if (btnSaveLot) {
          btnSaveLot.disabled = true;
          btnSaveLot.textContent = 'Topology Overlap Locked';
        }
      }
    }

    // 4. Populate Metes & Bounds Pin Table
    if (regMetesTbody) {
      regMetesTbody.innerHTML = '';
      coords.forEach((pt, idx) => {
        const nextIdx = (idx + 1) % coords.length;
        let segDist = 0;
        try {
          segDist = Math.round(turf.distance([pt[1], pt[0]], [coords[nextIdx][1], coords[nextIdx][0]], { units: 'kilometers' }) * 1000 * 10) / 10;
        } catch(e) {
          segDist = Math.round(L.latLng(pt).distanceTo(L.latLng(coords[nextIdx])) * 10) / 10;
        }
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="color: #ffffff;">Pin ${idx + 1}${idx === 0 ? ' (BBM Point)' : ''}</td>
          <td>${pt[0].toFixed(5)}° N</td>
          <td>${pt[1].toFixed(5)}° E</td>
          <td style="color: var(--colors-body-mid);">${segDist.toFixed(1)} m</td>
        `;
        regMetesTbody.appendChild(tr);
      });
    }

    // 5. Populate Form Fields
    updateLguDefaults(activeLguCode, activeLguName);
    if (regOwner) regOwner.value = '';
    if (regSurveyNo) regSurveyNo.value = 'Cad 211';

    updateRegAssessmentPreview();

    if (modalRegisterLot) modalRegisterLot.style.display = 'flex';

    // 6. Render Created Area on Left-Side Mini Map Preview
    const previewContainer = document.getElementById('reg-lot-preview-map');
    if (previewContainer && typeof L !== 'undefined') {
      if (!previewMap) {
        previewMap = L.map('reg-lot-preview-map', {
          zoomControl: false,
          attributionControl: false,
          scrollWheelZoom: false,
          doubleClickZoom: false,
          dragging: true
        });
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          className: 'dark-tiles',
          maxZoom: 19
        }).addTo(previewMap);
        previewLayerGroup = L.layerGroup().addTo(previewMap);
      }

      if (previewLayerGroup) {
        previewLayerGroup.clearLayers();

        const previewPoly = L.polygon(coords, {
          color: '#ffffff',
          weight: 2,
          fillColor: '#ffffff',
          fillOpacity: 0.20
        }).addTo(previewLayerGroup);

        // Render any detected encroachment hazard polygons in pulsing red
        if (activeRegistrationConflicts && activeRegistrationConflicts.length > 0) {
          activeRegistrationConflicts.forEach(c => {
            if (c.geojson) {
              L.geoJSON(c.geojson, {
                style: {
                  color: '#ffffff',
                  weight: 2,
                  fillColor: '#ffffff',
                  fillOpacity: 0.45,
                  dashArray: '4, 4'
                }
              }).addTo(previewLayerGroup);
            }
          });
        }

        // Boundary pins
        coords.forEach((pt, i) => {
          const pinIcon = L.divIcon({
            className: 'cadastral-boundary-pin',
            html: `<span>${i + 1}</span>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9]
          });
          L.marker(pt, { icon: pinIcon }).addTo(previewLayerGroup);
        });

        // Centroid marker dot
        L.circleMarker([cLat, cLng], {
          radius: 3.5,
          color: '#ffffff',
          fillColor: '#ffffff',
          fillOpacity: 1
        }).addTo(previewLayerGroup);

        setTimeout(() => {
          if (previewMap) {
            previewMap.invalidateSize();
            previewMap.fitBounds(previewPoly.getBounds(), { padding: [22, 22], maxZoom: 18 });
          }
        }, 50);
      }
    }
  }

  function closeRegistrationModal() {
    if (modalRegisterLot) modalRegisterLot.style.display = 'none';
  }

  if (btnCloseRegisterModal) btnCloseRegisterModal.addEventListener('click', closeRegistrationModal);
  if (btnCancelLotReg) btnCancelLotReg.addEventListener('click', closeRegistrationModal);

  // Form Submit: POST /api/parcels
  if (formRegisterLot) {
    formRegisterLot.addEventListener('submit', (e) => {
      e.preventDefault();

      if (!pendingDrawnCoords || !pendingDrawnCoords.length) {
        alert('Please draw a valid lot on the map first.');
        return;
      }

      if (activeRegistrationConflicts && activeRegistrationConflicts.length > 0) {
        const waiver = document.getElementById('reg-dispute-waiver');
        if (!waiver || !waiver.checked) {
          alert('Spatial Cadastral Boundary Overlap Detected!\n\nThis parcel overlaps an adjoining lot in the cadastre. To proceed, please resolve the boundary or acknowledge the Boundary Dispute Exception waiver.');
          if (btnSaveLot) {
            btnSaveLot.disabled = false;
            btnSaveLot.textContent = 'Topology Overlap Locked';
          }
          return;
        }
      }

      if (btnSaveLot) {
        btnSaveLot.disabled = true;
        btnSaveLot.textContent = 'Saving Record...';
      }

      const lguOpt = regLguSelect ? regLguSelect.options[regLguSelect.selectedIndex] : null;
      const subLguCode = regLguSelect ? regLguSelect.value : (lguSelect ? lguSelect.value : '03215');
      const subLguName = lguOpt ? (lguOpt.getAttribute('data-name') || lguOpt.text.split('(')[0].trim()) : 'Ilagan City';

      const mv = regMarketVal ? (parseFloat(regMarketVal.value) || 0) : 0;
      const av = regAssessedVal ? (parseFloat(regAssessedVal.value) || 0) : 0;
      const taxDue = regTaxDue ? (parseFloat(regTaxDue.value) || 0) : 0;

      const payload = {
        pin: regPin.value.trim(),
        lot_no: regLotNo.value.trim(),
        section_no: regSection.value.trim(),
        block_no: regBlock.value.trim(),
        survey_no: regSurveyNo ? regSurveyNo.value.trim() : 'Cad 211',
        owner_name: regOwner.value.trim(),
        owner_address: regAddress.value.trim(),
        classification: regClass.value,
        actual_use: `${regClass.value} Real Property`,
        unit_value: parseFloat(regUnitVal.value) || 3000,
        area_sqm: pendingDrawnArea,
        market_value: mv,
        assessed_value: av,
        tax_due: taxDue,
        coordinates: pendingDrawnCoords,
        lgu_code: subLguCode,
        lgu_name: subLguName,
        lat: pendingDrawnCentroid ? pendingDrawnCentroid[0] : pendingDrawnCoords[0][0],
        lng: pendingDrawnCentroid ? pendingDrawnCentroid[1] : pendingDrawnCoords[0][1]
      };

      fetch('/api/parcels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      .then(res => res.json())
      .then(data => {
        if (btnSaveLot) {
          btnSaveLot.disabled = false;
          btnSaveLot.textContent = 'Save Lot to Cadastre';
        }

        if (data.success && data.parcel) {
          closeRegistrationModal();
          alert(`[SUCCESS]\n${data.message}\n\nLot registered in Provincial Cadastre 211 (${subLguName}).`);

          const cp = data.parcel;
          const poly = L.polygon(cp.coordinates, defaultStyle);
          poly.bindTooltip(cp.lot_no, {
            permanent: true,
            direction: 'center',
            className: 'cadastral-lot-tooltip'
          });

          poly.on('mouseover', () => {
            if (poly !== activeSelectedPolygon) poly.setStyle(hoverStyle);
          });
          poly.on('mouseout', () => {
            if (poly !== activeSelectedPolygon) poly.setStyle(defaultStyle);
          });
          poly.on('click', () => {
            selectParcel(cp, poly);
          });

          poly.addTo(parcelsLayerGroup);
          parcelPolygonMap.set(cp.pin, { polygon: poly, data: cp });

          selectParcel(cp, poly);
          map.flyToBounds(poly.getBounds(), { padding: [80, 80], duration: 0.8 });
        } else {
          alert(`Failed to save lot: ${data.message || 'Unknown error'}`);
        }
      })
      .catch(err => {
        if (btnSaveLot) {
          btnSaveLot.disabled = false;
          btnSaveLot.textContent = 'Save Lot to Cadastre';
        }
        alert(`Server or network error: ${err.message}`);
      });
    });
  }

  // Delete Parcel Action
  if (btnDeleteParcel) {
    btnDeleteParcel.addEventListener('click', () => {
      if (!activeSelectedParcelData) {
        alert('Please select a parcel on the map to delete.');
        return;
      }

      const targetPin = activeSelectedParcelData.pin;
      const targetLot = activeSelectedParcelData.lot_no;
      const targetOwner = activeSelectedParcelData.owner_name;

      const confirmMsg = `[CONFIRM CADASTRAL DELETION]\n\n` +
        `Are you sure you want to permanently remove this parcel?\n\n` +
        `PIN: ${targetPin}\n` +
        `Lot: ${targetLot}\n` +
        `Owner: ${targetOwner}\n\n` +
        `This will cancel the record in Cadastre 211 and record an officer audit log.\n\nProceed?`;

      if (!confirm(confirmMsg)) return;

      const originalDelHtml = btnDeleteParcel.innerHTML;
      btnDeleteParcel.disabled = true;
      btnDeleteParcel.innerHTML = `<span class="icon-btn-label">Deleting...</span>`;

      fetch(`/api/parcels/${encodeURIComponent(targetPin)}`, {
        method: 'DELETE'
      })
      .then(res => res.json())
      .then(data => {
        btnDeleteParcel.disabled = false;
        btnDeleteParcel.innerHTML = originalDelHtml;

        if (data.success) {
          alert(`[DELETION COMMITTED]\n${data.message}`);

          // Remove from map
          const entry = parcelPolygonMap.get(targetPin);
          if (entry && entry.polygon) {
            parcelsLayerGroup.removeLayer(entry.polygon);
            parcelPolygonMap.delete(targetPin);
          }

          // Select another parcel if available
          if (parcelPolygonMap.size > 0) {
            const nextEntry = parcelPolygonMap.values().next().value;
            selectParcel(nextEntry.data, nextEntry.polygon);
          } else {
            activeSelectedParcelData = null;
            if (inspPin) inspPin.textContent = '—';
            if (inspTd) inspTd.textContent = '—';
            if (inspOwner) inspOwner.textContent = '—';
            if (inspArea) inspArea.textContent = '—';
          }
        } else {
          alert(`Deletion failed: ${data.message || 'Unknown error'}`);
        }
      })
      .catch(err => {
        btnDeleteParcel.disabled = false;
        btnDeleteParcel.innerHTML = originalDelHtml;
        alert(`Server or network error: ${err.message}`);
      });
    });
  }

  // 13. Official Tax Declaration (RPTD) Issuance & Print Engine
  const modalTaxDeclaration = document.getElementById('modal-tax-declaration');
  const btnPrintTd = document.getElementById('btn-print-td');
  const btnCloseTdModal = document.getElementById('btn-close-td-modal');

  function populateTaxDeclaration(td) {
    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = (val !== undefined && val !== null && val !== '') ? val : '—';
    };

    const lguNameUpper = (td.lgu_name || 'ILAGAN CITY').toUpperCase();
    setText('td-cert-lgu-title', lguNameUpper.startsWith('CITY') || lguNameUpper.includes('MUNICIPALITY') ? lguNameUpper : `MUNICIPALITY OF ${lguNameUpper}`);
    setText('td-cert-no', td.td_no || 'TD-PENDING');
    setText('td-cert-pin', td.pin || '—');
    setText('td-cert-owner', td.owner_name || 'Declared Property Owner');
    setText('td-cert-owner-address', td.owner_address || 'Province of Isabela');
    setText('td-cert-location', `${td.owner_address || 'Ilagan City'}, Province of Isabela`);
    setText('td-cert-lot', td.lot_no || 'Lot —');
    setText('td-cert-block', td.block_no || 'Blk 01');
    setText('td-cert-section', td.section_no || '014-A');
    setText('td-cert-survey', td.survey_no || 'Cad 211');

    // Geodetic Boundaries
    setText('td-cert-bnd-north', `Cadastral Lot adjacent to ${td.lot_no || 'parcel'} / Access Alley`);
    setText('td-cert-bnd-east', `Cadastral Section ${td.section_no || '014-A'} / Survey Lot`);
    setText('td-cert-bnd-south', `Adjacent Cadastral Boundary / Drainage`);
    setText('td-cert-bnd-west', `Public Road Right-of-Way (Cad 211)`);

    // Appraisal Schedule
    setText('td-cert-class', td.classification || 'Residential');
    setText('td-cert-use', td.actual_use || `${td.classification} Real Property`);
    setText('td-cert-use-2', td.actual_use || `${td.classification} Real Property`);
    
    const areaVal = parseFloat(td.area_sqm || 0);
    const haVal = parseFloat(td.area_ha || (areaVal / 10000));
    setText('td-cert-area', areaVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setText('td-cert-ha', haVal.toFixed(4));
    setText('td-cert-unit-val', parseFloat(td.unit_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    
    const mvStr = parseFloat(td.market_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    setText('td-cert-mv', mvStr);
    setText('td-cert-mv-2', mvStr);
    setText('td-cert-mv-total', `PHP ${mvStr}`);

    // Assessment Schedule
    setText('td-cert-level', `${td.assessment_level || 0}%`);
    const avStr = parseFloat(td.assessed_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    setText('td-cert-av', avStr);

    const isExempt = (td.status && td.status.includes('Exempt')) || (parseFloat(td.total_tax || 0) === 0 && (td.classification === 'Institutional' || (td.status && td.status.includes('Exempt'))));
    const basicTax = parseFloat(td.basic_tax || 0);
    const sefTax = parseFloat(td.sef_tax || 0);
    const totalTax = parseFloat(td.total_tax || 0);

    setText('td-cert-basic-tax', isExempt ? '0.00 (Exempt)' : basicTax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setText('td-cert-sef-tax', isExempt ? '0.00 (Exempt)' : sefTax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setText('td-cert-total-tax', isExempt ? 'PHP 0.00 (Exempt)' : `PHP ${totalTax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    setText('td-cert-status', td.status || (isExempt ? 'Exempt - Provincial Government' : 'Taxable - Current'));
    setText('td-cert-effectivity', td.effectivity || '1st Quarter, 2026 (General Revision Cycle)');

    // Signatures
    setText('td-cert-examiner', (td.examiner_name || 'ENGR. MARITES D. PASCUAL').toUpperCase());
    setText('td-cert-badge', `License / Badge: ${td.examiner_badge || 'PGI-GIS-014'}`);
    setText('td-cert-assessor', (td.assessor_name || 'ATTY. RODOLFO V. RAMOS, REA, REB').toUpperCase());
  }

  if (btnIssueTd) {
    btnIssueTd.addEventListener('click', () => {
      if (!activeSelectedParcelData) {
        if (parcelPolygonMap.size > 0) {
          const first = parcelPolygonMap.values().next().value;
          selectParcel(first.data, first.polygon);
        } else {
          alert('Please select a cadastral parcel on the map to issue its Tax Declaration.');
          return;
        }
      }

      const originalBtnText = btnIssueTd.innerHTML;
      btnIssueTd.disabled = true;
      btnIssueTd.innerHTML = `<span>Issuing TD...</span>`;

      fetch(`/api/parcels/${encodeURIComponent(activeSelectedParcelData.pin)}/issue-td`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })
      .then(res => res.json())
      .then(data => {
        btnIssueTd.disabled = false;
        btnIssueTd.innerHTML = originalBtnText;

        if (data.success && data.tax_declaration) {
          // Update active selected parcel TD in state and inspector
          activeSelectedParcelData.td_no = data.tax_declaration.td_no;
          if (inspTd) inspTd.textContent = data.tax_declaration.td_no;

          // Populate the official certificate document
          populateTaxDeclaration(data.tax_declaration);

          // Open modal
          if (modalTaxDeclaration) {
            modalTaxDeclaration.style.display = 'flex';
          }
        } else {
          alert(`Failed to issue Tax Declaration: ${data.message || 'Unknown error'}`);
        }
      })
      .catch(err => {
        btnIssueTd.disabled = false;
        btnIssueTd.innerHTML = originalBtnText;
        alert(`Server error while issuing Tax Declaration: ${err.message}`);
      });
    });
  }

  if (btnPrintTd) {
    btnPrintTd.addEventListener('click', () => {
      window.print();
    });
  }

  if (btnCloseTdModal && modalTaxDeclaration) {
    btnCloseTdModal.addEventListener('click', () => {
      modalTaxDeclaration.style.display = 'none';
    });

    modalTaxDeclaration.addEventListener('click', (e) => {
      if (e.target === modalTaxDeclaration) {
        modalTaxDeclaration.style.display = 'none';
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalTaxDeclaration.style.display === 'flex') {
        modalTaxDeclaration.style.display = 'none';
      }
    });
  }

  // 14. Official Cadastral Survey Sheet & Metes and Bounds Engine
  const btnOpenSurveySheet = document.getElementById('btn-open-survey-sheet');
  const modalSurveySheet = document.getElementById('modal-survey-sheet');
  const btnPrintSurveySheet = document.getElementById('btn-print-survey-sheet');
  const btnCopyTechDesc = document.getElementById('btn-copy-tech-desc');
  const btnCloseSurveyModal = document.getElementById('btn-close-survey-modal');
  const surveyCanvas = document.getElementById('survey-lot-diagram-canvas');

  let activeSurveySheetData = null;

  function drawCadastralLotDiagram(canvas, coords, lines, corners) {
    if (!canvas || !coords || coords.length < 3) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Dark grid background
    ctx.fillStyle = '#08090b';
    ctx.fillRect(0, 0, width, height);

    // Subtle grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    const step = 28;
    for (let x = 0; x < width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Determine bounding box of coords (lat, lng)
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    coords.forEach(([lat, lng]) => {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    });

    const dLat = (maxLat - minLat) || 0.0001;
    const dLng = (maxLng - minLng) || 0.0001;

    // Viewport padding
    const padX = 65;
    const padY = 50;
    const drawW = width - padX * 2;
    const drawH = height - padY * 2;

    const scale = Math.min(drawW / dLng, drawH / dLat);

    const toCanvasX = (lng) => padX + (lng - minLng) * scale + (drawW - dLng * scale) / 2;
    const toCanvasY = (lat) => height - (padY + (lat - minLat) * scale + (drawH - dLat * scale) / 2);

    const pts = coords.map(([lat, lng]) => [toCanvasX(lng), toCanvasY(lat)]);

    // Draw dashed tie vector from top-left (BLLM reference indicator) to Corner 1
    const c1 = pts[0];
    const bllmPt = [36, 36];

    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bllmPt[0], bllmPt[1]);
    ctx.lineTo(c1[0], c1[1]);
    ctx.stroke();
    ctx.restore();

    // Draw BLLM monument marker at top-left
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(bllmPt[0], bllmPt[1], 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = '9px "Geist Mono", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('BLLM #1', bllmPt[0] + 7, bllmPt[1] + 3);

    // Draw Polygon fill
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i][0], pts[i][1]);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.fill();

    // Draw Polygon border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // Draw segment dimensions / bearings along midpoints
    ctx.font = '8.5px "Geist Mono", monospace';
    ctx.fillStyle = '#94a3b8';
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % pts.length];
      const midX = (p1[0] + p2[0]) / 2;
      const midY = (p1[1] + p2[1]) / 2;

      const lineInfo = lines && lines[i];
      if (lineInfo) {
        const label = `${lineInfo.distance_m.toFixed(1)}m`;
        ctx.fillText(label, midX + 4, midY - 4);
      }
    }

    // Draw Corner pins
    pts.forEach((p, idx) => {
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p[0], p[1], 7.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.font = 'bold 9px "Geist Mono", monospace';
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((idx + 1).toString(), p[0], p[1]);
      ctx.restore();
    });

    // Draw North Arrow Compass at top-right
    const naX = width - 36;
    const naY = 36;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(naX, naY - 16);
    ctx.lineTo(naX + 5, naY + 5);
    ctx.lineTo(naX, naY + 2);
    ctx.lineTo(naX - 5, naY + 5);
    ctx.closePath();
    ctx.fill();

    ctx.font = 'bold 9px "Geist Mono", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('N', naX, naY - 20);
    ctx.restore();
  }

  function populateSurveySheet(data) {
    activeSurveySheetData = data;
    const s = data.survey_sheet;
    const mb = s.metes_and_bounds;

    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = (val !== undefined && val !== null && val !== '') ? val : '—';
    };

    setText('survey-cert-survey', s.survey_no || 'Cad 211, Isabela Cadastre');
    setText('survey-cert-lot', s.lot_no || 'Lot —');
    setText('survey-cert-pin', s.pin || '—');
    setText('survey-cert-td', s.td_no || 'TD-PENDING');
    setText('survey-cert-owner', s.owner_name || 'Declared Owner');
    setText('survey-cert-sec-blk', `Section ${s.section_no || '014-A'}, Block ${s.block_no || 'Blk 01'}`);
    setText('survey-cert-location', `${s.owner_address || s.lgu_name || 'Ilagan City'}, Isabela`);

    // Tie point
    if (mb && mb.tie_line) {
      const tl = mb.tie_line;
      setText('survey-cert-tie-bllm', tl.from_monument || 'BLLM No. 1, Cad 211');
      setText('survey-cert-tie-bllm-coords', `PRS92 Grid: N ${tl.bllm_northing.toLocaleString('en-US', { minimumFractionDigits: 2 })}, E ${tl.bllm_easting.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
      setText('survey-cert-tie-line', `Line BLLM 1 - Cor. 1: ${tl.bearing}, ${tl.distance_m.toLocaleString('en-US', { minimumFractionDigits: 2 })} m.`);
    }

    // Stats
    const areaVal = parseFloat(s.area_sqm || 0);
    const haVal = parseFloat(s.area_ha || (areaVal / 10000));
    setText('survey-cert-area', `${areaVal.toLocaleString('en-US', { minimumFractionDigits: 2 })} sq.m. (${haVal.toFixed(4)} ha)`);
    setText('survey-cert-perimeter', `${(mb && mb.perimeter_m ? mb.perimeter_m : 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} m`);
    setText('survey-cert-closure', mb && mb.closure_ratio ? mb.closure_ratio : '1:25,000 (First Order)');

    // Metes & bounds table
    const tbody = document.getElementById('survey-metes-tbody');
    if (tbody && mb && mb.lines) {
      tbody.innerHTML = '';
      mb.lines.forEach((line, idx) => {
        const corner = mb.corners[idx] || {};
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>Line ${line.line_no}</strong></td>
          <td class="td-bold" style="color: #0f172a;">${line.bearing}</td>
          <td style="text-align: right;">${line.distance_m.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
          <td style="text-align: right;">${corner.northing ? corner.northing.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}</td>
          <td style="text-align: right;">${corner.easting ? corner.easting.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}</td>
          <td style="font-family: var(--font-body); font-size: 9.5px;">${corner.monument || 'P.S. Cyl. Conc. Mons. 15x50cm'} · ${line.adjoining || 'Adjoining Cadastral Lot'}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    // Signatures
    setText('survey-cert-surveyor', s.surveyor_name || 'ENGR. MARITES D. PASCUAL, GE');
    setText('survey-cert-surveyor-prc', `${s.surveyor_prc || 'PRC License No. 005921'} · PTR No. 892014`);
    setText('survey-cert-approver', s.approver_name || 'ENGR. DANILO C. BALISI, GE');
    setText('survey-cert-approver-prc', `${s.approver_prc || 'PRC Lic. No. 004812'} · DENR-LMB Reg. 02`);

    // Render Canvas Lot Diagram
    if (surveyCanvas && s.coordinates && s.coordinates.length >= 3) {
      setTimeout(() => {
        drawCadastralLotDiagram(surveyCanvas, s.coordinates, mb ? mb.lines : [], mb ? mb.corners : []);
      }, 50);
    }
  }

  if (btnOpenSurveySheet) {
    btnOpenSurveySheet.addEventListener('click', () => {
      if (!activeSelectedParcelData) {
        alert('Please select a cadastral parcel on the map to view its Survey Sheet.');
        return;
      }

      const originalText = btnOpenSurveySheet.innerHTML;
      btnOpenSurveySheet.disabled = true;
      btnOpenSurveySheet.innerHTML = `<span>Loading Survey Sheet...</span>`;

      fetch(`/api/parcels/${encodeURIComponent(activeSelectedParcelData.pin)}/survey-sheet`)
        .then(res => res.json())
        .then(data => {
          btnOpenSurveySheet.disabled = false;
          btnOpenSurveySheet.innerHTML = originalText;

          if (data.success && data.survey_sheet) {
            populateSurveySheet(data);
            if (modalSurveySheet) {
              modalSurveySheet.style.display = 'flex';
            }
          } else {
            alert(`Failed to load survey sheet: ${data.message || 'Unknown error'}`);
          }
        })
        .catch(err => {
          btnOpenSurveySheet.disabled = false;
          btnOpenSurveySheet.innerHTML = originalText;
          alert(`Network/Server error loading survey sheet: ${err.message}`);
        });
    });
  }

  if (btnPrintSurveySheet) {
    btnPrintSurveySheet.addEventListener('click', () => {
      window.print();
    });
  }

  if (btnCopyTechDesc) {
    btnCopyTechDesc.addEventListener('click', () => {
      if (!activeSurveySheetData || !activeSurveySheetData.survey_sheet) {
        alert('No survey technical descriptions loaded.');
        return;
      }

      const s = activeSurveySheetData.survey_sheet;
      const mb = s.metes_and_bounds;
      let text = `TECHNICAL DESCRIPTIONS - CADASTRAL LOT SURVEY\n`;
      text += `SURVEY: ${s.survey_no || 'Cad 211, Isabela Cadastre'}\n`;
      text += `LOT: ${s.lot_no || ''} | PIN: ${s.pin || ''}\n`;
      text += `LOCATION: ${s.owner_address || s.lgu_name || 'Ilagan City'}, Isabela\n`;
      text += `LAND AREA: ${parseFloat(s.area_sqm || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} sq.m.\n\n`;
      if (mb && mb.tie_line) {
        text += `TIE POINT: From ${mb.tie_line.from_monument} to Corner 1: ${mb.tie_line.bearing}, ${mb.tie_line.distance_m.toFixed(2)} m.\n\n`;
      }
      text += `BOUNDARIES (METES AND BOUNDS):\n`;
      if (mb && mb.lines) {
        mb.lines.forEach((line) => {
          text += `  Line ${line.line_no}: ${line.bearing}, ${line.distance_m.toFixed(2)} m. (Adjoining: ${line.adjoining})\n`;
        });
      }
      text += `\nSURVEYED BY: ${s.surveyor_name} (${s.surveyor_prc})\n`;
      text += `APPROVED BY: ${s.approver_name} (${s.approver_prc})\n`;

      navigator.clipboard.writeText(text).then(() => {
        const originalBtnHtml = btnCopyTechDesc.innerHTML;
        btnCopyTechDesc.innerHTML = `<span>✓ Copied!</span>`;
        setTimeout(() => {
          btnCopyTechDesc.innerHTML = originalBtnHtml;
        }, 2000);
      }).catch(err => {
        alert(`Failed to copy to clipboard: ${err.message}`);
      });
    });
  }

  if (btnCloseSurveyModal && modalSurveySheet) {
    btnCloseSurveyModal.addEventListener('click', () => {
      modalSurveySheet.style.display = 'none';
    });

    modalSurveySheet.addEventListener('click', (e) => {
      if (e.target === modalSurveySheet) {
        modalSurveySheet.style.display = 'none';
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalSurveySheet.style.display === 'flex') {
        modalSurveySheet.style.display = 'none';
      }
    });
  }

  // 15. Live Clock
  function updateSidebarClock() {
    if (!liveClock) return;
    const now = new Date();
    const options = {
      timeZone: 'Asia/Manila',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    };
    liveClock.textContent = `PST ${now.toLocaleTimeString('en-GB', options)}`;
  }
  updateSidebarClock();
  setInterval(updateSidebarClock, 1000);

  // ==========================================================================
  // 16. Tax Declaration (RPTD) Registry Module
  // ==========================================================================
  const sidebarNavTaxDeclarations = document.getElementById('sidebar-nav-tax-declarations');
  const modalTaxDeclarationsRegistry = document.getElementById('modal-tax-declarations-registry');
  const btnCloseTdRegistry = document.getElementById('btn-close-td-registry');
  const btnCloseTdRegFooter = document.getElementById('btn-close-td-reg-footer');
  const tdRegistrySearch = document.getElementById('td-registry-search');
  const tdRegistryLguSelect = document.getElementById('td-registry-lgu-select');
  const tdRegistryStatusSelect = document.getElementById('td-registry-status-select');
  const tdRegistryClassSelect = document.getElementById('td-registry-class-select');
  const btnRefreshTdRegistry = document.getElementById('btn-refresh-td-registry');
  const tdRegistryTbody = document.getElementById('td-registry-tbody');
  const tdRegistryCountLabel = document.getElementById('td-registry-count-label');

  let tdSearchDebounceTimer = null;

  function loadTaxDeclarationsRegistry() {
    if (!tdRegistryTbody) return;
    tdRegistryTbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 24px; color: var(--colors-body-dim);">Loading Tax Declarations...</td></tr>`;

    const lgu = tdRegistryLguSelect ? tdRegistryLguSelect.value : 'ALL';
    const status = tdRegistryStatusSelect ? tdRegistryStatusSelect.value : 'ALL';
    const classification = tdRegistryClassSelect ? tdRegistryClassSelect.value : 'ALL';
    const query = tdRegistrySearch ? tdRegistrySearch.value.trim() : '';

    const url = `/api/tax-declarations?lgu=${encodeURIComponent(lgu)}&status=${encodeURIComponent(status)}&classification=${encodeURIComponent(classification)}&query=${encodeURIComponent(query)}`;

    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (!data.success) {
          tdRegistryTbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 24px; color: #a1a1aa;">Failed to load: ${data.message || 'Error'}</td></tr>`;
          return;
        }

        const list = data.tax_declarations || [];
        if (tdRegistryCountLabel) {
          tdRegistryCountLabel.textContent = `Showing ${list.length} of ${data.total || list.length} Tax Declarations (${lgu === 'ALL' ? 'All LGUs' : 'LGU ' + lgu})`;
        }

        if (list.length === 0) {
          tdRegistryTbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 28px; color: var(--colors-body-dim);">No matching Tax Declarations found.</td></tr>`;
          return;
        }

        tdRegistryTbody.innerHTML = '';
        list.forEach(item => {
          const tr = document.createElement('tr');
          const areaFmt = parseFloat(item.area_sqm || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
          const mvFmt = parseFloat(item.market_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
          const avFmt = parseFloat(item.assessed_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
          
          let statusBadge = '';
          const dStatus = item.delinquency_status || 'CURRENT';
          if (dStatus === 'DELINQUENT') {
            statusBadge = `<span class="badge-status badge-delinquent" style="font-size: 10px; padding: 2px 6px;">DELINQUENT</span>`;
          } else if (dStatus === 'EXEMPT') {
            statusBadge = `<span class="badge-status" style="font-size: 10px; padding: 2px 6px; background: rgba(255,255,255,0.08); color: #ffffff; border: 1px solid rgba(255,255,255,0.2);">EXEMPT</span>`;
          } else {
            statusBadge = `<span class="badge-status badge-current" style="font-size: 10px; padding: 2px 6px;">CURRENT</span>`;
          }

          tr.innerHTML = `
            <td class="mono-num" style="color: #ffffff; font-weight: 500;">${item.td_no || '—'}</td>
            <td class="mono-num" style="color: var(--colors-body-mid);">${item.pin || '—'}</td>
            <td style="font-weight: 400; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.owner_name || 'Declared Owner'}</td>
            <td>${item.classification || 'Residential'}</td>
            <td class="mono-num">${areaFmt}</td>
            <td class="mono-num">${mvFmt}</td>
            <td class="mono-num" style="color: #ffffff;">${avFmt}</td>
            <td>${statusBadge}</td>
            <td style="text-align: right; white-space: nowrap;">
              <button type="button" class="btn-tbl-action btn-view-td" data-pin="${item.pin}" title="View & Print Official Tax Declaration">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
                <span>View TD</span>
              </button>
              <button type="button" class="btn-tbl-action btn-locate" data-pin="${item.pin}" data-lat="${item.lat}" data-lng="${item.lng}" title="Locate on Map">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <circle cx="12" cy="12" r="10"></circle>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
                <span>Locate</span>
              </button>
            </td>
          `;

          // Event: View TD Certificate
          const btnView = tr.querySelector('.btn-view-td');
          if (btnView) {
            btnView.addEventListener('click', (e) => {
              e.stopPropagation();
              fetch(`/api/parcels/${encodeURIComponent(item.pin)}/issue-td`)
                .then(res => res.json())
                .then(tdRes => {
                  if (tdRes.success && tdRes.tax_declaration) {
                    populateTaxDeclaration(tdRes.tax_declaration);
                    if (modalTaxDeclaration) modalTaxDeclaration.style.display = 'flex';
                  } else {
                    alert(`Failed to retrieve Tax Declaration: ${tdRes.message || 'Error'}`);
                  }
                })
                .catch(err => alert(`Network error: ${err.message}`));
            });
          }

          // Event: Locate on Map
          const btnLoc = tr.querySelector('.btn-locate');
          if (btnLoc) {
            btnLoc.addEventListener('click', (e) => {
              e.stopPropagation();
              if (modalTaxDeclarationsRegistry) modalTaxDeclarationsRegistry.style.display = 'none';

              // If LGU doesn't match active, switch LGU
              if (item.lgu_code && item.lgu_code !== activeLguCode && lguSelect) {
                lguSelect.value = item.lgu_code;
                lguSelect.dispatchEvent(new Event('change'));
              }

              setTimeout(() => {
                const entry = parcelPolygonMap.get(item.pin);
                if (entry) {
                  selectParcel(entry.data, entry.polygon);
                  if (map && entry.polygon) {
                    map.fitBounds(entry.polygon.getBounds(), { padding: [50, 50], maxZoom: 18 });
                  }
                } else if (map && item.lat && item.lng) {
                  map.setView([item.lat, item.lng], 18);
                }
              }, 300);
            });
          }

          tdRegistryTbody.appendChild(tr);
        });
      })
      .catch(err => {
        tdRegistryTbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 24px; color: #a1a1aa;">Network error: ${err.message}</td></tr>`;
      });
  }

  if (sidebarNavTaxDeclarations) {
    sidebarNavTaxDeclarations.addEventListener('click', (e) => {
      e.preventDefault();
      if (modalTaxDeclarationsRegistry) {
        modalTaxDeclarationsRegistry.style.display = 'flex';
        if (tdRegistryLguSelect && activeLguCode) {
          tdRegistryLguSelect.value = activeLguCode;
        }
        loadTaxDeclarationsRegistry();
      }
    });
  }

  if (btnCloseTdRegistry && modalTaxDeclarationsRegistry) {
    btnCloseTdRegistry.addEventListener('click', () => { modalTaxDeclarationsRegistry.style.display = 'none'; });
  }
  if (btnCloseTdRegFooter && modalTaxDeclarationsRegistry) {
    btnCloseTdRegFooter.addEventListener('click', () => { modalTaxDeclarationsRegistry.style.display = 'none'; });
  }
  if (btnRefreshTdRegistry) {
    btnRefreshTdRegistry.addEventListener('click', () => { loadTaxDeclarationsRegistry(); });
  }
  if (tdRegistryLguSelect) {
    tdRegistryLguSelect.addEventListener('change', () => { loadTaxDeclarationsRegistry(); });
  }
  if (tdRegistryStatusSelect) {
    tdRegistryStatusSelect.addEventListener('change', () => { loadTaxDeclarationsRegistry(); });
  }
  if (tdRegistryClassSelect) {
    tdRegistryClassSelect.addEventListener('change', () => { loadTaxDeclarationsRegistry(); });
  }
  if (tdRegistrySearch) {
    tdRegistrySearch.addEventListener('input', () => {
      clearTimeout(tdSearchDebounceTimer);
      tdSearchDebounceTimer = setTimeout(loadTaxDeclarationsRegistry, 250);
    });
  }

  // ==========================================================================
  // 17. General Revision Assessment Roll Module (R.A. 7160 Sec. 248)
  // ==========================================================================
  const sidebarNavAssessmentRoll = document.getElementById('sidebar-nav-assessment-roll');
  const modalAssessmentRoll = document.getElementById('modal-assessment-roll');
  const btnCloseAssessmentRoll = document.getElementById('btn-close-assessment-roll');
  const btnCloseAssessmentRollFooter = document.getElementById('btn-close-assessment-roll-footer');
  const assessmentRollLguSelect = document.getElementById('assessment-roll-lgu-select');
  const btnPrintAssessmentRoll = document.getElementById('btn-print-assessment-roll');
  const rollKpiAv = document.getElementById('roll-kpi-av');
  const rollKpiLevel = document.getElementById('roll-kpi-level');
  const rollKpiMv = document.getElementById('roll-kpi-mv');
  const rollKpiArea = document.getElementById('roll-kpi-area');
  const rollKpiCounts = document.getElementById('roll-kpi-counts');
  const rollKpiDelinq = document.getElementById('roll-kpi-delinq');
  const rollKpiTax = document.getElementById('roll-kpi-tax');
  const rollClassBreakdownContainer = document.getElementById('roll-class-breakdown-container');
  const assessmentRollTbody = document.getElementById('assessment-roll-tbody');
  const rollFooterInfo = document.getElementById('roll-footer-info');

  function loadAssessmentRoll(lguCode) {
    const lgu = lguCode || (assessmentRollLguSelect ? assessmentRollLguSelect.value : '03215');
    if (assessmentRollTbody) {
      assessmentRollTbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding: 20px; color: var(--colors-body-dim);">Loading Assessment Roll for ${lgu}...</td></tr>`;
    }

    fetch(`/api/assessment-roll?lgu=${encodeURIComponent(lgu)}`)
      .then(res => res.json())
      .then(data => {
        if (!data.success) {
          if (assessmentRollTbody) {
            assessmentRollTbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding: 20px; color: #a1a1aa;">Failed to load: ${data.message || 'Error'}</td></tr>`;
          }
          return;
        }

        const sum = data.summary || {};

        // Update KPIs
        if (rollKpiAv) rollKpiAv.textContent = `PHP ${parseFloat(sum.total_assessed_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        if (rollKpiLevel) rollKpiLevel.textContent = `Eff. Assessment Level: ${sum.effective_assessment_level_pct || 0}%`;
        if (rollKpiMv) rollKpiMv.textContent = `PHP ${parseFloat(sum.total_market_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        if (rollKpiArea) rollKpiArea.textContent = `${sum.total_area_ha || 0} ha (${parseFloat(sum.total_area_sqm || 0).toLocaleString('en-US', { minimumFractionDigits: 1 })} sq.m.)`;
        if (rollKpiCounts) rollKpiCounts.textContent = `${sum.taxable_parcels || 0} Taxable / ${sum.exempt_parcels || 0} Exempt`;
        if (rollKpiDelinq) rollKpiDelinq.textContent = `${sum.delinquent_parcels || 0} Delinquent Accounts`;
        if (rollKpiTax) rollKpiTax.textContent = `PHP ${parseFloat(sum.total_annual_tax || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

        if (rollFooterInfo) {
          rollFooterInfo.textContent = `Certified Assessment Roll Pursuant to R.A. 7160 Sec. 248 · ${data.lgu_name} (${data.lgu_code}) · ${sum.total_parcels} Parcels`;
        }

        // Render Classification Breakdown
        if (rollClassBreakdownContainer) {
          rollClassBreakdownContainer.innerHTML = '';
          const bList = data.classification_breakdown || [];
          bList.forEach(cls => {
            const card = document.createElement('div');
            card.className = 'roll-breakdown-card';
            card.innerHTML = `
              <div class="roll-breakdown-class">
                <span>${cls.classification}</span>
                <span class="mono-num" style="font-size: 11px; color: #ffffff;">${cls.share_pct}%</span>
              </div>
              <div class="roll-breakdown-val mono-num">PHP ${cls.assessed_value.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
              <div class="roll-breakdown-meta mono-num">${cls.count} lots · ${cls.area_ha} ha</div>
            `;
            rollClassBreakdownContainer.appendChild(card);
          });
        }

        // Render Roll Table
        if (assessmentRollTbody) {
          assessmentRollTbody.innerHTML = '';
          const items = data.roll_items || [];
          if (items.length === 0) {
            assessmentRollTbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding: 24px; color: var(--colors-body-dim);">No assessment roll records indexed for this jurisdiction.</td></tr>`;
            return;
          }

          items.forEach(item => {
            const tr = document.createElement('tr');
            const areaFmt = parseFloat(item.area_sqm || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
            const mvFmt = parseFloat(item.market_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
            const avFmt = parseFloat(item.assessed_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
            const taxFmt = parseFloat(item.annual_tax || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });

            let statusBadge = '';
            if (item.delinquency_status === 'DELINQUENT') {
              statusBadge = `<span class="badge-status badge-delinquent" style="font-size: 10px;">DELINQUENT</span>`;
            } else if (item.delinquency_status === 'EXEMPT') {
              statusBadge = `<span class="badge-status" style="font-size: 10px; background: rgba(255,255,255,0.08); color: #ffffff; border: 1px solid rgba(255,255,255,0.2);">EXEMPT</span>`;
            } else {
              statusBadge = `<span class="badge-status badge-current" style="font-size: 10px;">CURRENT</span>`;
            }

            tr.innerHTML = `
              <td class="mono-num" style="color: var(--colors-body-dim);">${item.item_no}</td>
              <td class="mono-num" style="color: #ffffff;">${item.pin || '—'}</td>
              <td class="mono-num">${item.lot_no || '—'}</td>
              <td style="max-width: 170px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.owner_name || 'Declared Owner'}</td>
              <td>${item.classification || 'Residential'}</td>
              <td class="mono-num">${areaFmt}</td>
              <td class="mono-num">${mvFmt}</td>
              <td class="mono-num" style="color: #ffffff; font-weight: 500;">${avFmt}</td>
              <td class="mono-num" style="color: #ffffff;">PHP ${taxFmt}</td>
              <td>${statusBadge}</td>
            `;
            assessmentRollTbody.appendChild(tr);
          });
        }
      })
      .catch(err => {
        if (assessmentRollTbody) {
          assessmentRollTbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding: 20px; color: #a1a1aa;">Network error: ${err.message}</td></tr>`;
        }
      });
  }

  if (sidebarNavAssessmentRoll) {
    sidebarNavAssessmentRoll.addEventListener('click', (e) => {
      e.preventDefault();
      if (modalAssessmentRoll) {
        modalAssessmentRoll.style.display = 'flex';
        if (assessmentRollLguSelect && activeLguCode) {
          assessmentRollLguSelect.value = activeLguCode;
        }
        loadAssessmentRoll();
      }
    });
  }

  if (btnCloseAssessmentRoll && modalAssessmentRoll) {
    btnCloseAssessmentRoll.addEventListener('click', () => { modalAssessmentRoll.style.display = 'none'; });
  }
  if (btnCloseAssessmentRollFooter && modalAssessmentRoll) {
    btnCloseAssessmentRollFooter.addEventListener('click', () => { modalAssessmentRoll.style.display = 'none'; });
  }
  if (assessmentRollLguSelect) {
    assessmentRollLguSelect.addEventListener('change', () => {
      loadAssessmentRoll(assessmentRollLguSelect.value);
    });
  }
  if (btnPrintAssessmentRoll) {
    btnPrintAssessmentRoll.addEventListener('click', () => {
      window.print();
    });
  }

  // ==========================================================================
  // 18. Provincial Audit Trail Viewer Module
  // ==========================================================================
  const sidebarNavAuditTrail = document.getElementById('sidebar-nav-audit-trail');
  const modalAuditTrail = document.getElementById('modal-audit-trail');
  const btnCloseAuditTrail = document.getElementById('btn-close-audit-trail');
  const btnCloseAuditFooter = document.getElementById('btn-close-audit-footer');
  const auditSearchInput = document.getElementById('audit-search-input');
  const auditActionSelect = document.getElementById('audit-action-select');
  const btnRefreshAudit = document.getElementById('btn-refresh-audit');
  const auditTbody = document.getElementById('audit-tbody');
  const auditCountLabel = document.getElementById('audit-count-label');

  let auditDebounceTimer = null;

  function loadAuditLogs() {
    if (!auditTbody) return;
    auditTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 24px; color: var(--colors-body-dim);">Loading Audit Logs...</td></tr>`;

    const action = auditActionSelect ? auditActionSelect.value : 'ALL';
    const query = auditSearchInput ? auditSearchInput.value.trim() : '';

    const url = `/api/audit-logs?action=${encodeURIComponent(action)}&query=${encodeURIComponent(query)}&limit=150`;

    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (!data.success) {
          auditTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 24px; color: #a1a1aa;">Failed to load logs: ${data.message || 'Error'}</td></tr>`;
          return;
        }

        const logs = data.logs || [];
        if (auditCountLabel) {
          auditCountLabel.textContent = `Showing ${logs.length} of ${data.total || logs.length} Logged Transactions`;
        }

        if (logs.length === 0) {
          auditTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 28px; color: var(--colors-body-dim);">No audit events matching criteria.</td></tr>`;
          return;
        }

        auditTbody.innerHTML = '';
        logs.forEach(log => {
          const tr = document.createElement('tr');

          // Action badge styling
          let badgeHtml = '';
          const act = log.action || 'EVENT';
          if (act.includes('CREATE')) {
            badgeHtml = `<span class="badge-audit badge-audit-create">${act}</span>`;
          } else if (act.includes('SUBDIVID')) {
            badgeHtml = `<span class="badge-audit badge-audit-subdivide">${act}</span>`;
          } else if (act.includes('DELET')) {
            badgeHtml = `<span class="badge-audit badge-audit-delete">${act}</span>`;
          } else if (act.includes('ISSUED') || act.includes('TD_') || act.includes('DELINQ')) {
            badgeHtml = `<span class="badge-audit badge-audit-doc">${act}</span>`;
          } else {
            badgeHtml = `<span class="badge-audit badge-audit-auth">${act}</span>`;
          }

          // Format timestamp
          let timeDisplay = log.timestamp || '—';
          try {
            const dt = new Date(log.timestamp);
            if (!isNaN(dt.getTime())) {
              timeDisplay = dt.toLocaleString('en-GB', { timeZone: 'Asia/Manila', hour12: false });
            }
          } catch(e) {}

          tr.innerHTML = `
            <td class="mono-num" style="color: var(--colors-body-mid); font-size: 11px;">${timeDisplay}</td>
            <td class="mono-num" style="color: #ffffff; font-weight: 500;">${log.username || 'system'}</td>
            <td>${badgeHtml}</td>
            <td style="line-height: 1.4; color: var(--colors-ink);">${log.details || '—'}</td>
            <td class="mono-num" style="color: var(--colors-body-dim); font-size: 11px;">${log.ip_address || '127.0.0.1'}</td>
          `;
          auditTbody.appendChild(tr);
        });
      })
      .catch(err => {
        auditTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 24px; color: #a1a1aa;">Network error: ${err.message}</td></tr>`;
      });
  }

  if (sidebarNavAuditTrail) {
    sidebarNavAuditTrail.addEventListener('click', (e) => {
      e.preventDefault();
      if (modalAuditTrail) {
        modalAuditTrail.style.display = 'flex';
        loadAuditLogs();
      }
    });
  }

  if (btnCloseAuditTrail && modalAuditTrail) {
    btnCloseAuditTrail.addEventListener('click', () => { modalAuditTrail.style.display = 'none'; });
  }
  if (btnCloseAuditFooter && modalAuditTrail) {
    btnCloseAuditFooter.addEventListener('click', () => { modalAuditTrail.style.display = 'none'; });
  }
  if (btnRefreshAudit) {
    btnRefreshAudit.addEventListener('click', () => { loadAuditLogs(); });
  }
  if (auditActionSelect) {
    auditActionSelect.addEventListener('change', () => { loadAuditLogs(); });
  }
  if (auditSearchInput) {
    auditSearchInput.addEventListener('input', () => {
      clearTimeout(auditDebounceTimer);
      auditDebounceTimer = setTimeout(loadAuditLogs, 250);
    });
  }

  // ==========================================================================
  // 19. Cadastral Data Export Workflow (GeoJSON & Assessment Roll CSV)
  // ==========================================================================
  const btnExportCadastre = document.getElementById('btn-export-cadastre');
  const exportDropdownMenu = document.getElementById('export-dropdown-menu');
  const btnExportGeojson = document.getElementById('btn-export-geojson');
  const btnExportCsv = document.getElementById('btn-export-csv');

  if (btnExportCadastre && exportDropdownMenu) {
    btnExportCadastre.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = exportDropdownMenu.style.display === 'flex';
      exportDropdownMenu.style.display = isVisible ? 'none' : 'flex';
    });

    document.addEventListener('click', (e) => {
      if (!btnExportCadastre.contains(e.target) && !exportDropdownMenu.contains(e.target)) {
        exportDropdownMenu.style.display = 'none';
      }
    });
  }

  if (btnExportGeojson) {
    btnExportGeojson.addEventListener('click', (e) => {
      e.preventDefault();
      if (exportDropdownMenu) exportDropdownMenu.style.display = 'none';
      const curLgu = lguSelect ? lguSelect.value : '03215';
      window.location.href = `/api/cadastre/export/geojson?lgu=${encodeURIComponent(curLgu)}`;
    });
  }

  if (btnExportCsv) {
    btnExportCsv.addEventListener('click', (e) => {
      e.preventDefault();
      if (exportDropdownMenu) exportDropdownMenu.style.display = 'none';
      const curLgu = lguSelect ? lguSelect.value : '03215';
      window.location.href = `/api/cadastre/export/csv?lgu=${encodeURIComponent(curLgu)}`;
    });
  }

  // ==========================================================================
  // 20. Real Property Tax Payment Settlement & Accountable Form 51-C Module
  // ==========================================================================
  const modalPostPayment = document.getElementById('modal-post-payment');
  const btnClosePaymentModal = document.getElementById('btn-close-payment-modal');
  const btnCancelPayment = document.getElementById('btn-cancel-payment');
  const formPostPayment = document.getElementById('form-post-payment');

  const payLotTitle = document.getElementById('pay-lot-title');
  const payPinDisplay = document.getElementById('pay-pin-display');
  const payOwnerDisplay = document.getElementById('pay-owner-display');
  const payStatusBadge = document.getElementById('pay-status-badge');
  const payBasicRpt = document.getElementById('pay-basic-rpt');
  const paySef = document.getElementById('pay-sef');
  const payPenalties = document.getElementById('pay-penalties');
  const payTotalDue = document.getElementById('pay-total-due');
  const payPayorName = document.getElementById('pay-payor-name');
  const payModeSelect = document.getElementById('pay-mode-select');
  const payReferenceNo = document.getElementById('pay-reference-no');
  const payTendered = document.getElementById('pay-tendered');
  const payChange = document.getElementById('pay-change');
  const btnSubmitPayment = document.getElementById('btn-submit-payment');

  const modalOfficialReceipt = document.getElementById('modal-official-receipt');
  const btnCloseReceiptModal = document.getElementById('btn-close-receipt-modal');
  const btnPrintReceipt = document.getElementById('btn-print-receipt');

  let currentPaymentBreakdown = {
    basic_rpt: 0,
    sef: 0,
    penalties: 0,
    total_due: 0,
    period: ''
  };

  const btnOpenPaymentEl = document.getElementById('btn-open-payment');
  if (btnOpenPaymentEl) {
    btnOpenPaymentEl.addEventListener('click', () => {
      if (!activeSelectedParcelData) {
        if (parcelPolygonMap.size > 0) {
          const first = parcelPolygonMap.values().next().value;
          selectParcel(first.data, first.polygon);
        } else {
          alert('Please select a parcel on the map to post tax payment.');
          return;
        }
      }
      const p = activeSelectedParcelData;
      const isExempt = (p.status && p.status.includes('Exempt')) || (p.delinquency && p.delinquency.status === 'EXEMPT');
      if (isExempt) {
        alert(`[REAL PROPERTY TAX STATUS]\nParcel: ${p.pin} (${p.lot_no || 'Lot'})\nDeclared Owner: ${p.owner_name || '—'}\nClassification: ${p.classification || 'Institutional'}\n\nThis parcel is officially EXEMPT from Real Property Taxation under Section 234 of Republic Act No. 7160 (Government / Public Use).\nNo tax payment is required.`);
        return;
      }
      const delinq = p.delinquency || {};
      const av = parseFloat(p.assessed_value || 0);
      const annualBase = parseFloat(delinq.annual_tax || (av * 0.03) || 0);
      const basicRpt = parseFloat(delinq.basic_tax || (annualBase * (2/3)) || 0);
      const sef = parseFloat(delinq.sef_tax || (annualBase * (1/3)) || 0);
      const penalties = parseFloat(delinq.penalty_amount || 0);
      const totalDue = parseFloat(delinq.total_delinquent_due || (basicRpt + sef + penalties) || 0);
      const period = delinq.delinquent_years_str || 'Annual 2026';

      currentPaymentBreakdown = {
        basic_rpt: basicRpt,
        sef: sef,
        penalties: penalties,
        total_due: totalDue,
        period: period
      };

      if (payLotTitle) payLotTitle.textContent = `LOT ${p.lot_no || '—'} · ${p.block_no || 'BLK 01'}`;
      if (payPinDisplay) payPinDisplay.textContent = p.pin || '—';
      if (payOwnerDisplay) payOwnerDisplay.textContent = `Declared Owner: ${p.owner_name || '—'}`;
      if (payStatusBadge) {
        payStatusBadge.textContent = delinq.status || 'CURRENT';
        payStatusBadge.className = `badge-status badge-${(delinq.status || 'current').toLowerCase()}`;
      }

      if (payBasicRpt) payBasicRpt.textContent = `PHP ${basicRpt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      if (paySef) paySef.textContent = `PHP ${sef.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      if (payPenalties) payPenalties.textContent = `PHP ${penalties.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      if (payTotalDue) payTotalDue.textContent = `PHP ${totalDue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      if (payPayorName) payPayorName.value = p.owner_name || '';
      if (payModeSelect) payModeSelect.value = 'CASH';
      if (payReferenceNo) payReferenceNo.value = '';
      if (payTendered) payTendered.value = totalDue.toFixed(2);
      if (payChange) {
        payChange.value = 'PHP 0.00';
        payChange.style.color = '#ffffff';
      }

      if (modalPostPayment) modalPostPayment.style.display = 'flex';
    });
  }

  if (payTendered) {
    payTendered.addEventListener('input', () => {
      const tendered = parseFloat(payTendered.value) || 0;
      const change = tendered - currentPaymentBreakdown.total_due;
      if (payChange) {
        if (change >= 0) {
          payChange.value = `PHP ${change.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          payChange.style.color = '#ffffff';
        } else {
          payChange.value = `Short by PHP ${Math.abs(change).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          payChange.style.color = '#a1a1aa';
        }
      }
    });
  }

  if (btnClosePaymentModal && modalPostPayment) {
    btnClosePaymentModal.addEventListener('click', () => {
      modalPostPayment.style.display = 'none';
    });
  }
  if (btnCancelPayment && modalPostPayment) {
    btnCancelPayment.addEventListener('click', () => {
      modalPostPayment.style.display = 'none';
    });
  }

  function renderOfficialReceipt(r) {
    if (!modalOfficialReceipt) return;

    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setText('or-lgu-title', (r.lgu_name || 'City of Ilagan').toUpperCase());
    setText('or-doc-no', r.or_no || 'OR-2026');
    setText('or-doc-date', r.payment_date || 'March 8, 2026');
    setText('or-doc-payor', r.payor_name || 'Declared Owner');
    setText('or-doc-mode', `${r.payment_mode || 'CASH'}${r.reference_no && r.reference_no !== 'N/A' ? ` (Ref: ${r.reference_no})` : ''}`);
    setText('or-doc-pin', r.pin || '—');
    setText('or-doc-td', r.td_no || '—');
    setText('or-doc-lot', `Lot ${r.lot_no || '—'}, ${r.block_no || '—'}`);
    setText('or-doc-av', `PHP ${parseFloat(r.assessed_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    setText('or-doc-period', r.period_covered || 'Annual 2026');

    setText('or-table-basic', parseFloat(r.basic_rpt || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setText('or-table-sef', parseFloat(r.sef || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setText('or-table-penalties', parseFloat(r.penalties || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setText('or-table-discount', `(${parseFloat(r.discount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`);
    setText('or-table-total', `PHP ${parseFloat(r.total_amount_paid || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

    setText('or-doc-cashier', (r.collecting_officer || 'CHRISTIAN B. SALVADOR').toUpperCase());
    setText('or-doc-badge', `Badge No. ${r.officer_badge || 'PGI-TRS-008'}`);

    modalOfficialReceipt.style.display = 'flex';
  }

  if (btnCloseReceiptModal && modalOfficialReceipt) {
    btnCloseReceiptModal.addEventListener('click', () => {
      modalOfficialReceipt.style.display = 'none';
    });
  }

  if (btnPrintReceipt) {
    btnPrintReceipt.addEventListener('click', () => {
      window.print();
    });
  }

  if (formPostPayment) {
    formPostPayment.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!activeSelectedParcelData) return;
      const pin = activeSelectedParcelData.pin;
      const tendered = parseFloat(payTendered ? payTendered.value : 0) || 0;
      if (tendered < currentPaymentBreakdown.total_due) {
        alert('Tendered amount cannot be less than total amount due.');
        return;
      }

      if (btnSubmitPayment) {
        btnSubmitPayment.disabled = true;
        btnSubmitPayment.textContent = 'Posting Payment...';
      }

      const payload = {
        payor_name: payPayorName ? payPayorName.value.trim() : '',
        payment_mode: payModeSelect ? payModeSelect.value : 'CASH',
        reference_no: payReferenceNo ? payReferenceNo.value.trim() : '',
        basic_rpt: currentPaymentBreakdown.basic_rpt,
        sef: currentPaymentBreakdown.sef,
        penalties: currentPaymentBreakdown.penalties,
        discount: 0.0,
        period_covered: currentPaymentBreakdown.period
      };

      fetch(`/api/parcels/${encodeURIComponent(pin)}/pay-tax`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      .then(res => res.json())
      .then(res => {
        if (btnSubmitPayment) {
          btnSubmitPayment.disabled = false;
          btnSubmitPayment.textContent = 'Process Payment & Issue Form 51-C';
        }

        if (!res.success) {
          alert(`Payment failed: ${res.message || 'Unknown error'}`);
          return;
        }

        // Close payment modal
        if (modalPostPayment) modalPostPayment.style.display = 'none';

        // Render printable Official Receipt Form 51-C
        if (res.receipt) {
          renderOfficialReceipt(res.receipt);
        }

        // Update active parcel data
        activeSelectedParcelData.delinquency_status = 'CURRENT';
        activeSelectedParcelData.status = 'Taxable - Paid / Current';
        activeSelectedParcelData.penalty_amount = 0;
        activeSelectedParcelData.total_delinquent_due = 0;
        activeSelectedParcelData.overdue_months = 0;
        if (activeSelectedParcelData.delinquency) {
          activeSelectedParcelData.delinquency.status = 'CURRENT';
          activeSelectedParcelData.delinquency.penalty_amount = 0;
          activeSelectedParcelData.delinquency.total_delinquent_due = 0;
          activeSelectedParcelData.delinquency.overdue_months = 0;
        }

        // Re-render inspector & polygon styling
        selectParcel(activeSelectedParcelData, activeSelectedPolygon);
        loadCollectionTelemetry(activeSelectedParcelData.lgu_code || (lguSelect ? lguSelect.value : '03215'));
      })
      .catch(err => {
        if (btnSubmitPayment) {
          btnSubmitPayment.disabled = false;
          btnSubmitPayment.textContent = 'Process Payment & Issue Form 51-C';
        }
        alert(`Network error posting payment: ${err.message}`);
      });
    });
  }

  // ==========================================================================
  // 21. Real Property Tax Clearance Certificate Module (R.A. 7160)
  // ==========================================================================
  const modalTaxClearance = document.getElementById('modal-tax-clearance');
  const btnCloseClearanceModal = document.getElementById('btn-close-clearance-modal');
  const btnPrintClearance = document.getElementById('btn-print-clearance');
  const btnIssueClearanceEl = document.getElementById('btn-issue-clearance');
  const clearancePurposeSelect = document.getElementById('clearance-purpose-select');

  function renderTaxClearance(c) {
    if (!modalTaxClearance) return;

    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setText('tc-lgu-title', (c.jurisdiction.lgu_name || 'City of Ilagan').toUpperCase());
    setText('tc-doc-no', c.clearance_no || 'RPTC-2026-00000');
    setText('tc-doc-date-validity', `${c.date_issued || 'March 8, 2026'} · ${c.valid_until || 'Valid for 90 Days'}`);
    setText('tc-doc-owner', c.property.owner_name || 'Declared Property Owner');
    setText('tc-doc-address', c.property.owner_address || 'Province of Isabela');
    setText('tc-doc-pin', c.property.pin || '—');
    setText('tc-doc-td', c.property.td_no || '—');
    setText('tc-doc-lot', `Lot ${c.property.lot_no || '—'}, ${c.property.block_no || 'Blk 01'}`);
    setText('tc-doc-survey', `${c.property.survey_no || 'Cad 211'} (PRS92 / Zone 3)`);
    setText('tc-doc-class', c.property.classification || 'Residential');
    setText('tc-doc-area', `${parseFloat(c.property.area_sqm || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} sq.m. (${c.property.area_ha || '0.0000'} ha)`);
    setText('tc-doc-mv', `PHP ${parseFloat(c.property.market_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    setText('tc-doc-av', `PHP ${parseFloat(c.property.assessed_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);

    const certBodyEl = document.getElementById('tc-doc-cert-body');
    if (certBodyEl) {
      certBodyEl.innerHTML = `<strong>THIS IS TO CERTIFY</strong> that according to the Official Real Property Tax Roll, Assessment Register, and Collection Records of this Office, the real property described above is <strong>${c.tax_status_statement}</strong>.`;
    }

    setText('tc-doc-purpose-text', c.purpose || 'Transfer of Ownership / BIR eCAR Application / LRA Title Registration');

    const pay = c.payment_info || {};
    setText('tc-doc-or-no', pay.latest_or_no || 'N/A');
    setText('tc-doc-or-date', pay.date_paid || 'N/A');
    if (pay.status === 'EXEMPT') {
      setText('tc-doc-or-amount', 'PHP 0.00 (Exempt)');
    } else {
      setText('tc-doc-or-amount', `PHP ${parseFloat(pay.amount_paid || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    }
    setText('tc-doc-or-period', pay.period_covered || 'Annual 2026');

    const fees = c.fees || {};
    setText('tc-doc-fee-or', fees.fee_or_no || 'OR-FEE-2026-00000');

    const sign = c.signatories || {};
    if (sign.issuing_officer) {
      setText('tc-doc-examiner', (sign.issuing_officer.username || 'ENGR. MARITES D. PASCUAL').toUpperCase());
      setText('tc-doc-badge', `Badge No. ${sign.issuing_officer.badge || 'PGI-TRS-008'}`);
    }

    modalTaxClearance.style.display = 'flex';
  }

  function fetchAndShowTaxClearance() {
    if (!activeSelectedParcelData) {
      if (parcelPolygonMap.size > 0) {
        const first = parcelPolygonMap.values().next().value;
        selectParcel(first.data, first.polygon);
      } else {
        alert('Please select a cadastral parcel on the map to issue its Tax Clearance.');
        return;
      }
    }
    const p = activeSelectedParcelData;
    const delinq = p.delinquency || {};

    // Gate: Block if delinquent
    if (delinq.status === 'DELINQUENT' || p.delinquency_status === 'DELINQUENT') {
      const totalDue = delinq.total_delinquent_due || p.total_delinquent_due || 0;
      const confirmPay = confirm(
        `Cannot issue Tax Clearance: Parcel ${p.pin} has an outstanding delinquent tax liability of PHP ${parseFloat(totalDue).toLocaleString('en-US', { minimumFractionDigits: 2 })}.\n\n` +
        `Pursuant to R.A. 7160, all tax arrears and penalties must be settled prior to clearance issuance.\n\n` +
        `Click OK to open the Pay Tax window now and settle this account.`
      );
      if (confirmPay) {
        const btnPay = document.getElementById('btn-open-payment');
        if (btnPay) btnPay.click();
      }
      return;
    }

    const purpose = clearancePurposeSelect ? clearancePurposeSelect.value : '';
    fetch(`/api/parcels/${encodeURIComponent(p.pin)}/tax-clearance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purpose: purpose })
    })
    .then(res => res.json())
    .then(res => {
      if (!res.success) {
        alert(res.message || 'Failed to issue Tax Clearance Certificate.');
        return;
      }
      if (res.clearance) {
        renderTaxClearance(res.clearance);
      }
    })
    .catch(err => {
      alert(`Network error issuing tax clearance: ${err.message}`);
    });
  }

  if (btnIssueClearanceEl) {
    btnIssueClearanceEl.addEventListener('click', () => {
      fetchAndShowTaxClearance();
    });
  }

  if (clearancePurposeSelect) {
    clearancePurposeSelect.addEventListener('change', () => {
      if (modalTaxClearance && modalTaxClearance.style.display === 'flex') {
        fetchAndShowTaxClearance();
      }
    });
  }

  if (btnCloseClearanceModal && modalTaxClearance) {
    btnCloseClearanceModal.addEventListener('click', () => {
      modalTaxClearance.style.display = 'none';
    });
  }

  if (btnPrintClearance) {
    btnPrintClearance.addEventListener('click', () => {
      window.print();
    });
  }

  // ==========================================================================
  // CADASTRAL TOPOLOGY & BOUNDARY ENCROACHMENT CONFLICTS ENGINE
  // ==========================================================================
  const modalCadastralConflicts = document.getElementById('modal-cadastral-conflicts');
  const btnScanConflicts = document.getElementById('btn-scan-conflicts');
  const btnCloseConflictsModal = document.getElementById('btn-close-conflicts-modal');
  const btnRefreshConflictsScan = document.getElementById('btn-refresh-conflicts-scan');
  const conflictsLguSelect = document.getElementById('conflicts-lgu-select');
  const conflictsKpiHealth = document.getElementById('conflicts-kpi-health');
  const conflictsKpiTotal = document.getElementById('conflicts-kpi-total');
  const conflictsKpiCount = document.getElementById('conflicts-kpi-count');
  const conflictsKpiArea = document.getElementById('conflicts-kpi-area');
  const conflictsEmptyState = document.getElementById('conflicts-empty-state');
  const conflictsTableWrapper = document.getElementById('conflicts-table-wrapper');
  const conflictsTbody = document.getElementById('conflicts-tbody');
  const conflictsTimestamp = document.getElementById('conflicts-timestamp');

  let activeTopologyDisputes = [];

  function fetchAndRenderCadastreConflicts(lguCode = '03215') {
    if (btnRefreshConflictsScan) {
      btnRefreshConflictsScan.disabled = true;
      btnRefreshConflictsScan.textContent = 'Auditing...';
    }

    fetch(`/api/cadastre/conflicts?lgu=${encodeURIComponent(lguCode)}`)
      .then(res => res.json())
      .then(data => {
        if (!data.success || !data.report) throw new Error(data.message || 'Audit failed');

        const report = data.report;
        activeTopologyDisputes = report.disputes || [];

        // Update KPIs
        if (conflictsKpiHealth) {
          conflictsKpiHealth.textContent = `${report.topology_health_pct}%`;
          conflictsKpiHealth.style.color = '#ffffff';
        }
        if (conflictsKpiTotal) {
          conflictsKpiTotal.textContent = `${report.total_parcels} Lots`;
        }
        if (conflictsKpiCount) {
          conflictsKpiCount.textContent = `${report.conflicts_found} Conflict${report.conflicts_found === 1 ? '' : 's'}`;
          conflictsKpiCount.style.color = '#ffffff';
        }

        let totalDisputedArea = 0;
        if (activeTopologyDisputes.length > 0) {
          totalDisputedArea = activeTopologyDisputes.reduce((sum, d) => sum + (d.overlap_area_sqm || 0), 0);
        }
        if (conflictsKpiArea) {
          conflictsKpiArea.textContent = `${(Math.round(totalDisputedArea * 100) / 100).toLocaleString()} sq.m.`;
          conflictsKpiArea.style.color = '#ffffff';
        }

        if (conflictsTimestamp) {
          const now = new Date();
          conflictsTimestamp.textContent = `Scanned at ${now.toLocaleTimeString()} (${report.total_parcels} lots scanned)`;
        }

        // Render Disputes or Clean Empty State
        if (activeTopologyDisputes.length === 0) {
          if (conflictsEmptyState) conflictsEmptyState.style.display = 'flex';
          if (conflictsTableWrapper) conflictsTableWrapper.style.display = 'none';
          if (conflictsTbody) conflictsTbody.innerHTML = '';
        } else {
          if (conflictsEmptyState) conflictsEmptyState.style.display = 'none';
          if (conflictsTableWrapper) conflictsTableWrapper.style.display = 'block';
          if (conflictsTbody) {
            conflictsTbody.innerHTML = '';
            activeTopologyDisputes.forEach((d, idx) => {
              const tr = document.createElement('tr');
              const overlapArea = Math.round((d.overlap_area_sqm || 0) * 100) / 100;
              const areaA = d.lot_a.area_sqm || 1;
              const pctA = Math.min(100, Math.round((overlapArea / areaA) * 1000) / 10);

              let severityClass = 'severity-minor';
              let severityText = 'MINOR';
              if (overlapArea > 50) {
                severityClass = 'severity-critical';
                severityText = 'CRITICAL';
              } else if (overlapArea > 10) {
                severityClass = 'severity-moderate';
                severityText = 'MODERATE';
              }

              tr.innerHTML = `
                <td>
                  <div style="font-family: var(--fonts-mono); font-weight: 600; color: #ffffff;">${d.lot_a.lot_no} ⟷ ${d.lot_b.lot_no}</div>
                  <div class="mono-num" style="font-size: 10px; color: #94a3b8;">${d.lot_a.pin} / ${d.lot_b.pin}</div>
                </td>
                <td>
                  <div style="font-size: 11px; color: #e2e8f0;">${d.lot_a.owner_name}</div>
                  <div style="font-size: 10px; color: #64748b;">vs. ${d.lot_b.owner_name}</div>
                </td>
                <td>
                  <span class="mono-num" style="font-weight: 600; color: #ffffff;">${overlapArea.toLocaleString()} sq.m.</span>
                </td>
                <td>
                  <span class="mono-num" style="color: #cbd5e1;">${pctA}% of ${d.lot_a.lot_no}</span>
                </td>
                <td>
                  <span class="severity-pill ${severityClass}">${severityText}</span>
                </td>
                <td style="text-align: right;">
                  <button type="button" class="btn-locate-conflict" data-index="${idx}">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="22" y1="12" x2="18" y2="12"></line>
                      <line x1="6" y1="12" x2="2" y2="12"></line>
                      <line x1="12" y1="6" x2="12" y2="2"></line>
                      <line x1="12" y1="22" x2="12" y2="18"></line>
                    </svg>
                    Locate
                  </button>
                </td>
              `;

              const btnLocate = tr.querySelector('.btn-locate-conflict');
              if (btnLocate) {
                btnLocate.addEventListener('click', () => {
                  locateAndFlashConflict(d);
                });
              }

              conflictsTbody.appendChild(tr);
            });
          }
        }
      })
      .catch(err => {
        console.error('Topology audit error:', err);
        alert('Unable to load topology conflict audit. Please check system telemetry.');
      })
      .finally(() => {
        if (btnRefreshConflictsScan) {
          btnRefreshConflictsScan.disabled = false;
          btnRefreshConflictsScan.innerHTML = `
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 3px; vertical-align: -1px;">
              <path d="M23 4v6h-6"></path>
              <path d="M1 20v-6h6"></path>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            Re-Audit
          `;
        }
      });
  }

  function locateAndFlashConflict(dispute) {
    if (!dispute || !dispute.intersection_polygon) return;

    // Close modal
    if (modalCadastralConflicts) modalCadastralConflicts.style.display = 'none';

    // Clear previous hazard overlays
    encroachmentLayerGroup.clearLayers();

    const polyCoords = dispute.intersection_polygon; // array of [lat, lng]
    if (polyCoords.length < 3) return;

    // Draw red pulsing hazard polygon on main Leaflet map
    const hazardPolygon = L.polygon(polyCoords, {
      className: 'leaflet-encroachment-hazard',
      color: '#ffffff',
      weight: 2.5,
      dashArray: '4, 4',
      fillColor: '#ffffff',
      fillOpacity: 0.45
    }).addTo(encroachmentLayerGroup);

    // Add informative hazard marker popup
    const center = hazardPolygon.getBounds().getCenter();
    const hazardPopupContent = `
      <div style="font-family: var(--fonts-mono); font-size: 11px; padding: 4px; min-width: 200px;">
        <div style="color: #ffffff; font-weight: 700; margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
          <span>⚠ BOUNDARY OVERLAP CONFLICT</span>
        </div>
        <div style="color: #ffffff; font-size: 11px; margin-bottom: 2px;">
          <strong>${dispute.lot_a.lot_no}</strong> vs. <strong>${dispute.lot_b.lot_no}</strong>
        </div>
        <div style="color: #94a3b8; font-size: 10px; margin-bottom: 4px;">
          Overlap: <span style="color: #ffffff; font-weight: 600;">${Math.round(dispute.overlap_area_sqm * 100) / 100} sq.m.</span>
        </div>
        <div style="color: #64748b; font-size: 9.5px; border-top: 1px dashed #334155; padding-top: 3px;">
          ${dispute.lot_a.owner_name} / ${dispute.lot_b.owner_name}
        </div>
      </div>
    `;

    hazardPolygon.bindPopup(hazardPopupContent).openPopup(center);

    // Pan & Zoom
    map.flyToBounds(hazardPolygon.getBounds(), {
      padding: [80, 80],
      maxZoom: 18,
      duration: 1.2
    });

    // Also select lot_a in inspector if present in map
    if (parcelPolygonMap.has(dispute.lot_a.pin)) {
      const entry = parcelPolygonMap.get(dispute.lot_a.pin);
      selectParcel(entry.data, entry.polygon);
    }
  }

  // Open conflicts modal
  if (btnScanConflicts) {
    btnScanConflicts.addEventListener('click', () => {
      const activeLgu = lguSelect ? lguSelect.value : '03215';
      if (conflictsLguSelect) conflictsLguSelect.value = activeLgu;
      if (modalCadastralConflicts) modalCadastralConflicts.style.display = 'flex';
      fetchAndRenderCadastreConflicts(activeLgu);
    });
  }

  if (btnCloseConflictsModal) {
    btnCloseConflictsModal.addEventListener('click', () => {
      if (modalCadastralConflicts) modalCadastralConflicts.style.display = 'none';
    });
  }

  if (btnRefreshConflictsScan) {
    btnRefreshConflictsScan.addEventListener('click', () => {
      const lgu = conflictsLguSelect ? conflictsLguSelect.value : '03215';
      fetchAndRenderCadastreConflicts(lgu);
    });
  }

  if (conflictsLguSelect) {
    conflictsLguSelect.addEventListener('change', () => {
      fetchAndRenderCadastreConflicts(conflictsLguSelect.value);
    });
  }

  // ====================================================================
  // GIS SPATIAL PROXIMITY BUFFER & HAZARD IMPACT ZONE TOOL
  // R.A. 10752 (RIGHT-OF-WAY ACT) / P.D. 1067 (WATER CODE)
  // ====================================================================
  const btnBufferTool = document.getElementById('btn-buffer-tool');
  const bufferHud = document.getElementById('buffer-hud');
  const bufferPresetSelect = document.getElementById('buffer-preset-select');
  const bufferRadiusBtns = document.querySelectorAll('.buffer-radius-btn');
  const btnRunBufferAnalysis = document.getElementById('btn-run-buffer-analysis');
  const btnOpenBufferReport = document.getElementById('btn-open-buffer-report');
  const bufferBadgeCount = document.getElementById('buffer-badge-count');
  const btnClearBuffer = document.getElementById('btn-clear-buffer');
  const btnExitBufferHud = document.getElementById('btn-exit-buffer-hud');
  const btnInspectBuffer = document.getElementById('btn-inspect-buffer');
  const modalBufferReport = document.getElementById('modal-buffer-report');
  const btnCloseBufferReportModal = document.getElementById('btn-close-buffer-report-modal');
  const btnPrintBufferReport = document.getElementById('btn-print-buffer-report');
  const btnDownloadBufferCsv = document.getElementById('btn-download-buffer-csv');

  let activeBufferRadiusM = 500;
  let activeBufferData = null;
  let customBufferPoint = null;
  let highlightedBufferPins = new Set();

  function clearBufferOverlay() {
    if (spatialBufferLayerGroup) {
      spatialBufferLayerGroup.clearLayers();
    }
    highlightedBufferPins.forEach(pin => {
      if (parcelPolygonMap.has(pin)) {
        const item = parcelPolygonMap.get(pin);
        item.polygon.setStyle(item.polygon === activeSelectedPolygon ? activeStyle : defaultStyle);
      }
    });
    highlightedBufferPins.clear();
    activeBufferData = null;
    customBufferPoint = null;
    if (btnOpenBufferReport) btnOpenBufferReport.style.display = 'none';
    if (bufferBadgeCount) bufferBadgeCount.textContent = '0';
  }

  function executeSpatialBufferQuery() {
    const selectedMode = bufferPresetSelect ? bufferPresetSelect.value : 'maharlika_highway';
    const activeLgu = lguSelect ? lguSelect.value : '03215';

    let payload = {
      buffer_distance_m: activeBufferRadiusM,
      lgu_code: activeLgu
    };

    if (selectedMode === 'custom-point') {
      if (!customBufferPoint) {
        alert('Please click on the map to place the radial center point for the buffer.');
        return;
      }
      payload.center_lat = customBufferPoint[0];
      payload.center_lng = customBufferPoint[1];
    } else if (selectedMode === 'selected-parcel') {
      if (!activeSelectedParcelData) {
        alert('Please select a parcel on the map to generate its radial proximity buffer.');
        return;
      }
      payload.target_pin = activeSelectedParcelData.pin;
    } else {
      payload.preset_id = selectedMode;
    }

    if (btnRunBufferAnalysis) {
      btnRunBufferAnalysis.disabled = true;
      btnRunBufferAnalysis.textContent = 'Analyzing...';
    }

    fetch('/api/spatial/buffer-query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
      if (btnRunBufferAnalysis) {
        btnRunBufferAnalysis.disabled = false;
        btnRunBufferAnalysis.textContent = 'Analyze Impact';
      }

      if (!data.success) {
        alert('Failed to execute spatial buffer: ' + (data.message || 'Unknown error'));
        return;
      }

      // Reset previous overlay
      if (spatialBufferLayerGroup) spatialBufferLayerGroup.clearLayers();
      highlightedBufferPins.forEach(pin => {
        if (parcelPolygonMap.has(pin)) {
          const item = parcelPolygonMap.get(pin);
          item.polygon.setStyle(item.polygon === activeSelectedPolygon ? activeStyle : defaultStyle);
        }
      });
      highlightedBufferPins.clear();

      activeBufferData = data;

      // Render buffer polygon overlay
      if (data.buffer_geojson) {
        const bufferPoly = L.geoJSON(data.buffer_geojson, {
          style: {
            color: '#ffffff',
            weight: 1.8,
            dashArray: '6, 6',
            fillColor: '#ffffff',
            fillOpacity: 0.12
          }
        }).addTo(spatialBufferLayerGroup);

        try {
          const bounds = bufferPoly.getBounds();
          if (bounds.isValid()) {
            map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 17, duration: 1.0 });
          }
        } catch (e) {
          console.warn('Could not zoom to buffer polygon:', e);
        }
      }

      // Highlight intersected parcels
      const intersected = data.intersected_parcels || [];
      intersected.forEach(p => {
        highlightedBufferPins.add(p.pin);
        if (parcelPolygonMap.has(p.pin)) {
          const item = parcelPolygonMap.get(p.pin);
          item.polygon.setStyle({
            color: '#ffffff',
            weight: 2.5,
            fillColor: '#ffffff',
            fillOpacity: 0.45
          });
        }
      });

      // Update HUD UI
      if (bufferBadgeCount) bufferBadgeCount.textContent = intersected.length;
      if (btnOpenBufferReport) btnOpenBufferReport.style.display = 'inline-block';

      // Populate report modal
      populateBufferReport(data);
    })
    .catch(err => {
      if (btnRunBufferAnalysis) {
        btnRunBufferAnalysis.disabled = false;
        btnRunBufferAnalysis.textContent = 'Analyze Impact';
      }
      alert('Error running buffer analysis: ' + err.message);
    });
  }

  function populateBufferReport(data) {
    if (!data) return;
    const summary = data.summary || {};
    const parcels = data.intersected_parcels || [];

    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setText('buffer-rep-no', data.report_no || 'SP-IMPACT-001');
    setText('buffer-rep-source', data.source_name || 'Spatial Corridor');
    setText('buffer-rep-category', data.source_category || 'Infrastructure Alignment');
    setText('buffer-rep-statutory', data.statutory_basis ? `ISSUED PURSUANT TO ${data.statutory_basis.toUpperCase()}` : 'R.A. 10752 / P.D. 1067');
    setText('buffer-rep-radius', `${data.buffer_distance_m || 500} Meters (Offset Corridor)`);
    setText('buffer-rep-date', data.date_generated || new Date().toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' }));
    
    // KPI Cards
    setText('buffer-rep-lots', `${summary.total_intersected_parcels || parcels.length} Lots`);
    setText('buffer-rep-area', `${summary.total_affected_area_ha || 0} ha`);
    setText('buffer-rep-sqm', `${(summary.total_affected_area_sqm || 0).toLocaleString()} sq.m.`);
    setText('buffer-rep-mv', `PHP ${(summary.total_market_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    setText('buffer-rep-av', `PHP ${(summary.total_assessed_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

    // Classification Breakdown Chips
    const breakdownContainer = document.getElementById('buffer-rep-class-breakdown');
    if (breakdownContainer) {
      breakdownContainer.innerHTML = '';
      const breakdown = summary.breakdown_by_classification || {};
      const entries = Object.entries(breakdown);
      if (entries.length > 0) {
        entries.forEach(([cls, count]) => {
          const chip = document.createElement('div');
          chip.className = 'buffer-breakdown-chip';
          chip.innerHTML = `<span>${cls}:</span> <strong>${count} lots</strong>`;
          breakdownContainer.appendChild(chip);
        });
      } else {
        breakdownContainer.innerHTML = '<span style="font-size: 10.5px; color: #94a3b8;">No intersected parcels in buffer.</span>';
      }
    }

    // Table rows
    const tbody = document.getElementById('buffer-rep-table-body');
    if (tbody) {
      tbody.innerHTML = '';
      if (parcels.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #64748b; padding: 14px;">No cadastral parcels intersected within the ${data.buffer_distance_m}m proximity corridor.</td></tr>`;
      } else {
        parcels.forEach(p => {
          const tr = document.createElement('tr');
          const dist = Math.round(p.distance_m || 0);
          let badgeClass = 'impact-fringe';
          let badgeText = 'Fringe Zone';
          if (dist <= 50) {
            badgeClass = 'impact-direct';
            badgeText = 'Direct Impact';
          } else if (dist <= 200) {
            badgeClass = 'impact-proximity';
            badgeText = 'Proximity ROW';
          }

          tr.innerHTML = `
            <td class="mono-num td-bold">${p.pin || ''}</td>
            <td class="mono-num">${p.lot_no || ''}<br><span style="font-size: 9.5px; color: #64748b;">${p.survey_no || ''}</span></td>
            <td><strong>${p.owner_name || ''}</strong></td>
            <td>${p.barangay || 'Ilagan City'}</td>
            <td>${p.classification || 'Residential'}</td>
            <td class="mono-num">${(p.area_sqm || 0).toLocaleString()}</td>
            <td class="mono-num td-bold">PHP ${(p.assessed_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            <td>
              <span class="impact-badge ${badgeClass}">${badgeText}</span>
              <div class="mono-num" style="font-size: 9.5px; color: #64748b; margin-top: 2px;">${dist}m</div>
            </td>
          `;
          tbody.appendChild(tr);
        });
      }
    }
  }

  // Hook buffer tool button
  if (btnBufferTool) {
    btnBufferTool.addEventListener('click', () => {
      if (bufferHud) {
        const isHidden = bufferHud.style.display === 'none' || !bufferHud.style.display;
        bufferHud.style.display = isHidden ? 'flex' : 'none';
        if (isHidden) {
          executeSpatialBufferQuery();
        } else {
          clearBufferOverlay();
        }
      }
    });
  }

  // Radius pill buttons
  bufferRadiusBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      bufferRadiusBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeBufferRadiusM = parseInt(btn.getAttribute('data-radius'), 10) || 500;
      if (bufferHud && bufferHud.style.display !== 'none') {
        executeSpatialBufferQuery();
      }
    });
  });

  // Preset select dropdown
  if (bufferPresetSelect) {
    bufferPresetSelect.addEventListener('change', () => {
      if (bufferPresetSelect.value === 'custom-point') {
        alert('Click anywhere on the map to set the radial center point for the buffer.');
      } else if (bufferPresetSelect.value === 'selected-parcel') {
        if (!activeSelectedParcelData) {
          alert('Please click on a parcel in the map first to select it.');
        } else {
          executeSpatialBufferQuery();
        }
      } else {
        executeSpatialBufferQuery();
      }
    });
  }

  // Run analysis button
  if (btnRunBufferAnalysis) {
    btnRunBufferAnalysis.addEventListener('click', executeSpatialBufferQuery);
  }

  // Open report modal
  if (btnOpenBufferReport) {
    btnOpenBufferReport.addEventListener('click', () => {
      if (modalBufferReport) {
        modalBufferReport.style.display = 'flex';
      }
    });
  }

  // Clear buffer
  if (btnClearBuffer) {
    btnClearBuffer.addEventListener('click', clearBufferOverlay);
  }

  // Exit buffer HUD
  if (btnExitBufferHud) {
    btnExitBufferHud.addEventListener('click', () => {
      if (bufferHud) bufferHud.style.display = 'none';
      clearBufferOverlay();
    });
  }

  // Inspector Buffer shortcut
  if (btnInspectBuffer) {
    btnInspectBuffer.addEventListener('click', () => {
      if (!activeSelectedParcelData) {
        alert('Please select a parcel on the map first.');
        return;
      }
      if (bufferHud) bufferHud.style.display = 'flex';
      if (bufferPresetSelect) bufferPresetSelect.value = 'selected-parcel';
      executeSpatialBufferQuery();
    });
  }

  // Map click for custom radial point
  map.on('click', (e) => {
    if (bufferHud && bufferHud.style.display !== 'none' && bufferPresetSelect && bufferPresetSelect.value === 'custom-point') {
      customBufferPoint = [e.latlng.lat, e.latlng.lng];
      executeSpatialBufferQuery();
    }
  });

  // Close report modal
  if (btnCloseBufferReportModal && modalBufferReport) {
    btnCloseBufferReportModal.addEventListener('click', () => {
      modalBufferReport.style.display = 'none';
    });
    modalBufferReport.addEventListener('click', (e) => {
      if (e.target === modalBufferReport) {
        modalBufferReport.style.display = 'none';
      }
    });
  }

  // Print buffer report
  if (btnPrintBufferReport) {
    btnPrintBufferReport.addEventListener('click', () => {
      window.print();
    });
  }

  // Export CSV
  if (btnDownloadBufferCsv) {
    btnDownloadBufferCsv.addEventListener('click', () => {
      if (!activeBufferData || !activeBufferData.intersected_parcels) {
        alert('No spatial buffer analysis data to export.');
        return;
      }
      fetch('/api/spatial/export-impact-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_no: activeBufferData.report_no,
          source_name: activeBufferData.source_name,
          buffer_distance_m: activeBufferData.buffer_distance_m,
          parcels: activeBufferData.intersected_parcels
        })
      })
      .then(res => res.blob())
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `impact_assessment_${activeBufferData.report_no || 'report'}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(err => alert('Error downloading CSV: ' + err.message));
    });
  }

  // Universal Modal Dismissal on Backdrop Click
  document.querySelectorAll('.custom-modal-overlay, .td-modal-overlay, .new-lot-modal-overlay, .survey-modal-overlay, .delinquency-modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.style.display = 'none';
      }
    });
  });

  // Global Escape key dismiss for all custom modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.custom-modal-overlay, .td-modal-overlay, .new-lot-modal-overlay, .survey-modal-overlay, .delinquency-modal-overlay').forEach(m => {
        m.style.display = 'none';
      });
      if (exportDropdownMenu) exportDropdownMenu.style.display = 'none';
    }
  });
});


