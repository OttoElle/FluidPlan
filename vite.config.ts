import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // GitHub Pages serves the app below /FluidPlan/; the dev server stays at /.
  base: command === 'build' ? '/FluidPlan/' : '/',
  test: {
    include: ['src/**/*.test.ts'],
  },
}));
