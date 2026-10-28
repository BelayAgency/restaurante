import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...clases: ClassValue[]): string {
  return twMerge(clsx(clases));
}
