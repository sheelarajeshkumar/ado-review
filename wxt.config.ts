import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'PEP Review',
    description: 'AI-powered code review for Azure DevOps pull requests',
    permissions: ['storage'],
    host_permissions: [
      'https://dev.azure.com/*',
      'https://*.visualstudio.com/*',
      'https://api.openai.com/*',
    ],
  },
});
