import sharp from 'sharp';

/** An SVG drawn as a PNG. The art is greys only, so a palette keeps it small. */
export const png = (svg: string) =>
  sharp(Buffer.from(svg))
    .png({ palette: true, compressionLevel: 9 })
    .toBuffer();
