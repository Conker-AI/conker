// One switch for the owner's side-by-side placement review; no route semantics change.
export const companionPlacement: "title" | "tile" =
  import.meta.env.VITE_COMPANION_PLACEMENT === "tile" ? "tile" : "title";
