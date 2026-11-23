from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
from xml.sax.saxutils import escape
import struct


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "JibuSales-Pitch-Deck.pptx"
EMU = 914400
SW, SH = 13.333333, 7.5
NAVY = "10264D"
BLUE = "1677E8"
GREEN = "219653"
INK = "17243A"
MUTED = "58677D"
PALE = "F3F7FC"
WHITE = "FFFFFF"


def emu(value):
    return str(round(value * EMU))


def color(hex_color):
    return f'<a:solidFill><a:srgbClr val="{hex_color}"/></a:solidFill>'


def shape_xml(sid, name, x, y, w, h, fill=None, line=None, text=None, size=1800,
              color_hex=INK, bold=False, align="l", valign="ctr", margin=0.04,
              font="Aptos", radius=False):
    geom = "roundRect" if radius else "rect"
    fill_xml = color(fill) if fill else '<a:noFill/>'
    line_xml = f'<a:ln w="9525">{color(line)}</a:ln>' if line else '<a:ln><a:noFill/></a:ln>'
    tx = ""
    if text is not None:
        paragraphs = []
        for line_text in str(text).split("\n"):
            paragraphs.append(
                f'<a:p><a:pPr algn="{align}"/><a:r><a:rPr lang="en-US" sz="{size}" b="{1 if bold else 0}" dirty="0">'
                f'{color(color_hex)}<a:latin typeface="{font}"/></a:rPr><a:t xml:space="preserve">{escape(line_text)}</a:t></a:r>'
                f'<a:endParaRPr lang="en-US" sz="{size}"/></a:p>'
            )
        tx = (f'<p:txBody><a:bodyPr wrap="square" lIns="{emu(margin)}" rIns="{emu(margin)}" '
              f'tIns="{emu(margin)}" bIns="{emu(margin)}" anchor="{valign}"/><a:lstStyle/>'
              + "".join(paragraphs) + "</p:txBody>")
    return (f'<p:sp><p:nvSpPr><p:cNvPr id="{sid}" name="{escape(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
            f'<p:spPr><a:xfrm><a:off x="{emu(x)}" y="{emu(y)}"/><a:ext cx="{emu(w)}" cy="{emu(h)}"/></a:xfrm>'
            f'<a:prstGeom prst="{geom}"><a:avLst/></a:prstGeom>{fill_xml}{line_xml}</p:spPr>{tx}</p:sp>')


def image_size(path):
    data = path.read_bytes()
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", data[16:24])
    raise ValueError(f"Unsupported image format: {path}")


def picture_xml(sid, name, rid, x, y, w, h):
    return (f'<p:pic><p:nvPicPr><p:cNvPr id="{sid}" name="{escape(name)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>'
            f'<p:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>'
            f'<p:spPr><a:xfrm><a:off x="{emu(x)}" y="{emu(y)}"/><a:ext cx="{emu(w)}" cy="{emu(h)}"/></a:xfrm>'
            '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>')


def contain(path, x, y, w, h):
    iw, ih = image_size(path)
    scale = min(w / iw, h / ih)
    rw, rh = iw * scale, ih * scale
    return x + (w - rw) / 2, y + (h - rh) / 2, rw, rh


def slide_xml(elements):
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
            'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
            '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
            '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
            + "".join(elements) + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>')


def rels_xml(items):
    rels = "".join(f'<Relationship Id="{rid}" Type="{kind}" Target="{target}"/>' for rid, kind, target in items)
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels + '</Relationships>')


def base_slide(num, title, kicker="JIBUSALES | BUSINESS OPERATIONS"):
    parts = [shape_xml(2, "Background", 0, 0, SW, SH, WHITE)]
    parts.append(shape_xml(3, "Top rule", 0.62, 0.55, 0.48, 0.055, GREEN))
    parts.append(shape_xml(4, "Section", 1.22, 0.43, 6.8, 0.28, text=kicker.upper(), size=950, color_hex=GREEN, bold=True))
    parts.append(shape_xml(5, "Title", 0.62, 0.83, 12.0, 0.72, text=title, size=2900, color_hex=NAVY, bold=True))
    parts.append(shape_xml(6, "Footer line", 0.62, 7.02, 12.08, 0.012, "DDE5EF"))
    parts.append(shape_xml(7, "Footer brand", 0.62, 7.08, 4.5, 0.22, text="JibuSales  ·  Sell smart. Grow fast.", size=850, color_hex=MUTED))
    parts.append(shape_xml(8, "Page number", 12.03, 7.07, 0.65, 0.24, text=f"{num:02d}", size=900, color_hex=BLUE, bold=True, align="r"))
    return parts


slides = []
media = {}

logo = ROOT / "frontend/public/img/jibusales_logo.png"
team = ROOT / "frontend/public/img/Tracking-Time-in-Sales.png"
stock = ROOT / "frontend/public/img/Keep-nventory-accurate.jpg"
ideas = ROOT / "frontend/public/img/Empower-your-team.png"


# 1: branded opening
p = [shape_xml(2, "White canvas", 0, 0, SW, SH, WHITE),
     shape_xml(3, "Blue panel", 7.92, 0, SW - 7.92, SH, NAVY),
     shape_xml(4, "Accent", 0.77, 0.67, 0.52, 0.065, GREEN)]
lx, ly, lw, lh = contain(logo, 0.77, 0.92, 2.05, 1.9)
media["image1.png"] = logo
p.append(picture_xml(5, "JibuSales logo", "rId2", lx, ly, lw, lh))
p += [shape_xml(6, "Eyebrow", 0.82, 3.08, 6.55, 0.3, text="BUSINESS OPERATIONS, MADE CLEAR", size=1050, color_hex=GREEN, bold=True),
      shape_xml(7, "Title", 0.78, 3.48, 6.65, 1.32, text="Run the business.\nSee the numbers.", size=3400, color_hex=NAVY, bold=True),
      shape_xml(8, "Summary", 0.82, 5.05, 6.05, 0.92, text="One connected platform for sales, stock, spending, customers, suppliers and financial records.", size=1700, color_hex=MUTED),
      shape_xml(9, "Promise", 8.65, 1.34, 3.85, 0.42, text="CLARITY FOR EVERYDAY DECISIONS", size=1100, color_hex="A8D6FF", bold=True),
      shape_xml(10, "Panel statement", 8.65, 2.1, 3.85, 1.7, text="From the counter\nto the accounts.", size=3000, color_hex=WHITE, bold=True),
      shape_xml(11, "Panel detail", 8.65, 4.15, 3.7, 1.0, text="Keep operations connected as your business grows.", size=1700, color_hex="DCE9F7"),
      shape_xml(12, "Brand footer", 8.65, 6.64, 3.8, 0.28, text="JibuSales  ·  Sell smart. Grow fast.", size=900, color_hex="DCE9F7")]
slides.append((p, [("rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"), ("rId2", "image", "../media/image1.png")]))


# 2: the problem
p = base_slide(2, "Important business details live in too many places.", "THE CHALLENGE")
p.append(shape_xml(9, "Lead", 0.66, 1.72, 11.8, 0.52, text="When day-to-day activity is fragmented, it is harder to act with confidence.", size=1600, color_hex=MUTED))
cards = [
    (0.68, "SALES", "Transactions are recorded\napart from the stock and\ncustomer account they affect.", BLUE),
    (4.58, "OPERATIONS", "Stock, expenses and supplier\nobligations are difficult to\nreview together.", GREEN),
    (8.48, "VISIBILITY", "Owners spend time gathering\nanswers instead of deciding\nwhat to do next.", "E38B2C"),
]
for i, (x, label, body, accent) in enumerate(cards):
    p.append(shape_xml(10 + i * 3, f"Card {i+1}", x, 2.55, 3.58, 2.72, PALE, line="E3EAF3", radius=True))
    p.append(shape_xml(11 + i * 3, f"Accent {i+1}", x + 0.24, 2.85, 0.42, 0.055, accent))
    p.append(shape_xml(12 + i * 3, f"Label {i+1}", x + 0.24, 3.08, 3.1, 0.32, text=label, size=1050, color_hex=accent, bold=True))
    p.append(shape_xml(13 + i * 3, f"Body {i+1}", x + 0.24, 3.58, 3.05, 1.32, text=body, size=1550, color_hex=INK, bold=True, valign="t"))
p.append(shape_xml(20, "Bottom statement", 0.68, 5.75, 11.8, 0.62, text="The result: less operational clarity, weaker accountability and slower decisions.", size=1900, color_hex=NAVY, bold=True))
slides.append((p, [("rId1", "slideLayout", "../slideLayouts/slideLayout1.xml")]))


# 3: product proposition
p = base_slide(3, "JibuSales connects the work behind every transaction.", "THE PLATFORM")
p.append(shape_xml(9, "Core statement", 0.66, 1.72, 6.1, 0.62, text="Capture activity once. Keep the business picture connected.", size=1850, color_hex=INK, bold=True))
capabilities = ["Sales and receipts", "Inventory and stock movement", "Expenses and supplier balances", "Customer accounts and receivables", "Financial records and reporting"]
for i, label in enumerate(capabilities):
    y = 2.63 + i * 0.68
    p.append(shape_xml(10 + i * 2, f"Check {i+1}", 0.72, y + 0.07, 0.24, 0.24, GREEN, radius=True))
    p.append(shape_xml(11 + i * 2, f"Capability {i+1}", 1.14, y, 5.55, 0.42, text=label, size=1500, color_hex=INK))
p.append(shape_xml(22, "Image frame", 7.15, 1.75, 5.4, 4.55, "F2F6FC", radius=True))
ix, iy, iw, ih = contain(team, 7.27, 1.92, 5.16, 4.18)
media["image2.png"] = team
p.append(picture_xml(23, "Business visibility illustration", "rId2", ix, iy, iw, ih))
slides.append((p, [("rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"), ("rId2", "image", "../media/image2.png")]))


# 4: operating loop
p = base_slide(4, "A clearer operating loop, from sale to decision.", "HOW IT WORKS")
steps = [
    (0.72, "01", "Record", "Capture a sale, expense, payment or stock movement."),
    (3.9, "02", "Connect", "Keep the related customer, supplier and inventory details together."),
    (7.08, "03", "Account", "Maintain financial records as operational activity is posted."),
    (10.26, "04", "Review", "Use current information to spot issues and plan the next move."),
]
for idx, (x, num, title, body) in enumerate(steps):
    p.append(shape_xml(9 + idx * 4, f"Step {num}", x, 2.08, 2.34, 0.56, NAVY, radius=True))
    p.append(shape_xml(10 + idx * 4, f"Step number {num}", x + 0.15, 2.17, 0.58, 0.32, text=num, size=1350, color_hex=WHITE, bold=True, align="ctr"))
    p.append(shape_xml(11 + idx * 4, f"Step title {num}", x, 2.92, 2.55, 0.46, text=title, size=1950, color_hex=BLUE if idx % 2 == 0 else GREEN, bold=True))
    p.append(shape_xml(12 + idx * 4, f"Step text {num}", x, 3.55, 2.56, 1.34, text=body, size=1400, color_hex=INK, valign="t"))
    if idx < 3:
        p.append(shape_xml(30 + idx, f"Connector {idx+1}", x + 2.48, 2.3, 0.55, 0.035, "AFC0D5"))
p.append(shape_xml(34, "Bottom takeaway", 0.72, 5.55, 11.7, 0.72, text="Owners and teams can spend less time reconciling fragments and more time running the business.", size=1800, color_hex=NAVY, bold=True, align="ctr"))
slides.append((p, [("rId1", "slideLayout", "../slideLayouts/slideLayout1.xml")]))


# 5: visibility and accountability
p = base_slide(5, "Give owners a more useful view of performance.", "WHY IT MATTERS")
p.append(shape_xml(9, "Left image frame", 0.68, 1.78, 5.52, 4.76, PALE, radius=True))
ix, iy, iw, ih = contain(stock, 0.86, 1.94, 5.16, 4.42)
media["image3.png"] = stock
p.append(picture_xml(10, "Inventory accuracy illustration", "rId2", ix, iy, iw, ih))
p.append(shape_xml(11, "Right heading", 6.72, 1.93, 5.62, 0.56, text="Know what changed.\nUnderstand what it affects.", size=2300, color_hex=NAVY, bold=True))
value_points = [
    (3.12, "Better visibility", "Review sales, stock, expenses and balances in one operating context."),
    (4.13, "Clearer accountability", "Keep activity and records easier to trace across the team."),
    (5.14, "Room to grow", "Bring more workflows into view as the business and its operations expand."),
]
for i, (y, title, body) in enumerate(value_points):
    p.append(shape_xml(12 + i * 2, f"Value title {i+1}", 6.76, y, 5.6, 0.32, text=title, size=1450, color_hex=GREEN if i == 1 else BLUE, bold=True))
    p.append(shape_xml(13 + i * 2, f"Value body {i+1}", 6.76, y + 0.32, 5.7, 0.54, text=body, size=1180, color_hex=MUTED, valign="t"))
slides.append((p, [("rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"), ("rId2", "image", "../media/image3.png")]))


# 6: breadth and fit
p = base_slide(6, "Designed for the realities of growing businesses.", "WHO IT SERVES")
ix, iy, iw, ih = contain(ideas, 0.78, 2.0, 4.7, 3.85)
media["image4.png"] = ideas
p.append(picture_xml(9, "Team planning illustration", "rId2", ix, iy, iw, ih))
p.append(shape_xml(10, "Fit statement", 5.65, 1.87, 6.45, 0.65, text="A shared foundation for day-to-day operations, with workflows that can fit different business models.", size=1700, color_hex=INK, bold=True))
segments = [
    (5.68, 2.82, "TRADE & RETAIL", "Sales, products, stock and customer balances."),
    (8.9, 2.82, "SERVICE TEAMS", "Appointments, jobs, people and service income."),
    (5.68, 4.45, "HOSPITALITY", "Orders, menus and operational handoffs."),
    (8.9, 4.45, "RENTAL & PROPERTY", "Bookings, assets, tenancies and collections."),
]
for i, (x, y, title, body) in enumerate(segments):
    p.append(shape_xml(11 + i * 2, f"Segment {i+1}", x, y, 2.9, 1.23, PALE, line="E3EAF3", radius=True))
    p.append(shape_xml(12 + i * 2, f"Segment title {i+1}", x + 0.14, y + 0.14, 2.62, 0.25, text=title, size=930, color_hex=GREEN if i % 2 else BLUE, bold=True))
    p.append(shape_xml(20 + i, f"Segment body {i+1}", x + 0.14, y + 0.49, 2.62, 0.59, text=body, size=1100, color_hex=INK, valign="t"))
slides.append((p, [("rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"), ("rId2", "image", "../media/image4.png")]))


# 7: close
p = [shape_xml(2, "Closing background", 0, 0, SW, SH, NAVY),
     shape_xml(3, "Green accent", 0.78, 0.72, 0.55, 0.065, GREEN)]
lx, ly, lw, lh = contain(logo, 0.78, 1.0, 1.84, 1.8)
media["image5.png"] = logo
p.append(picture_xml(4, "JibuSales logo", "rId2", lx, ly, lw, lh))
p += [shape_xml(5, "Closing title", 0.82, 3.05, 7.3, 1.36, text="A clearer way to\nrun the business.", size=3400, color_hex=WHITE, bold=True),
      shape_xml(6, "Closing statement", 0.86, 4.75, 7.05, 0.76, text="JibuSales brings everyday operations and financial visibility together, so businesses can move forward with confidence.", size=1650, color_hex="DCE9F7"),
      shape_xml(7, "Brand line", 0.86, 6.55, 4.8, 0.3, text="Sell smart. Grow fast.", size=1100, color_hex="A8D6FF", bold=True),
      shape_xml(8, "Visual panel", 9.25, 0, 4.1, 7.5, BLUE),
      shape_xml(9, "Panel mark", 9.86, 2.05, 2.9, 0.08, GREEN),
      shape_xml(10, "Panel title", 9.86, 2.43, 2.75, 1.2, text="One place.\nClearer control.", size=2450, color_hex=WHITE, bold=True),
      shape_xml(11, "Panel support", 9.86, 4.12, 2.65, 0.93, text="Sales · Stock · Finance\nCustomers · Suppliers", size=1350, color_hex="E3EEFB")]
slides.append((p, [("rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"), ("rId2", "image", "../media/image5.png")]))


def slide_master():
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
            '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>'
            '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
            '<p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>')


def layout_xml():
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">'
            '<p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>')


def theme_xml():
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="JibuSales">'
            '<a:themeElements><a:clrScheme name="JibuSales"><a:dk1><a:srgbClr val="10264D"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="17243A"/></a:dk2><a:lt2><a:srgbClr val="F3F7FC"/></a:lt2><a:accent1><a:srgbClr val="1677E8"/></a:accent1><a:accent2><a:srgbClr val="219653"/></a:accent2><a:accent3><a:srgbClr val="E38B2C"/></a:accent3><a:accent4><a:srgbClr val="58677D"/></a:accent4><a:accent5><a:srgbClr val="A8D6FF"/></a:accent5><a:accent6><a:srgbClr val="DDE5EF"/></a:accent6><a:hlink><a:srgbClr val="1677E8"/></a:hlink><a:folHlink><a:srgbClr val="58677D"/></a:folHlink></a:clrScheme>'
            '<a:fontScheme name="Aptos"><a:majorFont><a:latin typeface="Aptos Display"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/></a:minorFont></a:fontScheme>'
            '<a:fmtScheme name="JibuSales"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>')


content = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
           '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
           '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
           '<Default Extension="xml" ContentType="application/xml"/>',
           '<Default Extension="png" ContentType="image/png"/>',
           '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>',
           '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>',
           '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>',
           '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>']
for i in range(1, len(slides) + 1):
    content.append(f'<Override PartName="/ppt/slides/slide{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>')
content.append('</Types>')

slide_ids = "".join(f'<p:sldId id="{255+i}" r:id="rId{i+1}"/>' for i in range(len(slides)))
pres = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
        '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>'
        f'<p:sldIdLst>{slide_ids}</p:sldIdLst><p:sldSz cx="{emu(SW)}" cy="{emu(SH)}" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle/></p:presentation>')

with ZipFile(OUT, "w", ZIP_DEFLATED) as z:
    z.writestr("[Content_Types].xml", "".join(content))
    z.writestr("_rels/.rels", rels_xml([("rId1", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument", "ppt/presentation.xml")]))
    z.writestr("ppt/presentation.xml", pres)
    pres_rels = [("rId1", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster", "slideMasters/slideMaster1.xml")]
    pres_rels += [(f"rId{i+1}", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide", f"slides/slide{i}.xml") for i in range(len(slides))]
    z.writestr("ppt/_rels/presentation.xml.rels", rels_xml(pres_rels))
    z.writestr("ppt/slideMasters/slideMaster1.xml", slide_master())
    z.writestr("ppt/slideMasters/_rels/slideMaster1.xml.rels", rels_xml([
        ("rId1", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout", "../slideLayouts/slideLayout1.xml"),
        ("rId2", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme", "../theme/theme1.xml")]))
    z.writestr("ppt/slideLayouts/slideLayout1.xml", layout_xml())
    z.writestr("ppt/slideLayouts/_rels/slideLayout1.xml.rels", rels_xml([("rId1", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster", "../slideMasters/slideMaster1.xml")]))
    z.writestr("ppt/theme/theme1.xml", theme_xml())
    for index, (parts, relations) in enumerate(slides, 1):
        z.writestr(f"ppt/slides/slide{index}.xml", slide_xml(parts))
        rel_items = []
        for rid, kind, target in relations:
            rel_type = ("http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" if kind == "slideLayout"
                        else "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image")
            rel_items.append((rid, rel_type, target))
        z.writestr(f"ppt/slides/_rels/slide{index}.xml.rels", rels_xml(rel_items))
    for name, path in media.items():
        z.write(path, f"ppt/media/{name}")

with ZipFile(OUT) as z:
    bad = z.testzip()
    if bad:
        raise RuntimeError(f"Corrupt archive member: {bad}")
    if len([n for n in z.namelist() if n.startswith("ppt/slides/slide") and n.endswith(".xml")]) != len(slides):
        raise RuntimeError("Slide count validation failed")
print(f"Created {OUT} ({len(slides)} slides, {OUT.stat().st_size:,} bytes)")
