import { useState } from "react";
import type { CharacterProfile } from "../../domain/model";

export function Portrait({ profile, expression = "neutral", size = "small" }: { profile?: CharacterProfile; expression?: string; size?: "small" | "large" }) {
  const [failed, setFailed] = useState<string>();
  const mapped = profile?.expressions[expression] ?? profile?.expressions.neutral;
  const asset = profile?.assets.find(item => item.id === mapped && item.kind === "portrait");
  const available = profile?.renderer === "static" && asset?.url && failed !== asset.url;
  return <span className={`portrait portrait-${size}`} role="img" aria-label={`${profile?.name ?? "Companion"} ${available ? expression : "neutral"} portrait`}>
    {available ? <img src={asset.url} alt="" onError={() => setFailed(asset.url)} /> : <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M13 21C13 9 51 9 51 21v22c0 15-38 15-38 0Z" fill="currentColor" opacity=".13" /><path d="M22 29v5m20-5v5m-16 9q6 5 12 0" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>}
  </span>;
}
