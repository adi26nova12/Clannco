/* GSAP is loaded as classic scripts (its distributed builds are UMD); this module registers the
   plugins once and defines the easing tokens that mirror clannco.css. */
const { gsap, ScrollTrigger, SplitText, CustomEase, Flip } = window;

// Flip only drives the first-visit intro; everything else works without it.
gsap.registerPlugin(ScrollTrigger, SplitText, CustomEase, ...(Flip ? [Flip] : []));

CustomEase.create('c-out', '0.22,1,0.36,1');   // --e-out
CustomEase.create('c-expo', '0.16,1,0.3,1');   // --e-expo-out
CustomEase.create('c-inout', '0.76,0,0.24,1'); // --e-in-out

// Mobile URL-bar show/hide resizes the viewport; refreshing on it makes pinned sections jump.
ScrollTrigger.config({ ignoreMobileResize: true });

export { gsap, ScrollTrigger, SplitText, Flip };
