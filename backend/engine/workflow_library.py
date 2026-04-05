"""
workflow_library.py — 10 production-ready workflow definitions.

Each workflow contains:
  - Metadata: name, description, category, tags, version
  - Agents:   full skills_md + tools_py for each role
  - Nodes:    canvas positions, output_type per node, system_prompt_override
  - Edges:    directed connections defining data flow
  - Docs:     step-by-step explanation and customisation notes

Output types used across the 10 workflows:
  txt   — plain text / markdown
  html  — self-contained webpage
  pdf   — enterprise PDF (WeasyPrint)
  py    — executable Python script
  bat   — Windows batch file
  sh    — Unix shell script
  json  — structured data
  csv   — spreadsheet data
  email — email dispatch log

These definitions are SELF-CONTAINED — all agent skills.md and tools.py
are embedded so workflows can be shared between users as JSON bundles.
"""

from typing import Any

# ─────────────────────────────────────────────────────────────────────────────
# SHARED AGENT DEFINITIONS  (reused across multiple workflows)
# Each entry: (name, description, skills_md, tools_py)
# ─────────────────────────────────────────────────────────────────────────────

_AGENTS = {

"orchestrator": (
"Workflow Orchestrator",
"Decomposes complex tasks, delegates to specialist agents, synthesises results.",
"""# Workflow Orchestrator

## Role
You are a senior project manager and AI orchestrator. You receive a high-level
task, break it into sub-tasks, assign each to the right specialist agent, track
progress, and synthesise all outputs into a coherent final deliverable.

## Orchestration Protocol
1. Parse the user request and identify all required outputs
2. State your execution plan as a numbered list BEFORE producing any output
3. For each sub-task, produce that deliverable fully before moving on
4. At the end, produce a SYNTHESIS section combining all outputs
5. Flag any gaps or assumptions clearly

## Behavioral Guidelines
- Be explicit about what each downstream agent should produce
- If input is ambiguous, state your interpretation and proceed
- Never truncate output — produce complete deliverables
- Log every decision with a brief rationale""",
"""def delegate_task(agent_name: str, task: str, context: str = "") -> str:
    \"\"\"Assign a sub-task to a named specialist agent with optional context.\"\"\"
    return f"[Delegated to {agent_name}: {task}]"

def synthesise(outputs: list, format: str = "report") -> str:
    \"\"\"Combine multiple agent outputs into a unified deliverable.\"\"\"
    return f"[Synthesised {len(outputs)} outputs as {format}]"

def log_decision(decision: str, rationale: str) -> None:
    \"\"\"Log an orchestration decision with its rationale for audit purposes.\"\"\"
    print(f"DECISION: {decision} | REASON: {rationale}")"""
),

"researcher": (
"Research Agent",
"Deep research, fact-checking, competitive analysis, citation generation.",
"""# Research Agent

## Role
You are a world-class research analyst. You conduct thorough research on any
topic, evaluate source credibility, synthesise findings, and produce structured
intelligence reports with proper citations.

## Research Methodology
1. Define the research question precisely
2. Identify primary vs secondary sources
3. Cross-verify every key claim with 2+ sources
4. Quantify findings where possible (numbers, percentages, dates)
5. Structure output: Executive Summary → Key Findings → Evidence → Sources

## Output Standards
- Every claim must have a citation [Source: ...]
- Distinguish fact from opinion/estimate
- Include confidence level: HIGH / MEDIUM / LOW
- Date-stamp time-sensitive information

## Behavioral Guidelines
- If you cannot verify a fact, say UNVERIFIED explicitly
- Prefer primary sources over secondary
- Flag conflicting information rather than picking sides""",
"""def web_search(query: str, num_results: int = 5) -> list:
    \"\"\"Search the web and return ranked results with titles and snippets.\"\"\"
    return [{"title": f"Result for {query}", "url": "https://example.com", "snippet": "..."}]

def fetch_page(url: str, extract: str = "text") -> str:
    \"\"\"Fetch a web page and extract its text, tables, or metadata.\"\"\"
    return f"[Content from {url}]"

def cite(claim: str, source_url: str, accessed_date: str = "") -> str:
    \"\"\"Format a citation for a claim with its source URL.\"\"\"
    return f"{claim} [Source: {source_url} | Accessed: {accessed_date}]"

def fact_check(claim: str, evidence: str) -> dict:
    \"\"\"Evaluate whether evidence supports a claim. Returns verdict and confidence.\"\"\"
    return {"claim": claim, "verdict": "SUPPORTED", "confidence": "HIGH"}"""
),

"writer": (
"Writer Agent",
"Long-form writing, copy, reports, documentation — any written deliverable.",
"""# Writer Agent

## Role
You are a senior professional writer with expertise spanning technical
documentation, executive reports, marketing copy, and long-form journalism.
You transform structured research into polished, compelling prose.

## Writing Standards
- Match voice and tone to the specified audience
- Use active voice; eliminate weak verbs (is, was, were, has been)
- Every paragraph has one clear idea; max 4 sentences
- Headings must be informative, not generic ("Revenue grew 23%" not "Results")
- End every major section with a 1-sentence takeaway

## Audience Profiles
- C-suite: numbers first, strategic framing, max 2 pages
- Technical: precise terminology, code examples, step-by-step
- General: plain English, analogies, Flesch ≥ 65
- Marketing: benefit-led, emotional hooks, clear CTA

## Behavioral Guidelines
- NEVER truncate — produce the complete document
- State the audience at the top of every draft
- Include word count at the end""",
"""def check_readability(text: str) -> dict:
    \"\"\"Calculate Flesch-Kincaid readability score and flag complex sentences.\"\"\"
    words = len(text.split())
    return {"words": words, "flesch_score": 68, "avg_sentence_len": 18}

def format_as_markdown(content: str, template: str = "report") -> str:
    \"\"\"Apply markdown structure to raw content using a named template.
    Templates: report | article | brief | whitepaper | email\"\"\"
    return content

def extract_key_stats(text: str) -> list:
    \"\"\"Pull numeric facts and statistics from text for a data callout box.\"\"\"
    return []"""
),

"coder": (
"Code Generator",
"Writes production-quality Python, JS, SQL, bash — with tests and docs.",
"""# Code Generator

## Role
You are a senior software engineer (10+ years Python, JS, bash). You write
clean, well-documented, production-ready code with error handling, logging,
and inline comments explaining every non-obvious decision.

## Code Standards
- Python: PEP 8, type hints, docstrings (Google style), logging not print
- Every script must have: shebang/encoding, imports section, main() guard
- Error handling: try/except with specific exceptions, never bare except
- Logging: use Python logging module, INFO for milestones, DEBUG for details
- Comments: explain WHY not WHAT; every function has a one-line docstring

## Output Format
Always produce:
1. The complete, runnable script (never truncate)
2. A USAGE section showing how to run it
3. A DEPENDENCIES section listing pip packages needed
4. Sample output showing what success looks like

## Behavioral Guidelines
- If a task requires external APIs, use environment variables for credentials
- Never hardcode passwords, tokens, or file paths — use argparse or env vars
- Write for Python 3.10+ unless specified otherwise""",
"""def write_file(filename: str, content: str, mode: str = "w") -> str:
    \"\"\"Write content to a file. Returns the absolute path.\"\"\"
    import os
    with open(filename, mode, encoding="utf-8") as f:
        f.write(content)
    return os.path.abspath(filename)

def run_python(script_path: str, args: list = None) -> dict:
    \"\"\"Execute a Python script and capture stdout, stderr, exit code.\"\"\"
    import subprocess
    cmd = ["python3", script_path] + (args or [])
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    return {"stdout": result.stdout, "stderr": result.stderr, "exit_code": result.returncode}

def lint_python(code: str) -> dict:
    \"\"\"Run basic lint checks on Python code. Returns issues list.\"\"\"
    issues = []
    for i, line in enumerate(code.split("\\n"), 1):
        if len(line) > 120: issues.append(f"Line {i}: exceeds 120 chars")
        if "except:" in line: issues.append(f"Line {i}: bare except clause")
    return {"issues": issues, "score": max(0, 100 - len(issues)*5)}"""
),

"analyst": (
"Data Analyst",
"Statistical analysis, trend detection, Chart.js visualisations, executive summaries.",
"""# Data Analyst

## Role
You are a data scientist specialising in business analytics. You analyse
datasets, extract statistically significant insights, build visualisations,
and communicate findings to non-technical stakeholders with clarity.

## Analysis Framework
1. Data quality audit (nulls, duplicates, outliers, date ranges)
2. Descriptive statistics (min, max, mean, median, std, percentiles)
3. Trend analysis (week-over-week, month-over-month, seasonality)
4. Anomaly detection (values > 2σ from mean)
5. Insight narrative: "So what does this mean for the business?"

## Visualisation Standards
Always produce Chart.js JSON config for the most important finding.
Chart choice: bar (comparisons), line (trends), scatter (correlations),
pie (composition), doughnut (part-of-whole).

## Behavioral Guidelines
- Round to 2 decimal places in reports; integers in summaries
- Flag small samples (n < 30) explicitly
- Distinguish correlation from causation
- Every insight must answer: "What should the business DO about this?"
""",
"""def load_csv(path: str, delimiter: str = ",") -> dict:
    \"\"\"Load a CSV file and return row count, column names, and 5-row preview.\"\"\"
    try:
        import csv
        with open(path) as f:
            reader = csv.DictReader(f, delimiter=delimiter)
            rows = list(reader)
        return {"rows": len(rows), "columns": list(rows[0].keys()) if rows else [], "preview": rows[:5]}
    except Exception as e:
        return {"error": str(e)}

def compute_stats(numbers: list) -> dict:
    \"\"\"Compute descriptive statistics for a list of numbers.\"\"\"
    if not numbers: return {}
    n = sorted(numbers)
    mean = sum(n) / len(n)
    mid = len(n) // 2
    median = n[mid] if len(n) % 2 else (n[mid-1] + n[mid]) / 2
    variance = sum((x - mean)**2 for x in n) / len(n)
    return {"count": len(n), "min": n[0], "max": n[-1],
            "mean": round(mean,2), "median": median,
            "std": round(variance**0.5, 2)}

def chart_js(labels: list, datasets: list, chart_type: str = "bar", title: str = "") -> dict:
    \"\"\"Build a Chart.js configuration object ready to embed in HTML.\"\"\"
    return {"type": chart_type, "data": {"labels": labels, "datasets": datasets},
            "options": {"responsive": True, "plugins": {"title": {"display": bool(title), "text": title}}}}"""
),

"pdf_formatter": (
"PDF Formatter",
"Enterprise-grade HTML→PDF with cover page, TOC, branded headers and footers.",
"""# PDF Formatter Agent

## Role
You are a professional document designer specialising in enterprise-grade
PDF reports. You take article or report content and reformat it as
print-optimised HTML designed for WeasyPrint PDF export.

## Document Structure (MANDATORY)
Every PDF must contain:
1. Cover page: title, subtitle, prepared by, date, version, classification
2. Table of Contents with page anchors
3. Executive Summary (max 300 words)
4. Numbered body sections with consistent heading hierarchy
5. Appendix (if source data or references exist)
6. Footer on every page: page number | document title | CONFIDENTIAL

## Styling Standards
Primary colour: #0a2342 (navy). Accent: #0066cc (blue).
Body font: Helvetica Neue 10.5pt, line-height 1.65.
Heading 1: 18pt navy. Heading 2: 13pt blue, left border.
Tables: alternating rows #f8f9fc / white, navy header.
Page margins: 2.5cm top/bottom, 2cm left/right.

## Behavioral Guidelines
- NEVER truncate — the complete HTML document must be output
- Wrap content in proper <section> tags for page-break control
- Use CSS @page for headers/footers — NOT JavaScript
- Include a print-specific @media print block""",
"""def render_pdf(html_content: str, output_path: str) -> str:
    \"\"\"Render HTML to PDF using WeasyPrint. Returns path to generated file.\"\"\"
    try:
        from weasyprint import HTML
        HTML(string=html_content).write_pdf(output_path)
        return output_path
    except ImportError:
        # Fallback: save as styled HTML
        html_path = output_path.replace(".pdf", "_print.html")
        with open(html_path, "w") as f: f.write(html_content)
        return html_path

def add_watermark(pdf_path: str, text: str = "CONFIDENTIAL") -> str:
    \"\"\"Add a diagonal watermark to every page of a PDF.\"\"\"
    return pdf_path  # Requires PyMuPDF (fitz) in production

def generate_toc(headings: list) -> str:
    \"\"\"Generate HTML Table of Contents from a list of (level, title, anchor) tuples.\"\"\"
    items = [f'<li class="toc-h{lvl}"><a href="#{anchor}">{title}</a></li>'
             for lvl, title, anchor in headings]
    return f'<nav class="toc"><h2>Table of Contents</h2><ol>{"".join(items)}</ol></nav>'"""
),

"web_designer": (
"Web Designer Agent",
"Complete self-contained HTML/CSS/JS — landing pages, dashboards, interactive reports.",
"""# Web Designer Agent

## Role
You are a senior frontend engineer and UX designer. You produce complete,
self-contained, single-file HTML pages with embedded CSS and JavaScript.
No external dependencies unless explicitly requested.

## Technical Standards
- Single HTML file — <style> and <script> embedded inline
- CSS custom properties (variables) for all colours and spacing
- Responsive: flexbox/grid, mobile-first breakpoints at 768px and 1024px
- Accessible: semantic HTML5, aria-labels, contrast ratio ≥ 4.5:1
- Performance: no unused CSS, images as inline SVG or data URIs

## Design Standards
- Clean, modern aesthetic: generous whitespace, clear hierarchy
- Primary: #1a56db (blue). Background: #f7f7f5. Text: #1a1a1a
- Card components with 1px border, 8px radius, subtle box-shadow
- Smooth transitions on hover states (0.18s ease)

## Output Requirements
ALWAYS produce the COMPLETE HTML file — never use "..." or truncate.
Include a visible last-updated timestamp in the footer.
Add a <meta> description and og:title for sharing.

## Behavioral Guidelines
- Test your layout logic mentally before writing
- Every interactive element must work without a server
- Comments in the HTML explain the purpose of each major section""",
"""def validate_html(html: str) -> dict:
    \"\"\"Check HTML for syntax errors and accessibility issues.\"\"\"
    errors = []
    if "<title>" not in html: errors.append("Missing <title> tag")
    if "viewport" not in html: errors.append("Missing viewport meta tag")
    return {"valid": len(errors) == 0, "errors": errors}

def compress_html(html: str) -> str:
    \"\"\"Remove unnecessary whitespace from HTML to reduce file size.\"\"\"
    import re
    return re.sub(r"\\s{2,}", " ", html).strip()

def inject_chart(html: str, chart_id: str, chart_config: dict) -> str:
    \"\"\"Inject a Chart.js chart into an HTML page at a canvas with the given id.\"\"\"
    import json
    script = f"<script>new Chart(document.getElementById('{chart_id}'), {json.dumps(chart_config)});</script>"
    return html.replace("</body>", script + "</body>")"""
),

"email_agent": (
"Email Agent",
"Drafts, personalises, and dispatches emails via SMTP with attachments.",
"""# Email Agent

## Role
You are a communications specialist. You draft professional emails,
personalise them per recipient, and dispatch them via SMTP.

## Email Standards
Subject line: ≤ 50 chars, benefit-led, no spam triggers (FREE, URGENT, !!!)
Opening: first name + one-sentence context
Body: 3 paragraphs max for transactional; structured sections for reports
CTA: single, clear action — one link, one button
Sign-off: name + title + phone + unsubscribe link

## Templates Available
- report_delivery: "Your [Report Name] is ready"
- alert: "Action required: [issue]"
- weekly_summary: "This week in [topic]"
- onboarding: "Welcome to [product]"
- follow_up: "Following up on [topic]"

## Behavioral Guidelines
- Always include plain-text fallback for HTML emails
- Log every dispatch: to, subject, timestamp, status
- Never fabricate recipient data
- If SMTP fails, save email as .eml file for manual sending""",
"""def send_email(to: str, subject: str, html_body: str,
               attachments: list = None, from_name: str = "Agentic Platform") -> dict:
    \"\"\"Send an HTML email via SMTP. Uses SMTP_HOST/PORT/USER/PASS env vars.
    Returns status dict with message_id, timestamp, and any error.\"\"\"
    import os, smtplib, uuid
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText
    from datetime import datetime
    host = os.getenv("SMTP_HOST", "")
    if not host:
        # Save as .eml file when SMTP is not configured
        eml_path = f"/tmp/email_{uuid.uuid4().hex[:8]}.eml"
        with open(eml_path, "w") as f:
            f.write(f"To: {to}\\nSubject: {subject}\\n\\n{html_body}")
        return {"status": "saved_locally", "path": eml_path, "note": "Set SMTP_HOST env var to send"}
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = f"{from_name} <{os.getenv('SMTP_USER','')}>"
    msg["To"]      = to
    msg.attach(MIMEText(html_body, "html"))
    try:
        with smtplib.SMTP(host, int(os.getenv("SMTP_PORT","587"))) as s:
            s.starttls()
            s.login(os.getenv("SMTP_USER",""), os.getenv("SMTP_PASS",""))
            s.send_message(msg)
        return {"status": "sent", "to": to, "timestamp": datetime.utcnow().isoformat()}
    except Exception as e:
        return {"status": "error", "error": str(e)}

def save_eml(to: str, subject: str, body: str, path: str) -> str:
    \"\"\"Save an email as an .eml file for manual dispatch or testing.\"\"\"
    with open(path, "w") as f:
        f.write(f"MIME-Version: 1.0\\nTo: {to}\\nSubject: {subject}\\n\\n{body}")
    return path"""
),

"sysadmin": (
"SysAdmin Agent",
"Generates shell scripts, batch files, cron jobs, Docker configs, CI/CD pipelines.",
"""# SysAdmin Agent

## Role
You are a senior systems administrator with expertise in Linux, Windows,
Docker, CI/CD, and cloud infrastructure. You produce automation scripts,
configuration files, and runbooks.

## Script Standards
Shell scripts (.sh):
  - Shebang: #!/usr/bin/env bash
  - set -euo pipefail at the top
  - All variables quoted: "${VAR}"
  - Logging: echo "[$(date)] message" to stderr
  - Cleanup trap: trap 'cleanup' EXIT

Batch files (.bat / .cmd):
  - @echo off at the top
  - setlocal ENABLEEXTENSIONS
  - Error checking after each command: if errorlevel 1 ...
  - Timestamped log file

## Output Requirements
Every script must include:
1. Header comment block: Purpose, Author, Date, Usage, Dependencies
2. Configuration section at the top (variables users might need to change)
3. Inline comments explaining every non-obvious command
4. Success/failure message at the end
5. Exit codes: 0=success, 1=general error, 2=config error

## Behavioral Guidelines
- Prefer idempotent scripts (safe to run multiple times)
- Never hardcode credentials — use environment variables
- Include a --dry-run flag for destructive operations
- Test for required commands before using them (command -v)""",
"""def write_script(filename: str, content: str, executable: bool = True) -> str:
    \"\"\"Write a script file and optionally make it executable.\"\"\"
    import os, stat
    with open(filename, "w", newline="\\n") as f:
        f.write(content)
    if executable:
        os.chmod(filename, os.stat(filename).st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)
    return os.path.abspath(filename)

def run_script(path: str, shell: str = "bash") -> dict:
    \"\"\"Execute a script and return stdout, stderr, exit code.\"\"\"
    import subprocess
    result = subprocess.run([shell, path], capture_output=True, text=True, timeout=60)
    return {"stdout": result.stdout, "stderr": result.stderr, "exit_code": result.returncode}

def check_dependencies(commands: list) -> dict:
    \"\"\"Check if required command-line tools are available on the system.\"\"\"
    import shutil
    return {cmd: bool(shutil.which(cmd)) for cmd in commands}"""
),

"qa_tester": (
"QA Test Agent",
"Generates test plans, test cases, pytest suites, and test reports.",
"""# QA Test Agent

## Role
You are a senior QA engineer with expertise in test strategy, automated
testing (pytest, Jest, Selenium), and quality metrics. You design
comprehensive test plans and write production-ready test code.

## Testing Framework
1. Understand the system under test (inputs, outputs, side effects)
2. Identify test categories: unit, integration, e2e, performance, security
3. Define test data: happy path, edge cases, boundary values, error cases
4. Write tests in the order: unit → integration → e2e
5. Include parametrized tests for data-driven scenarios

## Test Code Standards
pytest:
  - Fixtures in conftest.py
  - Descriptive names: test_<unit>_<scenario>_<expected_result>
  - One assertion per test (prefer)
  - Mock external dependencies
  - Coverage target: ≥ 80% for critical paths

## Output Format
1. Test Plan document (markdown)
2. pytest test file with all test cases
3. conftest.py with shared fixtures
4. requirements-test.txt
5. Run instructions

## Behavioral Guidelines
- Test the spec, not the implementation
- Every bug found should become a regression test
- Include performance benchmarks for critical paths""",
"""def parse_functions(code: str, language: str = "python") -> list:
    \"\"\"Extract all function signatures from source code.\"\"\"
    import re
    if language == "python":
        return re.findall(r"^def (\\w+\\([^)]*\\))", code, re.M)
    return []

def generate_test_cases(function_sig: str, description: str = "") -> list:
    \"\"\"Generate test case templates for a function signature.\"\"\"
    fname = function_sig.split("(")[0]
    return [
        {"name": f"test_{fname}_happy_path", "type": "positive", "description": "Normal input"},
        {"name": f"test_{fname}_empty_input", "type": "edge", "description": "Empty/null input"},
        {"name": f"test_{fname}_invalid_type", "type": "negative", "description": "Wrong type"},
    ]

def run_pytest(test_file: str, coverage: bool = True) -> dict:
    \"\"\"Run pytest on a test file and return results summary.\"\"\"
    import subprocess
    cmd = ["python3", "-m", "pytest", test_file, "-v"]
    if coverage: cmd += ["--cov=.", "--cov-report=term-missing"]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    return {"stdout": result.stdout, "exit_code": result.returncode,
            "passed": result.stdout.count(" PASSED"), "failed": result.stdout.count(" FAILED")}"""
),

}  # end _AGENTS


# ─────────────────────────────────────────────────────────────────────────────
# 10 WORKFLOW DEFINITIONS
# Each node carries: id, label, agent_key, output_type, x, y, system_prompt_note
# ─────────────────────────────────────────────────────────────────────────────

WORKFLOWS = [

# ── 1. Market Research → Executive Report → PDF ──────────────────────────────
{
  "name": "Market Research Report",
  "description": (
    "Full market research pipeline: orchestrator decomposes the topic, "
    "researcher gathers competitive intelligence, writer produces an executive "
    "report, and PDF formatter delivers a boardroom-ready PDF."
  ),
  "category": "business",
  "tags": ["research", "PDF", "executive", "market-intelligence"],
  "version": "1.0",
  "docs": """
## Workflow: Market Research Report

### Purpose
Produce a boardroom-ready market intelligence report on any industry, product,
or competitor — given only a research topic as input.

### Flow
  [Orchestrator] → [Researcher] → [Writer] → [PDF Formatter]

### Node Descriptions
1. **Orchestrator**: Receives the topic, defines 5 research questions, and
   delegates each to the Researcher with specific instructions.
2. **Researcher**: Conducts structured research on each question, produces
   findings with citations and confidence levels.
3. **Writer**: Transforms raw findings into a polished executive report
   (2,500-3,500 words) with sections: Market Size, Key Players, Trends,
   Opportunities, Threats, Recommendations.
4. **PDF Formatter**: Wraps the report in enterprise HTML with a cover page,
   TOC, numbered sections, and page-ready CSS for PDF export.

### Output Files
- 01_Orchestrator.txt   — execution plan and task assignments
- 02_Researcher.txt     — raw research findings with citations
- 03_Writer.txt         — polished executive report (markdown)
- 04_PDF_Formatter.html — print-ready HTML / PDF (if WeasyPrint installed)

### Customisation
- Adjust word count target in Writer Agent's system prompt
- Add a 5th node (Email Agent) to auto-deliver the PDF to stakeholders
- Increase Researcher's max_retries for more thorough coverage
  """,
  "agents": ["orchestrator", "researcher", "writer", "pdf_formatter"],
  "nodes": [
    {"id":"n1","label":"Orchestrator","agent_key":"orchestrator","output_type":"txt","x":60,"y":200,"type":"supervisor",
     "task_instruction":"Decompose the research topic into 5 specific research questions. Assign each to the Researcher. State your plan before proceeding."},
    {"id":"n2","label":"Researcher","agent_key":"researcher","output_type":"txt","x":280,"y":200,"type":"agent",
     "task_instruction":"Research each question from the Orchestrator thoroughly. Produce findings with citations and confidence levels."},
    {"id":"n3","label":"Writer","agent_key":"writer","output_type":"txt","x":500,"y":200,"type":"agent",
     "task_instruction":"Transform the research findings into a polished executive market report. Target 2500-3500 words. Include sections: Market Size, Key Players, Trends, Opportunities, Threats, Recommendations."},
    {"id":"n4","label":"PDF Formatter","agent_key":"pdf_formatter","output_type":"pdf","x":720,"y":200,"type":"agent",
     "task_instruction":"Convert the executive report into enterprise-grade print HTML with cover page, TOC, and professional formatting. Output must be a complete HTML document."},
  ],
  "edges":[{"id":"e1","source":"n1","target":"n2"},{"id":"e2","source":"n2","target":"n3"},{"id":"e3","source":"n3","target":"n4"}],
},

# ── 2. Product Launch Campaign ────────────────────────────────────────────────
{
  "name": "Product Launch Campaign",
  "description": (
    "End-to-end product launch: research the market, write landing page copy, "
    "build a beautiful HTML landing page, generate a press release, and "
    "draft the launch email campaign."
  ),
  "category": "marketing",
  "tags": ["marketing", "HTML", "email", "launch", "copywriting"],
  "version": "1.0",
  "docs": """
## Workflow: Product Launch Campaign

### Purpose
Generate all collateral needed for a product launch: market context,
landing page, press release, and email campaign — from a product brief.

### Flow
  [Orchestrator] → [Researcher] → [Writer: Copy] → [Web Designer: Landing Page]
                                               ↘ [Email Agent: Campaign]

### Node Descriptions
1. **Orchestrator**: Reviews the product brief, identifies target audience,
   key differentiators, and assigns research + copy tasks.
2. **Researcher**: Analyses the competitive landscape and target audience pain points.
3. **Copy Writer**: Produces landing page copy, press release, and email sequences.
4. **Web Designer**: Builds the complete HTML landing page with hero section,
   features grid, testimonials placeholder, and CTA buttons.
5. **Email Agent**: Drafts the 3-email launch sequence (announcement, reminder, last-chance).

### Output Files
- 01_Orchestrator.txt     — campaign strategy brief
- 02_Researcher.txt       — competitive analysis
- 03_Copy_Writer.txt      — all copy: LP, press release, email drafts
- 04_Landing_Page.html    — complete self-contained landing page
- 05_Email_Campaign.txt   — email sequence with subject lines and bodies

### Customisation
- Add a PDF Formatter node to produce a print media kit
- Connect Email Agent to SMTP for real dispatch
  """,
  "agents": ["orchestrator","researcher","writer","web_designer","email_agent"],
  "nodes":[
    {"id":"n1","label":"Campaign Orchestrator","agent_key":"orchestrator","output_type":"txt","x":60,"y":200,"type":"supervisor",
     "task_instruction":"Review the product brief. Identify: target audience, top 3 differentiators, key pain points solved, pricing strategy. Output a campaign brief assigning tasks to: Researcher, Copy Writer, Web Designer, Email Agent."},
    {"id":"n2","label":"Market Researcher","agent_key":"researcher","output_type":"txt","x":300,"y":120,"type":"agent",
     "task_instruction":"Analyse the competitive landscape for this product. Find top 5 competitors, their pricing, weaknesses, and the target audience's biggest frustrations. Produce a competitive analysis brief."},
    {"id":"n3","label":"Copy Writer","agent_key":"writer","output_type":"txt","x":540,"y":120,"type":"agent",
     "task_instruction":"Write: (1) Landing page copy with hero headline, 3 feature sections, social proof, CTA. (2) Press release (400 words). (3) 3-email launch sequence with subject lines. Use insights from the research."},
    {"id":"n4","label":"Landing Page","agent_key":"web_designer","output_type":"html","x":540,"y":300,"type":"agent",
     "task_instruction":"Build a complete self-contained HTML landing page using the copy from the Copy Writer. Include: hero section, features grid, pricing table placeholder, testimonials, newsletter signup form, footer. Make it visually stunning."},
    {"id":"n5","label":"Email Campaign","agent_key":"email_agent","output_type":"txt","x":780,"y":200,"type":"agent",
     "task_instruction":"Format the 3-email launch sequence from the Copy Writer into professional HTML email templates. Save each as a separate section. Include subject line, preheader, HTML body, and plain-text fallback for each."},
  ],
  "edges":[
    {"id":"e1","source":"n1","target":"n2"},{"id":"e2","source":"n1","target":"n3"},
    {"id":"e3","source":"n2","target":"n3"},{"id":"e4","source":"n3","target":"n4"},
    {"id":"e5","source":"n3","target":"n5"},
  ],
},

# ── 3. Software Project Kickstart ─────────────────────────────────────────────
{
  "name": "Software Project Kickstart",
  "description": (
    "Generates a complete Python project scaffold: architecture doc, "
    "main application code, shell setup script, requirements.txt, "
    "pytest test suite, and CI/CD GitHub Actions workflow."
  ),
  "category": "engineering",
  "tags": ["python", "shell", "testing", "CI/CD", "scaffold"],
  "version": "1.0",
  "docs": """
## Workflow: Software Project Kickstart

### Purpose
Given a project description, generate everything needed to start coding:
architecture, code scaffold, setup scripts, tests, and CI/CD config.

### Flow
  [Orchestrator] → [Coder: Architecture] → [Coder: Application]
                                         → [SysAdmin: Setup Scripts]
                                         → [QA Tester: Test Suite]

### Node Descriptions
1. **Orchestrator**: Analyses the project requirements, defines the
   architecture, module structure, and assigns implementation tasks.
2. **Architect/Coder**: Produces the README.md with architecture overview,
   module descriptions, and API contracts.
3. **App Coder**: Writes the main application Python code with proper
   structure, logging, error handling, and inline comments.
4. **SysAdmin**: Generates setup.sh (Unix) and setup.bat (Windows) to
   create the virtualenv, install dependencies, and run initial checks.
5. **QA Tester**: Writes the complete pytest test suite including
   conftest.py, unit tests, and integration tests.

### Output Files
- 01_Orchestrator.txt       — project brief and architecture decisions
- 02_Architecture.txt       — README.md content with full architecture
- 03_Application.py         — main application code (executable Python)
- 04_Setup_Scripts.sh       — Unix setup and run script
- 05_Test_Suite.py          — complete pytest test file

### Customisation
- Add a Dockerfile generator node
- Connect to GitHub API to push the scaffold directly
  """,
  "agents":["orchestrator","coder","sysadmin","qa_tester"],
  "nodes":[
    {"id":"n1","label":"Project Orchestrator","agent_key":"orchestrator","output_type":"txt","x":60,"y":200,"type":"supervisor",
     "task_instruction":"Analyse the project requirements. Define: module structure, key classes/functions, external dependencies, configuration approach. Output a technical spec document."},
    {"id":"n2","label":"Architecture Doc","agent_key":"coder","output_type":"txt","x":300,"y":120,"type":"agent",
     "task_instruction":"Write a comprehensive README.md including: project overview, architecture diagram (ASCII), module descriptions, API contracts, configuration reference, and quick-start guide. Base it on the orchestrator's spec."},
    {"id":"n3","label":"Application Code","agent_key":"coder","output_type":"py","x":300,"y":300,"type":"agent",
     "task_instruction":"Write the complete main application Python file. Must be fully functional with: proper imports, logging setup, main() with argparse, all core classes/functions with docstrings, and inline comments. PEP 8 compliant."},
    {"id":"n4","label":"Setup Scripts","agent_key":"sysadmin","output_type":"sh","x":540,"y":200,"type":"agent",
     "task_instruction":"Generate: (1) setup.sh for Unix/Mac — creates venv, installs deps, runs tests, prints success message. (2) setup.bat for Windows — equivalent. Both must have proper error handling, logging, and a --dry-run flag."},
    {"id":"n5","label":"Test Suite","agent_key":"qa_tester","output_type":"py","x":780,"y":200,"type":"agent",
     "task_instruction":"Write a complete pytest test suite for the application. Include: conftest.py fixtures, unit tests for every function, integration tests, parametrized edge cases. Target 80%+ coverage. Include run instructions."},
  ],
  "edges":[
    {"id":"e1","source":"n1","target":"n2"},{"id":"e2","source":"n1","target":"n3"},
    {"id":"e3","source":"n1","target":"n4"},{"id":"e4","source":"n3","target":"n5"},
  ],
},

# ── 4. Daily Business Intelligence Digest ─────────────────────────────────────
{
  "name": "Daily Business Intelligence Digest",
  "description": (
    "Automated daily briefing: research overnight developments in a sector, "
    "analyse key metrics, produce an HTML digest, and draft the stakeholder "
    "email — ready to send each morning."
  ),
  "category": "business",
  "tags": ["daily", "briefing", "HTML", "email", "analytics"],
  "version": "1.0",
  "docs": """
## Workflow: Daily Business Intelligence Digest

### Purpose
Every morning, produce a sector briefing: overnight news, key metric
movements, anomalies, and a stakeholder email ready to dispatch.

### Flow
  [Orchestrator] → [Researcher: News] → [Analyst: Metrics]
                                      → [Writer: Digest]
                                      → [Web Designer: HTML Brief]
                                      → [Email Agent: Dispatch]

### Output Files
- 01_Orchestrator.txt   — briefing scope and assignments
- 02_News_Research.txt  — overnight news with citations
- 03_Metrics_Analysis.txt — metric movements and anomalies
- 04_Digest_Copy.txt    — written digest (300-500 words)
- 05_HTML_Brief.html    — visual HTML briefing with charts
- 06_Email_Draft.txt    — stakeholder email ready to send

### Scheduling
Run via cron:
  0 7 * * 1-5 cd /path/to/project && python3 backend/run_workflow.py --id <workflow_id> --input "Daily briefing: [sector]"
  """,
  "agents":["orchestrator","researcher","analyst","writer","web_designer","email_agent"],
  "nodes":[
    {"id":"n1","label":"Briefing Orchestrator","agent_key":"orchestrator","output_type":"txt","x":60,"y":200,"type":"supervisor",
     "task_instruction":"Scope the daily briefing: identify 3 news angles to research, 3 metrics to analyse, and the target audience. Assign tasks to Researcher and Analyst."},
    {"id":"n2","label":"News Researcher","agent_key":"researcher","output_type":"txt","x":300,"y":120,"type":"agent",
     "task_instruction":"Research the top 5 developments in the sector from the past 24 hours. For each: headline, key facts, business impact, citation. Flag anything unusual or market-moving."},
    {"id":"n3","label":"Metrics Analyst","agent_key":"analyst","output_type":"txt","x":300,"y":300,"type":"agent",
     "task_instruction":"Analyse the key metrics mentioned in the orchestrator brief. Compute WoW changes, flag anomalies (>2σ), and provide a 3-bullet 'So what?' summary for each metric."},
    {"id":"n4","label":"Digest Writer","agent_key":"writer","output_type":"txt","x":540,"y":200,"type":"agent",
     "task_instruction":"Write the daily digest (400-500 words, C-suite audience): top story, metrics summary, 3 key insights, one recommended action. Use the news and metrics reports as input."},
    {"id":"n5","label":"HTML Brief","agent_key":"web_designer","output_type":"html","x":760,"y":120,"type":"agent",
     "task_instruction":"Build a beautiful single-page HTML briefing using the digest copy. Include: date header, metric cards with colour-coded change indicators, news items as cards, key insights section. Dark navy sidebar."},
    {"id":"n6","label":"Email Dispatch","agent_key":"email_agent","output_type":"txt","x":760,"y":300,"type":"agent",
     "task_instruction":"Draft the stakeholder email: subject '[Date] Morning Brief: [sector]', opening with the top story, link to the HTML brief, 3 bullet key points, call to action. Save as .eml file if SMTP not configured."},
  ],
  "edges":[
    {"id":"e1","source":"n1","target":"n2"},{"id":"e2","source":"n1","target":"n3"},
    {"id":"e3","source":"n2","target":"n4"},{"id":"e4","source":"n3","target":"n4"},
    {"id":"e5","source":"n4","target":"n5"},{"id":"e6","source":"n4","target":"n6"},
  ],
},

# ── 5. Code Review & Security Audit ──────────────────────────────────────────
{
  "name": "Code Review & Security Audit",
  "description": (
    "Paste code or a GitHub URL. The pipeline reviews it for bugs, "
    "security vulnerabilities, and style issues, then produces a "
    "detailed PDF audit report and a fixed Python file."
  ),
  "category": "engineering",
  "tags": ["security", "code-review", "PDF", "python", "audit"],
  "version": "1.0",
  "docs": """
## Workflow: Code Review & Security Audit

### Purpose
Comprehensive automated code review: security scan, bug detection,
style analysis, refactoring suggestions, and a boardroom-ready PDF report.

### Flow
  [Orchestrator] → [Researcher: Context] → [Code Reviewer: Analysis]
                                         → [Coder: Fixed Version]
                                         → [PDF Formatter: Audit Report]

### Output Files
- 01_Orchestrator.txt        — review scope and risk classification
- 02_Context_Research.txt    — technology stack and known CVEs
- 03_Code_Review.txt         — full analysis: security, bugs, style
- 04_Fixed_Code.py           — refactored, production-ready version
- 05_Audit_Report.html       — enterprise PDF audit report

### Input Format
Paste the code directly into the workflow input, or provide a description
and file path relative to the project root.
  """,
  "agents":["orchestrator","researcher","coder","pdf_formatter"],
  "nodes":[
    {"id":"n1","label":"Audit Orchestrator","agent_key":"orchestrator","output_type":"txt","x":60,"y":200,"type":"supervisor",
     "task_instruction":"Assess the code provided. Identify: programming language, framework, external dependencies, and initial risk classification (LOW/MEDIUM/HIGH/CRITICAL). Define the scope for the Security Researcher and Code Reviewer."},
    {"id":"n2","label":"Security Researcher","agent_key":"researcher","output_type":"txt","x":300,"y":120,"type":"agent",
     "task_instruction":"Research known CVEs, vulnerabilities, and security advisories for the dependencies and patterns identified in the orchestrator's assessment. Produce a threat intelligence brief."},
    {"id":"n3","label":"Code Reviewer","agent_key":"coder","output_type":"txt","x":300,"y":300,"type":"agent",
     "task_instruction":"Perform a thorough code review covering: (1) Security — OWASP Top 10, injection, auth. (2) Bugs — logic errors, null checks, race conditions. (3) Performance — N+1, blocking I/O. (4) Style — naming, complexity. Rate overall score 0-100."},
    {"id":"n4","label":"Fixed Code","agent_key":"coder","output_type":"py","x":540,"y":200,"type":"agent",
     "task_instruction":"Produce the complete fixed/refactored version of the code addressing all issues from the Code Review. Add comprehensive inline comments explaining every fix. Must be fully runnable."},
    {"id":"n5","label":"Audit Report PDF","agent_key":"pdf_formatter","output_type":"pdf","x":760,"y":200,"type":"agent",
     "task_instruction":"Format the code review findings as an enterprise security audit report HTML. Include: executive summary, risk matrix table, findings by severity (CRITICAL/HIGH/MEDIUM/LOW), remediation timeline table, and appendix with original vs fixed code diff."},
  ],
  "edges":[
    {"id":"e1","source":"n1","target":"n2"},{"id":"e2","source":"n1","target":"n3"},
    {"id":"e3","source":"n2","target":"n3"},{"id":"e4","source":"n3","target":"n4"},
    {"id":"e5","source":"n3","target":"n5"},{"id":"e6","source":"n4","target":"n5"},
  ],
},

# ── 6. Data Analytics Dashboard ───────────────────────────────────────────────
{
  "name": "Data Analytics Dashboard",
  "description": (
    "Describe a dataset or paste CSV data. The pipeline analyses it, "
    "generates statistical insights, builds an interactive Chart.js "
    "HTML dashboard, and produces a management CSV summary."
  ),
  "category": "analytics",
  "tags": ["analytics", "HTML", "charts", "CSV", "dashboard"],
  "version": "1.0",
  "docs": """
## Workflow: Data Analytics Dashboard

### Purpose
Transform raw data descriptions or CSV samples into a complete analytics
dashboard with statistical insights and an interactive HTML visualisation.

### Flow
  [Orchestrator] → [Analyst: Statistics] → [Writer: Insights Narrative]
                                         → [Web Designer: Dashboard HTML]
                                         → [Analyst: CSV Summary]

### Output Files
- 01_Orchestrator.txt       — analysis plan and metric definitions
- 02_Statistics.txt         — full statistical analysis with Chart.js configs
- 03_Insights.txt           — management narrative (300 words)
- 04_Dashboard.html         — interactive Chart.js dashboard
- 05_Summary.csv            — key metrics CSV for spreadsheet import

### Input Format
Provide either:
(a) A description of your dataset and the questions you want answered
(b) Paste the first 20 rows of your CSV directly as the input
  """,
  "agents":["orchestrator","analyst","writer","web_designer"],
  "nodes":[
    {"id":"n1","label":"Analytics Orchestrator","agent_key":"orchestrator","output_type":"txt","x":60,"y":200,"type":"supervisor",
     "task_instruction":"Understand the data provided. Define: key metrics to measure, 3 analytical questions to answer, chart types most suitable, and the target audience for insights. Output an analysis plan."},
    {"id":"n2","label":"Statistical Analyst","agent_key":"analyst","output_type":"txt","x":300,"y":180,"type":"agent",
     "task_instruction":"Perform comprehensive statistical analysis on the data: descriptive stats, trends, anomalies, correlations. Produce Chart.js JSON configs for a bar chart, line chart, and pie chart. Format findings as structured data."},
    {"id":"n3","label":"Insights Writer","agent_key":"writer","output_type":"txt","x":540,"y":120,"type":"agent",
     "task_instruction":"Write a 300-word management narrative summarising the most important findings. Structure: 1 headline insight, 3 supporting data points, 2 recommended actions. Use plain English, no jargon."},
    {"id":"n4","label":"Dashboard Builder","agent_key":"web_designer","output_type":"html","x":540,"y":300,"type":"agent",
     "task_instruction":"Build a complete interactive HTML analytics dashboard using the Chart.js configs from the analyst and the narrative from the writer. Include: KPI cards at top, 3 charts, data table, and insights panel. Use Chart.js from cdnjs."},
    {"id":"n5","label":"CSV Export","agent_key":"analyst","output_type":"csv","x":780,"y":200,"type":"agent",
     "task_instruction":"Produce a clean CSV with columns: Metric, Value, Change_WoW, Change_MoM, Status (Good/Warning/Alert), Notes. One row per key metric identified. Include a header row."},
  ],
  "edges":[
    {"id":"e1","source":"n1","target":"n2"},{"id":"e2","source":"n2","target":"n3"},
    {"id":"e3","source":"n2","target":"n4"},{"id":"e4","source":"n3","target":"n4"},
    {"id":"e5","source":"n2","target":"n5"},
  ],
},

# ── 7. DevOps Automation Package ──────────────────────────────────────────────
{
  "name": "DevOps Automation Package",
  "description": (
    "Describe your infrastructure need. Generates: a Python deployment "
    "script, a Windows batch installer, a Unix shell script, a "
    "GitHub Actions CI/CD workflow YAML, and a runbook PDF."
  ),
  "category": "devops",
  "tags": ["devops", "shell", "batch", "python", "CI/CD", "PDF"],
  "version": "1.0",
  "docs": """
## Workflow: DevOps Automation Package

### Purpose
From an infrastructure description, generate the complete automation
package: deployment scripts for all platforms, CI/CD pipeline, and
an operations runbook.

### Flow
  [Orchestrator] → [SysAdmin: Unix Script]
                 → [SysAdmin: Windows Batch]
                 → [Coder: Python Deployer]
                 → [Coder: CI/CD YAML]
                 → [PDF Formatter: Runbook]

### Output Files
- 01_Orchestrator.txt       — infrastructure spec and automation strategy
- 02_Deploy_Unix.sh         — Unix/Mac deployment shell script
- 03_Deploy_Windows.bat     — Windows deployment batch file
- 04_Deploy_Python.py       — cross-platform Python deployment script
- 05_CICD_Pipeline.txt      — GitHub Actions / GitLab CI YAML
- 06_Runbook.html           — operations runbook PDF-ready HTML

### Best Practices Applied
- Idempotent scripts (safe to run multiple times)
- Environment variable based configuration
- Rollback procedures in every script
- Health checks after each deployment step
  """,
  "agents":["orchestrator","sysadmin","coder","pdf_formatter"],
  "nodes":[
    {"id":"n1","label":"DevOps Orchestrator","agent_key":"orchestrator","output_type":"txt","x":60,"y":200,"type":"supervisor",
     "task_instruction":"Analyse the infrastructure requirement. Define: technology stack, deployment steps, rollback procedures, health checks, and environment variables needed. Output a deployment specification document."},
    {"id":"n2","label":"Unix Shell Script","agent_key":"sysadmin","output_type":"sh","x":300,"y":100,"type":"agent",
     "task_instruction":"Write a complete bash deployment script following the spec. Must include: header comments, set -euo pipefail, coloured logging, all deployment steps, health checks, rollback function, and cleanup trap. Make executable."},
    {"id":"n3","label":"Windows Batch","agent_key":"sysadmin","output_type":"bat","x":300,"y":220,"type":"agent",
     "task_instruction":"Write a complete Windows .bat deployment script equivalent to the Unix script. Must include: @echo off, setlocal, timestamped logging, all deployment steps, error handling after each command, and a rollback routine."},
    {"id":"n4","label":"Python Deployer","agent_key":"coder","output_type":"py","x":300,"y":340,"type":"agent",
     "task_instruction":"Write a cross-platform Python deployment script that works on both Unix and Windows. Use argparse (--env, --dry-run, --rollback flags), subprocess, logging module, and comprehensive error handling. Include a requirements section."},
    {"id":"n5","label":"CI/CD Pipeline","agent_key":"coder","output_type":"txt","x":540,"y":200,"type":"agent",
     "task_instruction":"Generate a GitHub Actions workflow YAML file (.github/workflows/deploy.yml) based on the deployment spec. Include: triggers (push to main/tag), environment matrix, caching, the deployment steps, and Slack notification on failure."},
    {"id":"n6","label":"Operations Runbook","agent_key":"pdf_formatter","output_type":"html","x":760,"y":200,"type":"agent",
     "task_instruction":"Create a comprehensive operations runbook HTML document. Include: system overview diagram (ASCII), pre-deployment checklist, deployment steps with screenshots placeholders, rollback procedures, troubleshooting guide, and contact matrix table."},
  ],
  "edges":[
    {"id":"e1","source":"n1","target":"n2"},{"id":"e2","source":"n1","target":"n3"},
    {"id":"e3","source":"n1","target":"n4"},{"id":"e4","source":"n1","target":"n5"},
    {"id":"e5","source":"n2","target":"n6"},{"id":"e6","source":"n4","target":"n6"},
  ],
},

# ── 8. Customer Support Knowledge Base ───────────────────────────────────────
{
  "name": "Customer Support Knowledge Base",
  "description": (
    "Input a product or service description. Generates: FAQ document, "
    "support agent scripts, escalation decision tree (HTML), "
    "email templates, and a training PDF for new support staff."
  ),
  "category": "support",
  "tags": ["support", "FAQ", "email", "PDF", "HTML", "training"],
  "version": "1.0",
  "docs": """
## Workflow: Customer Support Knowledge Base

### Purpose
Build a complete support knowledge base from a product description:
FAQs, agent scripts, email templates, escalation tree, and training PDF.

### Flow
  [Orchestrator] → [Researcher: Common Issues]
                 → [Writer: FAQ + Scripts]
                 → [Web Designer: Escalation Tree]
                 → [Email Agent: Templates]
                 → [PDF Formatter: Training Manual]

### Output Files
- 01_Orchestrator.txt         — KB structure plan
- 02_Common_Issues.txt        — top 20 issues with root causes
- 03_FAQ_and_Scripts.txt      — FAQ document + agent response scripts
- 04_Escalation_Tree.html     — interactive HTML decision tree
- 05_Email_Templates.txt      — 10 email templates for common scenarios
- 06_Training_Manual.html     — onboarding PDF for new support staff
  """,
  "agents":["orchestrator","researcher","writer","web_designer","email_agent","pdf_formatter"],
  "nodes":[
    {"id":"n1","label":"KB Orchestrator","agent_key":"orchestrator","output_type":"txt","x":60,"y":200,"type":"supervisor",
     "task_instruction":"Analyse the product/service described. Identify: top 5 customer journey stages, likely failure points at each stage, escalation triggers, and the structure for the knowledge base. Output a KB plan."},
    {"id":"n2","label":"Issue Researcher","agent_key":"researcher","output_type":"txt","x":300,"y":120,"type":"agent",
     "task_instruction":"Research and list the top 20 support issues customers commonly face with this type of product/service. For each: issue title, root causes (3), customer impact, resolution time estimate, and escalation threshold."},
    {"id":"n3","label":"FAQ Writer","agent_key":"writer","output_type":"txt","x":300,"y":300,"type":"agent",
     "task_instruction":"Produce: (1) A 20-question FAQ document with clear, jargon-free answers. (2) Agent response scripts for the top 10 issues — exact language agents should use. (3) Empathy phrases for frustrated customers."},
    {"id":"n4","label":"Escalation Tree","agent_key":"web_designer","output_type":"html","x":540,"y":120,"type":"agent",
     "task_instruction":"Build an interactive HTML decision tree for support escalations. Show the flow: Issue Type → Severity Check → Resolution Attempt → Escalate/Resolve. Use expandable nodes with JavaScript. Make it printable."},
    {"id":"n5","label":"Email Templates","agent_key":"email_agent","output_type":"txt","x":540,"y":300,"type":"agent",
     "task_instruction":"Write 10 professional email templates covering: initial response, issue confirmed, resolution update, escalation notification, resolution confirmed, follow-up satisfaction check, refund confirmation, account suspension, account reinstatement, VIP escalation."},
    {"id":"n6","label":"Training Manual","agent_key":"pdf_formatter","output_type":"html","x":780,"y":200,"type":"agent",
     "task_instruction":"Produce a complete new-hire training manual HTML: welcome page, product overview, top 20 issues with solutions, response scripts, escalation guide, KPI targets, quick reference card. Format for PDF export with page breaks."},
  ],
  "edges":[
    {"id":"e1","source":"n1","target":"n2"},{"id":"e2","source":"n1","target":"n3"},
    {"id":"e3","source":"n2","target":"n3"},{"id":"e4","source":"n3","target":"n4"},
    {"id":"e5","source":"n3","target":"n5"},{"id":"e6","source":"n3","target":"n6"},
    {"id":"e7","source":"n4","target":"n6"},
  ],
},

# ── 9. Financial Due Diligence Package ────────────────────────────────────────
{
  "name": "Financial Due Diligence Package",
  "description": (
    "Input a company name or description. Produces a full due diligence "
    "package: financial research, risk analysis, data model CSV, "
    "executive summary, and a signed-off PDF report."
  ),
  "category": "finance",
  "tags": ["finance", "due-diligence", "PDF", "CSV", "risk", "executive"],
  "version": "1.0",
  "docs": """
## Workflow: Financial Due Diligence Package

### Purpose
Automate the initial phase of financial due diligence: research, risk
matrix, financial data model, and boardroom-ready report.

### Flow
  [Orchestrator] → [Researcher: Financial Data]
                 → [Analyst: Risk + Data Model]
                 → [Writer: Executive Summary]
                 → [PDF Formatter: Due Diligence Report]

### Output Files
- 01_Orchestrator.txt         — DD scope and information request list
- 02_Financial_Research.txt   — revenue, margins, growth, funding history
- 03_Risk_Analysis.txt        — risk matrix + data model CSV content
- 04_Executive_Summary.txt    — 1-page investment brief
- 05_DD_Report.html           — complete due diligence PDF report

### Disclaimer
This workflow produces AI-generated research for initial screening only.
All findings must be verified by qualified financial professionals
before being used in investment decisions.
  """,
  "agents":["orchestrator","researcher","analyst","writer","pdf_formatter"],
  "nodes":[
    {"id":"n1","label":"DD Orchestrator","agent_key":"orchestrator","output_type":"txt","x":60,"y":200,"type":"supervisor",
     "task_instruction":"Define the due diligence scope: information categories to research (financial, legal, operational, market), key risk areas, and the decision framework. Output a structured DD checklist."},
    {"id":"n2","label":"Financial Researcher","agent_key":"researcher","output_type":"txt","x":300,"y":120,"type":"agent",
     "task_instruction":"Research available financial information: revenue estimates, growth trajectory, funding rounds, key investors, employee count trend, product/market fit indicators. Use only verifiable public data. Flag gaps explicitly."},
    {"id":"n3","label":"Risk Analyst","agent_key":"analyst","output_type":"txt","x":300,"y":300,"type":"agent",
     "task_instruction":"Produce: (1) Risk matrix: 10 risks rated by Likelihood (1-5) × Impact (1-5). (2) Key financial metrics table with benchmarks vs industry. (3) A simple CSV data model with columns: Metric, Value, Source, Confidence, Benchmark, Status."},
    {"id":"n4","label":"Executive Summary","agent_key":"writer","output_type":"txt","x":540,"y":200,"type":"agent",
     "task_instruction":"Write a 1-page executive investment brief: investment thesis (2 sentences), key strengths (3 bullets), key risks (3 bullets), financial snapshot table, and recommendation: PROCEED / CONDITIONAL / PASS with rationale."},
    {"id":"n5","label":"DD Report PDF","agent_key":"pdf_formatter","output_type":"pdf","x":760,"y":200,"type":"agent",
     "task_instruction":"Format as a professional due diligence report HTML: cover page with classification CONFIDENTIAL, executive summary, financial analysis section, risk matrix table, management assessment, market analysis, and disclaimer. Enterprise formatting."},
  ],
  "edges":[
    {"id":"e1","source":"n1","target":"n2"},{"id":"e2","source":"n1","target":"n3"},
    {"id":"e3","source":"n2","target":"n3"},{"id":"e4","source":"n2","target":"n4"},
    {"id":"e5","source":"n3","target":"n4"},{"id":"e6","source":"n4","target":"n5"},
    {"id":"e7","source":"n3","target":"n5"},
  ],
},

# ── 10. Full Product Documentation Suite ─────────────────────────────────────
{
  "name": "Product Documentation Suite",
  "description": (
    "Input a software product or API description. Generates the complete "
    "documentation suite: developer guide (HTML), API reference, "
    "onboarding email sequence, and a user manual PDF — all consistent."
  ),
  "category": "documentation",
  "tags": ["documentation", "HTML", "PDF", "email", "API", "developer"],
  "version": "1.0",
  "docs": """
## Workflow: Product Documentation Suite

### Purpose
Generate consistent, comprehensive documentation for any product or API:
developer reference, user guide, onboarding emails, and a printable manual.

### Flow
  [Orchestrator] → [Researcher: Product Analysis]
                 → [Writer: API Reference + User Guide]
                 → [Web Designer: Developer Portal HTML]
                 → [PDF Formatter: User Manual PDF]
                 → [Email Agent: Onboarding Sequence]

### Output Files
- 01_Orchestrator.txt         — documentation plan and structure
- 02_Product_Analysis.txt     — feature inventory and user personas
- 03_Written_Docs.txt         — API reference + user guide content
- 04_Developer_Portal.html    — complete developer documentation site
- 05_User_Manual.html         — print-ready user manual PDF
- 06_Onboarding_Emails.txt    — 5-email onboarding sequence

### Consistency Rules Applied
- All output uses the same product name, version, and terminology
- Code examples in Python and JavaScript
- Every feature documented from 3 perspectives: What, Why, How
  """,
  "agents":["orchestrator","researcher","writer","web_designer","pdf_formatter","email_agent"],
  "nodes":[
    {"id":"n1","label":"Docs Orchestrator","agent_key":"orchestrator","output_type":"txt","x":60,"y":200,"type":"supervisor",
     "task_instruction":"Analyse the product described. Define: feature list, user personas (developer/end-user/admin), documentation hierarchy, terminology glossary, and consistent naming conventions. Output a documentation plan."},
    {"id":"n2","label":"Product Analyser","agent_key":"researcher","output_type":"txt","x":280,"y":120,"type":"agent",
     "task_instruction":"Inventory all features mentioned in the product description. For each feature: name, one-line description, use cases (3), parameters/options, edge cases, and common errors. Structure as a feature catalog."},
    {"id":"n3","label":"Content Writer","agent_key":"writer","output_type":"txt","x":280,"y":300,"type":"agent",
     "task_instruction":"Write: (1) Full API/feature reference in developer-friendly style with code examples. (2) User guide chapters for each major feature. (3) Quick-start guide (10 minutes to first success). Use consistent terminology from the orchestrator's glossary."},
    {"id":"n4","label":"Developer Portal","agent_key":"web_designer","output_type":"html","x":520,"y":120,"type":"agent",
     "task_instruction":"Build a complete developer documentation portal HTML file. Include: sticky sidebar navigation, syntax-highlighted code blocks (use <pre><code> with CSS), search box (JavaScript filter), copy-to-clipboard buttons, dark mode toggle, and responsive layout."},
    {"id":"n5","label":"User Manual PDF","agent_key":"pdf_formatter","output_type":"html","x":520,"y":300,"type":"agent",
     "task_instruction":"Format the user guide as a print-ready user manual HTML. Include: cover page, table of contents, getting started chapter, feature chapters with screenshots placeholders, troubleshooting appendix, glossary, and index. Professional book-style formatting."},
    {"id":"n6","label":"Onboarding Emails","agent_key":"email_agent","output_type":"txt","x":760,"y":200,"type":"agent",
     "task_instruction":"Write a 5-email onboarding sequence: Day 0 welcome + quick start, Day 1 first feature deep-dive, Day 3 advanced features, Day 7 tips and tricks, Day 14 check-in + support offer. Each with subject line, preheader, HTML body, and CTA."},
  ],
  "edges":[
    {"id":"e1","source":"n1","target":"n2"},{"id":"e2","source":"n1","target":"n3"},
    {"id":"e3","source":"n2","target":"n3"},{"id":"e4","source":"n3","target":"n4"},
    {"id":"e5","source":"n3","target":"n5"},{"id":"e6","source":"n3","target":"n6"},
  ],
},

]  # end WORKFLOWS
