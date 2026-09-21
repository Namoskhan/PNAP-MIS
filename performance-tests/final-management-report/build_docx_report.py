import os
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

report_dir = os.path.abspath('performance-tests/final-management-report')
charts_dir = os.path.join(report_dir, 'charts')
docx_path = os.path.join(report_dir, 'PNAP-MIS-PERFORMANCE-OPTIMIZATION-FINAL-REPORT.docx')

def set_cell_background(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=100, bottom=100, left=140, right=140):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{m}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def prevent_row_split(table):
    for row in table.rows:
        trPr = row._tr.get_or_add_trPr()
        trPr.append(OxmlElement('w:cantSplit'))

def add_callout(doc, text, title="NOTE", border_color="1E3A8A", bg_color="F1F5F9"):
    tbl = doc.add_table(rows=1, cols=1)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = tbl.cell(0, 0)
    cell.width = Inches(6.5)
    set_cell_background(cell, bg_color)
    set_cell_margins(cell, top=120, bottom=120, left=160, right=160)
    
    tcPr = cell._tc.get_or_add_tcPr()
    borders = parse_xml(f'''
        <w:tcBorders {nsdecls("w")}>
            <w:top w:val="none"/>
            <w:left w:val="single" w:sz="24" w:space="0" w:color="{border_color}"/>
            <w:bottom w:val="none"/>
            <w:right w:val="none"/>
        </w:tcBorders>
    ''')
    tcPr.append(borders)
    
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)
    run_t = p.add_run(f"■ {title}: ")
    run_t.bold = True
    run_t.font.name = 'Calibri'
    run_t.font.size = Pt(9.5)
    run_t.font.color.rgb = RGBColor(30, 58, 138)
    
    run_b = p.add_run(text)
    run_b.font.name = 'Calibri'
    run_b.font.size = Pt(9.5)
    run_b.font.color.rgb = RGBColor(51, 65, 85)
    doc.add_paragraph()

def style_table(table, header_bg="1E3A8A", alt_bg="F8FAFC"):
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    prevent_row_split(table)
    
    # Header row
    for cell in table.rows[0].cells:
        set_cell_background(cell, header_bg)
        set_cell_margins(cell, top=120, bottom=120, left=140, right=140)
        for p in cell.paragraphs:
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            for run in p.runs:
                run.font.name = 'Calibri'
                run.font.size = Pt(9)
                run.bold = True
                run.font.color.rgb = RGBColor(255, 255, 255)
                
    # Data rows
    for r_idx, row in enumerate(table.rows[1:], start=1):
        bg = alt_bg if r_idx % 2 == 1 else "FFFFFF"
        for cell in row.cells:
            set_cell_background(cell, bg)
            set_cell_margins(cell, top=80, bottom=80, left=140, right=140)
            for p in cell.paragraphs:
                for run in p.runs:
                    run.font.name = 'Calibri'
                    run.font.size = Pt(8.5)
                    run.font.color.rgb = RGBColor(30, 41, 59)

def build_docx():
    doc = Document()
    
    # Margins
    for s in doc.sections:
        s.top_margin = Inches(0.75)
        s.bottom_margin = Inches(0.75)
        s.left_margin = Inches(0.8)
        s.right_margin = Inches(0.8)
        
        # Header & Footer setup
        footer = s.footer
        f_p = footer.paragraphs[0]
        f_p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        f_run = f_p.add_run("PNAP-MIS | Performance Optimization & Final Validation Report")
        f_run.font.name = 'Calibri'
        f_run.font.size = Pt(8)
        f_run.font.color.rgb = RGBColor(148, 163, 184)
        
    # -------------------------------------------------------------
    # PAGE 1: COVER PAGE
    # -------------------------------------------------------------
    p_org = doc.add_paragraph()
    r_org = p_org.add_run("PAKISTAN NATIONAL AWAMI PARTY (PNAP)")
    r_org.font.name = 'Calibri'
    r_org.font.size = Pt(11)
    r_org.font.bold = True
    r_org.font.color.rgb = RGBColor(13, 148, 136)
    p_org.paragraph_format.space_before = Pt(40)
    p_org.paragraph_format.space_after = Pt(8)
    
    p_title = doc.add_paragraph()
    r_title = p_title.add_run("PERFORMANCE OPTIMIZATION &\nFINAL VALIDATION REPORT")
    r_title.font.name = 'Calibri'
    r_title.font.size = Pt(24)
    r_title.font.bold = True
    r_title.font.color.rgb = RGBColor(15, 23, 42)
    p_title.paragraph_format.space_after = Pt(10)
    
    p_sub = doc.add_paragraph()
    r_sub = p_sub.add_run("Pre-Optimization Assessment → Optimization Implementation → Post-Optimization Validation")
    r_sub.font.name = 'Calibri'
    r_sub.font.size = Pt(12)
    r_sub.font.color.rgb = RGBColor(71, 85, 105)
    p_sub.paragraph_format.space_after = Pt(30)
    
    # Metadata Card
    meta_table = doc.add_table(rows=7, cols=2)
    meta_data = [
        ("System", "PNAP-MIS (Central Party Management Information System)"),
        ("Evaluation Scope", "Phases O1 through O10 (Completed Engineering Lifecycle)"),
        ("Assessment Type", "Local Performance Engineering & Scalability Revalidation"),
        ("Local Validation Status", "FINAL VALIDATION PASSED"),
        ("Baseline State", "FROZEN (Authoritative Post-Optimization Baseline)"),
        ("Prepared By", "PNAP-MIS Development & Performance Engineering Team"),
        ("Assessment Date", "September 2026")
    ]
    for idx, (k, v) in enumerate(meta_data):
        c0 = meta_table.cell(idx, 0)
        c1 = meta_table.cell(idx, 1)
        c0.width = Inches(2.2)
        c1.width = Inches(4.3)
        c0.paragraphs[0].text = k
        c0.paragraphs[0].runs[0].bold = True
        c0.paragraphs[0].runs[0].font.color.rgb = RGBColor(30, 58, 138)
        c1.paragraphs[0].text = v
        if k == "Local Validation Status":
            c1.paragraphs[0].runs[0].bold = True
            c1.paragraphs[0].runs[0].font.color.rgb = RGBColor(21, 128, 61)
        set_cell_background(c0, "F8FAFC")
        set_cell_background(c1, "FFFFFF")
        set_cell_margins(c0, top=70, bottom=70, left=120, right=120)
        set_cell_margins(c1, top=70, bottom=70, left=120, right=120)
    
    doc.add_paragraph()
    p_disc = doc.add_paragraph()
    p_disc.paragraph_format.space_before = Pt(80)
    r_disc = p_disc.add_run(
        "Notice: This document reflects controlled local performance measurements on frozen hardware. "
        "Production capacity remains subject to deployment-environment infrastructure validation."
    )
    r_disc.font.name = 'Calibri'
    r_disc.font.size = Pt(8.5)
    r_disc.font.color.rgb = RGBColor(100, 116, 139)
    
    doc.add_page_break()

    # -------------------------------------------------------------
    # PAGE 2: DOCUMENT CONTROL & TABLE OF CONTENTS
    # -------------------------------------------------------------
    h1 = doc.add_heading(level=1)
    r = h1.add_run("Document Control")
    r.font.name = 'Calibri'
    r.font.color.rgb = RGBColor(30, 58, 138)
    
    dc_table = doc.add_table(rows=8, cols=2)
    dc_data = [
        ("Document Title", "PNAP-MIS Performance Optimization & Final Validation Report"),
        ("Project Name", "PNAP-MIS (Central Party Management Information System)"),
        ("Report Classification", "Management Performance Engineering & Revalidation Report"),
        ("Evaluation Cycle", "Phases O1 through O10 (Completed Lifecycle)"),
        ("Publication Date", "September 2026"),
        ("Local Validation Verdict", "LOCAL OPTIMIZATION COMPLETED — PASSED"),
        ("Authoritative Baseline", "FROZEN (FINAL-LOCAL-POST-OPTIMIZATION-BASELINE.json)"),
        ("Target Audience", "Executive Leadership, General Secretary, IT Steering Committee")
    ]
    for idx, (k, v) in enumerate(dc_data):
        c0 = dc_table.cell(idx, 0)
        c1 = dc_table.cell(idx, 1)
        c0.width = Inches(2.2)
        c1.width = Inches(4.3)
        c0.paragraphs[0].text = k
        c0.paragraphs[0].runs[0].bold = True
        c0.paragraphs[0].runs[0].font.color.rgb = RGBColor(30, 58, 138)
        c1.paragraphs[0].text = v
        set_cell_background(c0, "F8FAFC")
        set_cell_background(c1, "FFFFFF")
        set_cell_margins(c0, top=60, bottom=60, left=120, right=120)
        set_cell_margins(c1, top=60, bottom=60, left=120, right=120)

    doc.add_paragraph()
    h2 = doc.add_heading(level=2)
    h2.add_run("Table of Contents")
    
    toc_table = doc.add_table(rows=14, cols=3)
    toc_data = [
        ("Section", "Title", "Report Location"),
        ("—", "Executive Summary & Status Scorecard", "Page 3"),
        ("1 & 2", "Purpose, Background & Original Pre-Optimization Assessment", "Page 4"),
        ("3", "Why Optimization Was Required (Root Causes)", "Page 5"),
        ("4", "Optimization Approach — The O1 to O10 Journey", "Page 6"),
        ("5", "Executive Before vs After Scorecard", "Page 7"),
        ("6", "Database & Large-Volume Improvements (50k Scalability)", "Pages 8–9"),
        ("7", "Dashboard Performance Improvements (Single-Flight & Staging)", "Page 10"),
        ("8", "Workflow Concurrency Scalability", "Page 11"),
        ("9", "Frontend Performance & Bundle Optimization", "Page 12"),
        ("10 & 11", "API Health, Functional Correctness & Security Validation", "Page 13"),
        ("12 & 13", "Remaining Local Limitations & Deployment Validation", "Page 14"),
        ("14", "Final Readiness Assessment & Dedicated Verdict", "Page 15"),
        ("15 & 16", "Management Recommendations & Final Conclusion", "Page 16")
    ]
    for idx, row in enumerate(toc_data):
        for c_idx, val in enumerate(row):
            toc_table.cell(idx, c_idx).paragraphs[0].text = val
            if idx == 0:
                toc_table.cell(idx, c_idx).paragraphs[0].runs[0].bold = True
    style_table(toc_table)

    doc.add_page_break()

    # -------------------------------------------------------------
    # PAGE 3: EXECUTIVE SUMMARY
    # -------------------------------------------------------------
    h1 = doc.add_heading(level=1)
    r = h1.add_run("Executive Summary")
    r.font.name = 'Calibri'
    r.font.color.rgb = RGBColor(30, 58, 138)
    
    doc.add_paragraph(
        "This report delivers the executive findings from the performance engineering and optimization program "
        "(Phases O1 through O10) conducted on the Pakistan National Awami Party Management Information System (PNAP-MIS). "
        "The system has been transformed from an unoptimized state that suffered from severe 11- to 14-second query freezes "
        "under representative volume into a high-efficiency platform executing in sub-second to two-second timeframes with "
        "zero functional regressions, zero authorization breaches, and 100% cryptographic response equivalence."
    )
    
    add_callout(
        doc,
        "OPTIMIZATION PROGRAM: COMPLETED (O1–O9)\n"
        "FINAL LOCAL REVALIDATION: PASSED (Phase O10)\n"
        "FUNCTIONAL REGRESSIONS: NONE DETECTED (19/19 Scenarios Passed)\n"
        "AUTHORIZATION / SCOPING: STRICTLY ENFORCED (9/9 Scenarios Passed)\n"
        "CRYPTOGRAPHIC EQUIVALENCE: 100% BIT-FOR-BIT MATCH\n"
        "AUTHORITATIVE BASELINE: FROZEN (Recorded in JSON)\n"
        "PRODUCTION / DEPLOYMENT VALIDATION: STILL REQUIRED",
        "FINAL LOCAL PERFORMANCE & VALIDATION STATUS",
        border_color="0D9488",
        bg_color="F0FDFA"
    )

    doc.add_heading(level=2).add_run("Key Performance Milestones Achieved")
    p = doc.add_paragraph()
    p.add_run("• 50,000 Stored-Member Organization Snapshot: ").bold = True
    p.add_run("Cold snapshot P95 dropped from 11.70 seconds (O7) to 0.87 seconds (O10)—a 92.52% latency reduction.\n")
    p.add_run("• Basic Unit & Area Processing: ").bold = True
    p.add_run("Basic Unit officer lookup dropped from 6.54 s to 0.72 s (89.02% reduction); Area officer lookup dropped from 3.36 s to 0.37 s (89.03% reduction).\n")
    p.add_run("• Workflow Concurrency Scalability: ").bold = True
    p.add_run("10 simultaneous staged dashboard workflows run 71.27% faster (slashed from 26.36 s to 7.57 s).\n")
    p.add_run("• Frontend Asset Weight: ").bold = True
    p.add_run("Initial JavaScript download dropped by 68.53% (from 944.6 KB raw / 234.9 KB gzip down to 297.2 KB raw / 92.9 KB gzip).\n")
    p.add_run("• User Experience Quality: ").bold = True
    p.add_run("Production Lighthouse Performance audit reached a perfect median score of 100 / 100 with 0.0 ms Total Blocking Time.")

    add_callout(
        doc,
        "LOCAL PERFORMANCE OPTIMIZATION COMPLETED | FINAL VALIDATION PASSED. "
        "The local software architecture is fully optimized and frozen. Production capacity remains subject to deployment-environment "
        "performance validation (real mobile network latency, reverse-proxy caching, and container resource limits).",
        "FINAL MANAGEMENT DETERMINATION"
    )

    doc.add_page_break()

    # -------------------------------------------------------------
    # PAGE 4: PURPOSE & ORIGINAL ASSESSMENT
    # -------------------------------------------------------------
    h1 = doc.add_heading(level=1)
    r = h1.add_run("1. Purpose & Background")
    r.font.name = 'Calibri'
    r.font.color.rgb = RGBColor(30, 58, 138)
    
    doc.add_paragraph(
        "PNAP-MIS is the core operational platform managing party organizational structures, membership registries, "
        "cabinet appointments, event meetings, activities, and financial compliance across National, Provincial, District, Area, "
        "and Basic Unit administrative tiers."
    )
    doc.add_paragraph(
        "Prior to optimization, initial assessments established that while basic single-user interactions functioned normally "
        "on small development datasets, the system suffered from severe performance degradation as stored member volume approached "
        "realistic organizational scale (50,000 synthetic members)."
    )
    
    h1_2 = doc.add_heading(level=1)
    r = h1_2.add_run("2. Original Pre-Optimization Assessment")
    r.font.name = 'Calibri'
    r.font.color.rgb = RGBColor(30, 58, 138)
    
    add_callout(
        doc,
        "\"CONDITIONALLY READY — OPTIMIZATION REQUIRED BEFORE HIGH-CONCURRENCY DEPLOYMENT\"\n"
        "The pre-optimization evaluation highlighted that database queries for unit leadership took upwards of 14 seconds, "
        "the dashboard dispatched redundant queries, concurrent users triggered repeated expensive background computations, and "
        "the frontend shipped nearly 1 MB of monolithic JavaScript before rendering the login screen.",
        "ORIGINAL MANAGEMENT VERDICT (PRE-OPTIMIZATION)",
        border_color="EF4444",
        bg_color="FEF2F2"
    )

    doc.add_page_break()

    # -------------------------------------------------------------
    # PAGE 5: WHY OPTIMIZATION WAS REQUIRED
    # -------------------------------------------------------------
    h1 = doc.add_heading(level=1)
    r = h1.add_run("3. Why Optimization Was Required")
    r.font.name = 'Calibri'
    r.font.color.rgb = RGBColor(30, 58, 138)
    
    doc.add_paragraph(
        "Detailed profiling isolated four primary architectural bottlenecks that severely restricted system capacity:"
    )
    
    p = doc.add_paragraph()
    p.add_run("A. Correlated Subqueries at Scale (MongoDB $lookup Bottleneck): ").bold = True
    p.add_run("When rendering unit leadership rosters, the server executed correlated subqueries for every appointment record. "
              "At 50,000 synthetic stored members, the database performed approximately 15,000 correlated lookups for Basic Units "
              "and 7,500 correlated lookups for Areas. This repetitive index traversal forced the database engine to scan "
              "millions of document keys, driving Basic Unit response time to 6.54 seconds and Area response time to 3.36 seconds.\n\n")
    p.add_run("B. Uncoalesced Cold Snapshot Builds (Thundering Herd): ").bold = True
    p.add_run("The system computes an executive organizational snapshot summarizing active units, appointed officers, and member counts. "
              "In the pre-optimized state, concurrent requests independently triggered the exact same 11.7-second aggregation pipeline, "
              "stalling the single-threaded Node.js event loop.\n\n")
    p.add_run("C. Redundant Dashboard Requests: ").bold = True
    p.add_run("The web client dispatched 16 individual requests upon landing on the dashboard, including duplicate calls for "
              "provincial boundaries and unprioritized heavy secondary charts.\n\n")
    p.add_run("D. Monolithic Initial JavaScript Delivery: ").bold = True
    p.add_run("All 56 application routes, administration forms, and modal dialogs were bundled into one 944.6 KB file, "
              "forcing users to download administrative code on mobile networks before even logging in.")

    doc.add_page_break()

    # -------------------------------------------------------------
    # PAGE 6: OPTIMIZATION JOURNEY O1–O10
    # -------------------------------------------------------------
    h1 = doc.add_heading(level=1)
    r = h1.add_run("4. Optimization Approach — The O1 to O10 Journey")
    r.font.name = 'Calibri'
    r.font.color.rgb = RGBColor(30, 58, 138)
    
    doc.add_paragraph(
        "The engineering team executed a disciplined, ten-phase optimization and revalidation program. Every change was "
        "strictly audited against functional test suites and cryptographic response hashes before adoption:"
    )
    
    j_table = doc.add_table(rows=11, cols=3)
    j_data = [
        ("Phase", "Technical Focus", "Outcome & Architectural Disposition"),
        ("Phase O1", "MongoDB Query & Index Exploration", "REVERTED: Composite indexes yielded no repeatable gain; clean schema preserved."),
        ("Phase O2", "Dashboard Request Deduplication", "RETAINED: Removed redundant province/summary requests; calls dropped from 16 to 12."),
        ("Phase O3", "Dashboard Latency Diagnostics", "CONFIRMED: Root cause isolated to cold snapshot fan-out and local event-loop contention."),
        ("Phase O4", "Snapshot Single-Flight & Staging", "RETAINED: In-flight promise coalescing (3+ builds → 1) and two-stage critical-first rendering."),
        ("Phase O5", "Membership Analytics Optimization", "RETAINED: Consolidated multiple database scans into a unified single-scan facet aggregation."),
        ("Phase O6", "Role-Assignment Aggregations", "REVERTED: Experimental aggregation pipelines showed no gain; cleanly reverted."),
        ("Phase O7", "Representative Volume Validation", "BENCHMARKED: Established baseline across 500 to 50k members; confirmed $lookup bottleneck."),
        ("Phase O8", "Basic Unit & Area Lookup Optimization", "RETAINED: Candidate B selected: Two-step indexed query + in-memory Node.js hash join."),
        ("Phase O9", "Frontend Bundle & Lazy Loading", "RETAINED: Converted 54 routes to React.lazy; deferred secondary modals; initial JS cut by 68.5%."),
        ("Phase O10", "Final Post-Optimization Revalidation", "FROZEN: Comprehensive read-only audit across all tiers; zero regressions; baseline frozen.")
    ]
    for idx, row in enumerate(j_data):
        for c_idx, val in enumerate(row):
            j_table.cell(idx, c_idx).paragraphs[0].text = val
            if idx == 0:
                j_table.cell(idx, c_idx).paragraphs[0].runs[0].bold = True
    style_table(j_table)

    add_callout(
        doc,
        "In Phases O1 and O6, proposed modifications failed to provide statistically meaningful latency improvements. "
        "Rather than allowing code complexity to accumulate, these changes were immediately reverted. "
        "Only verified, mathematically sound enhancements were retained in the production codebase.",
        "ENGINEERING DISCIPLINE HIGHLIGHT"
    )

    doc.add_page_break()

    # -------------------------------------------------------------
    # PAGE 7: EXECUTIVE SCORECARD
    # -------------------------------------------------------------
    h1 = doc.add_heading(level=1)
    r = h1.add_run("5. Executive Before vs After Scorecard")
    r.font.name = 'Calibri'
    r.font.color.rgb = RGBColor(30, 58, 138)
    
    add_callout(
        doc,
        "50,000 represents synthetic stored member records used to evaluate database volume scalability "
        "under representative party growth. It does NOT represent 50,000 simultaneous concurrent users.",
        "MANDATORY VOLUME DISCLAIMER",
        border_color="F59E0B",
        bg_color="FFFBEB"
    )

    sc_table = doc.add_table(rows=11, cols=5)
    sc_data = [
        ("Performance Area", "Workload Metric", "Before Optimization", "Final Optimized", "Improvement"),
        ("Cold Organization Snapshot", "50k Members (P95)", "11.70 s (11,699.89 ms)", "0.87 s (874.64 ms)", "92.52% Faster"),
        ("Basic Unit Officer Query", "50k Members (P95)", "6.54 s (6,540.80 ms)", "0.72 s (717.92 ms)", "89.02% Faster"),
        ("Area Officer Query", "50k Members (P95)", "3.36 s (3,359.80 ms)", "0.37 s (368.46 ms)", "89.03% Faster"),
        ("Group-3 Core Overview", "50k Members (P95)", "13.94 s (13,943.31 ms)", "1.20 s (1,196.76 ms)", "91.42% Faster"),
        ("Staged Dashboard Load", "50k Members (P95)", "12.98 s (12,980.36 ms)", "2.01 s (2,013.97 ms)", "84.48% Faster"),
        ("Workflow Concurrency c=1", "Staged Workflow (P95)", "11.19 s (11,186.44 ms)", "1.86 s (1,863.64 ms)", "83.34% Faster"),
        ("Workflow Concurrency c=10", "Staged Workflows (P95)", "26.36 s (26,359.17 ms)", "7.57 s (7,572.91 ms)", "71.27% Faster"),
        ("Initial JS Bundle (Raw)", "Web Build File Size", "944.6 KB (944,602 B)", "297.2 KB (297,242 B)", "68.53% Smaller"),
        ("Initial JS Bundle (Gzip)", "Network Transfer Size", "234.9 KB (234,860 B)", "92.9 KB (92,870 B)", "60.46% Smaller"),
        ("Lighthouse Score", "Production Audit", "89 / 100", "100 / 100", "+11 Points")
    ]
    for idx, row in enumerate(sc_data):
        for c_idx, val in enumerate(row):
            sc_table.cell(idx, c_idx).paragraphs[0].text = val
            if idx == 0:
                sc_table.cell(idx, c_idx).paragraphs[0].runs[0].bold = True
    style_table(sc_table)

    doc.add_page_break()

    # -------------------------------------------------------------
    # PAGES 8 & 9: DATABASE IMPROVEMENTS (CHARTS 1 & 2)
    # -------------------------------------------------------------
    h1 = doc.add_heading(level=1)
    r = h1.add_run("6. Database & Large-Volume Scalability")
    r.font.name = 'Calibri'
    r.font.color.rgb = RGBColor(30, 58, 138)
    
    doc.add_paragraph(
        "The most substantial backend breakthrough was achieved in Phase O8 via Candidate B, permanently "
        "eliminating the correlated member lookup ceiling at 50,000 stored members."
    )
    
    # Embed Chart 1
    p_img1 = doc.add_paragraph()
    p_img1.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_img1.add_run().add_picture(os.path.join(charts_dir, 'chart1_50k_backend_before_after.png'), width=Inches(6.2))
    p_cap1 = doc.add_paragraph()
    p_cap1.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_cap1 = p_cap1.add_run("Figure 1: Latency comparison across 50,000 stored-member workloads (Seconds P95 — Lower is better).")
    r_cap1.font.italic = True
    r_cap1.font.size = Pt(8.5)
    r_cap1.font.color.rgb = RGBColor(100, 116, 139)

    doc.add_page_break()

    # Page 9: Algorithmic Deep Dive & Chart 2
    h2 = doc.add_heading(level=2)
    h2.add_run("Algorithmic Resolution: The Candidate B Breakthrough")
    
    doc.add_paragraph(
        "Figure 2 illustrates the percentage latency reduction achieved across all primary database operations. "
        "Every single query path exhibited an efficiency gain exceeding 84%."
    )
    
    p_img2 = doc.add_paragraph()
    p_img2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_img2.add_run().add_picture(os.path.join(charts_dir, 'chart2_latency_percentage_reduction.png'), width=Inches(6.2))
    p_cap2 = doc.add_paragraph()
    p_cap2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_cap2 = p_cap2.add_run("Figure 2: Percentage latency reduction across 50,000-member database workloads (Higher is better).")
    r_cap2.font.italic = True
    r_cap2.font.size = Pt(8.5)
    r_cap2.font.color.rgb = RGBColor(100, 116, 139)

    doc.add_paragraph(
        "Instead of executing 22,500 nested subqueries across unindexed collections, Candidate B executes two indexed queries:\n"
        "1. Fetch active officer appointments from RoleAssignment.\n"
        "2. Single batched primary-key seek on Member (_id: { $in: memberIds }).\n"
        "3. High-speed in-memory Hash Map join in Node.js (<55 ms).\n"
        "At 50k members, the unique ID array generates just 267.5 KB of BSON transfer (1.63% of MongoDB limit)."
    )

    doc.add_page_break()

    # -------------------------------------------------------------
    # PAGE 10: DASHBOARD PERFORMANCE IMPROVEMENTS
    # -------------------------------------------------------------
    h1 = doc.add_heading(level=1)
    r = h1.add_run("7. Dashboard Performance Improvements")
    r.font.name = 'Calibri'
    r.font.color.rgb = RGBColor(30, 58, 138)
    
    doc.add_paragraph(
        "The executive dashboard is the primary operational interface for party leadership. Optimizations in Phases O2 and O4 "
        "re-architected how the client requests and consumes backend dashboard data:"
    )
    
    p = doc.add_paragraph()
    p.add_run("A. Request Deduplication & Payload Streamlining: ").bold = True
    p.add_run("Duplicate requests dropped from 3 to 0. Total dashboard requests reduced from 16 to 12. "
              "Total network payload was compressed to 25,141 bytes (~24.5 KB).\n\n")
    p.add_run("B. Snapshot Single-Flight (In-Flight Coalescing): ").bold = True
    p.add_run("When multiple concurrent requests arrive for the exact same cold organizational snapshot, the backend initiates "
              "exactly ONE build. All concurrent callers share the in-flight promise, eliminating duplicate server computations.\n\n")
    p.add_run("C. Two-Stage Dashboard Staging: ").bold = True
    p.add_run("Dashboard loading is partitioned into two tiers: Stage 1 (Critical executive summary cards) loads instantly; "
              "Stage 2 (Historical trends and secondary tables) loads non-blockingly in the background.")

    add_callout(
        doc,
        "Validation confirmed that during a 5-consumer concurrent cold snapshot wave, exactly 1 database build was executed. "
        "The remaining 4 requests attached to the active build, avoiding 80% redundant database aggregation work.",
        "SINGLE-FLIGHT VERIFICATION"
    )

    doc.add_page_break()

    # -------------------------------------------------------------
    # PAGE 11: CONCURRENCY IMPROVEMENTS (CHART 3)
    # -------------------------------------------------------------
    h1 = doc.add_heading(level=1)
    r = h1.add_run("8. Workflow Concurrency Scalability")
    r.font.name = 'Calibri'
    r.font.color.rgb = RGBColor(30, 58, 138)
    
    doc.add_paragraph(
        "Multi-user concurrency was benchmarked using multi-stage dashboard workflows running concurrently against "
        "the 50,000 stored-member database across concurrency levels c=1, 3, 5, and 10."
    )
    
    p_img3 = doc.add_paragraph()
    p_img3.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_img3.add_run().add_picture(os.path.join(charts_dir, 'chart3_concurrency_before_after.png'), width=Inches(6.2))
    p_cap3 = doc.add_paragraph()
    p_cap3.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_cap3 = p_cap3.add_run("Figure 3: Latency comparison across concurrent staged dashboard workflows at 50k volume (Seconds P95 — Lower is better).")
    r_cap3.font.italic = True
    r_cap3.font.size = Pt(8.5)
    r_cap3.font.color.rgb = RGBColor(100, 116, 139)

    add_callout(
        doc,
        "While 10 concurrent workflows run 71.27% faster than baseline (7.57 s vs 26.36 s), single-process CPU utilization "
        "and event-loop delay (419.5 ms) represent the primary remaining local performance boundary. "
        "This is the natural transition point where multi-worker process clustering (e.g. PM2 / Kubernetes replicas) should be evaluated in staging.",
        "REMAINING CONCURRENCY BOUNDARY"
    )

    doc.add_page_break()

    # -------------------------------------------------------------
    # PAGE 12: FRONTEND PERFORMANCE (CHARTS 4 & 5)
    # -------------------------------------------------------------
    h1 = doc.add_heading(level=1)
    r = h1.add_run("9. Frontend Performance Improvements")
    r.font.name = 'Calibri'
    r.font.color.rgb = RGBColor(30, 58, 138)
    
    doc.add_paragraph(
        "By implementing route-level code splitting (React.lazy) across 54 secondary pages and deferring heavy action modals, "
        "the initial JavaScript payload delivered to users was reduced by over two-thirds without removing a single feature."
    )
    
    p_img4 = doc.add_paragraph()
    p_img4.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_img4.add_run().add_picture(os.path.join(charts_dir, 'chart4_frontend_initial_js.png'), width=Inches(6.0))
    p_cap4 = doc.add_paragraph()
    p_cap4.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_cap4 = p_cap4.add_run("Figure 4: Initial JavaScript payload reduction via route code splitting (Kilobytes — Lower is better).")
    r_cap4.font.italic = True
    r_cap4.font.size = Pt(8)
    r_cap4.font.color.rgb = RGBColor(100, 116, 139)

    p_img5 = doc.add_paragraph()
    p_img5.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_img5.add_run().add_picture(os.path.join(charts_dir, 'chart5_frontend_experience.png'), width=Inches(6.0))
    p_cap5 = doc.add_paragraph()
    p_cap5.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_cap5 = p_cap5.add_run("Figure 5: Lighthouse Performance Score and visual paint latency before vs after optimization.")
    r_cap5.font.italic = True
    r_cap5.font.size = Pt(8)
    r_cap5.font.color.rgb = RGBColor(100, 116, 139)

    doc.add_page_break()

    # -------------------------------------------------------------
    # PAGE 13: API HEALTH & SECURITY VALIDATION
    # -------------------------------------------------------------
    h1 = doc.add_heading(level=1)
    r = h1.add_run("10. Final API Health & 11. Security Validation")
    r.font.name = 'Calibri'
    r.font.color.rgb = RGBColor(30, 58, 138)
    
    doc.add_paragraph(
        "Baseline API health was verified using an automated suite of 200 sequential queries across core administrative endpoints:\n"
        "• Throughput: 55.15 Requests Per Second across 200 sequential queries (0.00% error rate).\n"
        "• Latency Distribution: P50 = 13.69 ms, P95 = 39.76 ms, P99 = 72.53 ms, Max = 92.17 ms.\n"
        "• Password Security: Bcrypt password hashing (cost factor 12) was intentionally preserved, executing in ~64.9 ms (P95) to prevent brute-force exposure.\n"
        "• Token Verification: Current user session checks (/api/auth/me) execute in 2.40 ms (P95)."
    )

    doc.add_heading(level=2).add_run("Correctness & Security Gate Audit")
    val_table = doc.add_table(rows=5, cols=4)
    val_data = [
        ("Validation Gate", "Scope & Scenario Count", "Observed Result", "Security & Quality Verdict"),
        ("Functional API Audit", "19 Core Modules (All Tiers)", "19 / 19 Succeeded (0% errors)", "PASSED (Zero Functional Regressions)"),
        ("Authorization Scoping", "9 Scenarios (Central to Basic Unit)", "9 / 9 Enforced (403 OUT_OF_SCOPE)", "PASSED (Zero Territorial Data Leakage)"),
        ("Cryptographic Equivalence", "4 SHA-256 Hashes (10k & 50k)", "4 / 4 Matched Exactly", "PASSED (Bit-for-Bit Output Equivalence)"),
        ("Single-Flight Coalescing", "5 Concurrent Same-Key Consumers", "Exactly 1 Build Executed", "PASSED (No Redundant Server Work)")
    ]
    for idx, row in enumerate(val_data):
        for c_idx, val in enumerate(row):
            val_table.cell(idx, c_idx).paragraphs[0].text = val
            if idx == 0:
                val_table.cell(idx, c_idx).paragraphs[0].runs[0].bold = True
    style_table(val_table)

    add_callout(
        doc,
        "When a District Administrator attempted to inspect meetings belonging to a different district, "
        "the server rejected the request with HTTP 403 OUT_OF_SCOPE. Zero cross-provincial or cross-district "
        "data leakage occurred under any test scenario.",
        "TERRITORIAL BOUNDARY ENFORCEMENT"
    )

    doc.add_page_break()

    # -------------------------------------------------------------
    # PAGE 14: LIMITATIONS & DEPLOYMENT TESTING
    # -------------------------------------------------------------
    h1 = doc.add_heading(level=1)
    r = h1.add_run("12. Remaining Limitations & 13. Deployment Testing")
    r.font.name = 'Calibri'
    r.font.color.rgb = RGBColor(30, 58, 138)
    
    doc.add_paragraph(
        "Engineering integrity requires documenting what local optimization can and cannot accomplish:\n"
        "• Single-Process CPU Contention: Under sustained concurrency of 10 simultaneous multi-stage dashboard workflows on a single Node.js process, P95 latency reaches 7.57 seconds, and event-loop delay rises to 419.5 ms. This requires multi-worker process clustering (PM2 / Kubernetes replicas) in staging.\n"
        "• 50k Member Secondary Scans: Complex analytics filtering across 50,000 members take ~300–400 ms. While completely acceptable for management dashboards, they represent the largest remaining database slice.\n"
        "• Bcrypt Work Factor: Single-threaded password verification takes ~62 ms per attempt. Rapid burst login spikes require reverse-proxy rate limiting and worker process distribution."
    )

    doc.add_heading(level=2).add_run("Deployment-Dependent Validation (Required in Staging)")
    doc.add_paragraph(
        "The following operational parameters belong to staging and production deployment and must be verified in the cloud environment:\n"
        "• Cellular Network Latency: User connectivity over 3G/4G/5G mobile carriers across Pakistan.\n"
        "• Edge Compression & Reverse Proxy: TLS termination, HTTP/2 multiplexing, and Brotli compression via NGINX or Cloudflare.\n"
        "• Multi-Core Worker Clustering: Deploying Node.js process clustering to distribute concurrent multi-user load across CPU cores.\n"
        "• MongoDB Replica Sets: Primary-Secondary database replication and read preference distribution under live load."
    )

    doc.add_page_break()

    # -------------------------------------------------------------
    # PAGE 15: READINESS ASSESSMENT & VERDICT
    # -------------------------------------------------------------
    h1 = doc.add_heading(level=1)
    r = h1.add_run("14. Final Readiness Assessment & Verdict")
    r.font.name = 'Calibri'
    r.font.color.rgb = RGBColor(30, 58, 138)
    
    ra_table = doc.add_table(rows=9, cols=4)
    ra_data = [
        ("Operational Area", "Pre-Optimization", "Final Status", "Readiness Assessment"),
        ("Basic API Performance", "HEALTHY", "EXCELLENT", "55.15 RPS, P95 sub-40 ms, 0.00% error rate. Ready for deployment."),
        ("Large-Volume Database", "UNACCEPTABLE (11–14 s)", "EXCELLENT (0.3–0.8 s)", "50k stored-member queries improved by 89%–93%. Ready for deployment."),
        ("Dashboard Architecture", "DEFICIENT (Duplicates)", "EXCELLENT (Single-Flight)", "Duplicate calls eliminated; single-flight coalescing active. Ready."),
        ("Frontend Initial Loading", "SLOW (945 KB bundle)", "EXCELLENT (297 KB bundle)", "68.5% smaller download; 100/100 Lighthouse score. Ready for deployment."),
        ("Functional Integrity", "VALIDATED", "VALIDATED", "100% pass across all 19 functional modules. Zero regressions."),
        ("Authorization / Scoping", "UNTESTED AT SCALE", "VALIDATED & ENFORCED", "100% pass across 9 scenarios. Strict territorial boundary enforcement."),
        ("Concurrent Workflows", "CRITICAL (26.4 s at c=10)", "IMPROVED (7.57 s at c=10)", "71.3% faster; single-process limit reached. Requires worker clustering."),
        ("Production Infrastructure", "UNTESTED", "PENDING DEPLOYMENT", "Edge CDN, multi-node clustering, and cellular network tests pending.")
    ]
    for idx, row in enumerate(ra_data):
        for c_idx, val in enumerate(row):
            ra_table.cell(idx, c_idx).paragraphs[0].text = val
            if idx == 0:
                ra_table.cell(idx, c_idx).paragraphs[0].runs[0].bold = True
    style_table(ra_table)

    add_callout(
        doc,
        "BEFORE OPTIMIZATION VERDICT:\n"
        "CONDITIONALLY READY — Optimization required before higher-concurrency deployment.\n\n"
        "AFTER LOCAL OPTIMIZATION VERDICT:\n"
        "LOCAL PERFORMANCE OPTIMIZATION COMPLETED | FINAL VALIDATION PASSED\n\n"
        "REMAINING REQUIREMENT:\n"
        "PRODUCTION DEPLOYMENT PERFORMANCE VALIDATION REQUIRED",
        "DEDICATED MANAGEMENT VERDICT"
    )

    doc.add_page_break()

    # -------------------------------------------------------------
    # PAGE 16: RECOMMENDATIONS & CONCLUSION
    # -------------------------------------------------------------
    h1 = doc.add_heading(level=1)
    r = h1.add_run("15. Recommendations & 16. Conclusion")
    r.font.name = 'Calibri'
    r.font.color.rgb = RGBColor(30, 58, 138)
    
    doc.add_paragraph(
        "1. Formally Accept Local Optimization as Complete: Conclude local optimization activities. Algorithmic and code-level bottlenecks have been resolved with exceptional return on investment.\n"
        "2. Maintain Frozen Baseline: Use FINAL-LOCAL-POST-OPTIMIZATION-BASELINE.json as the permanent benchmark for future regression testing.\n"
        "3. Safely Retire Disposable Databases: The synthetic test databases (pnap_mis_o7_a through d) have fulfilled their validation mission and can be safely dropped to reclaim disk storage when convenient.\n"
        "4. Proceed to Staging Deployment: Deploy PNAP-MIS to the cloud staging environment and conduct production capacity testing with multi-process worker clustering."
    )

    h2 = doc.add_heading(level=2)
    h2.add_run("Final Management Conclusion")
    doc.add_paragraph(
        "The original PNAP-MIS performance assessment identified significant large-volume database, dashboard-processing, "
        "concurrency, and frontend-loading limitations. A controlled optimization program (Phases O1 through O10) was subsequently executed.\n\n"
        "Final local revalidation demonstrates substantial improvement across all dimensions while preserving functional behavior, "
        "authorization boundaries, and response correctness. The largest directly comparable 50,000-record backend measurements "
        "improved by approximately 84% to 92.5%, while initial frontend JavaScript was reduced by 68.5%.\n\n"
        "Final local validation has officially passed. The remaining performance work is deployment-dependent, encompassing production network "
        "behavior, cloud resource sizing, process worker clustering, database replica characteristics, and final production capacity validation."
    )

    add_callout(
        doc,
        "OPTIMIZATION PROGRAM: COMPLETED\n"
        "FINAL LOCAL REVALIDATION: PASSED\n"
        "FUNCTIONAL REGRESSION: NONE DETECTED\n"
        "AUTHORIZATION REGRESSION: NONE DETECTED\n"
        "RESPONSE EQUIVALENCE REGRESSION: NONE DETECTED\n"
        "AUTHORITATIVE LOCAL BASELINE: FROZEN\n"
        "NEXT STAGE: DEPLOYMENT PERFORMANCE VALIDATION",
        "FINAL LOCAL PERFORMANCE STATUS",
        border_color="0D9488",
        bg_color="F0FDFA"
    )

    doc.add_page_break()

    # -------------------------------------------------------------
    # PAGE 17: APPENDIX A: METRICS
    # -------------------------------------------------------------
    h1 = doc.add_heading(level=1)
    r = h1.add_run("Appendix A: Authoritative Metrics Tables")
    r.font.name = 'Calibri'
    r.font.color.rgb = RGBColor(30, 58, 138)
    
    doc.add_paragraph("Table A-1: 50k Database & Scalability Metrics (P95 in ms)")
    t1 = doc.add_table(rows=6, cols=5)
    d1 = [
        ("Metric Name", "Baseline (O7)", "Final (O10)", "Improvement", "Status"),
        ("Cold Organization Snapshot", "11,699.89 ms", "874.64 ms", "92.52% reduction", "Directly Comparable"),
        ("Basic Unit Officer Roster", "6,540.80 ms", "717.92 ms", "89.02% reduction", "Directly Comparable"),
        ("Area Officer Roster", "3,359.80 ms", "368.46 ms", "89.03% reduction", "Directly Comparable"),
        ("Group-3 Core Overview", "13,943.31 ms", "1,196.76 ms", "91.42% reduction", "Directly Comparable"),
        ("Staged Dashboard Completion", "12,980.36 ms", "2,013.97 ms", "84.48% reduction", "Directly Comparable")
    ]
    for idx, row in enumerate(d1):
        for c_idx, val in enumerate(row):
            t1.cell(idx, c_idx).paragraphs[0].text = val
            if idx == 0:
                t1.cell(idx, c_idx).paragraphs[0].runs[0].bold = True
    style_table(t1)

    doc.add_paragraph("Table A-2: Workflow Concurrency Scalability at 50k (P95 in ms)")
    t2 = doc.add_table(rows=5, cols=5)
    d2 = [
        ("Concurrency Level", "Baseline (O7)", "Final (O10)", "Improvement", "Status"),
        ("c = 1 Workflow", "11,186.44 ms", "1,863.64 ms", "83.34% reduction", "Directly Comparable"),
        ("c = 3 Workflows", "12,621.43 ms", "2,733.14 ms", "78.35% reduction", "Directly Comparable"),
        ("c = 5 Workflows", "16,495.44 ms", "4,102.37 ms", "75.13% reduction", "Directly Comparable"),
        ("c = 10 Workflows", "26,359.17 ms", "7,572.91 ms", "71.27% reduction", "Directly Comparable")
    ]
    for idx, row in enumerate(d2):
        for c_idx, val in enumerate(row):
            t2.cell(idx, c_idx).paragraphs[0].text = val
            if idx == 0:
                t2.cell(idx, c_idx).paragraphs[0].runs[0].bold = True
    style_table(t2)

    doc.add_page_break()

    # -------------------------------------------------------------
    # PAGE 18: APPENDIX B & C
    # -------------------------------------------------------------
    h1 = doc.add_heading(level=1)
    r = h1.add_run("Appendix B: Phase Summary & Appendix C: Provenance")
    r.font.name = 'Calibri'
    r.font.color.rgb = RGBColor(30, 58, 138)
    
    doc.add_paragraph(
        "All comparisons in this report adhere to strict data-integrity provenance rules:\n"
        "• Directly Comparable: Workloads where data volume, server hardware, measurement harness, and execution protocol were identical between Phase O7/O9 baselines and Phase O10 revalidation. Valid for all percentage improvement claims.\n"
        "• Directionally Comparable: Historical pre-optimization observations from exploratory manual testing that used differing network conditions or dev server states (e.g. initial Lighthouse 72 vs production 100). Preserved as qualitative observations without direct arithmetic percentage claims.\n"
        "• Not Comparable: Any metric where methodology or parameters diverged significantly. Strictly excluded from before-and-after tables."
    )

    doc.save(docx_path)
    print(f"DOCX successfully generated: {docx_path}")

if __name__ == '__main__':
    build_docx()
