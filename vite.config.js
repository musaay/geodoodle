import { defineConfig } from 'vite';

/**
 * Injects the CrazyGames SDK v3 script tag into index.html ONLY for the
 * portal build (`VITE_PORTAL=1`, see package.json's build:portal script) —
 * the web build's dist/index.html must carry no reference to it at all
 * (see src/engine/portal-sdk.js's own doc comment for why, and #23's
 * acceptance criteria, which greps dist/index.html for both builds).
 */
function crazyGamesSdkPlugin() {
  return {
    name: 'crazygames-sdk-inject',
    transformIndexHtml(html) {
      if (process.env.VITE_PORTAL !== '1') return html;
      return html.replace(
        '</head>',
        '  <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>\n  </head>'
      );
    },
  };
}

export default defineConfig({
  plugins: [crazyGamesSdkPlugin()],
});
