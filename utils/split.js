import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import sharp from 'sharp';

const inputFile = process.argv[2];
const outputDir = process.argv[3] ?? './output';

const groupsToProcess = ['arboles'];

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
const rootPresentationAttrs = Object.entries(rootAttrs)
  .filter(([name]) => !['width', 'height', 'viewBox'].includes(name) && name !== 'xmlns' && !name.startsWith('xmlns:'))
  .map(([name, value]) => `${name}="${value}"`)
  .join(' ');

// Extraer <style> y <defs> para preservar clases CSS, gradientes, clipPaths, etc.
const styles = $('svg > style').toString();
const defs = $('defs').toString();
const sharedSvgContent = [styles, defs].filter(Boolean).join('\n');

const sprites = [];

const sanitizeSegment = (value) => value
  .replace(/[\\/]/g, '_')
  .replace(/\s+/g, '_')
  .replace(/[^A-Za-z0-9_.-]/g, '_')
  .replace(/_+/g, '_')
  .replace(/^_+|_+$/g, '') || 'unnamed';

let fallbackPathCounter = 0;

const wrapWithParentCode = (el, content) => {
  let wrapped = content;
  let current = el.parent;

  while (current && current.tagName && current.tagName !== 'svg') {
    const currentAttrs = Object.entries(current.attribs ?? {})
      .map(([name, value]) => `${name}="${value}"`)
      .join(' ');

    const openTag = currentAttrs ? `<${current.tagName} ${currentAttrs}>` : `<${current.tagName}>`;
    wrapped = `${openTag}${wrapped}</${current.tagName}>`;
    current = current.parent;
  }

  return wrapped;
};

const getElementPathSegments = (el) => {
  const segments = [];
  let current = el;

  while (current && current.tagName !== 'svg') {
    if (current.tagName === 'g' || current.tagName === 'path') {
      const group = $(current);
      const label = group.attr('inkscape:label');
      const id = group.attr('id');
      const parent = group.parent();
      const sameTagSiblings = parent.children(current.tagName);
      const siblingIndex = sameTagSiblings.index(current);
      const fallbackName = `${current.tagName}_${siblingIndex >= 0 ? siblingIndex : 0}`;
      segments.push(sanitizeSegment(label || id || fallbackName));
    }

    current = current.parent;
  }

  return segments.reverse();
};

const getNodeLabel = (el) => {
  const node = $(el);
  return node.attr('inkscape:label') || node.attr('id') || null;
};

const createPathSprite = async (el) => {
  const groupContent = $.html(el);
  const contentWithParent = wrapWithParentCode(el, groupContent);

  const elementId = sanitizeSegment($(el).attr('id') || `noid_${fallbackPathCounter++}`);
  const fileName = `${getElementPathSegments(el).join('__')}__${elementId}`;

  console.log('Processing element:', fileName);

  const isolated = `<svg ${svgNamespaces} ${rootPresentationAttrs}
    viewBox="${viewBox}" width="${width}" height="${height}">
    ${sharedSvgContent}
    ${contentWithParent}
  </svg>`;

  console.log('\tCalculate bounds');

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

  console.log('\tCropping SVG');
  // Create cropped SVG if bounds exist
  const finalSvg = bounds
    ? `<svg ${svgNamespaces} ${rootPresentationAttrs}
    viewBox="0 0 ${bounds.width} ${bounds.height}" width="${bounds.width}" height="${bounds.height}">
    ${sharedSvgContent}
    <g transform="translate(${-bounds.x}, ${-bounds.y})">
      ${contentWithParent}
    </g>
  </svg>`
    : isolated;

  console.log('\tSaving PNG');
  const outputPath = path.join(outputDir, `${fileName}.png`);
  const image = sharp(Buffer.from(finalSvg));
  await image.clone().png().toFile(outputPath);

  console.log(`\t✓ ${outputPath}`);

  return {
    label: fileName,
    file: `${fileName}.png`,
    bounds,
  };
};

const processNode = async (el, depth = 0) => {
  if (!el || !el.tagName) {
    return null;
  }

  if ($(el).closest('defs, clipPath').length > 0) {
    return null;
  }

  if (el.tagName === 'g') {
    console.log('Processing group:', $(el).attr('id') || 'unnamed');
    const label = getNodeLabel(el);

    // Los <g> de primer nivel (hijos directos de <svg>) siempre se desglosan.
    if (depth === 0) {
      const children = [];
      for (const child of $(el).children().toArray()) {
        const childData = await processNode(child, depth + 1);
        if (childData) {
          children.push(childData);
        }
      }

      return {
        label,
        children,
      };
    }

    // Si el label está en groupsToProcess, procesar recursivamente sus hijos
    if (label && groupsToProcess.includes(label)) {
      const children = [];
      for (const child of $(el).children().toArray()) {
        const childData = await processNode(child, depth + 1);
        if (childData) {
          children.push(childData);
        }
      }

      return {
        label,
        children,
      };
    }

    // Si no está en groupsToProcess, crear sprite del grupo
    return createPathSprite(el);
  }

  if (el.tagName === 'path') {
    return createPathSprite(el);
  }

  return null;
};

const processRoot = rootSvg;
// const processRoot = $("#Juegos");

for (const child of processRoot.children().toArray()) {
  const nodeData = await processNode(child, 0);
  if (nodeData) {
    sprites.push(nodeData);
  }
}

const spritesPath = path.join(outputDir, 'sprites.json');
fs.writeFileSync(spritesPath, `${JSON.stringify(sprites, null, 2)}\n`, 'utf-8');
console.log(`✓ ${spritesPath}`);