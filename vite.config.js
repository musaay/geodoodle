import { defineConfig } from 'vite';

/**
 * The two portal SDK script tags (#23 CrazyGames, #25 Yandex Games) — see
 * src/engine/portal-sdk.js's own doc comment for why each path is what it
 * is. Keyed by VITE_PORTAL_TARGET, defaulting to 'crazygames' to match
 * portal-sdk.js's own default (build:portal doesn't set VITE_PORTAL_TARGET
 * at all).
 */
const PORTAL_SCRIPTS = {
  crazygames: '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>',
  yandex: '<script src="/sdk.js"></script>',
};

/**
 * Injects the target's portal SDK script tag into index.html ONLY for a
 * portal build (`VITE_PORTAL=1`, see package.json's build:portal/build:yandex
 * scripts) — the web build's dist/index.html must carry no reference to
 * either at all (see src/engine/portal-sdk.js's own doc comment for why, and
 * #23/#25's acceptance criteria, which grep dist/index.html for all three
 * builds).
 */
function portalSdkPlugin() {
  return {
    name: 'portal-sdk-inject',
    transformIndexHtml(html) {
      if (process.env.VITE_PORTAL !== '1') return html;
      const target = process.env.VITE_PORTAL_TARGET === 'yandex' ? 'yandex' : 'crazygames';
      return html.replace('</head>', `  ${PORTAL_SCRIPTS[target]}\n  </head>`);
    },
  };
}

export default defineConfig({
  plugins: [portalSdkPlugin()],
});
