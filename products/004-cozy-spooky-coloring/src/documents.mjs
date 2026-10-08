import sharp from 'sharp';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { FORMATS, placement, DPI } from './core.mjs';
const jpegCache=new WeakMap();
async function jpeg(bytes,quality) {
  let cached=jpegCache.get(bytes);
  if(cached?.quality!==quality) {
    cached={quality,bytes:await sharp(bytes).flatten({background:'#ffffff'}).jpeg({quality,chromaSubsampling:'4:4:4',mozjpeg:true}).toBuffer()};
    jpegCache.set(bytes,cached);
  }
  return cached.bytes;
}

export async function book(pages, format, quality=null, { title = 'Cozy Spooky Halloween', dpi = DPI } = {}) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`LumiumX ${title} - ${format}`);
  pdf.setAuthor('LumiumX');
  const [w,h] = FORMATS[format].map(mm => mm * 72 / 25.4);
  for (const bytes of pages) {
    const meta=await sharp(bytes).metadata(), p=placement(meta.width,meta.height,format,dpi);
    const image = quality===null ? await pdf.embedPng(bytes) : await pdf.embedJpg(await jpeg(bytes,quality));
    const iw=p.iw*72/dpi, ih=p.ih*72/dpi;
    pdf.addPage([w,h]).drawImage(image, { x: (w-iw)/2, y: (h-ih)/2, width: iw, height: ih });
  }
  return Buffer.from(await pdf.save());
}
export async function printingGuide({ title = 'Cozy Spooky Halloween Coloring Book', introduction = 'Explore 20 connected cozy Halloween adventures in two paper sizes.', closing = 'Enjoy a little cozy, spooky creativity.', printService = false } = {}) {
  const pdf = await PDFDocument.create();
  pdf.setTitle('LumiumX Printing Guide'); pdf.setAuthor('LumiumX');
  const page = pdf.addPage([210*72/25.4,297*72/25.4]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(.15,.15,.18), accent = rgb(.33,.26,.4);
  let y = 782;
  const line = (text, size=11, font=regular, gap=19) => {
    page.drawText(text, { x: 48, y, size, font, color: ink }); y -= gap;
  };
  page.drawRectangle({x:48,y:804,width:499,height:3,color:accent});
  line('LUMIUMX',12,bold,38);
  line('Your printing guide',25,bold,31);
  line(title,13,regular,43);
  const section = (title, lines) => { line(title,12,bold,23); for (const text of lines) line(text); y -= 20; };
  section('A digital book, ready to print', [
    introduction,
    'This is a digital product. No physical item is shipped.',
    'Save the files to your computer and extract any ZIP folders first.'
  ]);
  section('Choose the paper size that matches your printer', [
    'A4: 210 x 297 mm. US Letter: 8.5 x 11 inches.',
    'Open the matching PDF in a PDF reader, or print individual PNG pages.',
    'For PNGs, set the paper size manually; photo apps may auto-crop.'
  ]);
  section('Print at home', [
    'Choose portrait orientation and print at 100% / Actual Size.',
    'Turn off borderless printing, crop-to-fill and automatic enlargement.',
    'The pages already include print margins. Print one test page first.',
    'If your printer needs larger margins, use Fit to printable area.',
    printService ? 'Print single-sided at home or through a local print service.' : 'Print single-sided for comfortable colouring.'
  ]);
  section('Choose your paper', [
    'Standard white printer paper works well for pencils and crayons.',
    'For markers, try thicker paper supported by your printer.',
    'Place a spare sheet underneath to help protect your work surface.'
  ]);
  section('A small note on print results', [
    'Colours and printed tones may vary depending on your printer,',
    'paper and print settings. Use a good-quality print setting.'
  ]);
  line(closing,12,bold);
  return Buffer.from(await pdf.save());
}
export async function contactSheet(previews) {
  const cellW=240, cellH=350, columns=5, width=columns*cellW, height=Math.ceil(previews.length/columns)*cellH;
  const overlays=[];
  for (let i=0;i<previews.length;i++) {
    const {id,bytes}=previews[i];
    const thumb = await sharp(bytes).resize(220,310,{fit:'inside'}).png().toBuffer();
    const meta = await sharp(thumb).metadata();
    const x=(i%columns)*cellW, y=Math.floor(i/columns)*cellH;
    overlays.push({input:thumb,left:x+Math.floor((cellW-meta.width)/2),top:y+8});
    // Only the internal thumbnail label is generated; approved artwork is untouched.
    const label=Buffer.from(`<svg width="240" height="26"><rect width="240" height="26" fill="white"/><text x="120" y="19" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#222">${id}</text></svg>`);
    overlays.push({input:label,left:x,top:y+320});
  }
  return sharp({create:{width,height,channels:3,background:'#ffffff'}}).composite(overlays).png().toBuffer();
}
