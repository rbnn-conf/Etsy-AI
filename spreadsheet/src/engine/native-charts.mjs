/**
 * Native Excel chart injection.
 *
 * ExcelJS (this engine's whole foundation) can only READ charts, never write
 * them — there is no public API to add a real bar/pie chart to a worksheet.
 * To recreate a reference workbook's native charts exactly, this module
 * post-processes an already-built .xlsx buffer as a raw OOXML zip (via
 * jszip, which ExcelJS itself depends on for its own zip read/write — not a
 * new dependency in spirit) and injects the chart/drawing parts by hand:
 *
 *   xl/charts/chartN.xml        — one per chart (bar or pie)
 *   xl/drawings/drawingM.xml    — one per sheet that has charts, holding an
 *                                 anchor per chart on that sheet
 *   xl/drawings/_rels/drawingM.xml.rels
 *   xl/worksheets/_rels/sheetX.xml.rels  (created or appended to)
 *   <drawing r:id="..."/> spliced into the worksheet XML
 *   [Content_Types].xml Override entries for the new parts
 *
 * The XML shapes here (title-as-rich-text, series spPr solidFill, cat/val
 * strRef+numRef with cached points, twoCellAnchor editAs="absolute") mirror
 * a real chart exported by Excel — verified against a reference workbook's
 * actual chart1..4.xml. Every worksheet/rels file is discovered generically
 * (workbook.xml -> sheet name -> r:id -> xl/_rels/workbook.xml.rels ->
 * target path), the same resolution path Excel itself uses, so this doesn't
 * assume any particular sheetN.xml numbering.
 */

import JSZip from "jszip";

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function numCacheXml(values) {
  const pts = values.map((v, i) => `<c:pt idx="${i}"><c:v>${Number(v) || 0}</c:v></c:pt>`).join("");
  return `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${values.length}"/>${pts}</c:numCache>`;
}

function strCacheXml(values) {
  const pts = values.map((v, i) => `<c:pt idx="${i}"><c:v>${esc(v)}</c:v></c:pt>`).join("");
  return `<c:strCache><c:ptCount val="${values.length}"/>${pts}</c:strCache>`;
}

function titleXml(title, ink) {
  return (
    `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr lvl="0"><a:defRPr sz="1000" b="0">` +
    `<a:solidFill><a:srgbClr val="${ink}"/></a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:pPr>` +
    `<a:r><a:rPr lang="en-US" sz="1000" b="0"><a:solidFill><a:srgbClr val="${ink}"/></a:solidFill>` +
    `<a:latin typeface="+mj-lt"/></a:rPr><a:t>${esc(title)}</a:t></a:r></a:p></c:rich></c:tx>` +
    `<c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>`
  );
}

const CHART_SPACE_OPEN =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" ` +
  `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
  `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
  `<c:date1904 val="0"/><c:lang val="en-US"/><c:roundedCorners val="0"/>`;

const CHART_SPACE_TAIL =
  `<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"><a:alpha val="0"/></a:srgbClr></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr>` +
  `<c:printSettings><c:headerFooter/><c:pageMargins b="0.75" l="0.7" r="0.7" t="0.75" header="0.3" footer="0.3"/><c:pageSetup/></c:printSettings>` +
  `</c:chartSpace>`;

/**
 * @param {{
 *   title: string, ink: string,
 *   categoriesRef: string, categories: string[],
 *   series: Array<{ name: string, valuesRef: string, values: number[], color: string }>,
 *   legendPos?: "t"|"r"|"b"|"l",
 * }} spec
 */
function barChartXml(spec) {
  const ink = spec.ink ?? "1F1F1F";
  const showVal = spec.showValues ? "1" : "0";
  const dataLblTxPr =
    `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr lvl="0"><a:defRPr sz="900" b="0"><a:solidFill><a:srgbClr val="${ink}"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>`;
  const sers = spec.series
    .map(
      (s, idx) =>
        `<c:ser><c:idx val="${idx}"/><c:order val="${idx}"/><c:tx><c:v>${esc(s.name)}</c:v></c:tx>` +
        `<c:spPr><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill><a:ln w="9525" cmpd="sng"><a:noFill/></a:ln></c:spPr>` +
        `<c:invertIfNegative val="1"/>` +
        // CT_BarSer child order (schema): idx, order, tx, spPr,
        // invertIfNegative, dPt*, dLbls, ..., cat, val — dLbls MUST come
        // after invertIfNegative and before cat/val, or LibreOffice
        // silently mis-parses the series (confirmed empirically: it was
        // corrupting the category axis labels when dLbls was placed
        // before invertIfNegative).
        (spec.showValues
          ? `<c:dLbls><c:numFmt formatCode="${esc(spec.valueNumFmt ?? "General")}" sourceLinked="0"/>${dataLblTxPr}<c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>`
          : "") +
        `<c:cat><c:strRef><c:f>${esc(spec.categoriesRef)}</c:f>${strCacheXml(spec.categories)}</c:strRef></c:cat>` +
        `<c:val><c:numRef><c:f>${esc(s.valuesRef)}</c:f>${numCacheXml(s.values)}</c:numRef></c:val></c:ser>`,
    )
    .join("");
  return (
    CHART_SPACE_OPEN +
    `<c:chart>${titleXml(spec.title, ink)}<c:plotArea><c:layout/><c:barChart><c:barDir val="bar"/><c:grouping val="clustered"/>` +
    `<c:varyColors val="1"/>${sers}` +
    `<c:dLbls><c:showLegendKey val="0"/><c:showVal val="${showVal}"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>` +
    `<c:gapWidth val="150"/><c:axId val="111111111"/><c:axId val="222222222"/></c:barChart>` +
    `<c:catAx><c:axId val="111111111"/><c:scaling><c:orientation val="maxMin"/></c:scaling><c:delete val="0"/><c:axPos val="l"/>` +
    `<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>` +
    `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr lvl="0"><a:defRPr sz="900" b="0"><a:solidFill><a:srgbClr val="${ink}"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>` +
    `<c:crossAx val="222222222"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="1"/></c:catAx>` +
    `<c:valAx><c:axId val="222222222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="1"/><c:axPos val="b"/>` +
    `<c:majorGridlines><c:spPr><a:ln><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>` +
    `<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>` +
    `<c:crossAx val="111111111"/><c:crosses val="max"/><c:crossBetween val="between"/></c:valAx><c:spPr><a:noFill/></c:spPr></c:plotArea>` +
    `<c:legend><c:legendPos val="${spec.legendPos ?? "t"}"/><c:overlay val="0"/>` +
    `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr lvl="0"><a:defRPr sz="800" b="0"><a:solidFill><a:srgbClr val="505052"/></a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr></c:legend>` +
    `<c:plotVisOnly val="1"/><c:dispBlanksAs val="zero"/></c:chart>` +
    CHART_SPACE_TAIL
  );
}

/**
 * @param {{
 *   title: string, ink: string,
 *   categoriesRef: string, categories: string[],
 *   valuesRef: string, values: number[], colors: string[],
 *   legendPos?: "t"|"r"|"b"|"l",
 * }} spec
 */
function pieChartXml(spec) {
  const ink = spec.ink ?? "1F1F1F";
  const dPts = spec.colors
    .map(
      (c, i) =>
        `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${c}"/></a:solidFill></c:spPr></c:dPt>`,
    )
    .join("");
  return (
    CHART_SPACE_OPEN +
    `<c:chart>${titleXml(spec.title, ink)}<c:plotArea><c:layout/><c:pieChart><c:varyColors val="1"/>` +
    `<c:ser><c:idx val="0"/><c:order val="0"/>${dPts}` +
    `<c:cat><c:strRef><c:f>${esc(spec.categoriesRef)}</c:f>${strCacheXml(spec.categories)}</c:strRef></c:cat>` +
    `<c:val><c:numRef><c:f>${esc(spec.valuesRef)}</c:f>${numCacheXml(spec.values)}</c:numRef></c:val></c:ser>` +
    `<c:dLbls><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/><c:showLeaderLines val="0"/></c:dLbls>` +
    `<c:firstSliceAng val="0"/></c:pieChart><c:spPr><a:noFill/></c:spPr></c:plotArea>` +
    `<c:legend><c:legendPos val="${spec.legendPos ?? "r"}"/><c:overlay val="0"/>` +
    `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr lvl="0"><a:defRPr sz="900" b="0"><a:solidFill><a:srgbClr val="${ink}"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr></c:legend>` +
    `<c:plotVisOnly val="1"/><c:dispBlanksAs val="zero"/></c:chart>` +
    CHART_SPACE_TAIL
  );
}

/**
 * @param {{
 *   valuesRef: string, values: number[], colors: string[], holeSize?: number,
 *   title?: string, ink?: string,
 *   categoriesRef?: string, categories?: string[], legendPos?: "t"|"r"|"b"|"l",
 * }} spec - by default a 2-point doughnut (achieved / remaining) with no
 *   title and no legend/categories, matching the reference's own
 *   progress-ring chart (the ring is read in context of its dashboard).
 *   Passing `title`/`categoriesRef`+`categories`/`legendPos` opts into a
 *   full N-slice doughnut with a title and a category legend, for a
 *   "Where Your Money Goes"-style ring rather than a bare progress ring —
 *   existing 2-point callers that omit these keep the exact original output.
 */
function doughnutChartXml(spec) {
  const ink = spec.ink ?? "1F1F1F";
  const dPts = spec.colors
    .map(
      (c, i) =>
        `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${c}"/></a:solidFill></c:spPr></c:dPt>`,
    )
    .join("");
  const catXml = spec.categoriesRef
    ? `<c:cat><c:strRef><c:f>${esc(spec.categoriesRef)}</c:f>${strCacheXml(spec.categories ?? [])}</c:strRef></c:cat>`
    : "";
  const titlePart = spec.title ? titleXml(spec.title, ink) : `<c:autoTitleDeleted val="1"/>`;
  const legendPart = spec.legendPos
    ? `<c:legend><c:legendPos val="${spec.legendPos}"/><c:overlay val="0"/>` +
      `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr lvl="0"><a:defRPr sz="900" b="0"><a:solidFill><a:srgbClr val="${ink}"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr></c:legend>`
    : "";
  return (
    CHART_SPACE_OPEN +
    `<c:chart>${titlePart}<c:plotArea><c:layout/><c:doughnutChart><c:varyColors val="1"/>` +
    `<c:ser><c:idx val="0"/><c:order val="0"/>${dPts}${catXml}` +
    `<c:val><c:numRef><c:f>${esc(spec.valuesRef)}</c:f>${numCacheXml(spec.values)}</c:numRef></c:val></c:ser>` +
    `<c:dLbls><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/><c:showLeaderLines val="1"/></c:dLbls>` +
    `<c:firstSliceAng val="0"/><c:holeSize val="${spec.holeSize ?? 75}"/></c:doughnutChart><c:spPr><a:noFill/></c:spPr></c:plotArea>` +
    legendPart +
    `<c:plotVisOnly val="1"/><c:dispBlanksAs val="zero"/></c:chart>` +
    CHART_SPACE_TAIL
  );
}

function anchorXml({ fromCol, fromRow, toCol, toRow, rId, id, name }) {
  return (
    `<xdr:twoCellAnchor editAs="absolute">` +
    `<xdr:from><xdr:col>${fromCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
    `<xdr:to><xdr:col>${toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
    `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${id}" name="${esc(name)}"/>` +
    `<xdr:cNvGraphicFramePr><a:graphicFrameLocks/></xdr:cNvGraphicFramePr></xdr:nvGraphicFramePr>` +
    `<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">` +
    `<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${rId}"/>` +
    `</a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData fLocksWithSheet="0"/></xdr:twoCellAnchor>`
  );
}

function drawingXml(anchors) {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `${anchors.join("")}</xdr:wsDr>`
  );
}

function relsXml(rels) {
  const items = rels.map((r) => `<Relationship Id="${r.id}" Type="${r.type}" Target="${r.target}"/>`).join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items}</Relationships>`
  );
}

/** Shared by injectNativeCharts and withPreviewPaperSize: resolve a sheet
 * name to its worksheet XML part path the same way Excel does (workbook.xml
 * -> r:id -> workbook.xml.rels -> target), not by assumed sheetN numbering. */
async function resolveSheetPath(zip, sheetName) {
  const workbookXml = await zip.file("xl/workbook.xml").async("string");
  let rid = null;
  for (const m of workbookXml.matchAll(/<sheet\b[^>]*\/>/g)) {
    const tag = m[0];
    if (/name="([^"]*)"/.exec(tag)?.[1] === sheetName) { rid = /r:id="([^"]*)"/.exec(tag)?.[1]; break; }
  }
  if (!rid) return null;
  const wbRelsXml = await zip.file("xl/_rels/workbook.xml.rels").async("string");
  const m = new RegExp(`Id="${rid}"[^>]*Target="([^"]*)"`).exec(wbRelsXml);
  return m ? `xl/${m[1]}` : null;
}

/**
 * Override just the `paperSize` attribute of one or more sheets' existing
 * `<pageSetup>` element, via raw XML — NOT via ExcelJS. A plain ExcelJS
 * load->modify->save round-trip silently drops any part it has no model
 * for, which includes the chart/drawing parts {@link injectNativeCharts}
 * splices in; this only rewrites one attribute's text on the one XML
 * element that needs it, so it's safe to run on an already chart-injected
 * buffer. Every other pageSetup attribute (fitToWidth, fitToHeight,
 * orientation, scale) is left exactly as built.
 * @param {Buffer} buffer
 * @param {number} paperSize - OOXML paper size code (8 = A3, 9 = A4, ...)
 * @param {string[]} sheetNames - which sheets to patch
 * @returns {Promise<Buffer>}
 */
export async function withPreviewPaperSize(buffer, paperSize, sheetNames) {
  const zip = await JSZip.loadAsync(buffer);
  for (const name of sheetNames) {
    const path = await resolveSheetPath(zip, name);
    if (!path) continue;
    let xml = await zip.file(path).async("string");
    xml = xml.replace(/(<pageSetup\b[^>]*\bpaperSize=")\d+(")/, `$1${paperSize}$2`);
    zip.file(path, xml);
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

/**
 * Count native chart parts (xl/charts/chartN.xml) in a built .xlsx — a QC
 * primitive for products that inject charts via {@link injectNativeCharts},
 * since ExcelJS's own workbook model never sees these post-spliced parts.
 * @param {Buffer} buffer
 * @returns {Promise<number>}
 */
export async function countChartParts(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  let n = 0;
  zip.folder("xl/charts")?.forEach((path) => { if (/^chart\d+\.xml$/.test(path)) n += 1; });
  return n;
}

/**
 * @param {Buffer} buffer - an already-built .xlsx (e.g. from WorkbookBuilder#toBuffer())
 * @param {Record<string, Array<Object>>} chartsBySheet - sheet name -> chart specs.
 *   Each spec: { type: "bar"|"pie", anchor: {fromCol,fromRow,toCol,toRow} (0-indexed), ...type-specific fields above }
 * @returns {Promise<Buffer>}
 */
export async function injectNativeCharts(buffer, chartsBySheet) {
  const zip = await JSZip.loadAsync(buffer);

  const workbookXml = await zip.file("xl/workbook.xml").async("string");
  const sheetNameToRid = {};
  for (const m of workbookXml.matchAll(/<sheet\b[^>]*\/>/g)) {
    const tag = m[0];
    const name = /name="([^"]*)"/.exec(tag)?.[1];
    const rid = /r:id="([^"]*)"/.exec(tag)?.[1];
    if (name && rid) sheetNameToRid[name] = rid;
  }

  const wbRelsXml = await zip.file("xl/_rels/workbook.xml.rels").async("string");
  const ridToTarget = {};
  for (const m of wbRelsXml.matchAll(/<Relationship\b[^>]*\/>/g)) {
    const tag = m[0];
    const id = /Id="([^"]*)"/.exec(tag)?.[1];
    const target = /Target="([^"]*)"/.exec(tag)?.[1];
    if (id && target) ridToTarget[id] = target;
  }

  let maxChart = 0;
  let maxDrawing = 0;
  zip.folder("xl/charts")?.forEach((path) => {
    const m = /chart(\d+)\.xml$/.exec(path);
    if (m) maxChart = Math.max(maxChart, Number(m[1]));
  });
  zip.folder("xl/drawings")?.forEach((path) => {
    const m = /drawing(\d+)\.xml$/.exec(path);
    if (m) maxDrawing = Math.max(maxDrawing, Number(m[1]));
  });

  let contentTypesXml = await zip.file("[Content_Types].xml").async("string");
  const newOverrides = [];

  for (const [sheetName, specs] of Object.entries(chartsBySheet)) {
    if (!specs?.length) continue;
    const rid = sheetNameToRid[sheetName];
    if (!rid) throw new Error(`injectNativeCharts: sheet "${sheetName}" not found in xl/workbook.xml`);
    const target = ridToTarget[rid];
    if (!target) throw new Error(`injectNativeCharts: no workbook.xml.rels target for sheet "${sheetName}" (${rid})`);
    const sheetPath = `xl/${target}`;
    const sheetFile = sheetPath.split("/").pop();
    const sheetRelsPath = `xl/worksheets/_rels/${sheetFile}.rels`;

    const anchors = [];
    const drawingRels = [];
    let cNvId = 1;
    for (const spec of specs) {
      maxChart += 1;
      const chartFile = `chart${maxChart}.xml`;
      const xml =
        spec.type === "bar" ? barChartXml(spec) : spec.type === "doughnut" ? doughnutChartXml(spec) : pieChartXml(spec);
      zip.file(`xl/charts/${chartFile}`, xml);
      newOverrides.push(
        `<Override PartName="/xl/charts/${chartFile}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`,
      );

      const localRid = `rId${drawingRels.length + 1}`;
      drawingRels.push({
        id: localRid,
        type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart",
        target: `../charts/${chartFile}`,
      });
      anchors.push(anchorXml({ ...spec.anchor, rId: localRid, id: cNvId++, name: `Chart ${maxChart}` }));
    }

    maxDrawing += 1;
    const drawingFile = `drawing${maxDrawing}.xml`;
    zip.file(`xl/drawings/${drawingFile}`, drawingXml(anchors));
    zip.file(`xl/drawings/_rels/${drawingFile}.rels`, relsXml(drawingRels));
    newOverrides.push(
      `<Override PartName="/xl/drawings/${drawingFile}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`,
    );

    const existingRelsFile = zip.file(sheetRelsPath);
    let sheetRid;
    let sheetRelsXml;
    if (existingRelsFile) {
      sheetRelsXml = await existingRelsFile.async("string");
      const ids = [...sheetRelsXml.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]));
      sheetRid = `rId${(ids.length ? Math.max(...ids) : 0) + 1}`;
      sheetRelsXml = sheetRelsXml.replace(
        "</Relationships>",
        `<Relationship Id="${sheetRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/${drawingFile}"/></Relationships>`,
      );
    } else {
      sheetRid = "rId1";
      sheetRelsXml = relsXml([
        {
          id: sheetRid,
          type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing",
          target: `../drawings/${drawingFile}`,
        },
      ]);
    }
    zip.file(sheetRelsPath, sheetRelsXml);

    let sheetXml = await zip.file(sheetPath).async("string");
    const drawingTag = `<drawing r:id="${sheetRid}"/>`;
    // <extLst> can appear many times (ExcelJS emits one per x14 dataBar
    // conditional-formatting rule, nested inside <cfRule>) — only the LAST
    // one, right before </worksheet>, is the worksheet-level extLst that
    // <drawing> must precede. Splicing into an earlier (per-rule) extLst
    // would nest <drawing> inside a <cfRule>, which Excel/LibreOffice
    // silently drop rather than repair.
    const lastExtLst = sheetXml.lastIndexOf("<extLst>");
    const worksheetEnd = sheetXml.lastIndexOf("</worksheet>");
    sheetXml =
      lastExtLst !== -1 && lastExtLst < worksheetEnd
        ? sheetXml.slice(0, lastExtLst) + drawingTag + sheetXml.slice(lastExtLst)
        : sheetXml.replace("</worksheet>", `${drawingTag}</worksheet>`);
    zip.file(sheetPath, sheetXml);
  }

  if (newOverrides.length) {
    contentTypesXml = contentTypesXml.replace("</Types>", `${newOverrides.join("")}</Types>`);
    zip.file("[Content_Types].xml", contentTypesXml);
  }

  return zip.generateAsync({ type: "nodebuffer" });
}
