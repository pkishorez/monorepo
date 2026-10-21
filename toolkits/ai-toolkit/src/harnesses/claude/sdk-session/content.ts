import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { Attachment } from '../../../harness/index.js';

type Content = SDKUserMessage['message']['content'];

const IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

const imageType = (mime: string): ImageType | undefined =>
  IMAGE_TYPES.find((type) => type === mime.toLowerCase());

/**
 * A user message's content: its text alone, or each image as a base64
 * block followed by the text. An image of a type the API cannot read is
 * left out.
 */
export const userContent = (
  text: string,
  images: ReadonlyArray<Attachment>,
): Content => {
  const blocks = images.flatMap((image) => {
    const media_type = imageType(image.mime);
    return media_type === undefined
      ? []
      : [
          {
            type: 'image' as const,
            source: { type: 'base64' as const, media_type, data: image.data },
          },
        ];
  });
  return blocks.length === 0 ? text : [...blocks, { type: 'text', text }];
};
