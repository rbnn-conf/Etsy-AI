import { lib } from './config.mjs';
const { PDFDocument, StandardFonts, rgb } = lib('pdf-lib');

// One-page A4 printing guide. UK English; states only what the files contain.
export async function printingGuide({ pageCount=30, activityCount=28, bundleCount=null }={}) {
  const pdf=await PDFDocument.create();
  pdf.setTitle('LumiumX Printing Guide - Cute Ghost Halloween Activity Book'); pdf.setAuthor('LumiumX');
  const page=pdf.addPage([210*72/25.4,297*72/25.4]);
  const regular=await pdf.embedFont(StandardFonts.Helvetica), bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink=rgb(.13,.15,.24), accent=rgb(.85,.45,.16);
  let y=782;
  const line=(text,size=10.5,font=regular,gap=17)=>{page.drawText(text,{x:48,y,size,font,color:ink});y-=gap;};
  page.drawRectangle({x:48,y:804,width:499,height:3,color:accent});
  line('LUMIUMX',12,bold,36);
  line('Your printing guide',25,bold,30);
  line('Cute Ghost Halloween Activity Book',13,regular,38);
  const section=(title,lines)=>{line(title,12,bold,21);for(const t of lines)line(t);y-=16;};
  section("What's in your download",[
    `${pageCount} printable pages: a full-colour cover, ${activityCount} activity pages and a certificate.`,
    'A4 PDF and US Letter PDF, with the same pages in the same order.',
    `${pageCount} individual PNG pages (the original artwork) for printing single pages.`,
    bundleCount?`Download and extract all ${bundleCount} ZIP folders before printing.`:'Download and extract every ZIP folder before printing.',
    'This is a digital product. No physical item is shipped.'
  ]);
  section('Printing the PDF',[
    'Choose the PDF that matches your paper: A4 (210 x 297 mm) or US Letter (8.5 x 11 in).',
    'Print at 100% / Actual Size. Turn off borderless printing and crop-to-fill.',
    'The pages already include white print margins. Print one test page first.',
    'If your printer needs larger margins, choose Fit to printable area.',
    'Page 2 is a landscape image placed on a portrait page, so it prints smaller.'
  ]);
  section('Printing single PNG pages',[
    'Open the PNG in an image viewer and choose Fit to page, not Fill.',
    'Photo printing apps may crop the edges, so check the preview before printing.'
  ]);
  section('Paper and colours',[
    'Standard white printer paper works well for pencils and crayons.',
    'For markers or paint, try thicker paper that your printer supports.',
    'The cover prints in colour; the activity pages are black line art.',
    'Colours can vary with your printer, paper and settings.'
  ]);
  section('Personal use',[
    'Print as many copies as you need for your own household or classroom.',
    'Please do not resell, share or redistribute the digital files.'
  ]);
  line('Have a happy, cozy Halloween!',12,bold);
  return Buffer.from(await pdf.save());
}
