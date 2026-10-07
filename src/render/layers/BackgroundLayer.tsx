import type { JSX } from 'react';
import type { Background, Id } from '@/core/model/types';
import { num } from '../style';

/** Tracing image: top-left at (x, y), widthPx * scale wide, rotated around its top-left corner. */
export function BackgroundLayer({
  background,
  imageUrls,
}: {
  background: Background | null;
  imageUrls: Record<Id, string>;
}): JSX.Element | null {
  if (!background || !background.visible) return null;
  const url = imageUrls[background.imageId];
  if (!url) return null;
  const { x, y } = background;
  return (
    <image
      data-kind="background"
      data-id={background.imageId}
      href={url}
      x={num(x)}
      y={num(y)}
      width={num(background.widthPx * background.scale)}
      height={num(background.heightPx * background.scale)}
      transform={`rotate(${num(background.rotation)} ${num(x)} ${num(y)})`}
      opacity={background.opacity}
      preserveAspectRatio="none"
    />
  );
}
