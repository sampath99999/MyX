import { useRef } from "react";
import { useScroll, useSpring, useTransform } from "motion/react";
import { m, useReducedMotion } from "@/components/landing/motion";
import AppPreview from "@/components/landing/AppPreview";

/*
  The product shot, tilted back and standing up as you scroll.

  The effect is doing one job: making the screenshot read as an object in the
  room rather than a picture pasted onto the page. It starts rotated ~14° away
  from the viewer and flattens to 0° over the first screen of scroll, which is
  the same trick a physical product shot uses — you see the surface, then the
  face.

  Everything is driven by one `useScroll` on this container, springed so a
  trackpad's jittery deltas do not translate into a twitching panel. With
  reduced motion on, it renders flat and still.
*/

export default function HeroVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const still = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    // From the moment the top of the frame enters the viewport to the moment
    // its top reaches the top of the viewport.
    offset: ["start end", "start start"],
  });

  const smooth = useSpring(scrollYProgress, { stiffness: 120, damping: 28, mass: 0.4 });
  const rotateX = useTransform(smooth, [0, 1], [14, 0]);
  const scale = useTransform(smooth, [0, 1], [0.94, 1]);
  const y = useTransform(smooth, [0, 1], [40, 0]);

  if (still) {
    return (
      <div className="relative">
        <div className="overflow-hidden rounded-2xl">
          <AppPreview />
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative" style={{ perspective: "1400px" }}>
      {/*
        The glow under the frame. It sits behind and slightly inside the panel
        so the panel appears to be resting on a lit surface — without it the
        rotated frame floats in a void and the tilt reads as a mistake.
      */}
      <m.div
        aria-hidden
        className="pointer-events-none absolute inset-x-8 -bottom-6 top-16 rounded-[3rem] opacity-70 blur-3xl"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 50%, color-mix(in oklab, var(--brand) 40%, transparent), transparent 70%)",
          scale,
        }}
      />

      <m.div
        style={{ rotateX, scale, y, transformStyle: "preserve-3d" }}
        className="origin-top"
      >
        {/*
          Cropped rather than shown whole. A full-height dashboard in the hero
          pushes everything else below the fold and reads as a manual page; a
          crop that fades out reads as a glimpse, which is what a hero shot is
          for. The bottom gradient below does the fading.
        */}
        <div className="edge-lit max-h-[30rem] overflow-hidden rounded-2xl shadow-pop sm:max-h-[36rem]">
          <AppPreview />
        </div>
      </m.div>

      {/* Fades the bottom of the shot into the page rather than cutting it off
          with a hard edge, which is what makes it feel like a continuation of
          the section instead of an image dropped in. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background via-background/80 to-transparent"
      />
    </div>
  );
}
