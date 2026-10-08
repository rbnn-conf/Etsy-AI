import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { zipSync, unzipSync } from 'fflate';
import { crc32 } from 'node:zlib';

export const COUNT = 20;
// Canvas sizing only; never a claim about native artwork resolution.
export const DPI = 150;
export const MARGIN_MM = 12;
// Conservative decimal MB, also below 20 MiB.
export const LIMIT = 20_000_000;
export const IDS = Array.from({ length: COUNT }, (_, i) => `P${String(i + 1).padStart(3, '0')}`);
export const FORMATS = { A4: [210, 297], 'US-Letter': [215.9, 279.4] };
export const PREFIX = 'LumiumX-Cozy-Spooky-Halloween';
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const pixels = mm => Math.round(mm * DPI / 25.4);
export const pngName = (id, format) => `LumiumX-Halloween-${id}-${format}.png`;
export function assert(ok, message) { if (!ok) throw new Error(message); }
export function validatePngStructure(bytes) {
  assert(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])), 'Invalid PNG signature');
  let at=8, ended=false, imageData=false, header=false;
  while(at<bytes.length) {
    assert(at+12<=bytes.length,'Truncated PNG chunk');
    const length=bytes.readUInt32BE(at), end=at+12+length;
    assert(end<=bytes.length,'Truncated PNG chunk payload');
    const type=bytes.toString('ascii',at+4,at+8);
    assert(crc32(bytes.subarray(at+4,at+8+length))===bytes.readUInt32BE(at+8+length),`PNG CRC mismatch in ${type}`);
    assert(header || (type==='IHDR' && length===13),'PNG must start with IHDR');
    if(type==='IHDR') {assert(!header,'Duplicate PNG header');header=true;}
    assert(type!=='acTL','Animated PNG sources are not supported');
    if(type==='IDAT')imageData=true;
    if(type==='IEND') {assert(length===0 && end===bytes.length,'Invalid PNG end / trailing data');ended=true;}
    at=end;
  }
  assert(header && imageData && ended,'Incomplete PNG');
}
export function placement(width, height, format, dpi = DPI) {
  const [w, h] = FORMATS[format].map(mm => Math.round(mm * dpi / 25.4));
  const margin = Math.ceil(MARGIN_MM * dpi / 25.4);
  const scale = Math.min(1, (w - margin * 2) / width, (h - margin * 2) / height);
  const iw = Math.round(width * scale), ih = Math.round(height * scale);
  return { w, h, iw, ih, left: Math.floor((w - iw) / 2), top: Math.floor((h - ih) / 2), scale };
}
export async function decode(bytes) {
  return sharp(bytes, { failOn: 'warning' }).flatten({ background: '#ffffff' })
    .toColourspace('srgb').removeAlpha().raw().toBuffer({ resolveWithObject: true });
}
export async function validateSources(dir, approvedPages = [], { allowSquare = false } = {}) {
  const names = (await readdir(dir)).filter(n => n !== '.gitkeep' && n !== 'README.md');
  const errors = [], mapped = new Map();
  for (const name of names) {
    const matches = [...name.matchAll(/(?:^|[^A-Za-z0-9])(P\d{3})(?=[^A-Za-z0-9]|$)/g)];
    const numeric = /^(\d{1,2})\.png$/i.exec(name);
    const id = numeric ? `P${numeric[1].padStart(3, '0')}` : matches[0]?.[1];
    if (!/\.png$/i.test(name) || (!numeric && matches.length !== 1) || !IDS.includes(id)) {
      errors.push(`Unexpected source filename: ${name}; use 1.png through 20.png or P001.png through P020.png.`); continue;
    }
    if (mapped.has(id)) errors.push(`Duplicate page ID: ${id}`);
    mapped.set(id, name);
  }
  for (const id of IDS) if (!mapped.has(id)) errors.push(`Missing source: ${id}`);
  if (names.length !== COUNT) errors.push(`Expected ${COUNT} source PNGs; found ${names.length}.`);
  const records = [], seen = new Map();
  for (const [id, name] of mapped) {
    try {
      const bytes = await readFile(join(dir, name));
      validatePngStructure(bytes);
      const meta = await sharp(bytes, { failOn: 'warning' }).metadata();
      assert(meta.format === 'png' && (meta.pages ?? 1) === 1, `${id}: expected a single PNG image`);
      assert(!meta.orientation || meta.orientation === 1, `${id}: unsupported orientation metadata`);
      assert(meta.height > meta.width || (allowSquare && meta.height === meta.width), `${id}: source must be portrait${allowSquare ? ' or square' : ''}`);
      const decoded = await decode(bytes);
      const { width, height, channels } = decoded.info;
      const digest = hash(Buffer.concat([Buffer.from(`${width}x${height}:`), decoded.data]));
      assert(!seen.has(digest), `${id}: duplicate artwork of ${seen.get(digest)}`);
      seen.set(digest, id);
      const approved = approvedPages.find(p=>p.sourceId===id && p.approvedSha256===hash(bytes));
      const fullPageA4Dpi = Math.max(width / ((210-2*MARGIN_MM)/25.4),height / ((297-2*MARGIN_MM)/25.4));
      let white = 0, ink = 0, minX = width, minY = height, maxX = -1, maxY = -1;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const at = (y * width + x) * channels;
        const low = Math.min(decoded.data[at], decoded.data[at+1], decoded.data[at+2]);
        if (low >= 245) white++;
        if (low < 220) { ink++; minX = Math.min(minX,x); minY = Math.min(minY,y); maxX = Math.max(maxX,x); maxY = Math.max(maxY,y); }
      }
      assert(white / (width * height) >= 0.70 || approved, `${id}: less than 70% near-white background; visual review needed`);
      assert(ink >= 100, `${id}: blank or almost empty artwork`);
      const guard = Math.max(3, Math.ceil(Math.min(width, height) * 0.005));
      const sourceEdgeInk=!(minX >= guard && minY >= guard && maxX < width - guard && maxY < height - guard);
      assert(!sourceEdgeInk || approved,
        `${id}: ink within ${guard}px of source edge; possible clipped artwork / unsafe source margin`);
      records.push({ id, name, width, height, sha256: hash(bytes), pixelHash: digest,
        whiteFraction: white / (width * height), inkBounds: [minX,minY,maxX,maxY],
        fullPageA4Dpi:Math.round(fullPageA4Dpi),native300Dpi:fullPageA4Dpi>=300,
        resolutionStatus:fullPageA4Dpi<300?'PASS WITH NOTICE':'PASS',
        sourceEdgeInk,sourceEdgeReview:approved?.sourceEdgeReview??null });
    } catch (e) { errors.push(`${name}: ${e.message}`); }
  }
  return { records: records.sort((a,b) => a.id.localeCompare(b.id)), errors };
}
// Both candidates retain all decoded RGB values. Palette encoding is accepted
// only after an exact comparison, never because it merely looks similar.
export async function encodeLossless(raw, info, density = DPI) {
  const input = { raw: { width: info.width, height: info.height, channels: info.channels } };
  let normal = await sharp(raw, input).withMetadata({ density })
    .png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  const alternative=await sharp(raw,input).withMetadata({density}).png({compressionLevel:9,adaptiveFiltering:false}).toBuffer();
  if(alternative.length<normal.length)normal=alternative;
  const colours = new Set();
  for (let i = 0; i < raw.length && colours.size <= 256; i += info.channels)
    colours.add(`${raw[i]},${raw[i+1]},${raw[i+2]}`);
  if (colours.size > 256) return normal;
  const palette = await sharp(raw, input).withMetadata({ density })
    .png({ palette: true, colours: 256, dither: 0, effort: 10, compressionLevel: 9 }).toBuffer();
  return palette.length < normal.length && (await decode(palette)).data.equals(raw) ? palette : normal;
}
export async function renderPage(bytes, format, { dpi = DPI } = {}) {
  const source = await decode(bytes), p = placement(source.info.width, source.info.height, format, dpi);
  // Contain the entire source canvas; no trim, crop, threshold, or redraw.
  const resized = p.scale===1 ? source.data : await sharp(source.data, { raw: source.info }).resize(p.iw, p.ih, { fit: 'fill',kernel:'lanczos3' }).raw().toBuffer();
  const raw = Buffer.alloc(p.w * p.h * 3, 255);
  for (let y = 0; y < p.ih; y++) resized.copy(raw, ((p.top+y)*p.w+p.left)*3, y*p.iw*3, (y+1)*p.iw*3);
  const info = { width: p.w, height: p.h, channels: 3 };
  return { bytes: await encodeLossless(raw, info, dpi), pixelHash: hash(raw), placement: p };
}
export function zip(entries) { return Buffer.from(zipSync(entries, { level: 9 })); }
export function verifyZip(bytes, expected) {
  const actual = unzipSync(bytes);
  assert(Object.keys(actual).sort().join('|') === Object.keys(expected).sort().join('|'), 'ZIP filename/count mismatch');
  for (const [name, content] of Object.entries(expected)) assert(hash(actual[name]) === hash(content), `ZIP corrupted/mismatched entry: ${name}`);
}
const entrySizeCache=new WeakMap();
function zippedEntrySize(name,bytes) {
  let names=entrySizeCache.get(bytes);
  if(!names){names=new Map();entrySizeCache.set(bytes,names);}
  if(!names.has(name))names.set(name,zip({[name]:bytes}).length);
  return names.get(name);
}
export function packageForEtsy(canonical, loose, limit = LIMIT, { prefix = PREFIX, forceBundles = false } = {}) {
  if (!forceBundles && Object.values(canonical).every(b => b.length <= limit)) return { mode: 'standard', files: canonical };
  // Keep every canonical filename inside lossless ZIP bundles. Group PDFs and
  // guide plus individual PNGs; nesting the two PNG ZIPs prevents useful splits.
  const sorted = Object.entries(loose).map(([name, bytes]) => ({ name, bytes, size: zippedEntrySize(name,bytes) }))
    .sort((a,b) => b.size-a.size);
  let bins = [];
  for (const item of sorted) {
    assert(item.size <= limit, `Cannot fit ${item.name} within 20 MB losslessly. Build blocked; no quality reduction applied.`);
    let bin = bins.find(b => b.size + item.size <= limit);
    if (!bin) { bin = { entries: {}, size: 0 }; bins.push(bin); }
    bin.entries[item.name] = item.bytes; bin.size += item.size;
  }
  if(bins.length>5 && sorted.reduce((sum,item)=>sum+item.size,0)<=5*limit) {
    // Bounded exact placement improves on greedy packing without changing bytes.
    const candidate=Array.from({length:5},()=>({entries:{},size:0}));let visits=0;
    function place(index) {
      if(index===sorted.length)return true;
      if(++visits>250000)return false;
      const item=sorted[index], tried=new Set();
      for(const bin of [...candidate].sort((a,b)=>b.size-a.size)) {
        if(tried.has(bin.size) || bin.size+item.size>limit)continue;
        tried.add(bin.size);bin.entries[item.name]=item.bytes;bin.size+=item.size;
        if(place(index+1))return true;
        delete bin.entries[item.name];bin.size-=item.size;
      }
      return false;
    }
    if(place(0))bins=candidate.filter(b=>b.size);
  }
  assert(bins.length <= 5, `Could not fit lossless bundles into five attachments; greedy packing needs ${bins.length}. Payload estimate: ${(sorted.reduce((sum,item)=>sum+item.size,0)/1e6).toFixed(2)} MB. PNG pixels were not reduced.`);
  const files = {};
  bins.forEach((bin,i) => {
    const bytes = zip(bin.entries); verifyZip(bytes, bin.entries);
    assert(bytes.length <= limit, 'Etsy bundle exceeds limit');
    files[`${prefix}-Bundle-${i+1}-of-${bins.length}.zip`] = bytes;
  });
  return { mode: 'lossless-bundles', files };
}
