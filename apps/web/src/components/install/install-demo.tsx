"use client";

import * as React from "react";
import {
  Bookmark,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Copy,
  Ellipsis,
  EllipsisVertical,
  Glasses,
  History,
  Lock,
  Plus,
  Search,
  Share,
  SquarePlus,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The scenes of the install demo: a small drawn phone that acts out each
 * step. Every scene's resting state is its LAST frame (menu open, row
 * picked); the entrance animations play from hidden into that state, so
 * with reduced motion each scene is simply shown finished.
 */
export type SceneId =
  | "ios-menu"
  | "ios-toolbar"
  | "ios-top-share"
  | "share-sheet"
  | "ios-add"
  | "ios-add-web-app"
  | "android-menu"
  | "android-menu-item"
  | "android-install"
  | "home";

/** Milliseconds into a scene; becomes the animation delay. */
function at(ms: number): React.CSSProperties {
  return { "--at": `${ms}ms` } as React.CSSProperties;
}

/** A fingertip tap on its parent's centre at `ms`. */
function Tap({ ms }: { ms: number }) {
  return <span className="demo-tap" style={at(ms)} aria-hidden />;
}

/** Renders one scene inside the phone frame. */
export function InstallDemoScene({ scene }: { scene: SceneId }) {
  switch (scene) {
    case "ios-menu":
      return (
        <>
          <Page />
          <IosPillBar tapMore={500} />
          <Menu className="right-2 bottom-12 origin-bottom-right" popAt={900}>
            <MenuRow icon={Share} label="Share" pickAt={1700} />
            <MenuRow icon={Bookmark} label="Add Bookmark" />
            <MenuRow icon={Search} label="Find on Page" />
          </Menu>
        </>
      );
    case "ios-toolbar":
      return (
        <>
          <Page withAddressBar />
          <IosToolbar tapShare={600} />
          <SheetPeek at={1300} />
        </>
      );
    case "ios-top-share":
      return (
        <>
          <Page under="top-bar" />
          <TopBar end={<ToolButton icon={Share} tapAt={600} />} />
          <SheetPeek at={1300} />
        </>
      );
    case "share-sheet":
      return (
        <>
          <Page />
          <Dim />
          <ShareSheet />
        </>
      );
    case "ios-add":
    case "ios-add-web-app":
      return <IosAddPanel webApp={scene === "ios-add-web-app"} />;
    case "android-menu":
      return (
        <>
          <Page under="top-bar" />
          <TopBar end={<ToolButton icon={EllipsisVertical} tapAt={500} />} />
          <AndroidMenu popAt={900} />
        </>
      );
    case "android-menu-item":
      return (
        <>
          <Page under="top-bar" />
          <TopBar end={<ToolButton icon={EllipsisVertical} />} />
          <AndroidMenu pickAt={700} />
        </>
      );
    case "android-install":
      return (
        <>
          <Page under="top-bar" />
          <TopBar end={<ToolButton icon={EllipsisVertical} />} />
          <Dim />
          <div className="demo-pop absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-2xl border border-border/70 bg-card p-3 shadow-lg" style={at(150)}>
            <div className="flex items-center gap-2.5">
              <AppIcon className="size-9 rounded-[10px]" />
              <div className="min-w-0">
                <p className="text-[12px] font-semibold">Install app</p>
                <p className="text-[11px] text-muted-foreground">Streakly</p>
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-1.5 text-[11px] font-semibold">
              <span className="rounded-full px-2.5 py-1 text-muted-foreground">Cancel</span>
              <span className="demo-pick relative rounded-full bg-brand/15 px-2.5 py-1 text-foreground" style={at(1100)}>
                Install
                <Tap ms={1100} />
              </span>
            </div>
          </div>
        </>
      );
    case "home":
      return <HomeScreen />;
  }
}

/** The Streakly page in miniature: header and two goal cards. A browser
 *  bar drawn over the top (`under="top-bar"`) pushes the page down. */
function Page({ withAddressBar = false, under }: { withAddressBar?: boolean; under?: "top-bar" }) {
  return (
    <div className={cn("absolute inset-0 bg-background", under === "top-bar" && "pt-9")}>
      {withAddressBar ? (
        <div className="flex h-7 items-center justify-center border-b border-border/60 bg-card">
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Lock className="size-2.5" aria-hidden />
            streakly.app
          </span>
        </div>
      ) : null}
      <MiniApp />
    </div>
  );
}

/** The app itself, drawn small: shared by the page and the opened app. */
function MiniApp() {
  return (
    <>
      <div className="flex h-7 items-center gap-1.5 border-b border-border/60 px-3">
        <MiniFlame className="h-3 w-2.5" />
        <span className="h-1.5 w-11 rounded-full bg-foreground/70" />
      </div>
      <div className="space-y-2 p-2.5">
        <MiniCard color="var(--goal-emerald)" seed={3} />
        <MiniCard color="var(--goal-violet)" seed={5} />
      </div>
    </>
  );
}

/** A goal card in miniature: title bars and a small heatmap. */
function MiniCard({ color, seed }: { color: string; seed: number }) {
  return (
    <div className="rounded-lg border border-border/70 bg-card p-2">
      <div className="flex items-center gap-1.5">
        <span className="size-2 rounded-full" style={{ background: color }} />
        <span className="h-1.5 w-14 rounded-full bg-foreground/60" />
        <span className="ml-auto h-1.5 w-5 rounded-full bg-foreground/25" />
      </div>
      <div className="mt-2 grid w-fit grid-flow-col grid-rows-7 auto-cols-[5px] gap-[2px]">
        {Array.from({ length: 7 * 22 }, (_, i) => (
          <span
            key={i}
            className="size-[5px] rounded-[1px] bg-cell-empty"
            // A fixed, streaky-looking pattern: mostly done, a gap now and then.
            style={(i * seed + (i >> 3)) % 4 !== 0 ? { background: color } : undefined}
          />
        ))}
      </div>
    </div>
  );
}

/** The brand flame, small, in the brand's own colors. */
function MiniFlame({ className }: { className?: string }) {
  return (
    <svg viewBox="3 0.6 18 23.4" fill="none" className={className} aria-hidden>
      <path
        d="M12 2.2c.7 3.3 2.7 5.2 4.4 7C18.1 11 19.3 13 19.3 15.4c0 3.8-3.2 6.6-7.3 6.6s-7.3-2.8-7.3-6.6c0-2.4 1.1-4.4 2.7-5.9.2 1.7 1.1 2.9 2.3 3.5C9.6 10 10.4 5.2 12 2.2Z"
        stroke="var(--flame-lo)"
        strokeWidth={3.2}
        strokeLinejoin="round"
      />
      <path d="M12 19.6c-1.6 0-2.8-1.1-2.8-2.6 0-1.5 1.2-2.6 2.8-4.5 1.6 1.9 2.8 3 2.8 4.5 0 1.5-1.2 2.6-2.8 2.6Z" fill="var(--flame-hi)" />
    </svg>
  );
}

/** The real home-screen icon. */
function AppIcon({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- a fixed 192px asset; next/image adds nothing here.
  return <img src="/icons/icon-192.png" alt="" className={cn("block shadow-sm", className)} />;
}

/** Safari 26's floating bar: back, address, and the ⋯ button. */
function IosPillBar({ tapMore }: { tapMore: number }) {
  return (
    <div className="absolute inset-x-2 bottom-2 flex h-9 items-center gap-1 rounded-full border border-border/70 bg-card px-1.5 shadow-md">
      <ChevronLeft className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="flex h-6 flex-1 items-center justify-center rounded-full bg-muted/70 text-[11px] text-muted-foreground">
        streakly.app
      </span>
      <ToolButton icon={Ellipsis} tapAt={tapMore} />
    </div>
  );
}

/** Older Safari's bottom toolbar, with Share in the middle. */
function IosToolbar({ tapShare }: { tapShare: number }) {
  return (
    <div className="absolute inset-x-0 bottom-0 flex h-10 items-center justify-around border-t border-border/60 bg-card px-2">
      <ChevronLeft className="size-4 text-muted-foreground" aria-hidden />
      <ChevronRight className="size-4 text-muted-foreground/50" aria-hidden />
      <ToolButton icon={Share} tapAt={tapShare} />
      <BookOpen className="size-4 text-muted-foreground" aria-hidden />
      <Copy className="size-4 text-muted-foreground" aria-hidden />
    </div>
  );
}

/** A browser's top bar: the address, and one button at the end. */
function TopBar({ end }: { end: React.ReactNode }) {
  return (
    <div className="absolute inset-x-0 top-0 flex h-9 items-center gap-1.5 border-b border-border/60 bg-card px-2">
      <span className="flex h-6 flex-1 items-center gap-1 rounded-full bg-muted/70 px-2.5 text-[11px] text-muted-foreground">
        <Lock className="size-2.5 shrink-0" aria-hidden />
        streakly.app
      </span>
      {end}
    </div>
  );
}

/** A toolbar icon button; the one to press gets a tap and a ring. */
function ToolButton({ icon: Icon, tapAt }: { icon: React.ElementType; tapAt?: number }) {
  return (
    <span
      className={cn(
        "relative inline-flex size-7 shrink-0 items-center justify-center rounded-full text-foreground",
        tapAt !== undefined && "demo-pick",
      )}
      style={tapAt !== undefined ? at(tapAt) : undefined}
    >
      <Icon className="size-4" aria-hidden />
      {tapAt !== undefined ? <Tap ms={tapAt} /> : null}
    </span>
  );
}

/** A small popover menu. */
function Menu({ className, popAt, children }: { className?: string; popAt?: number; children: React.ReactNode }) {
  return (
    <div
      className={cn("absolute w-[9.5rem] overflow-hidden rounded-xl border border-border/70 bg-card py-1 shadow-lg", popAt !== undefined && "demo-pop", className)}
      style={popAt !== undefined ? at(popAt) : undefined}
    >
      {children}
    </div>
  );
}

/** One menu or list row; `pickAt` highlights and taps it. */
function MenuRow({ icon: Icon, label, pickAt }: { icon: React.ElementType; label: string; pickAt?: number }) {
  return (
    <div
      className={cn(
        "relative mx-1 flex h-7 items-center gap-2 rounded-md px-2 text-[11px] text-foreground",
        pickAt !== undefined && "demo-pick font-semibold",
      )}
      style={pickAt !== undefined ? at(pickAt) : undefined}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
      {pickAt !== undefined ? <Tap ms={pickAt} /> : null}
    </div>
  );
}

/** Chrome's ⋮ menu, with Add to Home screen at the bottom. */
function AndroidMenu({ popAt, pickAt }: { popAt?: number; pickAt?: number }) {
  return (
    <Menu className="top-10 right-1.5 origin-top-right" popAt={popAt}>
      <MenuRow icon={Plus} label="New tab" />
      <MenuRow icon={History} label="History" />
      <MenuRow icon={Star} label="Bookmarks" />
      <MenuRow icon={SquarePlus} label="Add to Home screen" pickAt={pickAt} />
    </Menu>
  );
}

/** Darkens the page behind a sheet or dialog. */
function Dim() {
  return <div className="demo-fade absolute inset-0 bg-black/25" style={at(0)} />;
}

/** The share sheet starting to rise: the hand-off to the next step. */
function SheetPeek({ at: ms }: { at: number }) {
  return (
    <div className="demo-sheet absolute inset-x-0 -bottom-[52%] h-[60%] rounded-t-2xl border-t border-border/70 bg-card shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.35)]" style={at(ms)}>
      <span className="mx-auto mt-1.5 block h-1 w-8 rounded-full bg-foreground/20" />
    </div>
  );
}

/** The iOS share sheet, with Add to Home Screen picked. */
function ShareSheet() {
  return (
    <div className="demo-sheet absolute inset-x-0 bottom-0 h-[88%] rounded-t-2xl border-t border-border/70 bg-card px-2.5 pt-2 shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.35)]" style={at(0)}>
      <span className="mx-auto block h-1 w-8 rounded-full bg-foreground/20" />
      <div className="mt-2 flex items-center gap-2">
        <AppIcon className="size-7 rounded-[8px]" />
        <div className="min-w-0 leading-tight">
          <p className="text-[11px] font-semibold">Streakly</p>
          <p className="text-[11px] text-muted-foreground">streakly.app</p>
        </div>
      </div>
      <div className="mt-2 flex justify-between px-1.5">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="size-6 rounded-full bg-foreground/10" />
        ))}
      </div>
      <div className="demo-scroll mt-2 rounded-xl bg-muted/60 py-1" style={at(500)}>
        <MenuRow icon={Copy} label="Copy" />
        <MenuRow icon={Glasses} label="Add to Reading List" />
        <MenuRow icon={Bookmark} label="Add Bookmark" />
        <MenuRow icon={SquarePlus} label="Add to Home Screen" pickAt={1500} />
      </div>
    </div>
  );
}

/** iOS's Add to Home Screen panel; Safari 26 adds the Open as Web App switch. */
function IosAddPanel({ webApp }: { webApp: boolean }) {
  const addAt = webApp ? 1900 : 1200;
  return (
    <div className="absolute inset-0 bg-muted/40">
      <div className="demo-sheet absolute inset-x-0 top-3 bottom-0 rounded-t-2xl border-t border-border/70 bg-card shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.35)]" style={at(0)}>
        <div className="flex h-9 items-center justify-between border-b border-border/60 px-2.5 text-[11px]">
          <span className="text-muted-foreground">Cancel</span>
          <span className="font-semibold">Add to Home Screen</span>
          <span className="demo-pick relative rounded-full px-1.5 py-0.5 font-bold text-brand" style={at(addAt)}>
            Add
            <Tap ms={addAt} />
          </span>
        </div>
        <div className="flex items-center gap-2.5 p-2.5">
          <AppIcon className="size-10 rounded-[11px]" />
          <div className="min-w-0 flex-1">
            <p className="border-b border-border/70 pb-1 text-[12px] font-medium">Streakly</p>
            <p className="pt-1 text-[11px] text-muted-foreground">streakly.app</p>
          </div>
        </div>
        {webApp ? (
          <div className="demo-pick mx-2.5 flex items-center justify-between rounded-lg bg-muted/60 px-2.5 py-2 text-[11px]" style={at(800)}>
            <span className="font-medium">Open as Web App</span>
            <span className="relative h-4 w-7 rounded-full bg-[oklch(0.72_0.17_150)]" aria-hidden>
              <span className="absolute top-0.5 right-0.5 size-3 rounded-full bg-white shadow-sm" />
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The payoff: the icon drops into place on the Home Screen, gets a tap,
 * and the app opens full screen with no browser around it.
 */
function HomeScreen() {
  const SLOT = 6;
  return (
    <div className="absolute inset-0 bg-[linear-gradient(160deg,var(--brand-soft),transparent_60%),var(--muted)]">
      <div className="grid grid-cols-4 gap-x-3 gap-y-3.5 px-4 pt-6">
        {Array.from({ length: 12 }, (_, i) =>
          i === SLOT ? (
            <span key={i} className="flex flex-col items-center gap-1">
              <span className="demo-drop relative" style={at(250)}>
                <AppIcon className="size-9 rounded-[10px]" />
                <Tap ms={1500} />
              </span>
              <span className="demo-fade text-[11px] leading-none font-medium" style={at(650)}>
                Streakly
              </span>
            </span>
          ) : (
            <span key={i} className="flex flex-col items-center gap-1">
              <span className="size-9 rounded-[10px] bg-foreground/10" />
              <span className="h-1 w-6 rounded-full bg-foreground/10" />
            </span>
          ),
        )}
      </div>
      {/* Opens from the icon's spot: column 3, row 2 of the grid. */}
      <div className="demo-open absolute inset-0 bg-background" style={at(1850)}>
        <MiniApp />
      </div>
    </div>
  );
}
