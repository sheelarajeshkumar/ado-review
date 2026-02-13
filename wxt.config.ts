import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: 'ADO Review',
    description: 'AI-powered code review for Azure DevOps pull requests',
    permissions: ['storage'],
    host_permissions: [
      'https://dev.azure.com/*',
      'https://*.visualstudio.com/*',
      'https://api.openai.com/*',
      'https://api.anthropic.com/*',
      'https://generativelanguage.googleapis.com/*',
      'http://localhost/*',
    ],
  },
});
