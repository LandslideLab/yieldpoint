import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'adapters/langgraph': 'src/adapters/langgraph.ts',
    'adapters/openai-agents': 'src/adapters/openai-agents.ts',
    'adapters/vercel-ai-sdk': 'src/adapters/vercel-ai-sdk.ts',
    'adapters/agent-loop': 'src/adapters/agent-loop.ts'
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  treeshake: true,
  target: 'es2020',
  outDir: 'dist'
});
