import type { CSSProperties } from 'react';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  radius?: string | number;
  style?: CSSProperties;
  className?: string;
}

// Thin wrapper around the shimmer utility already defined in index.css
// (`.skeleton` + `@keyframes shimmer`) — that class existed unused before this.
export function Skeleton({ width = '100%', height = '100%', radius, style, className = '' }: SkeletonProps) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ width, height, borderRadius: radius, ...style }}
      aria-hidden="true"
    />
  );
}
