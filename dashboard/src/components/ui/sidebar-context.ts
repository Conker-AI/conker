"use client";

import * as React from "react";

export const SIDEBAR_COOKIE_NAME: string = "sidebar_state";
export const SIDEBAR_COOKIE_MAX_AGE: number = 60 * 60 * 24 * 7;
export const SIDEBAR_WIDTH: string = "16rem";
export const SIDEBAR_WIDTH_MOBILE: string = "18rem";
export const SIDEBAR_WIDTH_ICON: string = "3rem";
export const SIDEBAR_KEYBOARD_SHORTCUT: string = "b";

export type SidebarContextProps = {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  /** `content` hands focus to the page after navigating instead of back to the opener. */
  setOpenMobile: (open: boolean, focus?: "opener" | "content") => void;
  isMobile: boolean;
  toggleSidebar: (opener?: HTMLElement) => void;
  restoreMobileFocus: () => false;
};

export const SidebarContext: React.Context<SidebarContextProps | null> =
  React.createContext<SidebarContextProps | null>(null);

export function useSidebar(): SidebarContextProps {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }

  return context;
}