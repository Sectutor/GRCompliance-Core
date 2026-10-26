
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock scrollTo (browser tests only; node-environment tests have no window)
if (typeof window !== "undefined") {
    window.scrollTo = vi.fn();
}

// Mock IntersectionObserver
const MockIntersectionObserver = vi.fn(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
}));

vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

// Mock ResizeObserver
const MockResizeObserver = vi.fn(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
}));

vi.stubGlobal('ResizeObserver', MockResizeObserver);
