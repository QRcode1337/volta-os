import 'server-only';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { NleTextStyle } from '@/types/nle';
import { FONT_STACK } from '@/lib/nle/model';
import { CACHE_DIR, NleError, ensureDir, sha1 } from './paths';

// Text clips → transparent PNGs. The Homebrew ffmpeg on this host is built without libfreetype (no drawtext), so text
// is rasterised with CoreText by a tiny Swift helper compiled once into cache/bin/. Fonts resolve exactly like the
// browser's FONT_STACK: the first installed family wins, then the generic (system-ui / serif / monospace).
//
// Layout contract (the preview should match it): no automatic wrapping, lines split on "\n"; line-height 1.2;
// per-line alignment inside the block; letter-spacing = CoreText kern (px after every glyph); stroke = outline OUTSIDE
// the glyphs, strokeWidth px wide (drawn 2x wide under the fill, like CSS `paint-order: stroke` with
// `-webkit-text-stroke-width: 2*strokeWidth`); background box = rounded rect, padding 0.18em x 0.35em, radius 0.12em.
// The PNG is centred on the text block, so its centre is the clip's anchor.

export const TEXT_PAD_X_EM = 0.35;
export const TEXT_PAD_Y_EM = 0.18;
export const TEXT_RADIUS_EM = 0.12;
export const TEXT_LINE_HEIGHT = 1.2;

const SWIFT_SRC = String.raw`
import Foundation
import CoreText
import CoreGraphics
import ImageIO

struct Spec: Decodable {
  let out: String; let families: [String]; let generic: String; let size: Double; let weight: Int; let italic: Bool
  let color: [Double]; let stroke: [Double]?; let strokeWidth: Double; let background: [Double]?
  let letterSpacing: Double; let align: String; let lines: [String]; let lineHeight: Double
  let padX: Double; let padY: Double; let radius: Double
}
func fail(_ m: String) -> Never { FileHandle.standardError.write((m + "\n").data(using: .utf8)!); exit(1) }
let input = FileHandle.standardInput.readDataToEndOfFile()
guard let s = try? JSONDecoder().decode(Spec.self, from: input) else { fail("bad spec json") }
let size = CGFloat(max(1, s.size))
func wtrait(_ w: Int) -> CGFloat { w >= 800 ? 0.56 : (w >= 600 ? 0.3 : 0.0) }
let wantW = wtrait(s.weight)
func pick(_ fam: String) -> CTFont? {
  let probe = CTFontCreateWithName(fam as CFString, size, nil)
  if (CTFontCopyFamilyName(probe) as String).caseInsensitiveCompare(fam) != .orderedSame { return nil }
  let q = CTFontDescriptorCreateWithAttributes([kCTFontFamilyNameAttribute: fam] as CFDictionary)
  guard let all = CTFontDescriptorCreateMatchingFontDescriptors(q, nil) as? [CTFontDescriptor], !all.isEmpty else { return probe }
  var best: CTFontDescriptor = all[0]; var bestScore = CGFloat.greatestFiniteMagnitude
  for d in all {
    let tr = CTFontDescriptorCopyAttribute(d, kCTFontTraitsAttribute) as? [CFString: Any] ?? [:]
    let w = (tr[kCTFontWeightTrait] as? NSNumber).map { CGFloat($0.doubleValue) } ?? 0
    let sym = (tr[kCTFontSymbolicTrait] as? NSNumber)?.uint32Value ?? 0
    let it = (sym & CTFontSymbolicTraits.traitItalic.rawValue) != 0
    let wd = (tr[kCTFontWidthTrait] as? NSNumber).map { CGFloat($0.doubleValue) } ?? 0
    let score = abs(w - wantW) + (it == s.italic ? 0 : 10) + abs(wd) * 5
    if score < bestScore { bestScore = score; best = d }
  }
  return CTFontCreateWithFontDescriptor(best, size, nil)
}
var font: CTFont? = nil
for fam in s.families { if let f = pick(fam) { font = f; break } }
if font == nil {
  let fam: String? = s.generic == "serif" ? "Times New Roman" : (s.generic == "mono" ? "Menlo" : nil)
  if let fam = fam { font = pick(fam) }
  if font == nil {
    let base = CTFontCreateUIFontForLanguage(.system, size, nil)!
    var traits: [CFString: Any] = [kCTFontWeightTrait: wantW]
    if s.italic { traits[kCTFontSymbolicTrait] = CTFontSymbolicTraits.traitItalic.rawValue }
    let d = CTFontDescriptorCreateCopyWithAttributes(CTFontCopyFontDescriptor(base), [kCTFontTraitsAttribute: traits] as CFDictionary)
    font = CTFontCreateWithFontDescriptor(d, size, nil)
  }
}
let f = font!
let cs = CGColorSpace(name: CGColorSpace.sRGB)!
func color(_ c: [Double]) -> CGColor { CGColor(colorSpace: cs, components: c.map { CGFloat($0) })! }
let ascent = CTFontGetAscent(f), descent = CTFontGetDescent(f)
let lh = CGFloat(s.lineHeight) * size
func line(_ text: String, fromContext: Bool) -> CTLine {
  var a: [NSAttributedString.Key: Any] = [NSAttributedString.Key(kCTFontAttributeName as String): f, NSAttributedString.Key(kCTKernAttributeName as String): CGFloat(s.letterSpacing)]
  if fromContext { a[NSAttributedString.Key(kCTForegroundColorFromContextAttributeName as String)] = true }
  else { a[NSAttributedString.Key(kCTForegroundColorAttributeName as String)] = color(s.color) }
  return CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: a))
}
let lines = s.lines.isEmpty ? [""] : s.lines
let widths = lines.map { CGFloat(CTLineGetTypographicBounds(line($0, fromContext: false), nil, nil, nil)) }
let blockW = max(1, widths.max() ?? 1), blockH = lh * CGFloat(lines.count)
let sw = CGFloat(max(0, s.stroke == nil ? 0 : s.strokeWidth))
let hasBg = s.background != nil
let padX = hasBg ? CGFloat(s.padX) : 0, padY = hasBg ? CGFloat(s.padY) : 0
let mx = ceil(max(padX, sw) + size * 0.12 + 2), my = ceil(max(padY, sw) + size * 0.06 + 2)
let W = Int(ceil(blockW + 2 * mx)), H = Int(ceil(blockH + 2 * my))
if W > 16384 || H > 16384 { fail("text too large") }
guard let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: 0, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { fail("no context") }
ctx.setAllowsAntialiasing(true); ctx.setShouldSmoothFonts(false)
let x0 = (CGFloat(W) - blockW) / 2, top0 = (CGFloat(H) - blockH) / 2
if let bg = s.background {
  let r = CGRect(x: x0 - padX, y: top0 - padY, width: blockW + 2 * padX, height: blockH + 2 * padY)
  ctx.setFillColor(color(bg))
  ctx.addPath(CGPath(roundedRect: r, cornerWidth: CGFloat(s.radius), cornerHeight: CGFloat(s.radius), transform: nil)); ctx.fillPath()
}
func draw(fromContext: Bool) {
  for (i, t) in lines.enumerated() {
    let w = widths[i]
    let x = s.align == "left" ? x0 : (s.align == "right" ? x0 + blockW - w : x0 + (blockW - w) / 2)
    let baselineFromTop = top0 + CGFloat(i) * lh + (lh - (ascent + descent)) / 2 + ascent
    ctx.textPosition = CGPoint(x: x, y: CGFloat(H) - baselineFromTop)
    CTLineDraw(line(t, fromContext: fromContext), ctx)
  }
}
if let st = s.stroke, sw > 0 {
  ctx.setTextDrawingMode(.stroke); ctx.setLineWidth(sw * 2); ctx.setLineJoin(.round); ctx.setStrokeColor(color(st))
  draw(fromContext: true)
}
ctx.setTextDrawingMode(.fill)
draw(fromContext: false)
guard let img = ctx.makeImage(), let dst = CGImageDestinationCreateWithURL(URL(fileURLWithPath: s.out) as CFURL, "public.png" as CFString, 1, nil) else { fail("no image") }
CGImageDestinationAddImage(dst, img, nil)
if !CGImageDestinationFinalize(dst) { fail("png write failed") }
print("{\"w\":\(W),\"h\":\(H),\"bx\":\(Double(x0)),\"bw\":\(Double(blockW))}")
`;

const BIN_DIR = path.join(CACHE_DIR, 'bin');
const SRC_HASH = sha1(SWIFT_SRC, 12);
const BIN = path.join(BIN_DIR, `nle-text-${SRC_HASH}`);
const g = globalThis as unknown as { __voltaNleTextBin?: Promise<string> };

function compileHelper(): Promise<string> {
  return (g.__voltaNleTextBin ??= (async () => {
    if (await fs.stat(BIN).then((s) => s.isFile(), () => false)) return BIN;
    await ensureDir(BIN_DIR);
    const src = path.join(BIN_DIR, `nle-text-${SRC_HASH}.swift`);
    await fs.writeFile(src, SWIFT_SRC);
    const tmp = `${BIN}.${process.pid}.tmp`;
    await new Promise<void>((resolve, reject) =>
      execFile('/usr/bin/swiftc', ['-O', '-o', tmp, src], { timeout: 180_000, maxBuffer: 4 * 1024 * 1024 }, (err, _o, stderr) =>
        err ? reject(new NleError(`Cannot build the text renderer (needs Xcode Command Line Tools / swiftc): ${String(stderr || err.message).trim().split('\n')[0].slice(0, 200)}`, 500)) : resolve(),
      ),
    );
    await fs.rename(tmp, BIN);
    return BIN;
  })().catch((err) => {
    g.__voltaNleTextBin = undefined;
    throw err;
  }));
}

// ── CSS colours ──────────────────────────────────────────────────────────────────────────────────

const NAMED: Record<string, string> = { black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', transparent: '#00000000', gray: '#808080', grey: '#808080' };

/** CSS colour (#rgb, #rgba, #rrggbb, #rrggbbaa, rgb(), rgba(), a few names) → [r, g, b, a] in 0..1. */
export function parseColor(raw: string | null | undefined, fallback: [number, number, number, number] = [0, 0, 0, 1]): [number, number, number, number] {
  if (!raw) return fallback;
  let s = raw.trim().toLowerCase();
  s = NAMED[s] ?? s;
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return fallback;
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
    return [n(0), n(2), n(4), h.length === 8 ? n(6) : 1];
  }
  m = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(s);
  if (m) {
    const ch = (v: string) => Math.max(0, Math.min(1, v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v) / 255));
    const al = m[4] === undefined ? 1 : Math.max(0, Math.min(1, m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])));
    return [ch(m[1]), ch(m[2]), ch(m[3]), al];
  }
  return fallback;
}

/** ffmpeg colour literal 0xRRGGBB@a. */
export function ffColor(raw: string | null | undefined, fallback = '#000000'): string {
  const [r, g2, b, a] = parseColor(raw, parseColor(fallback));
  const hx = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `0x${hx(r)}${hx(g2)}${hx(b)}${a < 1 ? `@${a.toFixed(3)}` : ''}`;
}

function stackOf(font: NleTextStyle['font']): { families: string[]; generic: string } {
  const parts = (FONT_STACK[font] ?? FONT_STACK.Inter).split(',').map((p) => p.trim().replace(/^["']|["']$/g, ''));
  const generics: Record<string, string> = { 'sans-serif': 'sans', 'system-ui': 'sans', serif: 'serif', monospace: 'mono' };
  const families = parts.filter((p) => !generics[p]);
  const generic = generics[parts.find((p) => generics[p]) ?? 'sans-serif'] ?? 'sans';
  return { families, generic };
}

export interface TextRaster {
  file: string;
  /** PNG size. */
  w: number;
  h: number;
  /** Text block left edge and width inside the PNG (typewriter reveal). */
  bx: number;
  bw: number;
}

/** Rasterise a text style at `px` = pixels per sequence pixel (output height / sequence height × extra scale). */
export async function renderText(style: NleTextStyle, px: number): Promise<TextRaster> {
  const size = Math.max(1, style.size * px);
  const { families, generic } = stackOf(style.font);
  const spec = {
    families,
    generic,
    size: Math.round(size * 100) / 100,
    weight: style.weight,
    italic: !!style.italic,
    color: parseColor(style.color, [1, 1, 1, 1]),
    stroke: style.stroke && style.strokeWidth > 0 ? parseColor(style.stroke) : null,
    strokeWidth: Math.max(0, style.strokeWidth * px),
    background: style.background ? parseColor(style.background) : null,
    letterSpacing: (style.letterSpacing || 0) * px,
    align: style.align,
    lines: String(style.content ?? '').replace(/\r\n?/g, '\n').split('\n'),
    lineHeight: TEXT_LINE_HEIGHT,
    padX: TEXT_PAD_X_EM * size,
    padY: TEXT_PAD_Y_EM * size,
    radius: TEXT_RADIUS_EM * size,
  };
  const key = sha1(`text|${SRC_HASH}|${JSON.stringify(spec)}`);
  const out = path.join(CACHE_DIR, `text_${key}.png`);
  const metaFile = `${out}.json`;
  try {
    const meta = JSON.parse(await fs.readFile(metaFile, 'utf8')) as Omit<TextRaster, 'file'>;
    const now = new Date();
    await fs.utimes(out, now, now); // keep it young for pruneCache
    await fs.utimes(metaFile, now, now);
    return { file: out, ...meta };
  } catch {
    // render
  }
  const bin = await compileHelper();
  await ensureDir(CACHE_DIR);
  const stdout = await new Promise<string>((resolve, reject) => {
    const p = spawn(bin, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    let so = '';
    let se = '';
    const timer = setTimeout(() => p.kill('SIGKILL'), 30_000);
    p.stdout.on('data', (d: Buffer) => (so += d.toString()));
    p.stderr.on('data', (d: Buffer) => (se += d.toString()));
    p.on('error', (e) => {
      clearTimeout(timer);
      reject(new NleError(`Text renderer failed to start: ${e.message}`, 500));
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(so);
      else reject(new NleError(`Text renderer failed: ${se.trim().slice(0, 200) || `exit ${code}`}`, 500));
    });
    p.stdin.end(JSON.stringify({ ...spec, out }));
  });
  const meta = JSON.parse(stdout.trim()) as Omit<TextRaster, 'file'>;
  await fs.writeFile(metaFile, JSON.stringify(meta));
  return { file: out, ...meta };
}
