"use client";

import { Flame, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface EmptyStateProps {
  onCreate: () => void;
}

export function EmptyState({ onCreate }: EmptyStateProps) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <div className="relative">
          <div className="absolute inset-0 animate-pulse rounded-full bg-orange-500/20 blur-2xl" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-orange-500/20 to-amber-500/10 ring-1 ring-orange-500/20">
            <Flame className="h-10 w-10 text-orange-500" />
          </div>
        </div>
        <div className="space-y-1.5">
          <h3 className="text-lg font-semibold">Start your first streak</h3>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            Create a goal, check in every day, and watch your unbroken chain
            grow. Consistency is the superpower.
          </p>
        </div>
        <Button onClick={onCreate} size="lg" className="mt-2">
          <Plus className="mr-2 h-4 w-4" />
          Create your first goal
        </Button>
        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="h-3 w-3" />
          Tip: small daily actions beat big occasional efforts.
        </div>
      </CardContent>
    </Card>
  );
}
