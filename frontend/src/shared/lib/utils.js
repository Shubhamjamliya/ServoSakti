import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs) => twMerge(clsx(inputs));

export const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
export const num = (n) => Number(n || 0).toLocaleString('en-IN');
