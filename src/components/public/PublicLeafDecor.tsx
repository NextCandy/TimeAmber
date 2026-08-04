import type { CSSProperties } from "react";

const LEAVES = [
  ["nw", "6%", "10px", "6px", "15s", "-7s", "72px", "-20deg", "18%"],
  ["n1", "18%", "13px", "8px", "18s", "-13s", "-48px", "36deg", "38%"],
  ["n2", "32%", "8px", "5px", "13s", "-4s", "65px", "-55deg", "55%"],
  ["n3", "48%", "12px", "7px", "17s", "-11s", "-80px", "82deg", "24%"],
  ["n4", "63%", "9px", "6px", "14s", "-9s", "52px", "-30deg", "67%"],
  ["n5", "76%", "14px", "8px", "19s", "-15s", "-58px", "42deg", "46%"],
  ["n6", "88%", "10px", "6px", "12s", "-3s", "75px", "-74deg", "81%"],
  ["n7", "96%", "8px", "5px", "16s", "-12s", "-44px", "105deg", "30%"],
] as const;

export function PublicLeafDecor() {
  return (
    <div className="public-background__leaves" aria-hidden="true">
      {LEAVES.map(([id, left, size, height, duration, delay, drift, rotation, staticTop]) => (
        <span
          key={id}
          className="public-background__leaf"
          style={
            {
              "--leaf-left": left,
              "--leaf-size": size,
              "--leaf-height": height,
              "--leaf-duration": duration,
              "--leaf-delay": delay,
              "--leaf-drift": drift,
              "--leaf-rotation": rotation,
              "--leaf-static-top": staticTop,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
