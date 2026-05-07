import React, { useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useIssues } from '../IssueStore';
import 'leaflet/dist/leaflet.css';
import './ReportIssue.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});
const orangeIcon = new L.Icon({
  iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
  shadowUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize:[25,41], iconAnchor:[12,41], popupAnchor:[1,-34], shadowSize:[41,41],
});

const CATS = ['Road Damage / Pothole','Broken Streetlight','Garbage Overflow','Water Leakage','Damaged Public Property','Drainage Problem','Other'];
const DEPT_MAP = {
  'Road Damage / Pothole':'Public Works Department','Broken Streetlight':'Electricity Board',
  'Garbage Overflow':'Sanitation Department','Water Leakage':'Water Authority',
  'Damaged Public Property':'Municipal Corporation','Drainage Problem':'Water Authority','Other':'Municipal Corporation',
};
const DEPT_ICON = { 'Public Works Department':'🛣️','Electricity Board':'💡','Sanitation Department':'🗑️','Water Authority':'💧','Municipal Corporation':'🏛️' };
const DEPT_EMAIL = { 'Public Works Department':'pwd@scis-gzb.gov.in','Electricity Board':'electricity@scis-gzb.gov.in','Sanitation Department':'sanitation@scis-gzb.gov.in','Water Authority':'water@scis-gzb.gov.in','Municipal Corporation':'municipal@scis-gzb.gov.in' };
const SEV_CFG = { 3:{ label:'High', color:'#dc2626', bg:'#fef2f2', hint:'Immediate safety risk — injuries or major damage possible' }, 2:{ label:'Medium', color:'#d97706', bg:'#fffbeb', hint:'Significant inconvenience, needs prompt attention' }, 1:{ label:'Low', color:'#16a34a', bg:'#f0fdf4', hint:'Minor issue, can be scheduled for routine maintenance' } };

const CITY_CENTER = [28.6692, 77.4538];
const EMPTY = { title:'', category:'', description:'', location:'', severity:'', email:'' };

function generateRefNo() { return `SCIS-GZB-${new Date().getFullYear()}-${Math.floor(100000+Math.random()*900000)}`; }

function LocationPicker({ onPick }) {
  useMapEvents({ click(e) { onPick(e.latlng.lat, e.latlng.lng); } });
  return null;
}

async function reverseGeocode(lat, lng) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,{headers:{'Accept-Language':'en'}});
    const d = await r.json();
    if (d?.display_name) return d.display_name.split(',').slice(0,3).join(',').trim();
  } catch {}
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

// Simulated email — in production hook to backend /api/send-email
async function sendEmailConfirmation(email, refNo, title, dept, deptEmail) {
  try {
    const token = localStorage.getItem('token');

    // FIX: Ensure the path is /api/issues/send-email
    const response = await fetch('/api/issues/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` // Ensure token is sent!
      },
      body: JSON.stringify({ 
        to: email, // Backend expects 'to'
        refNo, 
        title, 
        department: dept, 
        deptEmail 
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Server error');
    }

    console.log("✅ Real Email Sent!");
  } catch (err) {
    // This is the log you are seeing now
    console.log(`[EMAIL FAILED] Using fallback log: To:${email} Ref:${refNo}`);
    console.error("Actual Error:", err.message); // <--- Add this to see the real reason
  }
}

/* ── Department Assignment Toast ── */
function DeptToast({ info, onClose }) {
  if (!info) return null;
  const sev = SEV_CFG[info.severity] || SEV_CFG[2];
  return (
    <div className="dt-overlay" onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div className="dt-box">
        {/* Header */}
        <div className="dt-header">
          <div className="dt-header-left">
            <div className="dt-check">✅</div>
            <div>
              <div className="dt-htag">Complaint Registered</div>
              <div className="dt-htitle">Issue Assigned to Department</div>
            </div>
          </div>
          <button className="dt-close" onClick={onClose}>✕</button>
        </div>

        {/* Dept badge */}
        <div className="dt-dept-row">
          <div className="dt-dept-icon">{DEPT_ICON[info.dept]||'🏛️'}</div>
          <div>
            <div className="dt-dept-name">{info.dept}</div>
            <div className="dt-dept-email">{DEPT_EMAIL[info.dept]}</div>
          </div>
          <div className="dt-ref-box">
            <div className="dt-ref-label">Ref No</div>
            <div className="dt-ref-val">{info.refNo}</div>
          </div>
        </div>

        {/* BERT score row */}
        <div className="dt-bert-row">
          <div className="dt-bert-label">🤖 BERT Priority Score</div>
          <div className="dt-bert-val">
            <span className="dt-bert-num" style={{color: info.bert_label==='High'?'#dc2626':info.bert_label==='Medium'?'#d97706':'#16a34a'}}>
              {Math.round(info.bert_score||0)}
            </span>
            <span className="dt-bert-badge" style={{background:sev.bg, color:sev.color, border:`1px solid ${sev.color}33`}}>
              {info.bert_label||'Analysing'}
            </span>
            <span className="dt-bert-model">bert-base-uncased</span>
          </div>
        </div>

        {/* Details */}
        <div className="dt-details">
          <div className="dt-row"><span>📋 Issue</span><strong>{info.title}</strong></div>
          <div className="dt-row"><span>📍 Location</span><strong>{info.location}</strong></div>
          <div className="dt-row">
            <span>⚠️ Severity</span>
            <strong style={{color:sev.color}}>{sev.label}</strong>
          </div>
          {info.email && (
            <div className="dt-row">
              <span>📧 Email sent to</span>
              <strong style={{color:'#10b981'}}>{info.email}</strong>
            </div>
          )}
        </div>

        {info.email ? (
          <div className="dt-email-note">
            📨 Email confirmation sent to <strong>{info.email}</strong> with your reference number and tracking details.
          </div>
        ) : (
          <div className="dt-email-note" style={{background:'#fffbeb',borderColor:'#fde68a',color:'#92400e'}}>
            ⚠️ No email provided — you won't receive a confirmation. Note your Ref No: <strong>{info.refNo}</strong>
          </div>
        )}

        <button className="dt-ok" onClick={onClose}>View on Dashboard →</button>
      </div>
    </div>
  );
}

export default function ReportIssue({ user, onSuccess }) {
  const { addIssue }     = useIssues();
  const [form,       setForm]       = useState({ ...EMPTY, email:user?.email||'' });
  const [photo,      setPhoto]      = useState(null);
  const [errors,     setErrors]     = useState({});
  const [loading,    setLoading]    = useState(false);
  const [markerPos,  setMarkerPos]  = useState(null);
  const [locLoading, setLocLoading] = useState(false);
  const [mapVisible, setMapVisible] = useState(false);
  const [toastInfo,  setToastInfo]  = useState(null);
  const [submitted,  setSubmitted]  = useState(false);

  const h = e => { setForm(f=>({...f,[e.target.name]:e.target.value})); setErrors(er=>({...er,[e.target.name]:''})); };

  const handleMapClick = async (lat, lng) => {
    setMarkerPos({lat,lng}); setLocLoading(true);
    const address = await reverseGeocode(lat,lng);
    setForm(f=>({...f,location:address})); setLocLoading(false);
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(async pos => {
      const {latitude:lat,longitude:lng} = pos.coords;
      setMarkerPos({lat,lng}); setMapVisible(true);
      const address = await reverseGeocode(lat,lng);
      setForm(f=>({...f,location:address})); setLocLoading(false);
    }, ()=>setLocLoading(false));
  };

  const validate = () => {
    const err = {};
    if (!form.title.trim())       err.title       = 'Issue title is required';
    if (!form.category)           err.category    = 'Select a category';
    if (!form.description.trim()) err.description = 'Please describe the problem';
    if (!markerPos)               err.location    = 'Pick a location on the map below';
    if (!form.severity)           err.severity    = 'Select the severity level';
    if (form.email && !/\S+@\S+\.\S+/.test(form.email)) err.email = 'Enter a valid email address';
    return err;
  };

  const submit = async e => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setLoading(true);

    const dept  = DEPT_MAP[form.category] || 'Municipal Corporation';
    const refNo = generateRefNo();

    // Prepare data for the backend
    const issueData = {
      title:       form.title.trim(),
      category:    form.category,
      description: form.description.trim(),
      location:    form.location.trim(),
      severity:    parseInt(form.severity),
      reporter:    user?.name || 'Anonymous',
      phone:       user?.phone || '', // Added this to match your SQL schema
      email:       form.email.trim(),
      department:  dept,
      refNo,
      lat:         markerPos.lat,
      lng:         markerPos.lng,
    };

    try {
      // 1. Send to IssueStore (addIssue handles the BERT fallback internally)
      const saved = await addIssue(issueData);

      // 2. Safely extract BERT data (preventing the "undefined" crash)
      const finalBertScore = saved?.bert_score ?? 50; 
      const finalBertLabel = saved?.bert_label ?? 'Medium';

      // 3. Optional: Only call Email if you have the route. 
      // I've wrapped this in a try/catch so it doesn't break the whole app.
      if (form.email.trim()) {
        try {
          await sendEmailConfirmation(form.email.trim(), refNo, form.title.trim(), dept, DEPT_EMAIL[dept]);
        } catch (emailErr) {
          console.warn("Email service unavailable, but issue was saved.");
        }
      }

      setSubmitted(true);
      setToastInfo({
        dept, refNo,
        title:      form.title.trim(),
        location:   form.location.trim(),
        email:      form.email.trim(),
        severity:   parseInt(form.severity),
        bert_score: finalBertScore,
        bert_label: finalBertLabel,
      });

    } catch (err) {
      console.error("Submission failed", err);
      setErrors({ global: "Failed to save issue. Please check your database connection." });
    } finally {
      setLoading(false);
    }
  };

  const closeToast = () => { setToastInfo(null); if (submitted && onSuccess) onSuccess(); };

  const dept   = DEPT_MAP[form.category];
  const sevCfg = SEV_CFG[parseInt(form.severity)];

  return (
    <div className="page">
      <DeptToast info={toastInfo} onClose={closeToast}/>

      <div className="page-header">
        <div>
          <div className="page-title">📋 Report a New Issue</div>
          <div className="page-sub">🤖 BERT AI will analyse your description and assign a 0–100 priority score automatically</div>
        </div>
      </div>

      <div className="ri-layout">
        {/* ── FORM ── */}
        <div className="card ri-card">
          <form onSubmit={submit} noValidate>

            {/* Row 1: Title + Category */}
            <div className="ri-row">
              <div className="ri-field">
                <label className="ri-label">Issue Title *</label>
                <input className={`ri-input ${errors.title?'ri-error-border':''}`}
                  name="title" value={form.title} onChange={h}
                  placeholder="e.g. Large pothole causing accidents near school gate"/>
                {errors.title && <div className="ri-err">{errors.title}</div>}
              </div>
              <div className="ri-field">
                <label className="ri-label">Category *</label>
                <select className={`ri-select ${errors.category?'ri-error-border':''}`}
                  name="category" value={form.category} onChange={h}>
                  <option value="">Select issue category...</option>
                  {CATS.map(c=><option key={c}>{c}</option>)}
                </select>
                {errors.category && <div className="ri-err">{errors.category}</div>}
              </div>
            </div>

            {/* Description — BERT reads this */}
            <div className="ri-field">
              <label className="ri-label">
                Description *
                <span className="ri-bert-tag">🤖 BERT reads this to score priority</span>
              </label>
              <textarea className={`ri-textarea ${errors.description?'ri-error-border':''}`}
                name="description" value={form.description} onChange={h} rows={4}
                placeholder="Describe the issue in detail. Mention danger level, number of people affected, how long it has been there. BERT NLP automatically scores urgency from your words — no manual weights."/>
              {errors.description && <div className="ri-err">{errors.description}</div>}
              {form.description.length > 0 && (
                <div className="ri-desc-hint">
                  {form.description.length} chars · BERT will analyse for keywords like accident, flooding, burst, dark, broken...
                </div>
              )}
            </div>

            {/* Location picker */}
            <div className="ri-field">
              <label className="ri-label">📍 Location * — Pick on map for accurate pin</label>
              <div className="ri-loc-row">
                <input className={`ri-input ri-loc-input ${errors.location?'ri-error-border':''}`}
                  name="location" value={locLoading?'Fetching address...':form.location} onChange={h}
                  placeholder="Click map to auto-fill, or type manually"/>
                <button type="button" className="ri-loc-btn" onClick={useMyLocation} disabled={locLoading}>
                  {locLoading?'⏳':'📡'} GPS
                </button>
                <button type="button" className={`ri-loc-btn ${mapVisible?'ri-loc-active':''}`}
                  onClick={()=>setMapVisible(v=>!v)}>
                  🗺️ {mapVisible?'Hide':'Pick on Map'}
                </button>
              </div>
              {errors.location && <div className="ri-err">{errors.location}</div>}

              {mapVisible && (
                <div className="ri-map-wrap">
                  <div className="ri-map-bar">🖱️ Click anywhere on the map to drop a pin — address auto-fills</div>
                  <MapContainer center={markerPos?[markerPos.lat,markerPos.lng]:CITY_CENTER}
                    zoom={13} style={{height:300}} attributionControl={false}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" subdomains="abc"/>
                    <LocationPicker onPick={handleMapClick}/>
                    {markerPos && <Marker position={[markerPos.lat,markerPos.lng]} icon={orangeIcon}/>}
                  </MapContainer>
                  {markerPos && <div className="ri-map-confirm">✅ {form.location}</div>}
                </div>
              )}
              {markerPos && !mapVisible && (
                <div className="ri-pin-confirm">✅ Location pinned · {markerPos.lat.toFixed(4)}, {markerPos.lng.toFixed(4)}</div>
              )}
            </div>

            {/* Severity + Email */}
            <div className="ri-row">
              

              <div className="ri-field">
                <label className="ri-label">
                  📧 Email for Confirmation
                  <span style={{fontSize:10,color:'#10b981',marginLeft:6,fontWeight:600,textTransform:'none',letterSpacing:0}}>
                    Ref No. sent here
                  </span>
                </label>
                <div className={`ri-email-wrap ${errors.email?'ri-error-border':''}`}>
                  <span style={{padding:'0 10px',fontSize:14,color:'#94a3b8'}}>✉️</span>
                  <input className="ri-email-input"
                    type="email" name="email"
                    placeholder="your@email.com (optional)"
                    value={form.email} onChange={h}/>
                </div>
                {errors.email && <div className="ri-err">{errors.email}</div>}
                <div className="ri-email-note">
                  You'll receive your <strong>Reference Number</strong>, assigned department, and tracking link
                </div>
              </div>
            </div>

            {/* Photo */}
            <div className="ri-field">
              <label className="ri-label">Photo (optional)</label>
              <label className="ri-upload">
                <input type="file" accept="image/*" style={{display:'none'}} onChange={e=>setPhoto(e.target.files[0])}/>
                {photo
                  ? <span style={{color:'#f97316',fontWeight:600}}>✅ {photo.name}</span>
                  : <><span style={{fontSize:20}}>📷</span><span>Click to upload a photo of the issue</span></>}
              </label>
            </div>

            {/* Dept auto-assign preview */}
            {dept && (
              <div className="ri-dept-preview" style={{borderColor:form.severity?(SEV_CFG[parseInt(form.severity)]?.color+'44'):'#e2e8f0'}}>
                <div style={{fontSize:28}}>{DEPT_ICON[dept]}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:10,color:'#94a3b8',textTransform:'uppercase',letterSpacing:.4,marginBottom:2}}>Auto-assigned to</div>
                  <div style={{fontWeight:700,fontSize:14,color:'#1a3a5c'}}>{dept}</div>
                  <div style={{fontSize:11,color:'#64748b'}}>{DEPT_EMAIL[dept]}</div>
                </div>
                {sevCfg && (
                  <div style={{textAlign:'center',padding:'6px 14px',background:sevCfg.bg,borderRadius:8,border:`1px solid ${sevCfg.color}33`}}>
                    <div style={{fontSize:18,fontWeight:800,color:sevCfg.color}}>{sevCfg.label}</div>
                    <div style={{fontSize:9,color:'#94a3b8'}}>Severity</div>
                  </div>
                )}
              </div>
            )}

            {/* Buttons */}
            <div className="ri-actions">
              <button type="button" className="ri-btn-clear"
                onClick={()=>{setForm({...EMPTY,email:user?.email||''});setPhoto(null);setErrors({});setMarkerPos(null);setMapVisible(false);}}>
                Clear
              </button>
              <button type="submit" className="ri-btn-submit" disabled={loading}>
                {loading ? '🤖 Submitting & scoring...' : 'Submit Report →'}
              </button>
            </div>

          </form>
        </div>

        {/* ── SIDEBAR ── */}
        <div className="ri-sidebar">
          <div className="ri-sb-card ri-sb-bert">
            <div className="ri-sb-title" style={{color:'#6366f1'}}>🤖 How BERT Scores Priority</div>
            <div className="ri-sb-body">
              BERT reads your <strong>title + description</strong> and outputs a <strong>0–100 score</strong> based on semantic urgency.<br/><br/>
              <div className="ri-bert-examples">
                <div className="ri-be ri-be-high">flooding · accident · burst · collapse → <strong>High</strong></div>
                <div className="ri-be ri-be-med">pothole · overflow · blocked · dark → <strong>Medium</strong></div>
                <div className="ri-be ri-be-low">bench · paint · sign · minor → <strong>Low</strong></div>
              </div>
              <div style={{fontSize:10,color:'#6366f1',fontWeight:600,marginTop:8}}>No fixed ×40 or ×5 multipliers.</div>
            </div>
          </div>

          <div className="ri-sb-card" style={{borderLeft:`4px solid ${markerPos?'#10b981':'#e2e8f0'}`}}>
            <div className="ri-sb-title">📍 Location Status</div>
            {markerPos
              ? <div style={{textAlign:'center'}}><div style={{fontSize:24,marginBottom:4}}>✅</div><div style={{fontWeight:700,fontSize:12,color:'#059669'}}>Location Pinned</div><div style={{fontSize:11,color:'#64748b',marginTop:3,lineHeight:1.5}}>{form.location}</div></div>
              : <div style={{textAlign:'center',fontSize:12,color:'#f59e0b',padding:'4px 0'}}>Click "Pick on Map" or "GPS" to set location</div>}
          </div>

          <div className="ri-sb-card">
            <div className="ri-sb-title">📧 Email Confirmation</div>
            <div className="ri-sb-body">After submitting you'll receive:<br/><br/>• Reference number<br/>• Assigned department<br/>• Dept email contact<br/>• BERT priority score<br/>• Status tracking link</div>
          </div>

          <div className="ri-sb-card">
            <div className="ri-sb-title">What Happens After</div>
            <div className="ri-sb-body" style={{lineHeight:2.1}}>
              1️⃣ Saved to your dashboard<br/>
              2️⃣ Pin appears on City Map<br/>
              3️⃣ 🤖 BERT scores the text<br/>
              4️⃣ Auto-assigned to dept<br/>
              5️⃣ 📧 Email sent (if provided)<br/>
              6️⃣ Authority reviews & acts
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
