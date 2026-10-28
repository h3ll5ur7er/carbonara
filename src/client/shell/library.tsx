// The library, the left panel's content: the pack's recipes to browse and add (the first tab) and the factory's
// blueprints (the second). The tab chosen stays for the session.
import { BookOpen, Layers } from "lucide-react";
import type { ReactNode } from "react";
import { setLibraryTab, useBrowser, type LibraryTab } from "../features/recipe-browser/browser-store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

export interface LibraryProps {
  recipes: ReactNode;
  blueprints: ReactNode;
  /** How many blueprints the factory has, beside the tab's name. */
  blueprintCount?: number | undefined;
}

export function Library({ recipes, blueprints, blueprintCount }: LibraryProps) {
  const tab = useBrowser((state) => state.tab);
  return (
    <Tabs value={tab} onValueChange={(value) => setLibraryTab(value as LibraryTab)} className="flex h-full flex-col">
      <div className="shrink-0 px-3 pt-3">
        <TabsList aria-label="Library" className="flex w-full">
          <TabsTrigger value="recipes">
            <BookOpen aria-hidden /> Recipes
          </TabsTrigger>
          <TabsTrigger value="blueprints">
            <Layers aria-hidden /> Blueprints
            {blueprintCount !== undefined && blueprintCount > 0 && (
              <span className="font-mono text-2xs text-fg-faint tabular-nums">{blueprintCount}</span>
            )}
          </TabsTrigger>
        </TabsList>
      </div>
      {/* The panels hold focusable rows and fields, so they needn't be a tab stop of their own. */}
      <TabsContent value="recipes" tabIndex={-1} className="min-h-0 flex-1">
        {recipes}
      </TabsContent>
      <TabsContent value="blueprints" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto">
        {blueprints}
      </TabsContent>
    </Tabs>
  );
}
