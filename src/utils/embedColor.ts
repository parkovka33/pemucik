import { type Client, EmbedBuilder } from 'discord.js';
import { inflateSync } from 'node:zlib';

import { APP_COLOR } from '../config/constants';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MIN_ALPHA = 32;
const embedColorCache = new Map<string, number>();

type SupportedPngColorType = 2 | 6;

type PngMetadata = {
  width: number;
  height: number;
  bitDepth: number;
  colorType: SupportedPngColorType;
  interlaceMethod: number;
};

type ColorBucket = {
  weight: number;
  redSum: number;
  greenSum: number;
  blueSum: number;
};

function readByte(buffer: Buffer, offset: number): number {
  const value = buffer[offset];

  if (value === undefined) {
    throw new Error('Unexpected end of PNG data');
  }

  return value;
}

function readUInt32(buffer: Buffer, offset: number): number {
  return buffer.readUInt32BE(offset);
}

function paethPredictor(left: number, up: number, upLeft: number): number {
  const p = left + up - upLeft;
  const pLeft = Math.abs(p - left);
  const pUp = Math.abs(p - up);
  const pUpLeft = Math.abs(p - upLeft);

  if (pLeft <= pUp && pLeft <= pUpLeft) {
    return left;
  }

  if (pUp <= pUpLeft) {
    return up;
  }

  return upLeft;
}

function parsePngMetadata(buffer: Buffer): PngMetadata {
  if (buffer.length < 33 || !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error('Invalid PNG signature');
  }

  const ihdrLength = readUInt32(buffer, 8);
  const ihdrType = buffer.toString('ascii', 12, 16);

  if (ihdrLength !== 13 || ihdrType !== 'IHDR') {
    throw new Error('PNG metadata is missing IHDR');
  }

  const width = readUInt32(buffer, 16);
  const height = readUInt32(buffer, 20);
  const bitDepth = readByte(buffer, 24);
  const colorType = readByte(buffer, 25);
  const compressionMethod = readByte(buffer, 26);
  const filterMethod = readByte(buffer, 27);
  const interlaceMethod = readByte(buffer, 28);

  if (bitDepth !== 8) {
    throw new Error('Unsupported PNG bit depth');
  }

  if (colorType !== 2 && colorType !== 6) {
    throw new Error('Unsupported PNG color type');
  }

  if (compressionMethod !== 0 || filterMethod !== 0 || interlaceMethod !== 0) {
    throw new Error('Unsupported PNG encoding');
  }

  return {
    width,
    height,
    bitDepth,
    colorType,
    interlaceMethod,
  };
}

function collectIdatData(buffer: Buffer): Buffer {
  const chunks: Buffer[] = [];
  let offset = 8;

  while (offset + 8 <= buffer.length) {
    const chunkLength = readUInt32(buffer, offset);
    const chunkType = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkLength;
    const crcEnd = dataEnd + 4;

    if (crcEnd > buffer.length) {
      throw new Error('Invalid PNG chunk length');
    }

    if (chunkType === 'IDAT') {
      chunks.push(buffer.subarray(dataStart, dataEnd));
    }

    if (chunkType === 'IEND') {
      break;
    }

    offset = crcEnd;
  }

  if (chunks.length === 0) {
    throw new Error('PNG image data is missing');
  }

  return Buffer.concat(chunks);
}

function unfilterScanlines(data: Buffer, metadata: PngMetadata): Buffer {
  const bytesPerPixel = metadata.colorType === 6 ? 4 : 3;
  const stride = metadata.width * bytesPerPixel;
  const expectedLength = metadata.height * (stride + 1);

  if (data.length !== expectedLength) {
    throw new Error('PNG image data has unexpected size');
  }

  const output = Buffer.alloc(metadata.height * stride);

  for (let row = 0; row < metadata.height; row += 1) {
    const rowStart = row * (stride + 1);
    const filterType = readByte(data, rowStart);
    const sourceOffset = rowStart + 1;
    const targetOffset = row * stride;

    for (let column = 0; column < stride; column += 1) {
      const raw = readByte(data, sourceOffset + column);
      const left = column >= bytesPerPixel ? readByte(output, targetOffset + column - bytesPerPixel) : 0;
      const up = row > 0 ? readByte(output, targetOffset - stride + column) : 0;
      const upLeft = row > 0 && column >= bytesPerPixel
        ? readByte(output, targetOffset - stride + column - bytesPerPixel)
        : 0;

      if (filterType === 0) {
        output[targetOffset + column] = raw;
      } else if (filterType === 1) {
        output[targetOffset + column] = (raw + left) & 0xff;
      } else if (filterType === 2) {
        output[targetOffset + column] = (raw + up) & 0xff;
      } else if (filterType === 3) {
        output[targetOffset + column] = (raw + Math.floor((left + up) / 2)) & 0xff;
      } else if (filterType === 4) {
        output[targetOffset + column] = (raw + paethPredictor(left, up, upLeft)) & 0xff;
      } else {
        throw new Error('Unsupported PNG filter type');
      }
    }
  }

  return output;
}

function quantizeColor(red: number, green: number, blue: number): number {
  return ((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4);
}

function selectDominantColor(pixelData: Buffer, metadata: PngMetadata): number {
  const bytesPerPixel = metadata.colorType === 6 ? 4 : 3;
  const buckets = new Map<number, ColorBucket>();

  for (let offset = 0; offset < pixelData.length; offset += bytesPerPixel) {
    const red = readByte(pixelData, offset);
    const green = readByte(pixelData, offset + 1);
    const blue = readByte(pixelData, offset + 2);
    const alpha = bytesPerPixel === 4 ? readByte(pixelData, offset + 3) : 255;

    if (alpha < MIN_ALPHA) {
      continue;
    }

    const bucketKey = quantizeColor(red, green, blue);
    const bucket = buckets.get(bucketKey) ?? {
      weight: 0,
      redSum: 0,
      greenSum: 0,
      blueSum: 0,
    };

    bucket.weight += alpha;
    bucket.redSum += red * alpha;
    bucket.greenSum += green * alpha;
    bucket.blueSum += blue * alpha;
    buckets.set(bucketKey, bucket);
  }

  if (buckets.size === 0) {
    return APP_COLOR;
  }

  let dominantBucket: ColorBucket | null = null;

  for (const bucket of buckets.values()) {
    if (!dominantBucket || bucket.weight > dominantBucket.weight) {
      dominantBucket = bucket;
    }
  }

  if (!dominantBucket) {
    return APP_COLOR;
  }

  const red = Math.round(dominantBucket.redSum / dominantBucket.weight);
  const green = Math.round(dominantBucket.greenSum / dominantBucket.weight);
  const blue = Math.round(dominantBucket.blueSum / dominantBucket.weight);

  return (red << 16) | (green << 8) | blue;
}

function resolveDominantColorFromPng(buffer: Buffer): number {
  const metadata = parsePngMetadata(buffer);
  const compressedData = collectIdatData(buffer);
  const inflatedData = inflateSync(compressedData);
  const pixelData = unfilterScanlines(inflatedData, metadata);
  return selectDominantColor(pixelData, metadata);
}

export async function resolveBotAvatarEmbedColor(client: Client): Promise<number> {
  const botUser = client.user;

  if (!botUser) {
    return APP_COLOR;
  }

  const avatarUrl = botUser.displayAvatarURL({ extension: 'png', forceStatic: true, size: 64 });
  const cachedColor = embedColorCache.get(avatarUrl);

  if (cachedColor !== undefined) {
    return cachedColor;
  }

  try {
    const response = await fetch(avatarUrl);

    if (!response.ok) {
      return APP_COLOR;
    }

    const imageBuffer = Buffer.from(await response.arrayBuffer());
    const resolvedColor = resolveDominantColorFromPng(imageBuffer);
    embedColorCache.set(avatarUrl, resolvedColor);
    return resolvedColor;
  } catch {
    return APP_COLOR;
  }
}

export async function applyBotAvatarEmbedColor(embed: EmbedBuilder, client: Client): Promise<EmbedBuilder> {
  embed.setColor(await resolveBotAvatarEmbedColor(client));
  return embed;
}
