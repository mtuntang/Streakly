"use client";

import * as React from "react";
import { Ellipsis, EllipsisVertical, Pause, Play, Share, X as XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { prefersReducedMotion } from "@/lib/motion";
import { useInstall, useOpenGuideRequest } from "@/hooks/use-install";
import type { InstallPlatform } from "@/lib/install-platform";
import { InstallDemoScene, type SceneId } from "./install-demo";
import { hideInstallTip } from "./install-tip";

/** How long the demo stays on each step before moving to the next. */
const STEP_MS = 3400;

type Step = { title: React.ReactNode; detail?: string; scene: SceneId };

/** A browser button named inline in a step, drawn the way it looks. */
function Key({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <span className="mx-0.5 inline-flex h-5 min-w-5 translate-y-[-1px] items-center justify-center rounded-md border border-border bg-card px-1 align-middle text-foreground">
      <Icon className="size-3.5" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** The steps for this device, in the words its browser uses. */
function stepsFor(platform: InstallPlatform): Step[] {
  const home: Step = {
    title: "Open Streakly from your Home Screen",
    detail: "It opens full screen, without the browser around it.",
    scene: "home",
  };
  if (platform.kind === "android") {
    return [
      { title: <>Tap <Key icon={EllipsisVertical} label="the menu button" /> in the top corner</>, detail: "Your browser's menu.", scene: "android-menu" },
      { title: "Tap Add to Home screen", detail: "Some browsers call it Install app.", scene: "android-menu-item" },
      { title: "Tap Install", scene: "android-install" },
      { ...home, title: "Open Streakly from your Home screen" },
    ];
  }
  const shareSheet: Step = {
    title: "Tap Add to Home Screen",
    detail: "Scroll down the list if you don't see it.",
    scene: "share-sheet",
  };
  if (platform.kind === "ios" && platform.shareInMenu) {
    return [
      {
        title: <>Tap <Key icon={Ellipsis} label="More" />, then Share</>,
        detail: "More is next to the address bar. If Share is in the toolbar, tap it there.",
        scene: "ios-menu",
      },
      shareSheet,
      { title: "Keep Open as Web App on, then tap Add", scene: "ios-add-web-app" },
      home,
    ];
  }
  const browserSafari = platform.kind === "ios" && platform.browser === "safari";
  return [
    {
      title: <>Tap <Key icon={Share} label="Share" /></>,
      detail: browserSafari ? "It's in the toolbar." : "It's in your browser's toolbar or menu.",
      scene: browserSafari ? "ios-toolbar" : "ios-top-share",
    },
    shareSheet,
    { title: "Tap Add", scene: "ios-add" },
    home,
  ];
}

/**
 * The install guide: a small phone acts out each step while the steps
 * beside it light up in turn. It plays on a loop and can be paused, and
 * any step can be tapped to show it. With reduced motion it starts paused
 * and each scene is shown finished.
 *
 * Mounted once on the goals page; the tip and the account menu open it
 * through startInstall().
 */
export function InstallGuide() {
  const { platform } = useInstall();
  const steps = React.useMemo(() => stepsFor(platform), [platform]);

  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState(0);
  const [playing, setPlaying] = React.useState(true);
  // Bumped to replay the current step's scene from its start.
  const [run, setRun] = React.useState(0);

  const show = React.useCallback(() => {
    setStep(0);
    setRun((n) => n + 1);
    setPlaying(!prefersReducedMotion());
    setOpen(true);
  }, []);
  useOpenGuideRequest(show);

  // Keeps the step being shown in view where the list has to scroll (a
  // phone held sideways), as the demo moves through the steps.
  const listRef = React.useRef<HTMLOListElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const item = listRef.current?.querySelector<HTMLElement>("[aria-current=step]");
    item?.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [open, step]);

  // Moves to the next step when this one has played out. A pause clears
  // the timer, and playing again replays the current step from its start.
  React.useEffect(() => {
    if (!open || !playing) return;
    const timer = window.setTimeout(() => {
      setStep((s) => (s + 1) % steps.length);
      setRun((n) => n + 1);
    }, STEP_MS);
    return () => window.clearTimeout(timer);
  }, [open, playing, step, run, steps.length]);

  function goTo(i: number) {
    setStep(i);
    setRun((n) => n + 1);
  }

  function togglePlaying() {
    if (!playing) setRun((n) => n + 1);
    setPlaying((p) => !p);
  }

  function finish() {
    hideInstallTip();
    setOpen(false);
  }

  const current = steps[step] ?? steps[0]!;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        // Opens on the dialog itself, not on Close: focus still moves in for
        // keyboards and screen readers, without a focus ring appearing on
        // Close before anyone has done anything.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement | null)?.focus();
        }}
        className={cn(
          // Wider screens: a centred dialog that never outgrows the screen.
          "outline-none sm:max-h-[calc(100dvh-2rem)] sm:max-w-[540px] sm:overflow-y-auto guide-roomy:max-w-[720px] guide-roomy:gap-6 guide-roomy:p-8",
          // Phones: a bottom sheet.
          "max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:flex max-sm:max-h-[92dvh] max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:flex-col max-sm:gap-0 max-sm:rounded-none max-sm:rounded-t-[1.5rem] max-sm:border-x-0 max-sm:border-b-0 max-sm:p-0",
          "max-sm:data-[state=open]:zoom-in-100 max-sm:data-[state=closed]:zoom-out-100 max-sm:data-[state=open]:slide-in-from-bottom max-sm:data-[state=closed]:slide-out-to-bottom max-sm:duration-300",
          // Sideways: the drawn phone takes the full height on the left, and
          // the title, steps and Got it stack on the right. The body wrapper
          // below steps aside (display: contents) so its two parts land in
          // these columns.
          "guide-land:grid! guide-land:max-h-[calc(100dvh-0.5rem)]! guide-land:max-w-[min(820px,calc(100vw-1rem))]! guide-land:grid-cols-[auto_minmax(0,1fr)] guide-land:grid-rows-[auto_minmax(0,1fr)_auto] guide-land:gap-x-6 guide-land:gap-y-3 guide-land:overflow-hidden guide-land:py-3! guide-land:pr-[max(1rem,env(safe-area-inset-right))]! guide-land:pl-[max(1rem,env(safe-area-inset-left))]! max-sm:guide-land:rounded-t-[1.25rem]",
        )}
      >
        <DialogHeader className="flex-row items-start justify-between gap-3 text-left max-sm:border-b max-sm:border-border/60 max-sm:px-5 max-sm:pt-5 max-sm:pb-4 guide-tiny:pt-4 guide-tiny:pb-3 guide-land:col-start-2 guide-land:row-start-1 guide-land:border-0! guide-land:p-0!">
          <div className="grid min-w-0 gap-1.5">
            <DialogTitle className="text-balance guide-roomy:text-xl">Add Streakly to your Home Screen</DialogTitle>
            <DialogDescription className="guide-roomy:text-base guide-land:sr-only">
              Then it opens in one tap, full screen, like your other apps.
            </DialogDescription>
          </div>
          <DialogClose className="tap-44 -mt-1.5 -mr-1.5 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none sm:size-9">
            <XIcon className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogClose>
        </DialogHeader>

        <div className="grid gap-5 max-sm:min-h-0 max-sm:flex-1 max-sm:overflow-y-auto max-sm:overscroll-contain max-sm:px-5 max-sm:py-5 guide-tiny:gap-3 guide-tiny:py-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center guide-roomy:gap-8 guide-land:contents">
          {/* The phone: decorative, the steps carry the content. It is
              zoomed to fit the screen (.guide-stage); the pause button sits
              outside the zoom, so it keeps its full size. */}
          <div className="relative mx-auto w-fit guide-land:col-start-1 guide-land:row-span-3 guide-land:row-start-1 guide-land:self-center">
            <div className="guide-stage">
              <div
                key={`${step}-${run}`}
                className={cn(
                  "demo-stage relative h-[16.5rem] w-[13rem] overflow-hidden rounded-[1.75rem] border-[5px] border-foreground/85 bg-background shadow-[0_18px_40px_-20px_rgb(0_0_0/0.45)]",
                  !playing && "is-paused",
                )}
                aria-hidden
              >
                <InstallDemoScene scene={current.scene} />
              </div>
            </div>
            <button
              type="button"
              onClick={togglePlaying}
              aria-label={playing ? "Pause the demo" : "Play the demo"}
              className="absolute -right-3 -bottom-3 inline-flex size-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none guide-roomy:size-11"
            >
              {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4 translate-x-px" aria-hidden />}
            </button>
          </div>

          <div className="grid min-h-0 gap-3 guide-land:col-start-2 guide-land:row-start-2 guide-land:overflow-y-auto guide-land:overscroll-contain">
            {/* Small upright phones show one step at a time under the
                phone, with these numbers to move between them. */}
            <div className="hidden justify-center gap-3 guide-tiny:flex" role="group" aria-label="Choose a step">
              {steps.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => goTo(i)}
                  aria-current={i === step ? "step" : undefined}
                  aria-label={`Step ${i + 1}`}
                  className={cn(
                    "tap-44 inline-flex size-8 items-center justify-center rounded-full text-sm font-semibold tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    i === step ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
                  )}
                >
                  {i + 1}
                </button>
              ))}
            </div>

            <ol ref={listRef} className="grid gap-1 guide-roomy:gap-2" aria-label="Steps">
              {steps.map((s, i) => {
                const active = i === step;
                return (
                  <li key={i} className={cn(!active && "guide-tiny:hidden")}>
                    <button
                      type="button"
                      onClick={() => goTo(i)}
                      aria-current={active ? "step" : undefined}
                      className={cn(
                        "group/step grid w-full grid-cols-[1.5rem_1fr] gap-x-3 rounded-xl px-2 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none guide-roomy:grid-cols-[1.75rem_1fr] guide-roomy:px-3 guide-roomy:py-2.5 guide-land:py-1.5",
                        active ? "bg-brand-soft" : "hover:bg-accent",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-px inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition-colors guide-roomy:size-7 guide-roomy:text-sm guide-tiny:hidden",
                          active ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0 guide-tiny:col-span-2 guide-tiny:text-center">
                        <span className={cn("block text-sm font-medium leading-6 guide-roomy:text-base guide-roomy:leading-7 guide-tiny:text-base", active ? "text-foreground" : "text-muted-foreground")}>
                          {s.title}
                        </span>
                        {s.detail ? (
                          <span className={cn("grid transition-[grid-template-rows] duration-300 ease-out", active ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                            <span className="overflow-hidden text-xs leading-5 text-muted-foreground guide-roomy:text-sm guide-roomy:leading-6">{s.detail}</span>
                          </span>
                        ) : null}
                        {active && playing ? (
                          <span className="mt-1.5 block h-0.5 overflow-hidden rounded-full bg-foreground/10">
                            <span
                              key={run}
                              className="demo-progress block h-full origin-left rounded-full bg-brand"
                              style={{ "--dur": `${STEP_MS}ms` } as React.CSSProperties}
                            />
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        <DialogFooter className="max-sm:border-t max-sm:border-border/60 max-sm:px-5 max-sm:pt-4 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))] guide-tiny:pt-3 guide-land:col-start-2 guide-land:row-start-3 guide-land:flex-row guide-land:justify-end guide-land:border-0! guide-land:p-0!">
          <Button onClick={finish} className="max-sm:h-11 max-sm:w-full guide-roomy:h-11 guide-roomy:px-6 guide-land:h-10! guide-land:w-auto! guide-land:px-6">
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
