import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import sharp from 'sharp';

const inputFile = process.argv[2];
const outputDir = process.argv[3] ?? './output';

const svgContent = fs.readFileSync(inputFile, 'utf-8');
const $ = cheerio.load(svgContent, { xmlMode: true });

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

// Extraer viewBox y dimensiones del SVG raíz
const rootSvg = $('svg').first();
const viewBox = rootSvg.attr('viewBox') ?? '';
const width = rootSvg.attr('width') ?? '512';
const height = rootSvg.attr('height') ?? '512';
const rootAttrs = rootSvg.get(0)?.attribs ?? {};

// Conserva todos los namespaces declarados en el SVG fuente (xmlns y xmlns:prefijo)
const namespaceAttrs = Object.entries(rootAttrs)
  .filter(([name]) => name === 'xmlns' || name.startsWith('xmlns:'))
  .map(([name, value]) => `${name}="${value}"`)
  .join(' ');

const declaredPrefixes = new Set(
  Object.keys(rootAttrs)
    .filter((name) => name.startsWith('xmlns:'))
    .map((name) => name.slice('xmlns:'.length)),
);

const usedAttrPrefixes = new Set(
  [...svgContent.matchAll(/\s([A-Za-z_][\w.-]*):[A-Za-z_][\w.-]*\s*=/g)].map((match) => match[1]),
);

const inferredNamespaceAttrs = [...usedAttrPrefixes]
  .filter((prefix) => !declaredPrefixes.has(prefix) && prefix !== 'xml' && prefix !== 'xmlns')
  .map((prefix) => `xmlns:${prefix}="urn:svg-inferred:${prefix}"`)
  .join(' ');

const fallbackNamespaces = 'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"';
const svgNamespaces = [namespaceAttrs || fallbackNamespaces, inferredNamespaceAttrs].filter(Boolean).join(' ');

// Extraer <defs> para preservar gradientes, clipPaths, etc.
const defs = $('defs').toString();

const groups = $('svg g').filter((_, el) => {
  const hasNestedGroups = $(el).find('g').length > 0;
  const label = $(el).attr('inkscape:label');
  const hasLabel = typeof label === 'string' && label.length > 0;

  return !hasNestedGroups && hasLabel && !/^g\d+$/.test(label);
});

const positions = [];

const sanitizeSegment = (value) => value
  .replace(/[\\/]/g, '_')
  .replace(/\s+/g, '_')
  .replace(/[^A-Za-z0-9_.-]/g, '_')
  .replace(/_+/g, '_')
  .replace(/^_+|_+$/g, '') || 'unnamed';

const getElementPathSegments = (el) => {
  const segments = [];
  let current = el;

  while (current && current.tagName !== 'svg') {
    if (current.tagName === 'g') {
      const group = $(current);
      const label = group.attr('inkscape:label');
      const id = group.attr('id');
      const parent = group.parent();
      const sameTagSiblings = parent.children('g');
      const siblingIndex = sameTagSiblings.index(current);
      const fallbackName = `g_${siblingIndex >= 0 ? siblingIndex : 0}`;
      segments.push(sanitizeSegment(label || id || fallbackName));
    }

    current = current.parent;
  }

  return segments.reverse();
};

for (const el of groups) {
  const groupContent = $.html(el);
  const elementId = sanitizeSegment($(el).attr('id') || `noid_${groups.index(el)}`);
  const fileName = `${getElementPathSegments(el).join('__')}__${elementId}`;

  const isolated = `<svg ${svgNamespaces}
    viewBox="${viewBox}" width="${width}" height="${height}">
    ${defs}
    ${groupContent}
  </svg>`;

  // First pass: calculate bounds
  let bounds = null;
  {
    const image = sharp(Buffer.from(isolated));
    const { data, info } = await image
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let minX = info.width;
    let minY = info.height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const alpha = data[(y * info.width + x) * info.channels + (info.channels - 1)];

        if (alpha > 0) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }

    bounds = maxX >= 0
      ? {
          x: minX,
          y: minY,
          width: maxX - minX + 1,
          height: maxY - minY + 1,
        }
      : null;
  }

  // Create cropped SVG if bounds exist
  const finalSvg = bounds
    ? `<svg ${svgNamespaces}
    viewBox="0 0 ${bounds.width} ${bounds.height}" width="${bounds.width}" height="${bounds.height}">
    ${defs}
    <g transform="translate(${-bounds.x}, ${-bounds.y})">
      ${groupContent}
    </g>
  </svg>`
    : isolated;

  const outputPath = path.join(outputDir, `${fileName}.png`);
  const image = sharp(Buffer.from(finalSvg));
  await image.clone().png().toFile(outputPath);

  positions.push({
    label: fileName,
    file: `${fileName}.png`,
    bounds,
  });

  console.log(`✓ ${outputPath}`);
}

const positionsPath = path.join(outputDir, 'positions.json');
fs.writeFileSync(positionsPath, `${JSON.stringify(positions, null, 2)}\n`, 'utf-8');
console.log(`✓ ${positionsPath}`);