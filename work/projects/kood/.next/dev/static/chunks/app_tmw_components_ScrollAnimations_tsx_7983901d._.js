(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/app/tmw/components/ScrollAnimations.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ScrollAnimations
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
"use client";
;
function ScrollAnimations() {
    _s();
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "ScrollAnimations.useEffect": ()=>{
            const elements = document.querySelectorAll(".animate-in");
            const observer = new IntersectionObserver({
                "ScrollAnimations.useEffect": (entries)=>{
                    entries.forEach({
                        "ScrollAnimations.useEffect": (entry)=>{
                            if (entry.isIntersecting) {
                                const el = entry.target;
                                const delay = el.dataset.delay;
                                if (delay) {
                                    el.style.transitionDelay = `${delay}ms`;
                                }
                                el.classList.add("is-visible");
                                observer.unobserve(el);
                            }
                        }
                    }["ScrollAnimations.useEffect"]);
                }
            }["ScrollAnimations.useEffect"], {
                threshold: 0.1
            });
            elements.forEach({
                "ScrollAnimations.useEffect": (el)=>observer.observe(el)
            }["ScrollAnimations.useEffect"]);
            return ({
                "ScrollAnimations.useEffect": ()=>observer.disconnect()
            })["ScrollAnimations.useEffect"];
        }
    }["ScrollAnimations.useEffect"], []);
    return null;
}
_s(ScrollAnimations, "OD7bBpZva5O2jO+Puf00hKivP7c=");
_c = ScrollAnimations;
var _c;
__turbopack_context__.k.register(_c, "ScrollAnimations");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=app_tmw_components_ScrollAnimations_tsx_7983901d._.js.map