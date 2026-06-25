import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import sharp from 'sharp';

const inputFile = process.argv[2];
const outputDir = process.argv[3] ?? './output';
const extraArgs = process.argv.slice(4);
const cliTestFlag = extraArgs.includes('--test');
const cliTestArgIndex = extraArgs.indexOf('--test');
const cliTestTarget = cliTestArgIndex >= 0
  && extraArgs[cliTestArgIndex + 1]
  && !extraArgs[cliTestArgIndex + 1].startsWith('--')
  ? extraArgs[cliTestArgIndex + 1]
  : null;
const positionalTestTarget = extraArgs.find((arg) => !arg.startsWith('--')) ?? null;
const envTestValue = process.env.npm_config_test;
const envIsBooleanTest = envTestValue === 'true' || envTestValue === '1';
const envTestTarget = envTestValue && !['true', '1', 'false', '0'].includes(envTestValue)
  ? envTestValue
  : null;
const isTestMode = cliTestFlag || envIsBooleanTest || !!cliTestTarget || !!positionalTestTarget || !!envTestTarget;
const parseTargetIds = (value) => (typeof value === 'string'
  ? value.split(',').map((part) => part.trim()).filter(Boolean)
  : []);
const unique = (values) => [...new Set(values)];
const cliTestTargets = parseTargetIds(cliTestTarget);
const positionalTestTargets = parseTargetIds(positionalTestTarget);
const envTestTargets = parseTargetIds(envTestTarget);
const testRootIds = unique(
  (cliTestTargets.length ? cliTestTargets : [])
    .concat(positionalTestTargets.length ? positionalTestTargets : [])
    .concat(envTestTargets.length ? envTestTargets : []),
);
if (testRootIds.length === 0) {
  testRootIds.push('Juegos');
}

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
const atlasSprites = [];
const atlasPadding = 2;
const maxAtlasSize = 2048;

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

  console.log('\tRendering sprite');
  const image = sharp(Buffer.from(finalSvg));
  const { data: pngBuffer, info } = await image
    .png()
    .toBuffer({ resolveWithObject: true });

  atlasSprites.push({
    key: fileName,
    buffer: pngBuffer,
    width: info.width,
    height: info.height,
    bounds,
    dedicatedAtlas: false,
  });

  if (info.width > maxAtlasSize || info.height > maxAtlasSize) {
    const fitScale = Math.min(maxAtlasSize / info.width, maxAtlasSize / info.height);
    const resizedWidth = Math.max(1, Math.floor(info.width * fitScale));
    const resizedHeight = Math.max(1, Math.floor(info.height * fitScale));
    const resizedBuffer = await sharp(pngBuffer)
      .resize({
        width: resizedWidth,
        height: resizedHeight,
        fit: 'fill',
      })
      .png()
      .toBuffer();

    atlasSprites[atlasSprites.length - 1] = {
      key: fileName,
      buffer: resizedBuffer,
      width: resizedWidth,
      height: resizedHeight,
      bounds,
      dedicatedAtlas: true,
    };

    console.log(
      `\t! oversized sprite adapted ${fileName}: ${info.width}x${info.height} -> ${resizedWidth}x${resizedHeight} (atlas dedicado)`,
    );
  }

  console.log(`\t✓ queued ${fileName} (${info.width}x${info.height})`);

  return {
    label: fileName,
    frame: fileName,
    bounds,
  };
};

const nextPowerOfTwo = (value) => {
  if (value <= 1) {
    return 1;
  }

  return 2 ** Math.ceil(Math.log2(value));
};

const packSprites = (inputSprites, atlasWidth, padding, extrude = 0) => {
  const packNode = (node, requiredWidth, requiredHeight) => {
    if (!node) {
      return null;
    }

    if (node.used) {
      return packNode(node.right, requiredWidth, requiredHeight)
        ?? packNode(node.down, requiredWidth, requiredHeight);
    }

    if (requiredWidth > node.w || requiredHeight > node.h) {
      return null;
    }

    node.used = true;
    node.down = {
      x: node.x,
      y: node.y + requiredHeight,
      w: node.w,
      h: node.h - requiredHeight,
    };
    node.right = {
      x: node.x + requiredWidth,
      y: node.y,
      w: node.w - requiredWidth,
      h: requiredHeight,
    };

    return node;
  };

  return (atlasHeight) => {
    const root = {
      x: 0,
      y: 0,
      w: atlasWidth,
      h: atlasHeight,
    };

    const placements = [];
    let usedWidth = 0;
    let usedHeight = 0;

    for (const sprite of inputSprites) {
      const requiredWidth = sprite.width + (padding * 2) + (extrude * 2);
      const requiredHeight = sprite.height + (padding * 2) + (extrude * 2);
      const node = packNode(root, requiredWidth, requiredHeight);

      if (!node) {
        return null;
      }

      placements.push({
        ...sprite,
        x: node.x + padding + extrude,  // la posición del sprite real, sin el extrude
        y: node.y + padding + extrude
      });

      usedWidth = Math.max(usedWidth, node.x + sprite.width);
      usedHeight = Math.max(usedHeight, node.y + sprite.height);
    }

    return {
      placements,
      usedWidth,
      usedHeight,
    };
  };
};

const findBestLayout = (inputSprites, padding = atlasPadding, extrude = atlasPadding) => {
  if (!inputSprites.length) {
    return null;
  }

  const widestSprite = inputSprites.reduce((max, sprite) => Math.max(max, sprite.width), 0);
  const tallestSprite = inputSprites.reduce((max, sprite) => Math.max(max, sprite.height), 0);
  const widthStart = nextPowerOfTwo(widestSprite);
  const heightStart = nextPowerOfTwo(tallestSprite);

  let bestLayout = null;

  for (let width = widthStart; width <= maxAtlasSize; width *= 2) {
    const effectivePadding = inputSprites.length <= 1 ? 0 : padding;
    const effectiveExtrude = inputSprites.length <= 1 ? 0 : extrude;
    const packAtHeight = packSprites(inputSprites, width, effectivePadding, effectiveExtrude);

    for (let height = heightStart; height <= maxAtlasSize; height *= 2) {
      const packed = packAtHeight(height);
      if (!packed) {
        continue;
      }

      const area = width * height;
      if (!bestLayout || area < bestLayout.area) {
        bestLayout = {
          width,
          height,
          placements: packed.placements,
          area,
        };
      }

      break;
    }
  }

  return bestLayout;
};

const createExtrudedSpriteBuffer = async (sprite, extrude) => {
  if (extrude <= 0) {
    return sprite.buffer;
  }

  const topEdge = await sharp(sprite.buffer)
    .extract({ left: 0, top: 0, width: sprite.width, height: 1 })
    .resize({ width: sprite.width, height: extrude, fit: 'fill' })
    .png()
    .toBuffer();

  const bottomEdge = await sharp(sprite.buffer)
    .extract({ left: 0, top: sprite.height - 1, width: sprite.width, height: 1 })
    .resize({ width: sprite.width, height: extrude, fit: 'fill' })
    .png()
    .toBuffer();

  const leftEdge = await sharp(sprite.buffer)
    .extract({ left: 0, top: 0, width: 1, height: sprite.height })
    .resize({ width: extrude, height: sprite.height, fit: 'fill' })
    .png()
    .toBuffer();

  const rightEdge = await sharp(sprite.buffer)
    .extract({ left: sprite.width - 1, top: 0, width: 1, height: sprite.height })
    .resize({ width: extrude, height: sprite.height, fit: 'fill' })
    .png()
    .toBuffer();

  const topLeftCorner = await sharp(sprite.buffer)
    .extract({ left: 0, top: 0, width: 1, height: 1 })
    .resize({ width: extrude, height: extrude, fit: 'fill' })
    .png()
    .toBuffer();

  const topRightCorner = await sharp(sprite.buffer)
    .extract({ left: sprite.width - 1, top: 0, width: 1, height: 1 })
    .resize({ width: extrude, height: extrude, fit: 'fill' })
    .png()
    .toBuffer();

  const bottomLeftCorner = await sharp(sprite.buffer)
    .extract({ left: 0, top: sprite.height - 1, width: 1, height: 1 })
    .resize({ width: extrude, height: extrude, fit: 'fill' })
    .png()
    .toBuffer();

  const bottomRightCorner = await sharp(sprite.buffer)
    .extract({ left: sprite.width - 1, top: sprite.height - 1, width: 1, height: 1 })
    .resize({ width: extrude, height: extrude, fit: 'fill' })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: sprite.width + (extrude * 2),
      height: sprite.height + (extrude * 2),
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: topLeftCorner, left: 0, top: 0 },
      { input: topEdge, left: extrude, top: 0 },
      { input: topRightCorner, left: extrude + sprite.width, top: 0 },
      { input: leftEdge, left: 0, top: extrude },
      { input: sprite.buffer, left: extrude, top: extrude },
      { input: rightEdge, left: extrude + sprite.width, top: extrude },
      { input: bottomLeftCorner, left: 0, top: extrude + sprite.height },
      { input: bottomEdge, left: extrude, top: extrude + sprite.height },
      { input: bottomRightCorner, left: extrude + sprite.width, top: extrude + sprite.height },
    ])
    .png()
    .toBuffer();
};

const filterSpriteTreeByFrames = (nodes, frameSet) => {
  const filteredNodes = [];

  for (const node of nodes) {
    const children = Array.isArray(node.children)
      ? node.children
      : (Array.isArray(node.childen) ? node.childen : []);

    if (children.length > 0) {
      const filteredChildren = filterSpriteTreeByFrames(children, frameSet);
      if (filteredChildren.length > 0) {
        filteredNodes.push({
          label: node.label,
          children: filteredChildren,
        });
      }

      continue;
    }

    if (node.frame && frameSet.has(node.frame)) {
      filteredNodes.push(node);
    }
  }

  return filteredNodes;
};

const buildAtlases = async () => {
  if (atlasSprites.length === 0) {
    throw new Error('No hay sprites para generar atlas.');
  }

  const sortedSprites = [...atlasSprites].sort((a, b) => {
    const maxDiff = Math.max(b.width, b.height) - Math.max(a.width, a.height);
    if (maxDiff !== 0) {
      return maxDiff;
    }

    return b.height - a.height;
  });

  const widestSprite = sortedSprites.reduce((max, sprite) => Math.max(max, sprite.width), 0);
  const tallestSprite = sortedSprites.reduce((max, sprite) => Math.max(max, sprite.height), 0);

  if (widestSprite > maxAtlasSize || tallestSprite > maxAtlasSize) {
    throw new Error(
      `Hay sprites que exceden ${maxAtlasSize}px incluso tras adaptación (max ancho: ${widestSprite}, max alto: ${tallestSprite}).`,
    );
  }

  const atlasPages = [];
  const dedicatedSprites = sortedSprites.filter((sprite) => sprite.dedicatedAtlas);
  let remainingSprites = sortedSprites.filter((sprite) => !sprite.dedicatedAtlas);
  const atlasManifest = {
    atlases: [],
    frameToAtlasKey: {},
    sprites,
  };

  for (const sprite of dedicatedSprites) {
    const dedicatedLayout = findBestLayout([sprite], 0);
    if (!dedicatedLayout) {
      throw new Error(`No se pudo calcular layout para sprite dedicado "${sprite.key}".`);
    }

    atlasPages.push({
      sprites: [sprite],
      layout: dedicatedLayout,
    });
  }

  while (remainingSprites.length > 0) {
    const pageSprites = [];
    const nextRemainingSprites = [];

    for (const sprite of remainingSprites) {
      const candidateSprites = [...pageSprites, sprite];
      const canFitInCurrentPage = !!findBestLayout(candidateSprites);

      if (canFitInCurrentPage) {
        pageSprites.push(sprite);
      } else {
        nextRemainingSprites.push(sprite);
      }
    }

    if (pageSprites.length === 0) {
      throw new Error('No se pudo crear una página de atlas válida con los sprites restantes.');
    }

    const pageLayout = findBestLayout(pageSprites);
    if (!pageLayout) {
      throw new Error('No se pudo calcular un layout válido para una página de atlas.');
    }

    atlasPages.push({
      sprites: pageSprites,
      layout: pageLayout,
    });

    remainingSprites = nextRemainingSprites;
  }

  for (let pageIndex = 0; pageIndex < atlasPages.length; pageIndex += 1) {
    const page = atlasPages[pageIndex];
    const pageName = `atlas-${pageIndex}`;
    const textureKey = `sprites-atlas-${pageIndex}`;
    const atlasPngPath = path.join(outputDir, `${pageName}.png`);
    const atlasJsonPath = path.join(outputDir, `${pageName}.json`);

    const extrude = page.layout.placements.length <= 1 ? 0 : atlasPadding;
    const composites = await Promise.all(
      page.layout.placements.map(async (sprite) => {
        const input = await createExtrudedSpriteBuffer(sprite, extrude);

        return {
          input,
          left: sprite.x - extrude,
          top: sprite.y - extrude,
        };
      }),
    );

    await sharp({
      create: {
        width: page.layout.width,
        height: page.layout.height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(composites)
      .png()
      .toFile(atlasPngPath);

    const atlasFrames = Object.fromEntries(
      page.layout.placements.map((sprite) => [
        sprite.key,
        {
          frame: {
            x: sprite.x,
            y: sprite.y,
            w: sprite.width,
            h: sprite.height,
          },
          rotated: false,
          trimmed: false,
          spriteSourceSize: {
            x: 0,
            y: 0,
            w: sprite.width,
            h: sprite.height,
          },
          sourceSize: {
            w: sprite.width,
            h: sprite.height,
          },
        },
      ]),
    );

    const pageFrameSet = new Set(page.layout.placements.map((sprite) => sprite.key));
    const atlasData = {
      frames: atlasFrames,
      meta: {
        app: 'boiro split atlas generator',
        version: '1.0',
        image: `${pageName}.png`,
        format: 'RGBA8888',
        size: {
          w: page.layout.width,
          h: page.layout.height,
        },
        scale: '1',
      },
      sprites: filterSpriteTreeByFrames(sprites, pageFrameSet),
    };

    fs.writeFileSync(atlasJsonPath, `${JSON.stringify(atlasData, null, 2)}\n`, 'utf-8');

    atlasManifest.atlases.push({
      key: textureKey,
      image: `${pageName}.png`,
      data: `${pageName}.json`,
    });

    for (const sprite of page.layout.placements) {
      atlasManifest.frameToAtlasKey[sprite.key] = textureKey;
    }

    console.log(`✓ ${atlasPngPath}`);
    console.log(`✓ ${atlasJsonPath}`);
  }

  const atlasIndexPath = path.join(outputDir, 'atlas-index.json');
  fs.writeFileSync(atlasIndexPath, `${JSON.stringify(atlasManifest, null, 2)}\n`, 'utf-8');
  console.log(`✓ ${atlasIndexPath}`);
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

const processRoots = isTestMode
  ? testRootIds.map((id) => ({
      id,
      node: $('*[id]').filter((_, el) => $(el).attr('id') === id).first(),
    }))
  : [{ id: 'svg-root', node: rootSvg }];

if (isTestMode) {
  const missingIds = processRoots.filter((entry) => entry.node.length === 0).map((entry) => entry.id);
  if (missingIds.length > 0) {
    throw new Error(`Modo test activo, pero no se encontraron ids en el SVG: ${missingIds.join(', ')}`);
  }

  console.log(`Modo test activo: procesando solo hijos de ids [${testRootIds.join(', ')}].`);
}

for (const processRoot of processRoots) {
  for (const child of processRoot.node.children().toArray()) {
    const nodeData = await processNode(child, isTestMode ? 1 : 0);
    if (nodeData) {
      sprites.push(nodeData);
    }
  }
}

await buildAtlases();