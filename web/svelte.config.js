import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({ fallback: 'index.html' }), // SPA — daemon data is live, nothing to prerender
  },
};

export default config;
