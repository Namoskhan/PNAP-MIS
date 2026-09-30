import os
import subprocess
import base64

report_dir = os.path.abspath('performance-tests/final-management-report')
charts_dir = os.path.join(report_dir, 'charts')
html_path = os.path.join(report_dir, 'report.html')
pdf_path = os.path.join(report_dir, 'PNAP-MIS-PERFORMANCE-OPTIMIZATION-FINAL-REPORT.pdf')

def img_to_b64(fname):
    p = os.path.join(charts_dir, fname)
    with open(p, 'rb') as f:
        return 'data:image/png;base64,' + base64.b64encode(f.read()).decode('utf-8')

chart1_b64 = img_to_b64('chart1_50k_backend_before_after.png')
chart2_b64 = img_to_b64('chart2_latency_percentage_reduction.png')
chart3_b64 = img_to_b64('chart3_concurrency_before_after.png')
chart4_b64 = img_to_b64('chart4_frontend_initial_js.png')
chart5_b64 = img_to_b64('chart5_frontend_experience.png')

html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>PNAP-MIS Performance Optimization & Final Validation Report</title>
<style>
  @page {{
    size: A4;
    margin: 15mm 14mm 15mm 14mm;
  }}
  body {{
    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;
    color: #1e293b;
    line-height: 1.48;
    font-size: 9pt;
    margin: 0;
    padding: 0;
    background: #ffffff;
  }}
  .page {{
    page-break-after: always;
    height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
  }}
  .page:last-child {{
    page-break-after: avoid;
  }}
  .avoid-break {{
    page-break-inside: avoid;
  }}
  
  /* Header and Footer Simulation */
  .page-header {{
    display: flex;
    justify-content: space-between;
    border-bottom: 1px solid #cbd5e1;
    padding-bottom: 4px;
    margin-bottom: 14px;
    font-size: 7.8pt;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }}
  .page-footer {{
    margin-top: auto;
    border-top: 1px solid #cbd5e1;
    padding-top: 4px;
    display: flex;
    justify-content: space-between;
    font-size: 7.8pt;
    color: #94a3b8;
  }}

  /* Typography */
  h1 {{
    font-size: 15.5pt;
    font-weight: 700;
    color: #1e3a8a;
    border-bottom: 1.5px solid #e2e8f0;
    padding-bottom: 3px;
    margin-top: 0;
    margin-bottom: 10px;
  }}
  h2 {{
    font-size: 11.5pt;
    font-weight: 600;
    color: #0f172a;
    margin-top: 10px;
    margin-bottom: 5px;
  }}
  h3 {{
    font-size: 9.8pt;
    font-weight: 600;
    color: #334155;
    margin-top: 8px;
    margin-bottom: 3px;
  }}
  p {{
    margin-top: 3px;
    margin-bottom: 7px;
    text-align: justify;
  }}
  ul, ol {{
    margin-top: 3px;
    margin-bottom: 7px;
    padding-left: 20px;
  }}
  li {{
    margin-bottom: 3px;
  }}

  /* Cover Page */
  .cover-container {{
    height: 94vh;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 30px 10px 10px 10px;
    box-sizing: border-box;
  }}
  .cover-badge {{
    font-size: 11pt;
    font-weight: 700;
    color: #0d9488;
    letter-spacing: 1.5px;
    text-transform: uppercase;
  }}
  .cover-title {{
    font-size: 24pt;
    font-weight: 800;
    color: #0f172a;
    line-height: 1.15;
    margin-top: 15px;
    margin-bottom: 10px;
  }}
  .cover-subtitle {{
    font-size: 12pt;
    font-weight: 400;
    color: #475569;
    line-height: 1.4;
    margin-bottom: 25px;
  }}
  .cover-card {{
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 14px 18px;
    margin-top: 15px;
  }}
  .cover-card table {{
    width: 100%;
    border-collapse: collapse;
  }}
  .cover-card td {{
    padding: 5px 8px;
    font-size: 9pt;
    border: none;
  }}
  .cover-card td.label {{
    font-weight: 700;
    color: #1e3a8a;
    width: 32%;
  }}
  .cover-card td.value {{
    color: #0f172a;
  }}
  .badge-success {{
    display: inline-block;
    background: #dcfce7;
    color: #15803d;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 8.5pt;
  }}

  /* Tables */
  table.data-table {{
    width: 100%;
    border-collapse: collapse;
    margin-top: 6px;
    margin-bottom: 10px;
    font-size: 8.5pt;
  }}
  table.data-table th {{
    background: #1e3a8a;
    color: #ffffff;
    font-weight: 600;
    text-align: left;
    padding: 5px 8px;
    border: 1px solid #1e3a8a;
  }}
  table.data-table td {{
    padding: 4.5px 8px;
    border: 1px solid #e2e8f0;
    color: #1e293b;
  }}
  table.data-table tr:nth-child(even) {{
    background: #f8fafc;
  }}

  /* Callouts */
  .callout {{
    background: #f1f5f9;
    border-left: 4px solid #1e3a8a;
    padding: 8px 12px;
    margin: 8px 0;
    border-radius: 0 4px 4px 0;
  }}
  .callout-title {{
    font-weight: 700;
    font-size: 9pt;
    color: #1e3a8a;
    margin-bottom: 2px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }}
  .callout-body {{
    color: #334155;
    font-size: 8.6pt;
    line-height: 1.42;
  }}

  /* Status Box */
  .status-box {{
    background: #f8fafc;
    border: 2px solid #0d9488;
    border-radius: 6px;
    padding: 10px 14px;
    margin: 10px 0;
  }}
  .status-box-title {{
    font-weight: 800;
    font-size: 10.5pt;
    color: #0f766e;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 6px;
  }}
  .status-grid {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 16px;
    font-size: 8.6pt;
  }}
  .status-item {{
    display: flex;
    justify-content: space-between;
    border-bottom: 1px dotted #cbd5e1;
    padding-bottom: 2px;
  }}
  .status-label {{
    font-weight: 600;
    color: #475569;
  }}
  .status-val {{
    font-weight: 700;
    color: #0f172a;
  }}

  /* Chart Containers */
  .chart-container {{
    text-align: center;
    margin: 8px 0;
  }}
  .chart-container img {{
    max-width: 92%;
    height: auto;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
  }}
  .chart-caption {{
    font-size: 7.8pt;
    font-style: italic;
    color: #64748b;
    margin-top: 3px;
  }}
</style>
</head>
<body>

<!-- ========================================================= -->
<!-- PAGE 1: COVER PAGE -->
<!-- ========================================================= -->
<div class="page">
  <div class="cover-container">
    <div>
      <div class="cover-badge">Pakistan National Awami Party (PNAP)</div>
      <div class="cover-title">PERFORMANCE OPTIMIZATION &<br>FINAL VALIDATION REPORT</div>
      <div class="cover-subtitle">Pre-Optimization Assessment → Optimization Implementation → Post-Optimization Validation</div>
      
      <div class="cover-card">
        <table>
          <tr>
            <td class="label">System</td>
            <td class="value"><strong>PNAP-MIS</strong> (Central Party Management Information System)</td>
          </tr>
          <tr>
            <td class="label">Evaluation Scope</td>
            <td class="value">Phases O1 through O10 (Completed Engineering Lifecycle)</td>
          </tr>
          <tr>
            <td class="label">Assessment Type</td>
            <td class="value">Local Performance Engineering & Scalability Revalidation</td>
          </tr>
          <tr>
            <td class="label">Local Validation Status</td>
            <td class="value"><span class="badge-success">FINAL VALIDATION PASSED</span></td>
          </tr>
          <tr>
            <td class="label">Baseline State</td>
            <td class="value"><strong>FROZEN</strong> (Authoritative Post-Optimization Baseline)</td>
          </tr>
          <tr>
            <td class="label">Prepared By</td>
            <td class="value">PNAP-MIS Development & Performance Engineering Team</td>
          </tr>
          <tr>
            <td class="label">Assessment Date</td>
            <td class="value">September 2026</td>
          </tr>
        </table>
      </div>
    </div>

    <div style="font-size: 8pt; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 8px;">
      <strong>Notice:</strong> This document reflects controlled local performance measurements on frozen hardware. 
      Production capacity remains subject to deployment-environment infrastructure validation.
    </div>
  </div>
</div>

<!-- ========================================================= -->
<!-- PAGE 2: DOCUMENT CONTROL & TABLE OF CONTENTS -->
<!-- ========================================================= -->
<div class="page">
  <div class="page-header">
    <span>PNAP-MIS | Performance Optimization & Final Validation Report</span>
    <span>Document Control</span>
  </div>
  
  <h1>Document Control</h1>
  <table class="data-table">
    <tbody>
      <tr><td style="width: 28%; font-weight: bold; background: #f1f5f9;">Document Title</td><td>PNAP-MIS Performance Optimization & Final Validation Report</td></tr>
      <tr><td style="font-weight: bold; background: #f1f5f9;">Project Name</td><td>PNAP-MIS (Central Party Management Information System)</td></tr>
      <tr><td style="font-weight: bold; background: #f1f5f9;">Report Classification</td><td>Management Performance Engineering & Revalidation Report</td></tr>
      <tr><td style="font-weight: bold; background: #f1f5f9;">Evaluation Cycle</td><td>Phases O1 through O10 (Completed Lifecycle)</td></tr>
      <tr><td style="font-weight: bold; background: #f1f5f9;">Publication Date</td><td>September 2026</td></tr>
      <tr><td style="font-weight: bold; background: #f1f5f9;">Lifecycle Status</td><td>Final Approved Management Report</td></tr>
      <tr><td style="font-weight: bold; background: #f1f5f9;">Local Validation Verdict</td><td><span class="badge-success">LOCAL OPTIMIZATION COMPLETED — PASSED</span></td></tr>
      <tr><td style="font-weight: bold; background: #f1f5f9;">Authoritative Baseline</td><td>FROZEN (<code>FINAL-LOCAL-POST-OPTIMIZATION-BASELINE.json</code>)</td></tr>
      <tr><td style="font-weight: bold; background: #f1f5f9;">Target Audience</td><td>Executive Leadership, General Secretary, IT Steering Committee</td></tr>
    </tbody>
  </table>

  <h2>Table of Contents</h2>
  <table class="data-table" style="font-size: 8.3pt;">
    <thead>
      <tr><th style="width: 10%;">Section</th><th style="width: 65%;">Title</th><th style="width: 25%;">Page</th></tr>
    </thead>
    <tbody>
      <tr><td><strong>—</strong></td><td><strong>Executive Summary & Status Scorecard</strong></td><td>Page 3</td></tr>
      <tr><td><strong>1 & 2</strong></td><td><strong>Purpose, Background & Original Assessment</strong></td><td>Page 4</td></tr>
      <tr><td><strong>3</strong></td><td><strong>Why Optimization Was Required (Root Causes)</strong></td><td>Page 5</td></tr>
      <tr><td><strong>4</strong></td><td><strong>Optimization Approach — O1 to O10 Journey</strong></td><td>Page 6</td></tr>
      <tr><td><strong>5</strong></td><td><strong>Executive Before vs After Scorecard</strong></td><td>Page 7</td></tr>
      <tr><td><strong>6</strong></td><td><strong>Database & Large-Volume Improvements (50k Scalability)</strong></td><td>Pages 8–9</td></tr>
      <tr><td><strong>7</strong></td><td><strong>Dashboard Performance Improvements (Single-Flight & Staging)</strong></td><td>Page 10</td></tr>
      <tr><td><strong>8</strong></td><td><strong>Workflow Concurrency Scalability</strong></td><td>Page 11</td></tr>
      <tr><td><strong>9</strong></td><td><strong>Frontend Performance & Bundle Optimization</strong></td><td>Page 12</td></tr>
      <tr><td><strong>10 & 11</strong></td><td><strong>API Health, Functional Correctness & Security Validation</strong></td><td>Page 13</td></tr>
      <tr><td><strong>12 & 13</strong></td><td><strong>Remaining Local Limitations & Deployment Validation</strong></td><td>Page 14</td></tr>
      <tr><td><strong>14</strong></td><td><strong>Final Readiness Assessment & Dedicated Verdict</strong></td><td>Page 15</td></tr>
      <tr><td><strong>15 & 16</strong></td><td><strong>Management Recommendations & Final Conclusion</strong></td><td>Page 16</td></tr>
      <tr><td><strong>App. A</strong></td><td><strong>Appendix A: Authoritative Metrics Reference Tables</strong></td><td>Page 17</td></tr>
      <tr><td><strong>App. B/C</strong></td><td><strong>Appendix B: Phase Summary & Appendix C: Provenance Audit</strong></td><td>Page 18</td></tr>
    </tbody>
  </table>

  <div class="page-footer">
    <span>PNAP-MIS Performance Engineering Assessment</span>
    <span>Page 2</span>
  </div>
</div>

<!-- ========================================================= -->
<!-- PAGE 3: EXECUTIVE SUMMARY -->
<!-- ========================================================= -->
<div class="page">
  <div class="page-header">
    <span>PNAP-MIS | Performance Optimization & Final Validation Report</span>
    <span>Executive Summary</span>
  </div>

  <h1>Executive Summary</h1>
  <p>
    This report presents the final management findings from the performance engineering and optimization program 
    (Phases O1 through O10) conducted on the Pakistan National Awami Party Management Information System (PNAP-MIS). 
    The system has been transformed from an unoptimized state that suffered from severe 11- to 14-second query freezes 
    under representative volume into a high-efficiency platform executing in sub-second to two-second timeframes with 
    <strong>zero functional regressions, zero authorization breaches, and 100% cryptographic response equivalence</strong>.
  </p>

  <div class="status-box avoid-break">
    <div class="status-box-title">Final Local Performance & Validation Status</div>
    <div class="status-grid">
      <div class="status-item"><span class="status-label">Optimization Program:</span><span class="status-val">COMPLETED (O1–O9)</span></div>
      <div class="status-item"><span class="status-label">Final Local Revalidation:</span><span class="status-val" style="color: #0d9488;">PASSED (Phase O10)</span></div>
      <div class="status-item"><span class="status-label">Functional Regressions:</span><span class="status-val">NONE DETECTED (19/19 Pass)</span></div>
      <div class="status-item"><span class="status-label">Authorization / Scoping:</span><span class="status-val">STRICTLY ENFORCED (9/9 Pass)</span></div>
      <div class="status-item"><span class="status-label">Cryptographic Equivalence:</span><span class="status-val">100% BIT-FOR-BIT MATCH</span></div>
      <div class="status-item"><span class="status-label">Authoritative Baseline:</span><span class="status-val">FROZEN (JSON Recorded)</span></div>
    </div>
  </div>

  <h2>Key Performance Milestones Achieved</h2>
  <ul>
    <li><strong>50,000 Stored-Member Organization Snapshot:</strong> Cold snapshot P95 dropped from <strong>11.70 seconds (O7)</strong> to <strong>0.87 seconds (O10)</strong>—a <strong>92.52% latency reduction</strong>.</li>
    <li><strong>Basic Unit & Area Processing:</strong> Basic Unit officer lookup dropped from <strong>6.54 s to 0.72 s (89.02% reduction)</strong>; Area officer lookup dropped from <strong>3.36 s to 0.37 s (89.03% reduction)</strong>.</li>
    <li><strong>Workflow Concurrency Scalability:</strong> 10 simultaneous staged dashboard workflows run <strong>71.27% faster</strong> (slashed from 26.36 s to 7.57 s).</li>
    <li><strong>Frontend Asset Weight:</strong> Initial JavaScript download dropped by <strong>68.53%</strong> (from 944.6 KB raw / 234.9 KB gzip down to <strong>297.2 KB raw / 92.9 KB gzip</strong>).</li>
    <li><strong>User Experience Quality:</strong> Production Lighthouse Performance audit reached a perfect median score of <strong>100 / 100</strong> with <strong>0.0 ms Total Blocking Time</strong>.</li>
  </ul>

  <div class="callout avoid-break">
    <div class="callout-title">Final Management Determination</div>
    <div class="callout-body">
      <strong>LOCAL PERFORMANCE OPTIMIZATION COMPLETED | FINAL VALIDATION PASSED.</strong><br>
      The local software architecture is fully optimized and frozen. Production capacity remains subject to deployment-environment performance validation (real mobile network latency, reverse-proxy caching, and container resource limits).
    </div>
  </div>

  <div class="page-footer">
    <span>PNAP-MIS Performance Engineering Assessment</span>
    <span>Page 3</span>
  </div>
</div>

<!-- ========================================================= -->
<!-- PAGE 4: PURPOSE & ORIGINAL ASSESSMENT -->
<!-- ========================================================= -->
<div class="page">
  <div class="page-header">
    <span>PNAP-MIS | Performance Optimization & Final Validation Report</span>
    <span>1. Purpose & 2. Original Assessment</span>
  </div>

  <h1>1. Purpose & Background</h1>
  <p>
    The Pakistan National Awami Party Management Information System (PNAP-MIS) is a mission-critical web and mobile application 
    built to digitize and manage party structures across Pakistan. The system handles hundreds of thousands of member records, 
    cabinet rosters, meeting schedules, activity reporting, and financial transactions across five nested administrative tiers:
  </p>
  <ul>
    <li><strong>National (Center):</strong> Executive oversight, nationwide policy coordination, consolidated analytics.</li>
    <li><strong>Provincial:</strong> Provincial leadership, regional activity tracking, membership quotas.</li>
    <li><strong>District:</strong> District administrative reporting, meeting compliance, verification.</li>
    <li><strong>Area:</strong> Intermediate coordination across urban zones and union councils.</li>
    <li><strong>Basic Unit:</strong> Grassroots party units, ward membership registers, localized gatherings.</li>
  </ul>
  <p>
    As the party launched nationwide membership registration drives, leadership commissioned this engineering evaluation 
    to guarantee that system response times remain fast, reliable, and secure under high data volumes and multi-user access.
  </p>

  <h1>2. Original Pre-Optimization Performance Assessment</h1>
  <p>
    Initial performance testing conducted prior to Phase O1 revealed severe performance bottlenecks once data approached 
    realistic operational volumes. The original management evaluation concluded with the following formal verdict:
  </p>
  <div class="callout avoid-break" style="border-left-color: #ef4444;">
    <div class="callout-title" style="color: #b91c1c;">Original Management Verdict (Pre-Optimization)</div>
    <div class="callout-body">
      <strong>"CONDITIONALLY READY — OPTIMIZATION REQUIRED BEFORE HIGH-CONCURRENCY DEPLOYMENT"</strong><br>
      The assessment affirmed that normal single-user API behavior was generally functional with low error rates, but 
      database response times degraded catastrophically at volume, concurrent dashboard sessions generated redundant 
      server work, and frontend assets were excessively heavy for mobile networks.
    </div>
  </div>

  <h2>Summary of Baseline Observations (Pre-Optimization)</h2>
  <ul>
    <li><strong>Database Latency Degradation:</strong> At 50,000 synthetic stored members, organizational summary queries routinely exceeded 11 to 14 seconds.</li>
    <li><strong>Dashboard Fan-Out Contention:</strong> A single dashboard page load dispatched 16 separate HTTP calls, including duplicate queries and overlapping backend computations.</li>
    <li><strong>Cold Snapshot Freezes:</strong> When multiple users opened dashboards simultaneously, the backend initiated multiple independent, identical snapshot builds, blocking the single-threaded Node.js event loop.</li>
    <li><strong>Monolithic Web Bundle:</strong> The initial JavaScript download was 944.6 KB (uncompressed), requiring over 2.8 seconds of initial page parse time on simulated mobile connections.</li>
  </ul>

  <div class="page-footer">
    <span>PNAP-MIS Performance Engineering Assessment</span>
    <span>Page 4</span>
  </div>
</div>

<!-- ========================================================= -->
<!-- PAGE 5: WHY OPTIMIZATION WAS REQUIRED -->
<!-- ========================================================= -->
<div class="page">
  <div class="page-header">
    <span>PNAP-MIS | Performance Optimization & Final Validation Report</span>
    <span>3. Why Optimization Was Required</span>
  </div>

  <h1>3. Why Optimization Was Required</h1>
  <p>
    In-depth architectural tracing and CPU profiling isolated the root causes behind system sluggishness. 
    Optimization was mandatory to eliminate four systemic architectural deficiencies:
  </p>

  <h2>A. Correlated Subqueries at Scale (MongoDB $lookup Bottleneck)</h2>
  <p>
    When rendering unit leadership rosters, the server executed correlated subqueries for every appointment record. 
    At 50,000 synthetic stored members, the database performed approximately <strong>15,000 correlated lookups</strong> for Basic Units 
    and <strong>7,500 correlated lookups</strong> for Areas. This repetitive index traversal forced the database engine to scan 
    millions of document keys, driving Basic Unit response time to <strong>6.54 seconds</strong> and Area response time to <strong>3.36 seconds</strong>.
  </p>

  <h2>B. Uncoalesced Cold Snapshot Builds (Thundering Herd)</h2>
  <p>
    The system computes an executive organizational snapshot summarizing active units, appointed officers, and member counts. 
    In the pre-optimized state, if three users logged in at 9:00 AM, the server initiated three identical, full-database aggregation 
    pipelines concurrently. Each build required 11.7 seconds, causing thread-pool starvation and CPU spikes.
  </p>

  <h2>C. Redundant & Unstaged Dashboard Requests</h2>
  <p>
    The web client dispatched 16 individual requests upon landing on the dashboard. Profiling revealed that two calls requested 
    the exact same provincial boundary list twice, while secondary analytics (e.g. historical meeting charts) competed with 
    vital summary cards for immediate browser attention.
  </p>

  <h2>D. Monolithic Initial JavaScript Delivery</h2>
  <p>
    All 56 application routes, administration forms, and modal dialogs were bundled into a single file. Users attempting to log in 
    were forced to download administrative code for features they might never access, degrading performance on 3G and 4G networks.
  </p>

  <div class="callout avoid-break">
    <div class="callout-title">Architectural Conclusion</div>
    <div class="callout-body">
      These bottlenecks could not be solved by hardware upgrades alone. Scaling server CPU or RAM would not remedy 
      exponential $lookup subqueries or duplicate request loops. Targeted algorithmic and architectural optimization was required.
    </div>
  </div>

  <div class="page-footer">
    <span>PNAP-MIS Performance Engineering Assessment</span>
    <span>Page 5</span>
  </div>
</div>

<!-- ========================================================= -->
<!-- PAGE 6: OPTIMIZATION JOURNEY O1–O10 -->
<!-- ========================================================= -->
<div class="page">
  <div class="page-header">
    <span>PNAP-MIS | Performance Optimization & Final Validation Report</span>
    <span>4. Optimization Journey (O1–O10)</span>
  </div>

  <h1>4. Optimization Approach — The O1 to O10 Journey</h1>
  <p>
    The engineering team executed a disciplined, ten-phase optimization and revalidation program. Every change was 
    strictly audited against functional test suites and cryptographic response hashes before adoption:
  </p>

  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 14%;">Phase</th>
        <th style="width: 32%;">Technical Objective</th>
        <th>Outcome & Architectural Disposition</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Phase O1</strong></td>
        <td>MongoDB Query & Index Exploration</td>
        <td><strong>REVERTED:</strong> Speculative composite indexes yielded no repeatable gain; clean schema preserved.</td>
      </tr>
      <tr>
        <td><strong>Phase O2</strong></td>
        <td>Dashboard Request Deduplication</td>
        <td><strong>RETAINED:</strong> Eliminated redundant province/summary requests; dashboard calls dropped from 16 to 12.</td>
      </tr>
      <tr>
        <td><strong>Phase O3</strong></td>
        <td>Dashboard Latency Diagnostics</td>
        <td><strong>CONFIRMED:</strong> Root cause isolated to cold snapshot fan-out and local event-loop contention.</td>
      </tr>
      <tr>
        <td><strong>Phase O4</strong></td>
        <td>Snapshot Single-Flight & Staging</td>
        <td><strong>RETAINED:</strong> In-flight promise coalescing (3+ builds → 1) and two-stage critical-first rendering.</td>
      </tr>
      <tr>
        <td><strong>Phase O5</strong></td>
        <td>Membership Analytics Optimization</td>
        <td><strong>RETAINED:</strong> Consolidated multiple database scans into a unified single-scan facet aggregation.</td>
      </tr>
      <tr>
        <td><strong>Phase O6</strong></td>
        <td>Role-Assignment Aggregations</td>
        <td><strong>REVERTED:</strong> Complex single-command aggregation candidates showed no gain; cleanly reverted.</td>
      </tr>
      <tr>
        <td><strong>Phase O7</strong></td>
        <td>Representative Volume Validation</td>
        <td><strong>BENCHMARKED:</strong> Established baseline across 500 to 50k members; confirmed $lookup bottleneck.</td>
      </tr>
      <tr>
        <td><strong>Phase O8</strong></td>
        <td>Basic Unit & Area Lookup Optimization</td>
        <td><strong>RETAINED:</strong> Candidate B selected: Two-step indexed query + in-memory Node.js hash join.</td>
      </tr>
      <tr>
        <td><strong>Phase O9</strong></td>
        <td>Frontend Bundle & Lazy Loading</td>
        <td><strong>RETAINED:</strong> Converted 54 routes to React.lazy; deferred secondary modals; initial JS cut by 68.5%.</td>
      </tr>
      <tr>
        <td><strong>Phase O10</strong></td>
        <td>Final Post-Optimization Revalidation</td>
        <td><strong>FROZEN:</strong> End-to-end read-only audit; zero regressions; authoritative baseline frozen.</td>
      </tr>
    </tbody>
  </table>

  <div class="callout avoid-break">
    <div class="callout-title">Evidence-Based Reversion Discipline</div>
    <div class="callout-body">
      In Phases O1 and O6, proposed modifications failed to provide statistically meaningful latency improvements. 
      Rather than allowing code complexity to accumulate, these changes were immediately reverted. 
      Only verified, mathematically sound enhancements were retained in the production codebase.
    </div>
  </div>

  <div class="page-footer">
    <span>PNAP-MIS Performance Engineering Assessment</span>
    <span>Page 6</span>
  </div>
</div>

<!-- ========================================================= -->
<!-- PAGE 7: EXECUTIVE SCORECARD -->
<!-- ========================================================= -->
<div class="page">
  <div class="page-header">
    <span>PNAP-MIS | Performance Optimization & Final Validation Report</span>
    <span>5. Executive Before vs After Scorecard</span>
  </div>

  <h1>5. Executive Before vs After Scorecard</h1>
  
  <div class="callout avoid-break" style="border-left-color: #f59e0b;">
    <div class="callout-title" style="color: #b45309;">Mandatory Data-Volume Disclaimer</div>
    <div class="callout-body">
      <strong>50,000 represents synthetic stored member records</strong> used to evaluate database volume scalability 
      under representative party growth. It does <strong>NOT</strong> represent 50,000 simultaneous concurrent users.
    </div>
  </div>

  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 28%;">Performance Area</th>
        <th style="width: 22%;">Workload Metric</th>
        <th style="width: 20%;">Before Optimization</th>
        <th style="width: 18%;">Final Optimized</th>
        <th style="width: 12%;">Improvement</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Cold Organization Snapshot</strong></td>
        <td>50k Members (P95)</td>
        <td>11.70 s (11,699.89 ms)</td>
        <td><strong>0.87 s (874.64 ms)</strong></td>
        <td><strong>92.52% Faster</strong></td>
      </tr>
      <tr>
        <td><strong>Basic Unit Officer Query</strong></td>
        <td>50k Members (P95)</td>
        <td>6.54 s (6,540.80 ms)</td>
        <td><strong>0.72 s (717.92 ms)</strong></td>
        <td><strong>89.02% Faster</strong></td>
      </tr>
      <tr>
        <td><strong>Area Officer Query</strong></td>
        <td>50k Members (P95)</td>
        <td>3.36 s (3,359.80 ms)</td>
        <td><strong>0.37 s (368.46 ms)</strong></td>
        <td><strong>89.03% Faster</strong></td>
      </tr>
      <tr>
        <td><strong>Group-3 Core Overview</strong></td>
        <td>50k Members (P95)</td>
        <td>13.94 s (13,943.31 ms)</td>
        <td><strong>1.20 s (1,196.76 ms)</strong></td>
        <td><strong>91.42% Faster</strong></td>
      </tr>
      <tr>
        <td><strong>Staged Dashboard Load</strong></td>
        <td>50k Members (P95)</td>
        <td>12.98 s (12,980.36 ms)</td>
        <td><strong>2.01 s (2,013.97 ms)</strong></td>
        <td><strong>84.48% Faster</strong></td>
      </tr>
      <tr>
        <td><strong>Workflow Concurrency c=1</strong></td>
        <td>Staged Workflow (P95)</td>
        <td>11.19 s (11,186.44 ms)</td>
        <td><strong>1.86 s (1,863.64 ms)</strong></td>
        <td><strong>83.34% Faster</strong></td>
      </tr>
      <tr>
        <td><strong>Workflow Concurrency c=10</strong></td>
        <td>Staged Workflows (P95)</td>
        <td>26.36 s (26,359.17 ms)</td>
        <td><strong>7.57 s (7,572.91 ms)</strong></td>
        <td><strong>71.27% Faster</strong></td>
      </tr>
      <tr>
        <td><strong>Initial JS Bundle (Raw)</strong></td>
        <td>Web Build File Size</td>
        <td>944.6 KB (944,602 B)</td>
        <td><strong>297.2 KB (297,242 B)</strong></td>
        <td><strong>68.53% Smaller</strong></td>
      </tr>
      <tr>
        <td><strong>Initial JS Bundle (Gzip)</strong></td>
        <td>Network Transfer Size</td>
        <td>234.9 KB (234,860 B)</td>
        <td><strong>92.9 KB (92,870 B)</strong></td>
        <td><strong>60.46% Smaller</strong></td>
      </tr>
      <tr>
        <td><strong>Lighthouse Performance Score</strong></td>
        <td>Production Audit</td>
        <td>89 / 100</td>
        <td><strong>100 / 100</strong></td>
        <td><strong>+11 Points</strong></td>
      </tr>
    </tbody>
  </table>

  <div class="callout avoid-break">
    <div class="callout-title">Summary of Gains</div>
    <div class="callout-body">
      Every targeted workload achieved an improvement exceeding 60%, with heavy database operations exceeding 84% to 92% latency reduction.
    </div>
  </div>

  <div class="page-footer">
    <span>PNAP-MIS Performance Engineering Assessment</span>
    <span>Page 7</span>
  </div>
</div>

<!-- ========================================================= -->
<!-- PAGE 8: DATABASE IMPROVEMENTS (CHART 1) -->
<!-- ========================================================= -->
<div class="page">
  <div class="page-header">
    <span>PNAP-MIS | Performance Optimization & Final Validation Report</span>
    <span>6. Database & Large-Volume Improvements</span>
  </div>

  <h1>6. Database & Large-Volume Scalability</h1>
  <p>
    The most substantial backend breakthrough was achieved in Phase O8 via <strong>Candidate B</strong>, permanently 
    eliminating the correlated member lookup ceiling at 50,000 stored members.
  </p>
  
  <div class="chart-container avoid-break">
    <img src="{chart1_b64}" alt="50k Backend Performance Before vs After">
    <div class="chart-caption">Figure 1: Latency comparison across 50,000 stored-member workloads (Seconds P95 — Lower is better).</div>
  </div>

  <h2>Analysis of Workload Transformations</h2>
  <ul>
    <li><strong>Cold Organization Snapshot:</strong> Reduced from 11.70 seconds to <strong>0.87 seconds (92.52% reduction)</strong>. Previously, cold starts triggered a full system stall; they now resolve instantaneously.</li>
    <li><strong>Basic Unit Officer Roster:</strong> Reduced from 6.54 seconds to <strong>0.72 seconds (89.02% reduction)</strong>, enabling district officers to browse hundreds of grassroots units smoothly.</li>
    <li><strong>Area Officer Roster:</strong> Reduced from 3.36 seconds to <strong>0.37 seconds (89.03% reduction)</strong>.</li>
    <li><strong>Group-3 Executive Overview:</strong> Composite workload dropped from 13.94 seconds to <strong>1.20 seconds (91.42% reduction)</strong>.</li>
    <li><strong>Full Staged Dashboard:</strong> Total two-stage dashboard completion reduced from 12.98 seconds to <strong>2.01 seconds (84.48% reduction)</strong>.</li>
  </ul>

  <div class="page-footer">
    <span>PNAP-MIS Performance Engineering Assessment</span>
    <span>Page 8</span>
  </div>
</div>

<!-- ========================================================= -->
<!-- PAGE 9: DATABASE ALGORITHMIC DEEP DIVE (CHART 2) -->
<!-- ========================================================= -->
<div class="page">
  <div class="page-header">
    <span>PNAP-MIS | Performance Optimization & Final Validation Report</span>
    <span>6. Database Improvements (Cont.)</span>
  </div>

  <h1>6. Database Improvements: Algorithmic Resolution</h1>
  <p>
    Figure 2 summarizes the percentage latency reduction achieved across all primary database operations. 
    Every single query path exhibited an efficiency gain exceeding 84%.
  </p>

  <div class="chart-container avoid-break">
    <img src="{chart2_b64}" alt="Latency Reduction Percentage">
    <div class="chart-caption">Figure 2: Percentage latency reduction across 50,000-member database workloads (Higher is better).</div>
  </div>

  <h2>How Candidate B Resolved the $lookup Bottleneck</h2>
  <p>
    Rather than forcing MongoDB to execute 22,500 nested subqueries across unindexed fields, the system executes two indexed queries:
  </p>
  <ol>
    <li>An initial targeted query on <code>RoleAssignment</code> to fetch active officer appointments (<code>unitLevel</code>, <code>roleCode</code>, <code>memberId</code>).</li>
    <li>A single batched query on <code>Member</code> using a primary-key index seek: <code>_id: {{ $in: memberIds }}</code>.</li>
    <li>Node.js joins the results in application memory in less than 55 milliseconds using high-performance Hash Maps.</li>
  </ol>
  <p>
    <strong>Memory and BSON Headroom:</strong> At 50,000 members, the unique member ID array produces only <strong>267.5 KB</strong> 
    of BSON transfer—representing just <strong>1.63%</strong> of MongoDB's 16 MB document limit. This ensures enormous headroom 
    for organizational growth without risking driver overflow.
  </p>

  <div class="page-footer">
    <span>PNAP-MIS Performance Engineering Assessment</span>
    <span>Page 9</span>
  </div>
</div>

<!-- ========================================================= -->
<!-- PAGE 10: DASHBOARD PERFORMANCE IMPROVEMENTS -->
<!-- ========================================================= -->
<div class="page">
  <div class="page-header">
    <span>PNAP-MIS | Performance Optimization & Final Validation Report</span>
    <span>7. Dashboard Performance Improvements</span>
  </div>

  <h1>7. Dashboard Performance Improvements</h1>
  <p>
    The executive dashboard is the most heavily trafficked interface in PNAP-MIS. Optimizations in Phases O2 and O4 
    re-architected how the client requests and consumes backend dashboard data.
  </p>

  <h2>A. Request Deduplication & Payload Streamlining</h2>
  <p>
    In Phase O2, network tracing revealed that the dashboard client issued 16 HTTP calls, including duplicate queries 
    for provincial boundaries and redundant membership statistics.
  </p>
  <ul>
    <li><strong>Duplicate Calls Eliminated:</strong> Duplicate requests dropped from 3 to <strong>0</strong>. Total dashboard requests reduced from 16 to <strong>12</strong>.</li>
    <li><strong>Optimized Network Transfer:</strong> Total dashboard payload was compressed to <strong>25,141 bytes (~24.5 KB)</strong>.</li>
    <li><strong>Province Caching:</strong> Static administrative lists are loaded once and shared across widgets.</li>
  </ul>

  <h2>B. Snapshot Single-Flight (In-Flight Promise Coalescing)</h2>
  <p>
    In Phase O4, an in-memory single-flight coalescing mechanism was introduced. When multiple concurrent requests 
    arrive for the exact same cold organizational snapshot, the backend initiates exactly <strong>one build</strong>. 
    Subsequent incoming requests attach to the in-flight promise and receive the identical result upon completion.
  </p>
  <div class="status-box avoid-break">
    <div class="status-box-title">Single-Flight Validation Verification</div>
    <div class="status-grid">
      <div class="status-item"><span class="status-label">Simultaneous Consumers:</span><span class="status-val">5 Concurrent Requests</span></div>
      <div class="status-item"><span class="status-label">Database Builds Triggered:</span><span class="status-val">Exactly 1 Build</span></div>
      <div class="status-item"><span class="status-label">Duplicate Builds Avoided:</span><span class="status-val">4 Builds (80% Waste Cut)</span></div>
      <div class="status-item"><span class="status-label">Multi-Tenant Scoping:</span><span class="status-val">Strictly Isolated by User Scope</span></div>
    </div>
  </div>

  <h2>C. Two-Stage Dashboard Rendering</h2>
  <p>
    Dashboard components are staged into two priority tiers:
  </p>
  <ul>
    <li><strong>Stage 1 (Critical):</strong> Summary metrics cards and user alerts render immediately in sub-second time.</li>
    <li><strong>Stage 2 (Secondary):</strong> Heavy historical trend graphs and rosters load asynchronously in the background.</li>
  </ul>

  <div class="page-footer">
    <span>PNAP-MIS Performance Engineering Assessment</span>
    <span>Page 10</span>
  </div>
</div>

<!-- ========================================================= -->
<!-- PAGE 11: CONCURRENCY IMPROVEMENTS (CHART 3) -->
<!-- ========================================================= -->
<div class="page">
  <div class="page-header">
    <span>PNAP-MIS | Performance Optimization & Final Validation Report</span>
    <span>8. Concurrency Improvements</span>
  </div>

  <h1>8. Workflow Concurrency Scalability</h1>
  <p>
    Multi-user concurrency was rigorously benchmarked using staged dashboard workflows running against 
    the 50,000 stored-member database across concurrency levels c=1, 3, 5, and 10.
  </p>

  <div class="chart-container avoid-break">
    <img src="{chart3_b64}" alt="Concurrent Dashboard Workflows Before vs Final">
    <div class="chart-caption">Figure 3: Latency comparison across concurrent staged dashboard workflows at 50k volume (Seconds P95 — Lower is better).</div>
  </div>

  <table class="data-table">
    <thead>
      <tr>
        <th>Concurrent Workflows</th>
        <th>Pre-Optimization (O7 P95)</th>
        <th>Final Optimized (O10 P95)</th>
        <th>Improvement</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>1 Concurrent Workflow</strong></td>
        <td>11.19 s (11,186.44 ms)</td>
        <td><strong>1.86 s (1,863.64 ms)</strong></td>
        <td><strong>83.34% Faster</strong></td>
      </tr>
      <tr>
        <td><strong>3 Concurrent Workflows</strong></td>
        <td>12.62 s (12,621.43 ms)</td>
        <td><strong>2.73 s (2,733.14 ms)</strong></td>
        <td><strong>78.35% Faster</strong></td>
      </tr>
      <tr>
        <td><strong>5 Concurrent Workflows</strong></td>
        <td>16.50 s (16,495.44 ms)</td>
        <td><strong>4.10 s (4,102.37 ms)</strong></td>
        <td><strong>75.13% Faster</strong></td>
      </tr>
      <tr>
        <td><strong>10 Concurrent Workflows</strong></td>
        <td>26.36 s (26,359.17 ms)</td>
        <td><strong>7.57 s (7,572.91 ms)</strong></td>
        <td><strong>71.27% Faster</strong></td>
      </tr>
    </tbody>
  </table>

  <div class="callout avoid-break">
    <div class="callout-title">Remaining Concurrency Boundary Observation</div>
    <div class="callout-body">
      While 10 concurrent workflows run 71.27% faster than baseline (7.57 s vs 26.36 s), single-process CPU utilization 
      and event-loop delay (419.5 ms) represent the primary remaining local performance boundary. 
      This is the natural transition point where multi-worker process clustering (e.g. PM2 / Kubernetes replicas) should be evaluated in staging.
    </div>
  </div>

  <div class="page-footer">
    <span>PNAP-MIS Performance Engineering Assessment</span>
    <span>Page 11</span>
  </div>
</div>

<!-- ========================================================= -->
<!-- PAGE 12: FRONTEND IMPROVEMENTS (CHARTS 4 & 5) -->
<!-- ========================================================= -->
<div class="page">
  <div class="page-header">
    <span>PNAP-MIS | Performance Optimization & Final Validation Report</span>
    <span>9. Frontend Performance Improvements</span>
  </div>

  <h1>9. Frontend Performance Improvements</h1>
  <p>
    By implementing route-level code splitting (<code>React.lazy</code>) across 54 secondary pages and deferring heavy action modals, 
    the initial JavaScript payload delivered to users was reduced by over two-thirds without removing a single feature.
  </p>

  <div class="chart-container avoid-break">
    <img src="{chart4_b64}" alt="Frontend Initial JavaScript Reduction">
    <div class="chart-caption">Figure 4: Initial JavaScript payload reduction via route code splitting (Kilobytes — Lower is better).</div>
  </div>

  <h2>Lighthouse Experience & Paint Latency</h2>
  <p>
    Production Lighthouse audits confirmed that the reduced bundle translates directly into instant visual rendering, 
    achieving a perfect median score of 100/100 and cutting Largest Contentful Paint (LCP) in half.
  </p>

  <div class="chart-container avoid-break">
    <img src="{chart5_b64}" alt="Frontend Experience Metrics">
    <div class="chart-caption">Figure 5: Lighthouse Performance Score and visual paint latency before vs after optimization.</div>
  </div>

  <div class="page-footer">
    <span>PNAP-MIS Performance Engineering Assessment</span>
    <span>Page 12</span>
  </div>
</div>

<!-- ========================================================= -->
<!-- PAGE 13: API HEALTH & VALIDATION -->
<!-- ========================================================= -->
<div class="page">
  <div class="page-header">
    <span>PNAP-MIS | Performance Optimization & Final Validation Report</span>
    <span>10. API Health & 11. Security Validation</span>
  </div>

  <h1>10. Final API & System Health</h1>
  <p>
    Baseline API health was verified using an automated suite of 200 sequential queries across core administrative endpoints:
  </p>
  <ul>
    <li><strong>Throughput:</strong> 55.15 Requests Per Second across 200 sequential queries (0.00% error rate).</li>
    <li><strong>Latency Distribution:</strong> P50 = 13.69 ms, P95 = 39.76 ms, P99 = 72.53 ms, Max = 92.17 ms.</li>
    <li><strong>Password Security:</strong> Bcrypt password hashing (cost factor 12) was intentionally preserved, executing in ~64.9 ms (P95) to prevent brute-force exposure.</li>
    <li><strong>Token Verification:</strong> Current user session checks (<code>/api/auth/me</code>) execute in 2.40 ms (P95).</li>
  </ul>

  <h1>11. Correctness, Functional & Security Validation</h1>
  <p>
    A fundamental requirement of Phase O10 was verifying that performance optimizations did not weaken system security, 
    distort reporting accuracy, or bypass territorial authorization boundaries.
  </p>

  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 25%;">Validation Gate</th>
        <th style="width: 25%;">Scope & Scenario Count</th>
        <th style="width: 25%;">Observed Result</th>
        <th>Security & Quality Verdict</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Functional API Audit</strong></td>
        <td>19 Core Modules (All Tiers)</td>
        <td>19 / 19 Succeeded (0% errors)</td>
        <td><strong>PASSED (Zero Functional Regressions)</strong></td>
      </tr>
      <tr>
        <td><strong>Authorization Scoping</strong></td>
        <td>9 Scenarios (Central to Basic Unit)</td>
        <td>9 / 9 Enforced (403 OUT_OF_SCOPE)</td>
        <td><strong>PASSED (Zero Territorial Data Leakage)</strong></td>
      </tr>
      <tr>
        <td><strong>Cryptographic Equivalence</strong></td>
        <td>4 SHA-256 Hashes (10k & 50k)</td>
        <td>4 / 4 Matched Exactly</td>
        <td><strong>PASSED (Bit-for-Bit Output Equivalence)</strong></td>
      </tr>
      <tr>
        <td><strong>Single-Flight Coalescing</strong></td>
        <td>5 Concurrent Same-Key Consumers</td>
        <td>Exactly 1 Build Executed</td>
        <td><strong>PASSED (No Redundant Server Work)</strong></td>
      </tr>
    </tbody>
  </table>

  <div class="callout avoid-break">
    <div class="callout-title">Territorial Boundary Security Verified</div>
    <div class="callout-body">
      When a District Administrator attempted to inspect meetings belonging to a different district, 
      the server rejected the request with <strong>HTTP 403 OUT_OF_SCOPE</strong>. Zero cross-provincial or cross-district 
      data leakage occurred under any test scenario.
    </div>
  </div>

  <div class="page-footer">
    <span>PNAP-MIS Performance Engineering Assessment</span>
    <span>Page 13</span>
  </div>
</div>

<!-- ========================================================= -->
<!-- PAGE 14: LIMITATIONS & DEPLOYMENT VALIDATION -->
<!-- ========================================================= -->
<div class="page">
  <div class="page-header">
    <span>PNAP-MIS | Performance Optimization & Final Validation Report</span>
    <span>12. Limitations & 13. Deployment Validation</span>
  </div>

  <h1>12. Remaining Local Performance Limitations</h1>
  <p>
    Engineering integrity requires documenting what local optimization can and cannot accomplish:
  </p>
  <ul>
    <li><strong>Single-Process CPU Contention:</strong> Under sustained concurrency of 10 simultaneous multi-stage dashboard workflows on a single Node.js process, P95 latency reaches 7.57 seconds, and event-loop delay rises to 419.5 ms. This cannot be resolved by further query tuning; it requires multi-worker process clustering (PM2 / Kubernetes replicas) in staging.</li>
    <li><strong>50k Member Secondary Scans:</strong> Complex analytics filtering across 50,000 members take ~300–400 ms. While completely acceptable for management dashboards, they represent the largest remaining database slice.</li>
    <li><strong>Bcrypt Work Factor:</strong> Single-threaded password verification takes ~62 ms per attempt. Rapid burst login spikes require reverse-proxy rate limiting and worker process distribution.</li>
  </ul>

  <h1>13. Deployment-Dependent Validation (Required in Staging)</h1>
  <p>
    The following operational parameters belong to staging and production deployment and must be verified in the cloud environment:
  </p>
  <ul>
    <li><strong>Cellular Network Latency:</strong> User connectivity over 3G/4G/5G mobile carriers across Pakistan.</li>
    <li><strong>Edge Compression & Reverse Proxy:</strong> TLS termination, HTTP/2 multiplexing, and Brotli compression via NGINX or Cloudflare.</li>
    <li><strong>Multi-Core Worker Clustering:</strong> Deploying Node.js process clustering to distribute concurrent multi-user load across CPU cores.</li>
    <li><strong>MongoDB Replica Sets:</strong> Primary-Secondary database replication and read preference distribution under live load.</li>
  </ul>

  <div class="callout avoid-break">
    <div class="callout-title">Deployment Boundary Clarification</div>
    <div class="callout-body">
      These factors are outside the scope of local testing. Local software optimization is complete, and the system is ready 
      to move into staging for deployment-dependent infrastructure validation.
    </div>
  </div>

  <div class="page-footer">
    <span>PNAP-MIS Performance Engineering Assessment</span>
    <span>Page 14</span>
  </div>
</div>

<!-- ========================================================= -->
<!-- PAGE 15: READINESS ASSESSMENT & DEDICATED VERDICT -->
<!-- ========================================================= -->
<div class="page">
  <div class="page-header">
    <span>PNAP-MIS | Performance Optimization & Final Validation Report</span>
    <span>14. Final Readiness Assessment & Verdict</span>
  </div>

  <h1>14. Final Readiness Assessment</h1>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 25%;">Operational Area</th>
        <th style="width: 20%;">Pre-Optimization</th>
        <th style="width: 20%;">Final Status</th>
        <th>Readiness Assessment</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Basic API Performance</strong></td>
        <td>HEALTHY</td>
        <td><strong>EXCELLENT</strong></td>
        <td>55.15 RPS, P95 sub-40 ms, 0.00% error rate. Ready for deployment.</td>
      </tr>
      <tr>
        <td><strong>Large-Volume Database</strong></td>
        <td>UNACCEPTABLE (11–14 s)</td>
        <td><strong>EXCELLENT (0.3–0.8 s)</strong></td>
        <td>50k stored-member queries improved by 89%–93%. Ready for deployment.</td>
      </tr>
      <tr>
        <td><strong>Dashboard Architecture</strong></td>
        <td>DEFICIENT (Duplicates)</td>
        <td><strong>EXCELLENT (Single-Flight)</strong></td>
        <td>Duplicate calls eliminated; single-flight coalescing active. Ready.</td>
      </tr>
      <tr>
        <td><strong>Frontend Initial Loading</strong></td>
        <td>SLOW (945 KB bundle)</td>
        <td><strong>EXCELLENT (297 KB bundle)</strong></td>
        <td>68.5% smaller download; 100/100 Lighthouse score. Ready for deployment.</td>
      </tr>
      <tr>
        <td><strong>Functional Integrity</strong></td>
        <td>VALIDATED</td>
        <td><strong>VALIDATED</strong></td>
        <td>100% pass across all 19 functional modules. Zero regressions.</td>
      </tr>
      <tr>
        <td><strong>Authorization / Scoping</strong></td>
        <td>UNTESTED AT SCALE</td>
        <td><strong>VALIDATED & ENFORCED</strong></td>
        <td>100% pass across 9 scenarios. Strict territorial boundary enforcement.</td>
      </tr>
      <tr>
        <td><strong>Concurrent Workflows</strong></td>
        <td>CRITICAL (26.4 s at c=10)</td>
        <td><strong>IMPROVED (7.57 s at c=10)</strong></td>
        <td>71.3% faster; single-process limit reached. Requires worker clustering.</td>
      </tr>
      <tr>
        <td><strong>Production Infrastructure</strong></td>
        <td>UNTESTED</td>
        <td><strong>PENDING DEPLOYMENT</strong></td>
        <td>Edge CDN, multi-node clustering, and cellular network tests pending.</td>
      </tr>
    </tbody>
  </table>

  <h2>Dedicated Management Verdict Page</h2>
  <div class="callout avoid-break" style="border-left-color: #ef4444; margin-bottom: 12px;">
    <div class="callout-title" style="color: #b91c1c;">BEFORE OPTIMIZATION VERDICT</div>
    <div class="callout-body">
      <strong>CONDITIONALLY READY — OPTIMIZATION REQUIRED BEFORE HIGH-CONCURRENCY DEPLOYMENT</strong><br>
      System exhibited severe query latencies exceeding 11–14 seconds at 50k stored members and redundant dashboard requests.
    </div>
  </div>

  <div class="callout avoid-break" style="border-left-color: #10b981; margin-bottom: 12px;">
    <div class="callout-title" style="color: #047857;">AFTER LOCAL OPTIMIZATION VERDICT</div>
    <div class="callout-body">
      <strong>LOCAL PERFORMANCE OPTIMIZATION COMPLETED | FINAL VALIDATION PASSED</strong><br>
      All algorithmic, database query, single-flight, and frontend bundle optimizations successfully completed and verified.
    </div>
  </div>

  <div class="callout avoid-break" style="border-left-color: #3b82f6;">
    <div class="callout-title" style="color: #1d4ed8;">REMAINING DEPLOYMENT REQUIREMENT</div>
    <div class="callout-body">
      <strong>PRODUCTION DEPLOYMENT PERFORMANCE VALIDATION REQUIRED</strong><br>
      Production capacity remains subject to staging validation of cellular network conditions and worker process clustering.
    </div>
  </div>

  <div class="page-footer">
    <span>PNAP-MIS Performance Engineering Assessment</span>
    <span>Page 15</span>
  </div>
</div>

<!-- ========================================================= -->
<!-- PAGE 16: RECOMMENDATIONS & CONCLUSION -->
<!-- ========================================================= -->
<div class="page">
  <div class="page-header">
    <span>PNAP-MIS | Performance Optimization & Final Validation Report</span>
    <span>15. Recommendations & 16. Conclusion</span>
  </div>

  <h1>15. Management Recommendations</h1>
  <ol>
    <li><strong>Formally Accept Local Optimization as Complete:</strong> Conclude local optimization activities. Algorithmic and code-level bottlenecks have been resolved with exceptional return on investment.</li>
    <li><strong>Maintain Frozen Baseline:</strong> Use <code>FINAL-LOCAL-POST-OPTIMIZATION-BASELINE.json</code> as the permanent benchmark for future regression testing.</li>
    <li><strong>Safely Retire Disposable Databases:</strong> The synthetic test databases (<code>pnap_mis_o7_a</code> through <code>d</code>) have fulfilled their validation mission and can be safely dropped to reclaim disk storage when convenient.</li>
    <li><strong>Proceed to Staging Deployment:</strong> Deploy PNAP-MIS to the cloud staging environment and conduct production capacity testing with multi-process worker clustering.</li>
  </ol>

  <h1>16. Conclusion & Sign-Off</h1>
  <p>
    The original PNAP-MIS performance assessment identified significant large-volume database, dashboard-processing, 
    concurrency, and frontend-loading limitations. A controlled optimization program (Phases O1 through O10) was subsequently executed.
  </p>
  <p>
    Final local revalidation demonstrates substantial improvement across all dimensions while preserving functional behavior, 
    authorization boundaries, and response correctness. The largest directly comparable 50,000-record backend measurements 
    improved by approximately 84% to 92.5%, while initial frontend JavaScript was reduced by 68.5%.
  </p>
  <p>
    Final local validation has officially passed. The remaining performance work is deployment-dependent, encompassing production network 
    behavior, cloud resource sizing, process worker clustering, database replica characteristics, and final production capacity validation.
  </p>

  <div class="status-box avoid-break" style="margin-top: 15px;">
    <div class="status-box-title">FINAL LOCAL PERFORMANCE STATUS</div>
    <div class="status-grid">
      <div class="status-item"><span class="status-label">Optimization Program:</span><span class="status-val">COMPLETED</span></div>
      <div class="status-item"><span class="status-label">Final Revalidation:</span><span class="status-val" style="color: #0d9488;">PASSED</span></div>
      <div class="status-item"><span class="status-label">Functional Regressions:</span><span class="status-val">NONE DETECTED</span></div>
      <div class="status-item"><span class="status-label">Authorization Regressions:</span><span class="status-val">NONE DETECTED</span></div>
      <div class="status-item"><span class="status-label">Response Equivalence:</span><span class="status-val">NONE DETECTED</span></div>
      <div class="status-item"><span class="status-label">Authoritative Baseline:</span><span class="status-val">FROZEN</span></div>
      <div class="status-item"><span class="status-label">Next Project Stage:</span><span class="status-val" style="color: #1e3a8a;">DEPLOYMENT VALIDATION</span></div>
    </div>
  </div>

  <div class="page-footer">
    <span>PNAP-MIS Performance Engineering Assessment</span>
    <span>Page 16</span>
  </div>
</div>

<!-- ========================================================= -->
<!-- PAGE 17: APPENDIX A: AUTHORITATIVE METRICS -->
<!-- ========================================================= -->
<div class="page">
  <div class="page-header">
    <span>PNAP-MIS | Performance Optimization & Final Validation Report</span>
    <span>Appendix A: Authoritative Metrics</span>
  </div>

  <h1>Appendix A: Authoritative Metrics Reference Tables</h1>
  <p>
    This appendix tabulates the complete authoritative before vs after metrics recorded in <code>FINAL-MANAGEMENT-REPORT-DATA.json</code>:
  </p>

  <h2>Table A-1: 50k Database & Scalability Metrics (P95 in ms)</h2>
  <table class="data-table">
    <thead>
      <tr><th>Metric Name</th><th>Baseline (O7)</th><th>Final (O10)</th><th>Improvement</th><th>Status</th></tr>
    </thead>
    <tbody>
      <tr><td>Cold Organization Snapshot</td><td>11,699.89 ms</td><td>874.64 ms</td><td>92.52% reduction</td><td>Directly Comparable</td></tr>
      <tr><td>Basic Unit Officer Roster</td><td>6,540.80 ms</td><td>717.92 ms</td><td>89.02% reduction</td><td>Directly Comparable</td></tr>
      <tr><td>Area Officer Roster</td><td>3,359.80 ms</td><td>368.46 ms</td><td>89.03% reduction</td><td>Directly Comparable</td></tr>
      <tr><td>Group-3 Core Overview</td><td>13,943.31 ms</td><td>1,196.76 ms</td><td>91.42% reduction</td><td>Directly Comparable</td></tr>
      <tr><td>Staged Dashboard Completion</td><td>12,980.36 ms</td><td>2,013.97 ms</td><td>84.48% reduction</td><td>Directly Comparable</td></tr>
    </tbody>
  </table>

  <h2>Table A-2: Workflow Concurrency Scalability at 50k (P95 in ms)</h2>
  <table class="data-table">
    <thead>
      <tr><th>Concurrency Level</th><th>Baseline (O7)</th><th>Final (O10)</th><th>Improvement</th><th>Status</th></tr>
    </thead>
    <tbody>
      <tr><td>c = 1 Workflow</td><td>11,186.44 ms</td><td>1,863.64 ms</td><td>83.34% reduction</td><td>Directly Comparable</td></tr>
      <tr><td>c = 3 Workflows</td><td>12,621.43 ms</td><td>2,733.14 ms</td><td>78.35% reduction</td><td>Directly Comparable</td></tr>
      <tr><td>c = 5 Workflows</td><td>16,495.44 ms</td><td>4,102.37 ms</td><td>75.13% reduction</td><td>Directly Comparable</td></tr>
      <tr><td>c = 10 Workflows</td><td>26,359.17 ms</td><td>7,572.91 ms</td><td>71.27% reduction</td><td>Directly Comparable</td></tr>
    </tbody>
  </table>

  <h2>Table A-3: Frontend Bundle & Lighthouse Performance</h2>
  <table class="data-table">
    <thead>
      <tr><th>Metric Name</th><th>Baseline (O9)</th><th>Final (O10)</th><th>Improvement</th><th>Status</th></tr>
    </thead>
    <tbody>
      <tr><td>Initial JavaScript (Raw Bytes)</td><td>944,602 B</td><td>297,242 B</td><td>68.53% reduction</td><td>Directly Comparable</td></tr>
      <tr><td>Initial JavaScript (Gzip Bytes)</td><td>234,860 B</td><td>92,870 B</td><td>60.46% reduction</td><td>Directly Comparable</td></tr>
      <tr><td>Lighthouse Performance Score</td><td>89 / 100</td><td>100 / 100</td><td>+11 points gain</td><td>Directly Comparable</td></tr>
      <tr><td>First Contentful Paint (FCP)</td><td>2,822.40 ms</td><td>1,416.03 ms</td><td>49.83% faster</td><td>Directly Comparable</td></tr>
      <tr><td>Largest Contentful Paint (LCP)</td><td>2,822.40 ms</td><td>1,416.03 ms</td><td>49.83% faster</td><td>Directly Comparable</td></tr>
      <tr><td>Total Blocking Time (TBT)</td><td>0.00 ms</td><td>0.00 ms</td><td>Perfect (0.0 ms)</td><td>Directly Comparable</td></tr>
      <tr><td>Speed Index</td><td>3,901.83 ms</td><td>1,983.39 ms</td><td>49.17% faster</td><td>Directly Comparable</td></tr>
    </tbody>
  </table>

  <div class="page-footer">
    <span>PNAP-MIS Performance Engineering Assessment</span>
    <span>Page 17</span>
  </div>
</div>

<!-- ========================================================= -->
<!-- PAGE 18: APPENDIX B & C -->
<!-- ========================================================= -->
<div class="page">
  <div class="page-header">
    <span>PNAP-MIS | Performance Optimization & Final Validation Report</span>
    <span>Appendix B & C</span>
  </div>

  <h1>Appendix B: Optimization Phase Lifecycle Summary</h1>
  <table class="data-table" style="font-size: 8.2pt;">
    <thead>
      <tr><th style="width: 14%;">Phase</th><th style="width: 32%;">Target Area</th><th>Outcome Summary</th></tr>
    </thead>
    <tbody>
      <tr><td><strong>Phase O1</strong></td><td>MongoDB Indexing</td><td>Reverted: Composite index tests showed negligible gain. Preserved baseline schema.</td></tr>
      <tr><td><strong>Phase O2</strong></td><td>Dashboard API</td><td>Retained: Eliminated 3 duplicate requests; reduced total calls to 12.</td></tr>
      <tr><td><strong>Phase O3</strong></td><td>Diagnostics</td><td>Confirmed: Identified cold snapshot build fan-out as primary latency trigger.</td></tr>
      <tr><td><strong>Phase O4</strong></td><td>Single-Flight</td><td>Retained: Promise coalescing slashed concurrent builds to 1. Critical staging added.</td></tr>
      <tr><td><strong>Phase O5</strong></td><td>Membership</td><td>Retained: Single-pass facet aggregation cut database query scans.</td></tr>
      <tr><td><strong>Phase O6</strong></td><td>Aggregations</td><td>Reverted: Experimental one-command aggregations showed no gain; cleanly reverted.</td></tr>
      <tr><td><strong>Phase O7</strong></td><td>Volume Validation</td><td>Benchmarked: Established authoritative baselines at 500, 2k, 10k, and 50k stored members.</td></tr>
      <tr><td><strong>Phase O8</strong></td><td>Lookup Optimization</td><td>Retained: Candidate B two-step indexed query + in-memory join slashed latency by 89%.</td></tr>
      <tr><td><strong>Phase O9</strong></td><td>Frontend Bundle</td><td>Retained: Route-level code splitting cut initial JS download by 68.5%.</td></tr>
      <tr><td><strong>Phase O10</strong></td><td>Final Revalidation</td><td>Frozen: Read-only revalidation passed across all tiers. Baseline permanently frozen.</td></tr>
    </tbody>
  </table>

  <h1>Appendix C: Evidence Provenance & Comparability Audit</h1>
  <p>
    In accordance with engineering integrity standards, all comparisons in this report adhere to strict provenance rules:
  </p>
  <ul>
    <li><strong>Directly Comparable:</strong> Workloads where data volume, server hardware, measurement harness, and execution protocol were identical between Phase O7/O9 baselines and Phase O10 revalidation. Valid for all percentage improvement claims.</li>
    <li><strong>Directionally Comparable:</strong> Historical pre-optimization observations from exploratory manual testing that used differing network conditions or dev server states (e.g. initial Lighthouse 72 vs production 100). Preserved as qualitative observations without direct arithmetic percentage claims.</li>
    <li><strong>Not Comparable:</strong> Any metric where methodology or parameters diverged significantly. Strictly excluded from before-and-after tables.</li>
  </ul>

  <div class="callout avoid-break">
    <div class="callout-title">Final Document Sign-Off</div>
    <div class="callout-body">
      This document, associated datasets in <code>FINAL-MANAGEMENT-REPORT-DATA.json</code>, and audit logs in <code>REPORT-DATA-INTEGRITY-AUDIT.md</code> 
      constitute the complete, permanent record of the PNAP-MIS local performance optimization program.
    </div>
  </div>

  <div class="page-footer">
    <span>PNAP-MIS Performance Engineering Assessment</span>
    <span>Page 18</span>
  </div>
</div>

</body>
</html>
"""

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html_content)
print("report.html successfully written.")

# Call Chrome headless to render PDF
chrome_path = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
cmd = [
    chrome_path,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--run-all-compositor-stages-before-draw',
    f'--print-to-pdf={pdf_path}',
    html_path
]

print("Executing Chrome headless print-to-pdf...")
res = subprocess.run(cmd, capture_output=True, text=True)
print("Chrome return code:", res.returncode)
if os.path.exists(pdf_path):
    size_kb = os.path.getsize(pdf_path) / 1024
    print(f"PDF successfully generated: {pdf_path} ({size_kb:.1f} KB)")
else:
    print("ERROR: PDF was not generated!")
