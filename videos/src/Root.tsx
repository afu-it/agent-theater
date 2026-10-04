import { Composition } from "remotion";

import { Film } from "./Film";
import { DURATION, FPS } from "./timeline";

export function Root() {
  return (
    <>
      <Composition
        id="TheaterWide"
        component={Film}
        width={1920}
        height={1080}
        fps={FPS}
        durationInFrames={Math.round(DURATION * FPS)}
        defaultProps={{ layout: "wide" as const }}
      />
      <Composition
        id="TheaterTall"
        component={Film}
        width={1080}
        height={1920}
        fps={FPS}
        durationInFrames={Math.round(DURATION * FPS)}
        defaultProps={{ layout: "tall" as const }}
      />
    </>
  );
}
