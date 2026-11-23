from io import BytesIO
from pathlib import Path

from PIL import Image
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Inches, Pt


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "JibuSales-Pitch-Deck.pptx"
ASSETS = ROOT / "frontend" / "public" / "img"

SW, SH = 13.333333, 7.5
NAVY = "10264D"
BLUE = "1677E8"
GREEN = "219653"
INK = "17243A"
MUTED = "58677D"
PALE = "F3F7FC"
WHITE = "FFFFFF"
LINE = "DDE5EF"
ORANGE = "E38B2C"


def rgb(value):
    return RGBColor.from_string(value)


def rect(slide, x, y, w, h, fill, radius=False, line=None):
    kind = MSO_SHAPE.ROUNDED_RECTANGLE if radius else MSO_SHAPE.RECTANGLE
    shape = slide.shapes.add_shape(kind, Inches(x), Inches(y), Inches(w), Inches(h))
    shape.fill.solid()
    shape.fill.fore_color.rgb = rgb(fill)
    if line:
        shape.line.color.rgb = rgb(line)
        shape.line.width = Pt(0.8)
    else:
        shape.line.fill.background()
    if radius:
        try:
            shape.adjustments[0] = 0.07
        except (IndexError, ValueError):
            pass
    return shape


def textbox(slide, x, y, w, h, text, size=16, color=INK, bold=False,
            align=PP_ALIGN.LEFT, valign=MSO_ANCHOR.TOP, font="Aptos",
            margin=0, line_spacing=1.08):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    frame = box.text_frame
    frame.clear()
    frame.word_wrap = True
    frame.margin_left = Inches(margin)
    frame.margin_right = Inches(margin)
    frame.margin_top = Inches(margin)
    frame.margin_bottom = Inches(margin)
    frame.vertical_anchor = valign
    for idx, line in enumerate(str(text).split("\n")):
        paragraph = frame.paragraphs[0] if idx == 0 else frame.add_paragraph()
        paragraph.alignment = align
        paragraph.space_after = Pt(0)
        paragraph.line_spacing = line_spacing
        run = paragraph.add_run()
        run.text = line
        run.font.name = font
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.color.rgb = rgb(color)
    return box


def image_crop(slide, path, x, y, w, h):
    path = Path(path)
    target_ratio = w / h
    with Image.open(path) as im:
        im = im.convert("RGB")
        ratio = im.width / im.height
        if ratio > target_ratio:
            nw = int(im.height * target_ratio)
            left = (im.width - nw) // 2
            im = im.crop((left, 0, left + nw, im.height))
        else:
            nh = int(im.width / target_ratio)
            top = (im.height - nh) // 2
            im = im.crop((0, top, im.width, top + nh))
        buff = BytesIO()
        im.save(buff, format="PNG", optimize=True)
        buff.seek(0)
        return slide.shapes.add_picture(buff, Inches(x), Inches(y), width=Inches(w), height=Inches(h))


def image_contain(slide, path, x, y, w, h):
    path = Path(path)
    with Image.open(path) as im:
        iw, ih = im.size
    scale = min(w / iw, h / ih)
    rw, rh = iw * scale, ih * scale
    return slide.shapes.add_picture(str(path), Inches(x + (w - rw) / 2), Inches(y + (h - rh) / 2),
                                    width=Inches(rw), height=Inches(rh))


def slide_base(prs, page, kicker, title):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    slide.background.fill.solid()
    slide.background.fill.fore_color.rgb = rgb(WHITE)
    rect(slide, 0.62, 0.55, 0.48, 0.055, GREEN)
    textbox(slide, 1.22, 0.41, 7.1, 0.25, kicker.upper(), 9, GREEN, True, valign=MSO_ANCHOR.MIDDLE)
    textbox(slide, 0.62, 0.86, 12.0, 0.66, title, 27, NAVY, True, valign=MSO_ANCHOR.MIDDLE)
    rect(slide, 0.62, 7.02, 12.08, 0.012, LINE)
    textbox(slide, 0.62, 7.08, 5.0, 0.2, "JibuSales  ·  Sell smart. Grow fast.", 8, MUTED, valign=MSO_ANCHOR.MIDDLE)
    textbox(slide, 12.0, 7.07, 0.7, 0.2, f"{page:02d}", 9, BLUE, True, PP_ALIGN.RIGHT, MSO_ANCHOR.MIDDLE)
    return slide


def card(slide, x, y, w, h, title, body, accent=BLUE, title_size=11, body_size=13):
    rect(slide, x, y, w, h, PALE, True, LINE)
    rect(slide, x + 0.22, y + 0.24, 0.34, 0.045, accent)
    textbox(slide, x + 0.22, y + 0.43, w - 0.44, 0.28, title.upper(), title_size, accent, True)
    textbox(slide, x + 0.22, y + 0.88, w - 0.44, h - 1.0, body, body_size, INK, True)


prs = Presentation()
prs.slide_width = Inches(SW)
prs.slide_height = Inches(SH)
prs.core_properties.title = "JibuSales | Business Management Technology for African SMEs"
prs.core_properties.subject = "Investor and strategic partner pitch"
prs.core_properties.author = "Kairos Technologies"

logo = ASSETS / "jibusales_logo.png"
team = ASSETS / "Tracking-Time-in-Sales.png"
inventory = ASSETS / "Keep-nventory-accurate.jpg"
empower = ASSETS / "Empower-your-team.png"


# 1. Cover
slide = prs.slides.add_slide(prs.slide_layouts[6])
slide.background.fill.solid()
slide.background.fill.fore_color.rgb = rgb(NAVY)
rect(slide, 8.05, 0, SW - 8.05, SH, BLUE)
rect(slide, 0.72, 0.65, 0.55, 0.065, GREEN)
rect(slide, 0.72, 0.92, 1.32, 1.3, WHITE, True)
image_contain(slide, logo, 0.78, 0.98, 1.2, 1.18)
textbox(slide, 2.25, 1.16, 4.8, 0.5, "JibuSales", 30, WHITE, True, valign=MSO_ANCHOR.MIDDLE)
textbox(slide, 0.78, 2.55, 6.95, 0.4, "BUSINESS MANAGEMENT TECHNOLOGY FOR AFRICAN SMEs", 11, "A8D6FF", True)
textbox(slide, 0.76, 3.08, 6.9, 1.32, "The operating layer\nfor growing businesses.", 34, WHITE, True)
textbox(slide, 0.8, 4.72, 6.6, 0.82,
        "Manage sales, inventory, customers, suppliers, expenses and financial records in one place.",
        16, "E2ECF8")
textbox(slide, 0.82, 6.13, 2.7, 0.22, "COMMERCIAL LAUNCH", 8, "A8D6FF", True)
textbox(slide, 0.82, 6.43, 3.0, 0.3, "June 2026  |  Uganda", 12, WHITE, True)
textbox(slide, 8.72, 0.84, 3.85, 0.28, "ONE CONNECTED BUSINESS VIEW", 10, "DDF3E7", True)
textbox(slide, 8.72, 1.35, 3.9, 1.45, "Run the\nbusiness.\nSee the numbers.", 27, WHITE, True)
rect(slide, 8.72, 3.18, 3.8, 0.035, "9EDBB8")
image_crop(slide, team, 8.72, 3.52, 3.95, 2.35)
textbox(slide, 8.72, 6.27, 3.9, 0.55, "Kairos Technologies\nUganda", 12, WHITE, True)


# 2. Problem
slide = slide_base(prs, 2, "The challenge", "Important business details live in too many places.")
textbox(slide, 0.66, 1.7, 11.8, 0.42,
        "When daily activity is fragmented, it is harder to understand performance and act with confidence.", 16, MUTED)
card(slide, 0.68, 2.42, 3.6, 2.45, "Sales & credit", "Sales, customer balances and receipts can be scattered across notebooks and separate tools.", BLUE)
card(slide, 4.58, 2.42, 3.6, 2.45, "Stock & suppliers", "Stock movement, replenishment and supplier obligations are difficult to review together.", GREEN)
card(slide, 8.48, 2.42, 3.6, 2.45, "Owner visibility", "Owners spend time piecing information together instead of deciding what to do next.", ORANGE)
image_crop(slide, inventory, 0.7, 5.22, 1.45, 1.15)
textbox(slide, 2.4, 5.34, 9.9, 0.72,
        "The opportunity: give SMEs structured records, stronger accountability and clearer management information.",
        18, NAVY, True, valign=MSO_ANCHOR.MIDDLE)


# 3. Product
slide = slide_base(prs, 3, "The platform", "JibuSales connects the work behind every transaction.")
textbox(slide, 0.66, 1.68, 6.25, 0.66,
        "Capture activity once and keep the operational and financial picture connected.", 18, INK, True)
capabilities = [
    "Sales, receipts and cash or credit transactions",
    "Inventory, units and stock movements",
    "Customers, balances, histories and statements",
    "Suppliers, payables, expenses and cash workflows",
    "Reports, branches, staff roles and permissions",
]
for i, label in enumerate(capabilities):
    y = 2.62 + i * 0.65
    rect(slide, 0.74, y + 0.05, 0.22, 0.22, GREEN, True)
    textbox(slide, 1.12, y, 5.85, 0.43, label, 14, INK, valign=MSO_ANCHOR.MIDDLE)
rect(slide, 7.25, 1.78, 5.35, 4.48, PALE, True)
image_crop(slide, team, 7.42, 1.95, 5.02, 4.13)
textbox(slide, 7.45, 6.35, 4.9, 0.3, "Operational activity, financial records and reporting", 10, MUTED, True, PP_ALIGN.CENTER)


# 4. Operating loop
slide = slide_base(prs, 4, "How it works", "A clearer operating loop, from sale to decision.")
steps = [
    (0.72, "01", "Record", "Capture sales, expenses, payments and stock movements."),
    (3.9, "02", "Connect", "Keep related customer, supplier and inventory details together."),
    (7.08, "03", "Account", "Maintain the financial record as operational activity is posted."),
    (10.26, "04", "Review", "Use current information to spot issues and plan the next move."),
]
for i, (x, num, title, body) in enumerate(steps):
    rect(slide, x, 2.12, 2.45, 0.6, NAVY, True)
    textbox(slide, x + 0.1, 2.18, 2.25, 0.38, num, 15, WHITE, True, PP_ALIGN.CENTER, MSO_ANCHOR.MIDDLE)
    textbox(slide, x, 3.0, 2.62, 0.4, title, 20, BLUE if i % 2 == 0 else GREEN, True)
    textbox(slide, x, 3.58, 2.62, 1.18, body, 14, INK)
    if i < 3:
        rect(slide, x + 2.53, 2.4, 0.47, 0.035, "AFC0D5")
rect(slide, 0.75, 5.48, 11.82, 0.82, "EAF2FC", True)
textbox(slide, 0.98, 5.67, 11.35, 0.4,
        "Less time reconciling fragments. More time running the business.", 19, NAVY, True, PP_ALIGN.CENTER, MSO_ANCHOR.MIDDLE)


# 5. Commercial validation
slide = slide_base(prs, 5, "Commercial traction", "Early validation, with recurring value already in market.")
rect(slide, 0.7, 1.8, 5.45, 4.85, PALE, True)
image_crop(slide, inventory, 0.88, 1.98, 5.1, 3.35)
textbox(slide, 0.95, 5.55, 4.95, 0.7,
        "3 businesses currently on demo / evaluation", 17, NAVY, True, PP_ALIGN.CENTER, MSO_ANCHOR.MIDDLE)
metrics = [
    (6.55, 1.92, "UGX 3.05M", "Stated annual subscription value", BLUE),
    (9.55, 1.92, "UGX 205K", "Monthly recurring subscriptions", GREEN),
    (6.55, 3.35, "UGX 1.50M", "Current annual service value", GREEN),
    (9.55, 3.35, "UGX 7.01M", "Approx. annualized stated arrangements", BLUE),
]
for x, y, amount, label, tone in metrics:
    rect(slide, x, y, 2.66, 1.12, WHITE, True, LINE)
    textbox(slide, x + 0.16, y + 0.15, 2.34, 0.4, amount, 20, tone, True)
    textbox(slide, x + 0.16, y + 0.61, 2.36, 0.36, label, 10, INK)
textbox(slide, 6.58, 5.05, 5.6, 0.83,
        "Run-rate estimate from stated subscription and service prices; not historical revenue or a guarantee.",
        11, MUTED)
textbox(slide, 6.58, 6.05, 5.55, 0.32,
        "Commercially launched in Uganda in June 2026.", 12, NAVY, True)


# 6. Market and go-to-market
slide = slide_base(prs, 6, "Go-to-market", "A focused route from Uganda to regional growth.")
textbox(slide, 0.68, 1.7, 6.35, 0.55,
        "Start where stock, credit, cash control or operational complexity is acute.", 16, INK, True)
segments = [
    (0.72, 2.52, "TRADE & RETAIL", "Retail, hardware, pharmacy and wholesale."),
    (3.88, 2.52, "SERVICE TEAMS", "Appointments, jobs, payments and service income."),
    (0.72, 4.08, "HOSPITALITY & FUEL", "Orders, stock movement and operating controls."),
    (3.88, 4.08, "RENTAL & PROPERTY", "Bookings, assets, tenancies and collections."),
]
for i, (x, y, title, body) in enumerate(segments):
    card(slide, x, y, 2.85, 1.3, title, body, BLUE if i % 2 == 0 else GREEN, 9, 11)
image_contain(slide, empower, 7.42, 1.8, 5.0, 3.55)
rect(slide, 7.43, 5.5, 4.98, 1.0, NAVY, True)
textbox(slide, 7.63, 5.68, 4.58, 0.22, "END-2027 MANAGEMENT TARGET", 9, "A8D6FF", True)
textbox(slide, 7.63, 5.99, 4.58, 0.32, "75–100 active businesses", 18, WHITE, True)
textbox(slide, 0.75, 5.78, 6.15, 0.65,
        "Demonstration-led sales, guided onboarding, referrals and selected distribution partners.",
        14, MUTED)


# 7. Capital plan
slide = slide_base(prs, 7, "Scale-up capital", "UGX 85 million to build the next stage.")
textbox(slide, 0.76, 1.9, 4.05, 0.8, "UGX 85M", 40, BLUE, True)
textbox(slide, 0.78, 2.83, 3.95, 1.15,
        "Proposed 12–18 month plan for product, customer growth and regional pilots.", 16, INK)
textbox(slide, 0.78, 4.5, 3.85, 0.85,
        "The ask is a planning target; financing structure remains open to strategic equity, grants, programme support or partnerships.",
        12, MUTED)
allocations = [
    ("Product & engineering", 24, BLUE),
    ("Sales & marketing", 25, GREEN),
    ("Customer success & onboarding", 12, ORANGE),
    ("Infrastructure & security", 8, "5D77A8"),
    ("Regional market development", 10, "32A7A0"),
    ("Legal, finance & administration", 6, "8A6FC1"),
]
for i, (label, amount, tone) in enumerate(allocations):
    y = 1.91 + i * 0.72
    textbox(slide, 5.0, y, 3.2, 0.28, label, 12, INK, True, valign=MSO_ANCHOR.MIDDLE)
    rect(slide, 8.45, y + 0.03, 3.1 * amount / 25, 0.22, tone, True)
    textbox(slide, 11.76, y - 0.01, 0.72, 0.3, f"{amount}M", 11, NAVY, True, PP_ALIGN.RIGHT, MSO_ANCHOR.MIDDLE)
textbox(slide, 5.0, 6.35, 7.45, 0.32, "TOTAL PLANNING ALLOCATION: UGX 85M", 13, GREEN, True, PP_ALIGN.RIGHT)


# 8. Close
slide = prs.slides.add_slide(prs.slide_layouts[6])
slide.background.fill.solid()
slide.background.fill.fore_color.rgb = rgb(NAVY)
rect(slide, 8.15, 0, SW - 8.15, SH, BLUE)
rect(slide, 0.78, 0.7, 0.55, 0.065, GREEN)
rect(slide, 0.8, 1.08, 1.7, 1.7, WHITE, True)
image_contain(slide, logo, 0.87, 1.15, 1.56, 1.56)
textbox(slide, 2.8, 1.6, 4.7, 0.55, "JibuSales", 30, WHITE, True, valign=MSO_ANCHOR.MIDDLE)
textbox(slide, 0.84, 3.16, 6.95, 1.38, "Better business records.\nStronger businesses.", 31, WHITE, True)
textbox(slide, 0.88, 4.92, 6.85, 0.75,
        "Building the operating layer for Africa’s growing SMEs.", 17, "DCE9F7")
textbox(slide, 0.88, 6.55, 4.8, 0.3, "Sell smart. Grow fast.", 11, "A8D6FF", True)
textbox(slide, 8.8, 1.15, 3.75, 0.35, "KAIROS TECHNOLOGIES", 11, "DDF3E7", True)
textbox(slide, 8.8, 2.02, 3.8, 0.65, "Let’s build the next stage.", 20, WHITE, True)
textbox(slide, 8.8, 3.02, 3.85, 1.45,
        "Uganda\n+256 788 216 271\njibusales00@gmail.com\nkairosups.com", 13, WHITE)


prs.save(OUT)

# Re-open through python-pptx to verify its package and slide relationships.
check = Presentation(OUT)
assert len(check.slides) == 8, f"Expected 8 slides, got {len(check.slides)}"
assert "JibuSales" in " ".join(shape.text for shape in check.slides[0].shapes if shape.has_text_frame)
assert "June 2026" in " ".join(shape.text for shape in check.slides[0].shapes if shape.has_text_frame)
assert "UGX 85M" in " ".join(shape.text for shape in check.slides[6].shapes if shape.has_text_frame)
assert "I Choose Life" not in " ".join(shape.text for slide in check.slides for shape in slide.shapes if shape.has_text_frame)
print(f"Created and re-opened {OUT} ({len(check.slides)} slides, {OUT.stat().st_size:,} bytes)")
