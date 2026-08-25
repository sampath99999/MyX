import { Outlet } from "react-router-dom";
import { UtensilsCrossed, LineChart, Library } from "lucide-react";
import { NavTabs } from "@/components/ui/tabs";

/*
  Meals' own navigation, following Money's pattern.

  Three destinations rather than seven, and the order is deliberate: Today is
  where the module is used, and the other two are where it is understood. A
  tracker that opens on a chart instead of on the thing you came to log is
  asking to be closed again.
*/

const TABS = [
  { to: "/meals", label: "Today", end: true, icon: UtensilsCrossed },
  { to: "/meals/trends", label: "Trends", icon: LineChart },
  { to: "/meals/foods", label: "Foods", icon: Library },
];

export default function MealsLayout() {
  return (
    <>
      <div className="glass-bar sticky top-0 z-20 border-b border-border px-4 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-[1400px]">
          <NavTabs items={TABS} rule={false} />
        </div>
      </div>
      <Outlet />
    </>
  );
}
