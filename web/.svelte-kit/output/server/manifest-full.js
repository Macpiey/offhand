export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set(["icons/icon-180.png","icons/icon-192.png","icons/icon-512.png","manifest.webmanifest","sw.js"]),
	mimeTypes: {".png":"image/png",".webmanifest":"application/manifest+json",".js":"text/javascript"},
	_: {
		client: {start:"_app/immutable/entry/start.CyTnt3op.js",app:"_app/immutable/entry/app.rsEz-9Bk.js",imports:["_app/immutable/entry/start.CyTnt3op.js","_app/immutable/chunks/DNmJ63Pg.js","_app/immutable/chunks/ajvzcqi3.js","_app/immutable/chunks/BPYNbsjE.js","_app/immutable/chunks/DkzOMTzn.js","_app/immutable/entry/app.rsEz-9Bk.js","_app/immutable/chunks/BVWc513n.js","_app/immutable/chunks/ajvzcqi3.js","_app/immutable/chunks/DvlQWCNg.js","_app/immutable/chunks/DkzOMTzn.js","_app/immutable/chunks/CS5-4xZr.js","_app/immutable/chunks/DZzariKS.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./nodes/0.js')),
			__memo(() => import('./nodes/1.js')),
			__memo(() => import('./nodes/2.js')),
			__memo(() => import('./nodes/3.js')),
			__memo(() => import('./nodes/4.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			},
			{
				id: "/session",
				pattern: /^\/session\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 3 },
				endpoint: null
			},
			{
				id: "/settings",
				pattern: /^\/settings\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 4 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
