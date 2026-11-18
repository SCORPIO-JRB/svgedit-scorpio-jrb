import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    {
      // jsPDF loads these three on demand, for html() and addSvgAsImage(),
      // which the PDF export never calls. A module that only fails stands
      // for each of them: the bundle stays in one piece, without them.
      name: 'svgcanvas-jspdf-on-demand',
      enforce: 'pre',
      resolveId: (id) => (['html2canvas', 'dompurify', 'canvg'].includes(id) ? '\0not-bundled' : undefined),
      load: (id) => (id === '\0not-bundled' ? "throw new Error('not part of the svgcanvas bundle')" : undefined)
    }
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: resolve(__dirname, 'svgcanvas.js'),
      formats: ['es'],
      fileName: () => 'svgcanvas.js'
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    }
  }
})
