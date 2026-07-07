import { TrendingUp, PieChart, Landmark, ShieldCheck, Coins, Bitcoin, Layers } from "lucide-react";
import type { InvestmentType } from "@/lib/api";

export const INVESTMENT_TYPES: { value: InvestmentType; label: string; icon: typeof TrendingUp }[] = [
  { value: "stocks", label: "Stocks", icon: TrendingUp },
  { value: "mutual_fund", label: "Mutual Fund", icon: PieChart },
  { value: "fd", label: "Fixed Deposit", icon: Landmark },
  { value: "ppf_epf", label: "PPF / EPF", icon: ShieldCheck },
  { value: "gold", label: "Gold", icon: Coins },
  { value: "crypto", label: "Crypto", icon: Bitcoin },
  { value: "other", label: "Other", icon: Layers },
];

export function investmentTypeMeta(type: InvestmentType) {
  return INVESTMENT_TYPES.find((t) => t.value === type) ?? INVESTMENT_TYPES[INVESTMENT_TYPES.length - 1];
}
