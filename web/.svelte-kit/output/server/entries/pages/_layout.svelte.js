import { g as getContext, a as attr, e as escape_html, h as head, s as store_get, b as attr_class, c as ensure_array_like, u as unsubscribe_stores } from "../../chunks/index.js";
import "@sveltejs/kit/internal";
import "../../chunks/exports.js";
import "../../chunks/utils2.js";
import "@sveltejs/kit/internal/server";
import "../../chunks/root.js";
import "../../chunks/state.svelte.js";
import { c as conn, w as waiting } from "../../chunks/client.js";
import "jsqr";
const getStores = () => {
  const stores = getContext("__svelte__");
  return {
    /** @type {typeof page} */
    page: {
      subscribe: stores.page.subscribe
    },
    /** @type {typeof navigating} */
    navigating: {
      subscribe: stores.navigating.subscribe
    },
    /** @type {typeof updated} */
    updated: stores.updated
  };
};
const page = {
  subscribe(fn) {
    const store = getStores().page;
    return store.subscribe(fn);
  }
};
function PairScreen($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { error = "" } = $$props;
    let code = "";
    let relay = "";
    let errorMsg = error;
    $$renderer2.push(`<div class="pair svelte-5zdxzo"><img src="/icons/icon-192.png" alt="offhand" width="72" height="72" class="svelte-5zdxzo"/> <h1 class="svelte-5zdxzo">offhand</h1> <p class="tagline svelte-5zdxzo">Your coding agent, in your pocket.</p> <ol class="svelte-5zdxzo"><li>On your computer: <code class="svelte-5zdxzo">npx offhand --relay …</code></li> <li>Scan the QR it prints:</li></ol> <button class="scan svelte-5zdxzo">📷 Scan QR code</button> <details class="svelte-5zdxzo"><summary class="svelte-5zdxzo">or enter the code manually</summary> <form class="svelte-5zdxzo"><input placeholder="Pairing code (123456.xxxx…)"${attr("value", code)} autocomplete="off"/> <input placeholder="Relay URL (leave empty for default)"${attr("value", relay)} autocomplete="off"/> <button type="submit"${attr("disabled", !code.trim(), true)}>Pair</button></form></details> `);
    if (errorMsg) {
      $$renderer2.push(`<!--[0--><p class="err svelte-5zdxzo">${escape_html(errorMsg)}</p>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
function _layout($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    let { children } = $$props;
    let bootError = "";
    const tabs = [
      { href: "/", icon: "▤", label: "Sessions" },
      { href: "/session", icon: "❯", label: "Chat" },
      { href: "/settings", icon: "⚙", label: "Settings" }
    ];
    head("12qhfyh", $$renderer2, ($$renderer3) => {
      $$renderer3.push(`<meta name="color-scheme" content="dark"/>`);
    });
    $$renderer2.push(`<div class="app svelte-12qhfyh">`);
    if (store_get($$store_subs ??= {}, "$conn", conn).phase === "unpaired") {
      $$renderer2.push("<!--[0-->");
      PairScreen($$renderer2, { error: bootError });
    } else {
      $$renderer2.push(`<!--[-1--><header class="svelte-12qhfyh"><span${attr_class(
        `dot ${store_get($$store_subs ??= {}, "$conn", conn).phase === "connected" ? store_get($$store_subs ??= {}, "$conn", conn).daemonOnline ? "ok" : "warn" : "bad"}`,
        "svelte-12qhfyh"
      )}></span> <span class="status-text svelte-12qhfyh">`);
      if (store_get($$store_subs ??= {}, "$conn", conn).phase !== "connected") {
        $$renderer2.push(`<!--[0-->connecting…`);
      } else if (!store_get($$store_subs ??= {}, "$conn", conn).daemonOnline) {
        $$renderer2.push(`<!--[1-->daemon offline${escape_html(store_get($$store_subs ??= {}, "$conn", conn).lastSeenMs ? ` · last seen ${new Date(store_get($$store_subs ??= {}, "$conn", conn).lastSeenMs).toLocaleTimeString()}` : "")}`);
      } else {
        $$renderer2.push(`<!--[-1-->${escape_html(store_get($$store_subs ??= {}, "$conn", conn).host?.hostname ?? "connected")} · <span class="sas svelte-12qhfyh">🔒 ${escape_html(store_get($$store_subs ??= {}, "$conn", conn).sas)}</span>`);
      }
      $$renderer2.push(`<!--]--></span></header> <main class="svelte-12qhfyh">`);
      children($$renderer2);
      $$renderer2.push(`<!----></main> <nav class="svelte-12qhfyh"><!--[-->`);
      const each_array = ensure_array_like(tabs);
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let tab = each_array[$$index];
        $$renderer2.push(`<a${attr("href", tab.href)}${attr_class("svelte-12qhfyh", void 0, {
          "active": store_get($$store_subs ??= {}, "$page", page).url.pathname === tab.href
        })}><span class="icon svelte-12qhfyh">${escape_html(tab.icon)} `);
        if (tab.href === "/session" && store_get($$store_subs ??= {}, "$waiting", waiting).size > 0) {
          $$renderer2.push(`<!--[0--><span class="badge svelte-12qhfyh">${escape_html(store_get($$store_subs ??= {}, "$waiting", waiting).size)}</span>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--></span> <span>${escape_html(tab.label)}</span></a>`);
      }
      $$renderer2.push(`<!--]--></nav>`);
    }
    $$renderer2.push(`<!--]--></div>`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
export {
  _layout as default
};
