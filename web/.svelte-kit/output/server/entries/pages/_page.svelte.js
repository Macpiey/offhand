import { s as store_get, e as escape_html, c as ensure_array_like, b as attr_class, u as unsubscribe_stores, d as derived } from "../../chunks/index.js";
import "@sveltejs/kit/internal";
import "../../chunks/exports.js";
import "../../chunks/utils2.js";
import "@sveltejs/kit/internal/server";
import "../../chunks/root.js";
import "../../chunks/state.svelte.js";
import { w as waiting, r as runners, s as sessions } from "../../chunks/client.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    const live = derived(() => store_get($$store_subs ??= {}, "$sessions", sessions).filter((s) => !s.archived));
    if (store_get($$store_subs ??= {}, "$waiting", waiting).size > 0) {
      $$renderer2.push(`<!--[0--><button class="waiting-banner svelte-1uha8ag">🔐 ${escape_html(store_get($$store_subs ??= {}, "$waiting", waiting).size)} approval${escape_html(store_get($$store_subs ??= {}, "$waiting", waiting).size > 1 ? "s" : "")} waiting on you — tap to review</button>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <div class="list svelte-1uha8ag">`);
    const each_array = ensure_array_like(live());
    if (each_array.length !== 0) {
      $$renderer2.push("<!--[-->");
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let s = each_array[$$index];
        $$renderer2.push(`<div${attr_class("card svelte-1uha8ag", void 0, {
          "attention": store_get($$store_subs ??= {}, "$waiting", waiting).has(s.id)
        })} role="button" tabindex="0"><div class="row svelte-1uha8ag"><span class="label svelte-1uha8ag">${escape_html(s.label)}</span> <span class="state svelte-1uha8ag">`);
        if (store_get($$store_subs ??= {}, "$waiting", waiting).has(s.id)) {
          $$renderer2.push(`<!--[0-->🔐 waiting`);
        } else if (s.busy) {
          $$renderer2.push(`<!--[1--><span class="spin svelte-1uha8ag">●</span> running`);
        } else if (s.queuedPrompts > 0) {
          $$renderer2.push(`<!--[2-->${escape_html(s.queuedPrompts)} queued`);
        } else {
          $$renderer2.push(`<!--[-1-->idle`);
        }
        $$renderer2.push(`<!--]--></span></div> <div class="meta svelte-1uha8ag"><span class="chip svelte-1uha8ag">${escape_html(store_get($$store_subs ??= {}, "$runners", runners).find((r) => r.id === s.runnerId)?.name ?? s.runnerId)}</span> `);
        if (s.model) {
          $$renderer2.push(`<!--[0--><span class="chip svelte-1uha8ag">${escape_html(s.model)}</span>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--> <span class="path svelte-1uha8ag">${escape_html(s.workspace)}</span> <button class="archive svelte-1uha8ag" title="Archive">✕</button></div></div>`);
      }
    } else {
      $$renderer2.push(`<!--[!--><p class="empty svelte-1uha8ag">No sessions yet — create one below.</p>`);
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push(`<!--[-1--><button class="new-btn svelte-1uha8ag">＋ New session</button>`);
    }
    $$renderer2.push(`<!--]--></div>`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
export {
  _page as default
};
