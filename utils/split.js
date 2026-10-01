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

// Vaciamos el directorio sin borrarlo: si se elimina entero con `npm run dev` arrancado,
// Vite deja de servir sus ficheros hasta reiniciarse y el juego carga en blanco.
fs.mkdirSync(outputDir, { recursive: true });
for (const entry of fs.readdirSync(outputDir)) {
  fs.rmSync(path.join(outputDir, entry), { recursive: true, force: true });
}

// Extraer viewBox y dimensiones del SVG raíz
const rootSvg = $('svg').first();
const viewBox = rootSvg.attr('viewBox') ?? '';
const [viewBoxX = 0, viewBoxY = 0, viewBoxWidth, viewBoxHeight] = viewBox
  .split(/[\s,]+/)
  .filter(Boolean)
  .map(Number);
// Renderizamos siempre a 1 px por unidad del viewBox. Si usáramos los width/height del SVG
// (en mm), sharp rasterizaría a 72 dpi con una escala ligeramente distinta (6803 px en vez de 6804)
// y los bounds calculados no coincidirían con el recorte posterior.
const width = String(viewBoxWidth ?? parseFloat(rootSvg.attr('width') ?? '512'));
const height = String(viewBoxHeight ?? parseFloat(rootSvg.attr('height') ?? '512'));
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
// Con zoom mínimo (~0.24) la GPU muestrea los niveles de mipmap 2 y 3, donde cada texel promedia
// bloques de 4-8 px y el filtrado bilineal alcanza el bloque vecino: con menos extrude el borde
// de los tiles se mezcla con la transparencia y aparece una costura clara.
const atlasExtrude = 16;
const maxAtlasSize = 4096;
// Tamaño máximo de un tile para sprites que no caben en un atlas: deja sitio al padding y al extrude.
const maxTileSize = maxAtlasSize - ((atlasPadding + atlasExtrude) * 2);

// Versión HD (LOD): cada sprite se rasteriza también a hdScale px por unidad y se trocea en chunks
// que el juego carga bajo demanda solo para la zona visible cuando el zoom pasa de ~1.
// La escala se puede cambiar con `npm run split --scale=2` o `npm run split -- --scale=2`.
const cliScaleArg = extraArgs.find((arg) => arg.startsWith('--scale='));
const hdScale = Number(cliScaleArg?.slice('--scale='.length) ?? process.env.npm_config_scale ?? 2.5);
if (!(hdScale > 0)) {
  throw new Error(`Escala HD no válida: ${hdScale}`);
}
const hdDirName = 'hd';
const hdDir = path.join(outputDir, hdDirName);
// Texturas potencia de 2 (para tener mipmaps) de como mucho 1024 px: con chunks más grandes se
// cargaría mucha HD apenas visible por los bordes de la vista.
const hdMaxTextureSize = 1024;
// Píxeles reales de los chunks vecinos alrededor de cada chunk: con zoom >= 1 solo se muestrean
// los primeros niveles de mipmap y 4 px bastan para que no aparezcan costuras entre chunks.
const hdOverlap = 4;
const hdMaxChunkSize = hdMaxTextureSize - (hdOverlap * 2);
fs.mkdirSync(hdDir, { recursive: true });

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

const nextPowerOfTwoSize = (value) => 2 ** Math.ceil(Math.log2(Math.max(1, value)));

const isRegionEmpty = (data, info, left, top, regionWidth, regionHeight) => {
  for (let y = top; y < top + regionHeight; y += 1) {
    for (let x = left; x < left + regionWidth; x += 1) {
      if (data[(y * info.width + x) * info.channels + (info.channels - 1)] > 0) {
        return false;
      }
    }
  }

  return true;
};

// Rasteriza el sprite a hdScale sobre exactamente el mismo rectángulo que los bounds a 1x
// y lo trocea en chunks con textura potencia de 2. Las coordenadas de cada chunk se guardan
// en unidades del mundo, relativas a los bounds.
const createHdChunks = async (fileName, contentWithParent, bounds) => {
  const hdWidth = Math.round(bounds.width * hdScale);
  const hdHeight = Math.round(bounds.height * hdScale);
  const hdSvg = `<svg ${svgNamespaces} ${rootPresentationAttrs}
    viewBox="0 0 ${bounds.width} ${bounds.height}" width="${hdWidth}" height="${hdHeight}">
    ${sharedSvgContent}
    <g transform="translate(${-(viewBoxX + bounds.x)}, ${-(viewBoxY + bounds.y)})">
      ${contentWithParent}
    </g>
  </svg>`;

  const { data, info } = await sharp(Buffer.from(hdSvg), { limitInputPixels: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const columns = Math.ceil(info.width / hdMaxChunkSize);
  const rows = Math.ceil(info.height / hdMaxChunkSize);
  const chunkWidth = Math.ceil(info.width / columns);
  const chunkHeight = Math.ceil(info.height / rows);
  const chunks = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const left = column * chunkWidth;
      const top = row * chunkHeight;
      const contentWidth = Math.min(chunkWidth, info.width - left);
      const contentHeight = Math.min(chunkHeight, info.height - top);

      if (isRegionEmpty(data, info, left, top, contentWidth, contentHeight)) {
        continue;
      }

      const sourceLeft = Math.max(0, left - hdOverlap);
      const sourceTop = Math.max(0, top - hdOverlap);
      const sourceRight = Math.min(info.width, left + contentWidth + hdOverlap);
      const sourceBottom = Math.min(info.height, top + contentHeight + hdOverlap);
      const region = await sharp(data, { raw: info, limitInputPixels: false })
        .extract({
          left: sourceLeft,
          top: sourceTop,
          width: sourceRight - sourceLeft,
          height: sourceBottom - sourceTop,
        })
        .png()
        .toBuffer();

      const textureWidth = nextPowerOfTwoSize(contentWidth + (hdOverlap * 2));
      const textureHeight = nextPowerOfTwoSize(contentHeight + (hdOverlap * 2));
      const key = `${fileName}__hd_${column}_${row}`;
      const file = `${hdDirName}/${key}.png`;

      await sharp({
        create: {
          width: textureWidth,
          height: textureHeight,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .composite([{
          input: region,
          left: hdOverlap - (left - sourceLeft),
          top: hdOverlap - (top - sourceTop),
        }])
        .png()
        .toFile(path.join(outputDir, file));

      chunks.push({
        key,
        file,
        x: left / hdScale,
        y: top / hdScale,
        width: contentWidth / hdScale,
        height: contentHeight / hdScale,
        frame: {
          x: hdOverlap,
          y: hdOverlap,
          w: contentWidth,
          h: contentHeight,
        },
      });
    }
  }

  console.log(`\t✓ HD ${fileName} (${info.width}x${info.height}) en ${chunks.length} chunks`);

  return chunks;
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
  let sceneWidthPx = 0;
  let sceneHeightPx = 0;
  {
    const image = sharp(Buffer.from(isolated));
    const { data, info } = await image
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    sceneWidthPx = info.width;
    sceneHeightPx = info.height;
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

  if (!bounds) {
    console.log(`\t- skipped ${fileName} (sin píxeles visibles)`);
    return null;
  }

  // Ancho y alto pares para que, multiplicados por hdScale (2.5), den píxeles enteros y la versión HD
  // cubra exactamente el mismo rectángulo que la de 1x. Crecemos hacia donde quede escena.
  if (bounds.width % 2 === 1) {
    if (bounds.x + bounds.width < sceneWidthPx) bounds.width += 1;
    else { bounds.x -= 1; bounds.width += 1; }
  }
  if (bounds.height % 2 === 1) {
    if (bounds.y + bounds.height < sceneHeightPx) bounds.height += 1;
    else { bounds.y -= 1; bounds.height += 1; }
  }

  console.log('\tRendering HD');
  const hd = await createHdChunks(fileName, contentWithParent, bounds);

  console.log('\tCropping SVG');
  const finalSvg = `<svg ${svgNamespaces} ${rootPresentationAttrs}
    viewBox="0 0 ${bounds.width} ${bounds.height}" width="${bounds.width}" height="${bounds.height}">
    ${sharedSvgContent}
    <g transform="translate(${-(viewBoxX + bounds.x)}, ${-(viewBoxY + bounds.y)})">
      ${contentWithParent}
    </g>
  </svg>`;

  console.log('\tRendering sprite');
  const image = sharp(Buffer.from(finalSvg));
  const { data: pngBuffer, info } = await image
    .png()
    .toBuffer({ resolveWithObject: true });

  if (info.width <= maxTileSize && info.height <= maxTileSize) {
    atlasSprites.push({
      key: fileName,
      buffer: pngBuffer,
      width: info.width,
      height: info.height,
    });

    console.log(`\t✓ queued ${fileName} (${info.width}x${info.height})`);

    return {
      label: fileName,
      frame: fileName,
      bounds,
      hd,
    };
  }

  // Sprite demasiado grande para un atlas: lo troceamos en tiles a resolución completa
  // en lugar de reducirlo (reducirlo es lo que provocaba la pérdida de definición).

  const columns = Math.ceil(info.width / maxTileSize);
  const rows = Math.ceil(info.height / maxTileSize);
  const tileWidth = Math.ceil(info.width / columns);
  const tileHeight = Math.ceil(info.height / rows);
  const tiles = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const left = column * tileWidth;
      const top = row * tileHeight;
      const width = Math.min(tileWidth, info.width - left);
      const height = Math.min(tileHeight, info.height - top);
      const tileBuffer = await sharp(pngBuffer)
        .extract({ left, top, width, height })
        .png()
        .toBuffer();

      const { isEmpty } = await sharp(tileBuffer).stats().then((stats) => ({
        isEmpty: stats.channels[3].max === 0,
      }));

      if (isEmpty) {
        continue;
      }

      const tileKey = `${fileName}__tile_${column}_${row}`;
      atlasSprites.push({
        key: tileKey,
        buffer: tileBuffer,
        width,
        height,
      });
      tiles.push({
        frame: tileKey,
        x: left,
        y: top,
        width,
        height,
      });
    }
  }

  console.log(`\t✓ queued ${fileName} (${info.width}x${info.height}) en ${tiles.length} tiles`);

  return {
    label: fileName,
    bounds,
    tiles,
    hd,
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

const findBestLayout = (inputSprites, padding = atlasPadding, extrude = atlasExtrude) => {
  if (!inputSprites.length) {
    return null;
  }

  const widestSprite = inputSprites.reduce((max, sprite) => Math.max(max, sprite.width), 0);
  const tallestSprite = inputSprites.reduce((max, sprite) => Math.max(max, sprite.height), 0);
  // El padding y el extrude se aplican siempre, también con un único sprite: las texturas
  // potencia de 2 usan wrap REPEAT en Phaser y un frame pegado al borde de la textura
  // mezclaría sus píxeles con los del lado opuesto al filtrar.
  const margin = (padding + extrude) * 2;
  const widthStart = nextPowerOfTwo(widestSprite + margin);
  const heightStart = nextPowerOfTwo(tallestSprite + margin);

  let bestLayout = null;

  for (let width = widthStart; width <= maxAtlasSize; width *= 2) {
    const packAtHeight = packSprites(inputSprites, width, padding, extrude);

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

    if (Array.isArray(node.tiles)) {
      const pageTiles = node.tiles.filter((tile) => frameSet.has(tile.frame));
      if (pageTiles.length > 0) {
        filteredNodes.push({ ...node, tiles: pageTiles });
      }
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

  if (widestSprite > maxTileSize || tallestSprite > maxTileSize) {
    throw new Error(
      `Hay sprites que exceden ${maxTileSize}px (max ancho: ${widestSprite}, max alto: ${tallestSprite}).`,
    );
  }

  const atlasPages = [];
  let remainingSprites = sortedSprites;
  const atlasManifest = {
    hdScale,
    atlases: [],
    frameToAtlasKey: {},
    sprites,
  };

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

    const extrude = atlasExtrude;
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

    // Los <g> de primer nivel (hijos directos de <svg>) son capas y se desglosan, salvo los objetos
    // del juego (`ob_*`): esos se exportan como un solo sprite aunque cuelguen de la raíz.
    if (depth === 0 && !(label && label.startsWith('ob_'))) {
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