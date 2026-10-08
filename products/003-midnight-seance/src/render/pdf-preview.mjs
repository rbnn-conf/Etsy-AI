import { createCanvas } from '@napi-rs/canvas';
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { PDFDocument,PDFName,PDFDict,PDFRawStream,PDFArray } from 'pdf-lib';
const require=createRequire(import.meta.url);
// PDF.js uses Node canvas globals for paths and matrices; import after native setup.
const canvasModule=require('@napi-rs/canvas');
for(const name of ['DOMMatrix','ImageData','Path2D']) globalThis[name]??=canvasModule[name];
const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
const pdfjsRoot=dirname(require.resolve('pdfjs-dist/package.json'));
// Transparency groups must use the same native binding as the main canvas/Path2D.
class ProductCanvasFactory {
  create(width,height){const canvas=createCanvas(width,height);return {canvas,context:canvas.getContext('2d')};}
  reset(target,width,height){target.canvas.width=width;target.canvas.height=height;}
  destroy(target){target.canvas.width=0;target.canvas.height=0;target.canvas=null;target.context=null;}
}
export async function inspectPdf(path,{dpi=300,outPrefix}={}) {
  const data=new Uint8Array(await readFile(path));
  const pdf=await PDFDocument.load(data);
  const nonempty=stream=>stream instanceof PDFRawStream&&stream.contents.length>0;
  function fontEvidence(font){
    const subtype=font.get(PDFName.of('Subtype'))?.toString();
    if(subtype==='/Type3'){
      const glyphs=pdf.context.lookup(font.get(PDFName.of('CharProcs'))),unicode=pdf.context.lookup(font.get(PDFName.of('ToUnicode')));
      const streams=glyphs instanceof PDFDict?glyphs.entries().map(([,ref])=>pdf.context.lookup(ref)):[];
      const descriptor=pdf.context.lookup(font.get(PDFName.of('FontDescriptor')));
      return {name:descriptor?.get(PDFName.of('FontName'))?.toString(),subtype,glyphStreamCount:streams.length,embedded:streams.length>0&&streams.every(nonempty)&&nonempty(unicode),unicodeMap:nonempty(unicode)};
    }
    const descendants=pdf.context.lookup(font.get(PDFName.of('DescendantFonts')));
    if(descendants instanceof PDFArray){const result=fontEvidence(pdf.context.lookup(descendants.get(0)));return{...result,subtype,unicodeMap:nonempty(pdf.context.lookup(font.get(PDFName.of('ToUnicode'))))};}
    const descriptor=pdf.context.lookup(font.get(PDFName.of('FontDescriptor')));
    const key=descriptor instanceof PDFDict?['FontFile','FontFile2','FontFile3'].find(k=>descriptor.has(PDFName.of(k))):null;
    const stream=key?pdf.context.lookup(descriptor.get(PDFName.of(key))):null;
    return{name:descriptor?.get(PDFName.of('FontName'))?.toString(),subtype,embedded:nonempty(stream)};
  }
  const embeddedFontStreams=pdf.context.enumerateIndirectObjects().filter(([,obj])=>obj instanceof PDFDict&&obj.get(PDFName.of('Type'))?.toString()==='/Font').map(([,font])=>fontEvidence(font));
  const doc=await pdfjs.getDocument({data,CanvasFactory:ProductCanvasFactory,useSystemFonts:false,isEvalSupported:false,standardFontDataUrl:join(pdfjsRoot,'standard_fonts').replaceAll('\\','/')+'/',cMapUrl:join(pdfjsRoot,'cmaps').replaceAll('\\','/')+'/',cMapPacked:true}).promise;
  const pages=[];
  try {
    for(let i=1;i<=doc.numPages;i++) {
      const page=await doc.getPage(i),viewport=page.getViewport({scale:dpi/72});
      const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
      await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
      const content=await page.getTextContent();
      const usedFonts=[...new Set(content.items.map(i=>i.fontName).filter(Boolean))];
      const fonts=usedFonts.map(name=>{const f=page.commonObjs.get(name);return {name,loadedName:f.loadedName,family:f.name,embedded:!f.missingFile};});
      const pngPath=outPrefix?`${outPrefix}-${String(i).padStart(2,'0')}.png`:null;
      if(pngPath)await writeFile(pngPath,await sharp(canvas.toBuffer('image/png')).withMetadata({density:dpi}).png().toBuffer());
      const textItems=content.items.filter(i=>typeof i.str==='string').map(i=>({text:i.str,x:i.transform[4],y:i.transform[5],width:i.width,height:i.height}));
      pages.push({page:i,widthPx:canvas.width,heightPx:canvas.height,widthMm:page.view[2]*25.4/72,heightMm:page.view[3]*25.4/72,text:content.items.map(i=>i.str).join(' '),textItems,fonts,embeddedFontStreams,pngPath});
      page.cleanup();
    }
  } finally {await doc.destroy();}
  return pages;
}
