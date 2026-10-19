
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

const premiumMock = path.resolve(__dirname, './src/mocks/premium');

export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        environment: 'happy-dom',
        setupFiles: ['./src/test/setup.ts'],
        css: true,
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            '@complianceos/ui': path.resolve(__dirname, '../ui/src'),
            '@shared': path.resolve(__dirname, '../../shared'),
            '@complianceos/premium': premiumMock,
        },
    },
});
