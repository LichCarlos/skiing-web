"use client";

import { useEffect, useState } from "react";
import Waves from "@/features/auth/vendor/waves";

export function AuthBackground({ paused }: { paused: boolean }) {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return (
    <div aria-hidden="true" data-auth-background>
      <Waves
        backgroundColor="#2455F5"
        lineColor="#FF3B4D"
        accentColor="#FF3B4D"
        spacing={16}
        lineWidth={1.2}
        amplitude={48}
        rotation={-12}
        speed={0.35}
        opacity={0.7}
        intro={false}
        dpr={1.25}
        paused={paused || reduced}
        mouseInteraction={!paused && !reduced}
        clickRipple={false}
      />
    </div>
  );
}
