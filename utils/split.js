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

for (const el of groups) {
  const label = $(el).attr('inkscape:label') ?? `group_${groups.index(el)}`;
  const groupContent = $.html(el);
  const fileName = label.replace(/[\\/]/g, '_');

  const isolated = `<svg ${svgNamespaces}
    viewBox="${viewBox}" width="${width}" height="${height}">
    ${defs}
    ${groupContent}
  </svg>`;

  const outputPath = path.join(outputDir, `${fileName}.png`);
  const image = sharp(Buffer.from(isolated));

  await image.clone().png().toFile(outputPath);

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

  const bounds = maxX >= 0
    ? {
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      }
    : null;

  positions.push({
    label,
    file: `${fileName}.png`,
    bounds,
  });

  console.log(`✓ ${outputPath}`);
}

const positionsPath = path.join(outputDir, 'positions.json');
fs.writeFileSync(positionsPath, `${JSON.stringify(positions, null, 2)}\n`, 'utf-8');
console.log(`✓ ${positionsPath}`);