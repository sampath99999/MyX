import {
  sip,
  stepUpSip,
  lumpsum,
  swp,
  fd,
  rd,
  ppf,
  compoundInterest,
  simpleInterest,
  cagr,
  gst,
  inflation,
} from "./finance";

/*
  Every public calculator, as data.

  The alternative was a folder of near-identical page components, and that goes
  wrong in a specific way: the eleventh calculator gets built by copying the
  tenth, so it inherits the tenth's layout bugs, its heading levels and — worst
  for a set of pages whose entire job is search — its wording. Pages assembled
  that way read as templated, which is exactly what a "thin content" penalty is
  looking for.

  So the *shape* is shared and the *substance* is not. Each entry below owns its
  own H1, its own intro, several hundred words of explanation nobody else has,
  its own questions, and links to the primary sources for the rules it encodes.
  Anything generic lives in the component; anything a reader would notice lives
  here.
*/

export type CalculatorCategory = "invest" | "save" | "borrow" | "plan";

export const CATEGORY_LABELS: Record<CalculatorCategory, string> = {
  invest: "Investing",
  save: "Saving & deposits",
  borrow: "Loans & EMI",
  plan: "Planning & tax",
};

export interface CalcInput {
  key: string;
  label: string;
  /** Shown small, to the right of the label — a unit or a derived hint. */
  suffix: string | ((values: Record<string, number>) => string);
  min: number;
  max: number;
  step: number;
  initial: number;
  /** Rendered as a currency figure under the field rather than a bare number. */
  money?: boolean;
  /**
   * A short list of choices. These render as buttons rather than a slider —
   * "how often does it compound" is a choice from five, not a number, and a
   * slider showing "4" for quarterly told the reader nothing.
   */
  options?: { value: number; label: string }[];
}

export interface CalcOutput {
  label: string;
  value: string;
  /** The one number the page exists to produce. */
  primary?: boolean;
  hint?: string;
}

export interface CalcResult {
  outputs: CalcOutput[];
  /**
   * The two-part split drawn as a bar: what you put in vs what it became.
   *
   * `caption` overrides the derived "42% returns" label on the right. GST needs
   * it: the tax is 18% of the net but 15% of the total, and a bar reading
   * "15% gst" directly under a tile reading "GST at 18%" reads as a bug.
   */
  split?: {
    aLabel: string;
    aValue: number;
    bLabel: string;
    bValue: number;
    caption?: string;
  };
  /** Year-by-year series for the growth chart. */
  series?: { year: number; base: number; total: number }[];
  /** A caveat that depends on the inputs, e.g. "the corpus runs out in year 7". */
  note?: string;
}

export interface CalcReference {
  label: string;
  publisher: string;
  url: string;
}

export interface Calculator {
  slug: string;
  /** Short, for menus and cards. */
  name: string;
  category: CalculatorCategory;
  /** The <title>. Written for the SERP, not for the page. */
  title: string;
  /** The meta description. */
  description: string;
  /** The on-page H1. Deliberately not identical to the title. */
  h1: string;
  /** One or two sentences under the H1. */
  intro: string;
  /** Shown under the inputs — the convention this calculator assumes. */
  assumption: string;
  inputs: CalcInput[];
  compute: (v: Record<string, number>) => CalcResult;
  explainer: { heading: string; body: string[] }[];
  faqs: { q: string; a: string }[];
  references: CalcReference[];
  /** Slugs of calculators worth a link from this one. */
  related: string[];
}

/* ------------------------------------------------------------ formatting */

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.round(n));

const pct = (n: number) => `${Math.round(n * 10) / 10}%`;

/** "18 years 6 months" from a fractional year count. */
const termLabel = (years: number) => {
  const whole = Math.floor(years);
  const months = Math.round((years - whole) * 12);
  if (whole === 0) return `${months} months`;
  return months ? `${whole}y ${months}m` : `${whole} years`;
};

const growthSeries = (s: { year: number; invested: number; value: number }[]) =>
  s.map((p) => ({ year: p.year, base: p.invested, total: p.value }));

/* ------------------------------------------------------------ calculators */

export const CALCULATORS: Calculator[] = [
  /* ------------------------------------------------------------------ SIP */
  {
    slug: "sip-calculator",
    name: "SIP",
    category: "invest",
    title: "SIP Calculator — Mutual Fund SIP Returns with Yearly Breakdown | MyX",
    description:
      "Free SIP calculator: work out what a monthly mutual fund SIP grows to, how much of it is your money and how much is return, year by year. Start-of-month convention, no signup.",
    h1: "SIP calculator",
    intro:
      "Put in what you invest each month and the return you expect, and see what the SIP is worth at the end — split into the money you actually paid in and the growth on top.",
    assumption:
      "Instalments are invested at the start of each month and compound monthly. Returns are assumed constant; a real fund will not be.",
    inputs: [
      { key: "monthly", label: "Monthly investment", suffix: "₹", min: 500, max: 5_00_000, step: 500, initial: 10_000, money: true },
      { key: "rate", label: "Expected return", suffix: "% per year", min: 1, max: 30, step: 0.5, initial: 12 },
      { key: "years", label: "Time period", suffix: (v) => termLabel(v.years), min: 1, max: 40, step: 1, initial: 10 },
    ],
    compute: (v) => {
      const r = sip(v.monthly, v.rate, v.years);
      return {
        outputs: [
          { label: "Total value", value: inr(r.value), primary: true },
          { label: "You invested", value: inr(r.invested) },
          { label: "Estimated returns", value: inr(r.returns) },
        ],
        split: { aLabel: "Invested", aValue: r.invested, bLabel: "Returns", bValue: r.returns },
        series: growthSeries(r.series),
      };
    },
    explainer: [
      {
        heading: "What a SIP calculator actually tells you",
        body: [
          "A systematic investment plan buys units of a mutual fund on a fixed date every month. Because the amount is fixed and the unit price is not, you buy more units when the market is cheap and fewer when it is expensive — the averaging effect that makes SIPs the default advice for anyone investing out of a salary.",
          "The calculator answers one question: if the fund returned a steady rate for the whole term, what would the pot be worth? That steadiness is the fiction. No equity fund returns 12% every year; it returns 30% one year and −8% the next and averages out. The figure here is a planning number, not a forecast.",
        ],
      },
      {
        heading: "The formula",
        body: [
          "FV = P × [((1 + i)^n − 1) ÷ i] × (1 + i), where P is the monthly instalment, i is the monthly rate (annual ÷ 12 ÷ 100) and n is the number of instalments.",
          "The trailing (1 + i) is the part most calculators get quietly wrong. It assumes the instalment is invested at the start of the month rather than the end, which is what actually happens when your SIP debits on the 1st. Leave it out and a 20-year SIP is understated by about one month of growth.",
        ],
      },
      {
        heading: "Why the split matters more than the total",
        body: [
          "On a 10-year SIP at 12%, roughly half of the final value is money you paid in. On a 25-year SIP the same instalment is only about a fifth — the rest is growth. That ratio, not the headline number, is the argument for starting early, and it is why the bar under the result is drawn at all.",
        ],
      },
    ],
    faqs: [
      {
        q: "Is 12% a realistic SIP return?",
        a: "It is the figure most Indian planning tools use for a diversified equity fund over a long horizon, based on long-run index returns. Over ten years or more it is defensible. Over three years it is meaningless — equity returns over short periods are dominated by which part of the cycle you happened to buy in.",
      },
      {
        q: "Does the calculator account for expense ratio or exit load?",
        a: "No. Enter a return you expect net of costs. A fund quoting 12% gross with a 1% expense ratio is delivering roughly 11% to you, so use 11.",
      },
      {
        q: "What about tax on SIP returns?",
        a: "Not included, because it depends on the fund type and how long you hold each instalment — every SIP instalment has its own holding period for capital gains. Treat the result as pre-tax.",
      },
      {
        q: "What is the difference between a SIP and a lumpsum?",
        a: "A SIP spreads the same money over months and averages your entry price; a lumpsum puts it in at one price on one day. Over a rising market the lumpsum usually wins; over a volatile one the SIP usually does. Use the lumpsum calculator to compare the two on the same numbers.",
      },
    ],
    references: [
      { label: "Mutual funds: investor education", publisher: "SEBI", url: "https://investor.sebi.gov.in/" },
      { label: "What is a SIP?", publisher: "AMFI India", url: "https://www.amfiindia.com/investor-corner/knowledge-center/what-is-SIP.html" },
    ],
    related: ["lumpsum-calculator", "step-up-sip-calculator", "swp-calculator", "cagr-calculator"],
  },

  /* -------------------------------------------------------------- Lumpsum */
  {
    slug: "lumpsum-calculator",
    name: "Lumpsum",
    category: "invest",
    title: "Lumpsum Calculator — One-Time Mutual Fund Investment Returns | MyX",
    description:
      "Work out what a one-time investment grows to at a given annual return, year by year. Free lumpsum calculator with the invested-versus-returns split. No signup.",
    h1: "Lumpsum calculator",
    intro:
      "One amount, invested once, left to compound. See what it becomes and how much of that is growth rather than your own money.",
    assumption: "Annual compounding at a constant rate, with nothing added or withdrawn along the way.",
    inputs: [
      { key: "amount", label: "Total investment", suffix: "₹", min: 1_000, max: 5_00_00_000, step: 1_000, initial: 5_00_000, money: true },
      { key: "rate", label: "Expected return", suffix: "% per year", min: 1, max: 30, step: 0.5, initial: 12 },
      { key: "years", label: "Time period", suffix: (v) => termLabel(v.years), min: 1, max: 40, step: 1, initial: 10 },
    ],
    compute: (v) => {
      const r = lumpsum(v.amount, v.rate, v.years);
      return {
        outputs: [
          { label: "Total value", value: inr(r.value), primary: true },
          { label: "You invested", value: inr(r.invested) },
          { label: "Estimated returns", value: inr(r.returns) },
        ],
        split: { aLabel: "Invested", aValue: r.invested, bLabel: "Returns", bValue: r.returns },
        series: growthSeries(r.series),
      };
    },
    explainer: [
      {
        heading: "How a lumpsum grows",
        body: [
          "FV = P × (1 + r)^t. One multiplication per year, applied to a balance that keeps getting bigger — which is why the curve on the chart bends upward rather than running straight.",
          "The bend is the whole story of compounding. Over the first few years the line is nearly straight and the growth looks disappointing; the interesting part is entirely in the back half of the term. Drag the time period slider from 5 to 25 and watch where the value comes from.",
        ],
      },
      {
        heading: "Lumpsum or SIP?",
        body: [
          "If you already have the money and the horizon is long, the arithmetic favours investing it at once: money in the market earns for longer than money waiting to be invested. If putting it all in on one day would keep you awake, or if the market has run hard and you would not forgive yourself for buying the top, spreading it over some months costs a little expected return and buys a lot of sleep.",
          "The honest answer is that the difference between the two is usually smaller than the difference between investing and not getting round to it.",
        ],
      },
    ],
    faqs: [
      {
        q: "Does this account for inflation?",
        a: "No — the figure is in future rupees. A ₹50 lakh corpus in 20 years does not buy what ₹50 lakh buys today. Run the number through the inflation calculator to see it in today's money.",
      },
      {
        q: "Can I use this for a fixed deposit?",
        a: "Use the FD calculator instead. An FD compounds quarterly rather than annually, so this one would understate it slightly.",
      },
      {
        q: "Is the return guaranteed?",
        a: "No. This is arithmetic on an assumption you supplied. Only a deposit product — an FD, PPF, or a small savings scheme — carries a contractual rate, and even those reset.",
      },
    ],
    references: [
      { label: "Mutual funds: investor education", publisher: "SEBI", url: "https://investor.sebi.gov.in/" },
    ],
    related: ["sip-calculator", "cagr-calculator", "fd-calculator", "inflation-calculator"],
  },

  /* ---------------------------------------------------------- Step-up SIP */
  {
    slug: "step-up-sip-calculator",
    name: "Step-up SIP",
    category: "invest",
    title: "Step Up SIP Calculator — Top-Up SIP Returns Calculator | MyX",
    description:
      "Calculate a step-up (top-up) SIP where the instalment rises every year with your salary. See the extra corpus a 10% annual increase builds. Free, no signup.",
    h1: "Step-up SIP calculator",
    intro:
      "A SIP that grows with your income. Raise the instalment a little every year and see what the difference compounds into over the full term.",
    assumption:
      "The instalment rises on each anniversary, not monthly. Instalments are invested at the start of the month and compound monthly.",
    inputs: [
      { key: "monthly", label: "Starting monthly amount", suffix: "₹", min: 500, max: 5_00_000, step: 500, initial: 10_000, money: true },
      { key: "stepUp", label: "Annual increase", suffix: "% each year", min: 0, max: 50, step: 1, initial: 10 },
      { key: "rate", label: "Expected return", suffix: "% per year", min: 1, max: 30, step: 0.5, initial: 12 },
      { key: "years", label: "Time period", suffix: (v) => termLabel(v.years), min: 1, max: 40, step: 1, initial: 15 },
    ],
    compute: (v) => {
      const r = stepUpSip(v.monthly, v.rate, v.years, v.stepUp);
      const flat = sip(v.monthly, v.rate, v.years);
      return {
        outputs: [
          { label: "Total value", value: inr(r.value), primary: true },
          { label: "You invested", value: inr(r.invested) },
          { label: "Estimated returns", value: inr(r.returns) },
          {
            label: "Versus a flat SIP",
            value: `+${inr(r.value - flat.value)}`,
            hint: `A flat ${inr(v.monthly)} SIP would reach ${inr(flat.value)}`,
          },
        ],
        split: { aLabel: "Invested", aValue: r.invested, bLabel: "Returns", bValue: r.returns },
        series: growthSeries(r.series),
      };
    },
    explainer: [
      {
        heading: "Why step up at all",
        body: [
          "The instalment you can afford at 25 is not the instalment you can afford at 35, but almost nobody goes back and changes it. A step-up SIP builds the increase in at the start: the amount rises by a fixed percentage on every anniversary, ideally roughly in line with your salary, so the SIP keeps pace with your income instead of shrinking against it in real terms.",
          "The compounding effect is larger than it looks. A 10% annual step-up on a 15-year SIP roughly doubles both what you put in and what you end with, because each raise gets the remaining years to compound.",
        ],
      },
      {
        heading: "Reading the comparison",
        body: [
          "The 'versus a flat SIP' figure holds the starting instalment, the return and the term constant and changes only the step-up. It is the price of leaving a SIP untouched for a decade, and for most people it is the single largest number on this page.",
        ],
      },
    ],
    faqs: [
      {
        q: "What step-up percentage should I use?",
        a: "Something close to your expected annual salary increase — 5% to 10% is the usual range. Setting it far above what your income does means you eventually cannot fund the instalment, and a step-up SIP you cancel in year eight is worse than a flat one you keep.",
      },
      {
        q: "Do fund houses support automatic step-up?",
        a: "Most do, usually called a top-up SIP, and it can be set at the time of registration. Where it is not available the same thing is achieved by starting a second SIP each year.",
      },
      {
        q: "Does the increase apply monthly or yearly?",
        a: "Yearly, on the anniversary — which is what this calculator models and what fund houses offer. Your first twelve instalments are all at the starting amount.",
      },
    ],
    references: [
      { label: "Mutual funds: investor education", publisher: "SEBI", url: "https://investor.sebi.gov.in/" },
      { label: "What is a SIP?", publisher: "AMFI India", url: "https://www.amfiindia.com/investor-corner/knowledge-center/what-is-SIP.html" },
    ],
    related: ["sip-calculator", "lumpsum-calculator", "inflation-calculator"],
  },

  /* ------------------------------------------------------------------ SWP */
  {
    slug: "swp-calculator",
    name: "SWP",
    category: "invest",
    title: "SWP Calculator — Systematic Withdrawal Plan Calculator | MyX",
    description:
      "How long will your corpus last? Free SWP calculator showing the monthly withdrawal you can take, the balance left each year, and the month the money runs out.",
    h1: "SWP calculator",
    intro:
      "Draw a monthly income from a corpus while the rest stays invested. See what is left each year — and whether it lasts.",
    assumption:
      "The withdrawal is taken at the end of each month, after that month's growth. Returns are assumed constant.",
    inputs: [
      { key: "corpus", label: "Total investment", suffix: "₹", min: 10_000, max: 10_00_00_000, step: 10_000, initial: 50_00_000, money: true },
      { key: "monthly", label: "Monthly withdrawal", suffix: "₹", min: 500, max: 10_00_000, step: 500, initial: 30_000, money: true },
      { key: "rate", label: "Expected return", suffix: "% per year", min: 0, max: 25, step: 0.5, initial: 9 },
      { key: "years", label: "Time period", suffix: (v) => termLabel(v.years), min: 1, max: 40, step: 1, initial: 20 },
    ],
    compute: (v) => {
      const r = swp(v.corpus, v.monthly, v.rate, v.years);
      const survived = r.exhaustedInMonth === null;
      return {
        outputs: [
          { label: "Balance at the end", value: inr(r.finalBalance), primary: true },
          { label: "Total withdrawn", value: inr(r.totalWithdrawn) },
          {
            label: survived ? "Corpus lasts" : "Corpus runs out",
            value: survived ? `the full ${termLabel(v.years)}` : `month ${r.exhaustedInMonth}`,
          },
        ],
        series: r.series.map((p) => ({ year: p.year, base: p.withdrawn, total: p.balance })),
        note: survived
          ? undefined
          : `At this withdrawal rate the money is gone in year ${Math.ceil((r.exhaustedInMonth ?? 0) / 12)}. Lower the withdrawal or raise the corpus.`,
      };
    },
    explainer: [
      {
        heading: "What an SWP is for",
        body: [
          "A systematic withdrawal plan is the mirror image of a SIP: instead of putting a fixed amount in every month, you take a fixed amount out, and whatever is left stays invested. It is the standard way to convert a retirement corpus into a monthly income without selling everything on day one.",
          "The tension is simple. If the withdrawal is smaller than the growth, the corpus keeps rising and the income is effectively permanent. If it is larger, you are eating into capital and there is a date on which it ends — this calculator tells you which of those you are doing, and if it is the second, when.",
        ],
      },
      {
        heading: "The withdrawal rate that survives",
        body: [
          "As a rough guide, withdrawing about 4% of the starting corpus a year has historically survived a 30-year retirement in most market conditions. On ₹50 lakh that is a little under ₹17,000 a month. Anything much above that and the outcome depends heavily on what markets do in the first few years — the sequence of returns, not just the average.",
          "The chart plots the balance, not the withdrawals, precisely so a corpus heading for zero is visible long before it gets there.",
        ],
      },
    ],
    faqs: [
      {
        q: "Is an SWP better than a fixed deposit for income?",
        a: "It is different. An FD pays a contractual rate and returns your capital intact; an SWP takes market risk in exchange for a corpus that can grow while paying you. In a bad first decade an SWP can leave you materially worse off, which is the risk the FD does not carry.",
      },
      {
        q: "How is an SWP taxed?",
        a: "Each withdrawal is treated as a redemption of units, so capital gains apply on the gain portion of the units sold, with the rate depending on the fund type and holding period. Not modelled here — the figures are pre-tax.",
      },
      {
        q: "What happens if I withdraw more than the balance?",
        a: "The calculator takes whatever is left and stops. It reports the month the corpus is exhausted rather than showing a negative balance.",
      },
    ],
    references: [
      { label: "Mutual funds: investor education", publisher: "SEBI", url: "https://investor.sebi.gov.in/" },
    ],
    related: ["sip-calculator", "lumpsum-calculator", "fd-calculator", "inflation-calculator"],
  },

  /* ------------------------------------------------------------------- FD */
  {
    slug: "fd-calculator",
    name: "Fixed deposit",
    category: "save",
    title: "FD Calculator — Fixed Deposit Maturity & Interest Calculator | MyX",
    description:
      "Calculate fixed deposit maturity value and interest with quarterly compounding, the way Indian banks actually do it. Free FD calculator, no signup.",
    h1: "FD calculator",
    intro:
      "What a fixed deposit is worth at maturity, compounded quarterly the way banks actually post it.",
    assumption:
      "Quarterly compounding, which is the default for a cumulative FD at every major Indian bank. Non-cumulative FDs that pay interest out monthly will end lower.",
    inputs: [
      { key: "principal", label: "Deposit amount", suffix: "₹", min: 1_000, max: 5_00_00_000, step: 1_000, initial: 5_00_000, money: true },
      { key: "rate", label: "Interest rate", suffix: "% per year", min: 1, max: 15, step: 0.05, initial: 7 },
      { key: "years", label: "Tenure", suffix: (v) => termLabel(v.years), min: 1, max: 20, step: 1, initial: 5 },
    ],
    compute: (v) => {
      const r = fd(v.principal, v.rate, v.years);
      return {
        outputs: [
          { label: "Maturity value", value: inr(r.value), primary: true },
          { label: "Deposit", value: inr(r.invested) },
          { label: "Interest earned", value: inr(r.returns) },
        ],
        split: { aLabel: "Deposit", aValue: r.invested, bLabel: "Interest", bValue: r.returns },
        series: growthSeries(r.series),
      };
    },
    explainer: [
      {
        heading: "Why quarterly compounding matters",
        body: [
          "A cumulative fixed deposit in India compounds quarterly: every three months the interest earned is added to the principal and starts earning on its own. That is why the maturity value is higher than principal × rate × years, and why a calculator that compounds annually will quietly under-quote you.",
          "The gap is small over one year and meaningful over ten. On ₹5 lakh at 7% for 10 years, quarterly compounding is worth roughly ₹18,000 more than annual.",
        ],
      },
      {
        heading: "Cumulative versus non-cumulative",
        body: [
          "A cumulative FD keeps the interest in the deposit until maturity, which is the case this calculator models. A non-cumulative FD pays the interest out monthly or quarterly as income — useful if you need the cash flow, but the payout does not compound, so the total interest over the term is lower.",
          "If the bank offered you a monthly-payout FD and you want the equivalent income figure, the SWP calculator is closer to what you are asking.",
        ],
      },
      {
        heading: "Tax and TDS",
        body: [
          "FD interest is taxable as income at your slab rate in the year it accrues, not the year it is paid. Banks deduct TDS once interest across your deposits with them crosses the annual threshold, and that deduction is an advance against the tax you owe rather than the full liability. Neither is modelled here — the maturity figure is pre-tax.",
        ],
      },
    ],
    faqs: [
      {
        q: "Is my FD safe if the bank fails?",
        a: "Deposits are insured by the DICGC up to ₹5 lakh per depositor per bank, covering principal and interest together. Above that, the exposure is to the bank.",
      },
      {
        q: "Do senior citizens get a better rate?",
        a: "Usually 0.25% to 0.75% more, depending on the bank and tenure. Enter the rate you have actually been quoted rather than the headline one.",
      },
      {
        q: "What happens if I break the FD early?",
        a: "Most banks pay the rate applicable to the period the money actually stayed, minus a penalty of around 0.5% to 1%. Premature withdrawal is not modelled here.",
      },
      {
        q: "Is an FD better than a debt fund?",
        a: "An FD gives a contractual rate and DICGC cover up to ₹5 lakh; a debt fund gives no guarantee but can be more tax-efficient depending on your slab and holding period. The FD is the simpler and safer of the two, and for money you will need on a known date it is usually the right answer.",
      },
    ],
    references: [
      { label: "Deposit insurance (₹5 lakh cover)", publisher: "DICGC, RBI", url: "https://www.dicgc.org.in/" },
      { label: "Master directions on interest rate on deposits", publisher: "Reserve Bank of India", url: "https://www.rbi.org.in/" },
    ],
    related: ["rd-calculator", "ppf-calculator", "compound-interest-calculator", "lumpsum-calculator"],
  },

  /* ------------------------------------------------------------------- RD */
  {
    slug: "rd-calculator",
    name: "Recurring deposit",
    category: "save",
    title: "RD Calculator — Recurring Deposit Maturity Calculator | MyX",
    description:
      "Calculate recurring deposit maturity value and interest. Each instalment compounds quarterly for the time it is held, the way banks and India Post compute it. Free, no signup.",
    h1: "RD calculator",
    intro:
      "A fixed amount every month into a deposit that pays a contractual rate. See what it matures to and how much of that is interest.",
    assumption:
      "Every instalment compounds quarterly for as long as it is held — the first for the full term, the last for one month. This is how banks compute an RD.",
    inputs: [
      { key: "monthly", label: "Monthly deposit", suffix: "₹", min: 100, max: 10_00_000, step: 100, initial: 5_000, money: true },
      { key: "rate", label: "Interest rate", suffix: "% per year", min: 1, max: 15, step: 0.05, initial: 7 },
      { key: "years", label: "Tenure", suffix: (v) => termLabel(v.years), min: 1, max: 10, step: 1, initial: 5 },
    ],
    compute: (v) => {
      const r = rd(v.monthly, v.rate, v.years);
      return {
        outputs: [
          { label: "Maturity value", value: inr(r.value), primary: true },
          { label: "You deposited", value: inr(r.invested) },
          { label: "Interest earned", value: inr(r.returns) },
        ],
        split: { aLabel: "Deposited", aValue: r.invested, bLabel: "Interest", bValue: r.returns },
        series: growthSeries(r.series),
      };
    },
    explainer: [
      {
        heading: "How an RD is actually computed",
        body: [
          "An RD is not one deposit — it is a series of them. The instalment you pay in month one earns for the whole term; the one you pay in the final month earns for a single month. The maturity value is the sum of every instalment grown for its own holding period, compounded quarterly.",
          "This is why the effective return on an RD always looks lower than the headline rate. Your average rupee has been in the account for about half the term, not all of it. An RD at 7% for five years turns ₹3,00,000 into roughly ₹3,58,000 — an overall gain of about 19%, not 35%.",
        ],
      },
      {
        heading: "RD or SIP?",
        body: [
          "They are the same habit pointed at different risks. An RD pays a contractual rate with no market exposure and is the right home for money you need on a fixed date within a few years. A SIP takes equity risk for a higher expected return and is the right home for money you will not touch for a decade.",
          "Using an RD for a 20-year goal is the more common mistake of the two: a guaranteed 7% loses to inflation more slowly than it looks, but it still loses.",
        ],
      },
    ],
    faqs: [
      {
        q: "What if I miss an instalment?",
        a: "Banks typically charge a small penalty per missed instalment and may close the account after several consecutive misses. Not modelled here — the calculator assumes every instalment is paid on time.",
      },
      {
        q: "Is RD interest taxable?",
        a: "Yes, as income at your slab rate, and TDS applies once interest crosses the annual threshold. The maturity figure here is pre-tax.",
      },
      {
        q: "Why does my bank's figure differ by a few hundred rupees?",
        a: "Rounding conventions differ slightly between banks, and some compound on a monthly rather than quarterly basis. Over five years that is a difference of a few hundred rupees on a three-lakh deposit, not a different answer.",
      },
    ],
    references: [
      { label: "Recurring deposit scheme rules", publisher: "India Post", url: "https://www.indiapost.gov.in/Financial/Pages/Content/Post-Office-Saving-Schemes.aspx" },
      { label: "Deposit insurance (₹5 lakh cover)", publisher: "DICGC, RBI", url: "https://www.dicgc.org.in/" },
    ],
    related: ["fd-calculator", "sip-calculator", "ppf-calculator"],
  },

  /* ------------------------------------------------------------------ PPF */
  {
    slug: "ppf-calculator",
    name: "PPF",
    category: "save",
    title: "PPF Calculator — Public Provident Fund Maturity Calculator | MyX",
    description:
      "Calculate PPF maturity value over 15 years with annual compounding. See the interest earned on your yearly contribution, year by year. Free PPF calculator, no signup.",
    h1: "PPF calculator",
    intro:
      "A yearly contribution to a Public Provident Fund account, compounded annually for the full term. See what the account is worth at maturity.",
    assumption:
      "The deposit is made at the start of each year and interest is credited annually on the running balance. Real PPF interest is computed on the lowest balance between the 5th and the last day of each month, so a deposit made in April earns slightly more than the same deposit made in March.",
    inputs: [
      { key: "yearly", label: "Yearly deposit", suffix: "₹", min: 500, max: 1_50_000, step: 500, initial: 1_50_000, money: true },
      { key: "rate", label: "Interest rate", suffix: "% per year", min: 4, max: 12, step: 0.1, initial: 7.1 },
      { key: "years", label: "Tenure", suffix: (v) => termLabel(v.years), min: 15, max: 50, step: 5, initial: 15 },
    ],
    compute: (v) => {
      const r = ppf(v.yearly, v.rate, v.years);
      return {
        outputs: [
          { label: "Maturity value", value: inr(r.value), primary: true },
          { label: "You deposited", value: inr(r.invested) },
          { label: "Interest earned", value: inr(r.returns) },
        ],
        split: { aLabel: "Deposited", aValue: r.invested, bLabel: "Interest", bValue: r.returns },
        series: growthSeries(r.series),
      };
    },
    explainer: [
      {
        heading: "Why PPF is unusual",
        body: [
          "PPF is one of the few Indian instruments that is exempt at all three stages: the contribution is deductible under section 80C, the interest accrues tax-free, and the maturity amount is tax-free. That combination is worth considerably more than the headline rate suggests — for someone in the 30% bracket, a tax-free 7.1% is comparable to a taxable deposit paying well over 10%.",
          "The price is liquidity. The account runs for 15 financial years, partial withdrawals are only allowed from the seventh year and are capped, and the contribution ceiling is ₹1.5 lakh a year.",
        ],
      },
      {
        heading: "The deposit date trick",
        body: [
          "Interest is calculated on the lowest balance in the account between the 5th and the last day of each month. Depositing before the 5th of April therefore earns a full year of interest on that contribution; depositing on the 6th of March earns almost none. Over a 15-year account, consistently depositing in early April rather than late March is worth a meaningful sum for no extra money.",
          "The calculator assumes the favourable case — a contribution at the start of the year — so treat the result as the best-case figure for the rate you entered.",
        ],
      },
      {
        heading: "Extending past 15 years",
        body: [
          "At maturity the account can be extended in blocks of five years, with or without further contributions. Extending with contributions is how the balances that get quoted in the tens of lakhs are built; the tenure slider here goes to 50 years so you can see what that looks like.",
        ],
      },
    ],
    faqs: [
      {
        q: "What is the current PPF interest rate?",
        a: "The rate is set by the Ministry of Finance and reviewed quarterly, so it changes. Enter the rate currently in force — the National Savings Institute link below publishes it. The default here is the rate that has applied for several recent quarters.",
      },
      {
        q: "Can I deposit more than ₹1.5 lakh a year?",
        a: "No. ₹1.5 lakh is the statutory annual ceiling across all PPF accounts in your name, including one opened for a minor. The input is capped at that.",
      },
      {
        q: "Is PPF better than ELSS for section 80C?",
        a: "PPF is guaranteed, tax-free and locked for 15 years. ELSS is market-linked, taxed on gains above the annual exemption, and locked for three. They serve different purposes; most people who can afford to use both should.",
      },
      {
        q: "Can I withdraw before 15 years?",
        a: "Partial withdrawal is allowed from the seventh financial year, subject to a cap, and full premature closure only in narrow circumstances such as serious illness or higher education. Loans against the balance are available from the third year.",
      },
    ],
    references: [
      { label: "Small savings scheme interest rates", publisher: "National Savings Institute, Ministry of Finance", url: "https://www.nsiindia.gov.in/" },
      { label: "Public Provident Fund scheme", publisher: "India Post", url: "https://www.indiapost.gov.in/Financial/Pages/Content/Post-Office-Saving-Schemes.aspx" },
    ],
    related: ["fd-calculator", "rd-calculator", "sip-calculator", "compound-interest-calculator"],
  },

  /* ------------------------------------------------- Compound interest */
  {
    slug: "compound-interest-calculator",
    name: "Compound interest",
    category: "save",
    title: "Compound Interest Calculator — Daily, Monthly, Quarterly & Yearly | MyX",
    description:
      "Free compound interest calculator with a choice of compounding frequency. See the maturity amount, the interest earned and the year-by-year curve. No signup.",
    h1: "Compound interest calculator",
    intro:
      "Interest on the interest. Choose how often it compounds and see what the difference is worth over the term.",
    assumption: "A single deposit with nothing added or withdrawn. Choose the compounding frequency below.",
    inputs: [
      { key: "principal", label: "Principal", suffix: "₹", min: 1_000, max: 5_00_00_000, step: 1_000, initial: 1_00_000, money: true },
      { key: "rate", label: "Interest rate", suffix: "% per year", min: 0.5, max: 30, step: 0.25, initial: 10 },
      { key: "years", label: "Time period", suffix: (v) => termLabel(v.years), min: 1, max: 40, step: 1, initial: 10 },
      {
        key: "frequency",
        label: "Compounding",
        suffix: "",
        min: 1,
        max: 365,
        step: 1,
        initial: 4,
        options: [
          { value: 1, label: "Yearly" },
          { value: 2, label: "Half-yearly" },
          { value: 4, label: "Quarterly" },
          { value: 12, label: "Monthly" },
        ],
      },
    ],
    compute: (v) => {
      const n = Math.max(1, Math.round(v.frequency));
      const r = compoundInterest(v.principal, v.rate, v.years, n);
      const simple = simpleInterest(v.principal, v.rate, v.years);
      return {
        outputs: [
          { label: "Maturity amount", value: inr(r.value), primary: true },
          { label: "Interest earned", value: inr(r.returns) },
          {
            label: "Versus simple interest",
            value: `+${inr(r.value - simple.total)}`,
            hint: `Simple interest would give ${inr(simple.total)}`,
          },
        ],
        split: { aLabel: "Principal", aValue: r.invested, bLabel: "Interest", bValue: r.returns },
        series: growthSeries(r.series),
      };
    },
    explainer: [
      {
        heading: "The formula",
        body: [
          "A = P(1 + r/n)^(nt), where P is the principal, r the annual rate as a decimal, n the number of times it compounds per year and t the number of years. The interest earned is A − P.",
          "Raising n increases the result, but with sharply diminishing returns. Going from yearly to quarterly on ₹1 lakh at 10% over 10 years adds about ₹9,000; going from monthly to daily adds under ₹500. The frequency matters far less than the rate and the term.",
        ],
      },
      {
        heading: "Why the comparison line is there",
        body: [
          "Simple interest pays only on the original principal — the same amount every year, forever. Compound interest pays on the balance, which keeps growing. Over one year they are identical; over thirty they are not remotely.",
          "The 'versus simple interest' figure is the whole of what compounding contributed, isolated. On a long term it is usually larger than the principal itself.",
        ],
      },
    ],
    faqs: [
      {
        q: "How often do Indian banks compound?",
        a: "Fixed deposits compound quarterly. Savings accounts pay interest quarterly on a daily balance. PPF and most small savings schemes compound annually. Loans are a separate matter — those charge interest monthly on the reducing balance.",
      },
      {
        q: "What is the rule of 72?",
        a: "Divide 72 by the annual rate to get the rough number of years for money to double. At 8% that is nine years. It is accurate enough for mental arithmetic at ordinary rates and drifts at very high ones.",
      },
      {
        q: "Does this handle regular contributions?",
        a: "No — this is a single deposit. For a monthly contribution use the SIP calculator for market-linked returns, or the RD calculator for a contractual deposit rate.",
      },
    ],
    references: [
      { label: "Master directions on interest rate on deposits", publisher: "Reserve Bank of India", url: "https://www.rbi.org.in/" },
    ],
    related: ["simple-interest-calculator", "fd-calculator", "lumpsum-calculator", "cagr-calculator"],
  },

  /* --------------------------------------------------- Simple interest */
  {
    slug: "simple-interest-calculator",
    name: "Simple interest",
    category: "save",
    title: "Simple Interest Calculator — SI Formula, Interest & Total Amount | MyX",
    description:
      "Free simple interest calculator using I = P × R × T ÷ 100. See the interest and the total amount, and how far it falls behind compound interest. No signup.",
    h1: "Simple interest calculator",
    intro:
      "Interest on the original amount only, never on the interest. The formula every school textbook starts with — and a few real products still use.",
    assumption: "Interest accrues on the original principal for the whole term and is not added to it.",
    inputs: [
      { key: "principal", label: "Principal", suffix: "₹", min: 1_000, max: 5_00_00_000, step: 1_000, initial: 1_00_000, money: true },
      { key: "rate", label: "Interest rate", suffix: "% per year", min: 0.5, max: 40, step: 0.25, initial: 10 },
      { key: "years", label: "Time period", suffix: (v) => termLabel(v.years), min: 1, max: 30, step: 1, initial: 5 },
    ],
    compute: (v) => {
      const r = simpleInterest(v.principal, v.rate, v.years);
      const comp = compoundInterest(v.principal, v.rate, v.years, 1);
      return {
        outputs: [
          { label: "Total amount", value: inr(r.total), primary: true },
          { label: "Interest", value: inr(r.interest) },
          {
            label: "Compound would give",
            value: inr(comp.value),
            hint: `${inr(comp.value - r.total)} more, compounded yearly`,
          },
        ],
        split: { aLabel: "Principal", aValue: r.principal, bLabel: "Interest", bValue: r.interest },
      };
    },
    explainer: [
      {
        heading: "The formula",
        body: [
          "I = P × R × T ÷ 100, and the total amount is P + I. Nothing compounds: ₹1 lakh at 10% earns exactly ₹10,000 in year one, year five and year thirty.",
          "That flatness is the entire difference from compound interest, and over long terms it is enormous. Twenty years at 10% simple triples your money; twenty years at 10% compounded multiplies it by nearly seven.",
        ],
      },
      {
        heading: "Where simple interest is actually used",
        body: [
          "Most consumer products in India compound, so simple interest turns up less than the textbooks suggest. It still appears in short-term personal and vehicle loans quoted at a 'flat rate', in some informal lending, and in the interest component of certain fixed-tenure instruments.",
          "The flat-rate loan is the one to watch. A car loan advertised at '6% flat' is not a 6% loan — because you repay the principal monthly but pay interest on the whole original amount throughout, the true reducing-balance rate is roughly double. If you are comparing a flat quote against an EMI quote, the EMI calculator is the honest comparison.",
        ],
      },
    ],
    faqs: [
      {
        q: "Is a flat rate the same as simple interest?",
        a: "Effectively yes, and it is why flat-rate loans are misleading. Interest is charged on the full original amount for the whole tenure even though you have been repaying principal all along, so the effective rate is close to double the quoted one.",
      },
      {
        q: "When is simple interest better for me?",
        a: "When you are the borrower. As the lender or saver you want compounding; as the borrower you want as little of it as possible.",
      },
      {
        q: "Can time be entered in months?",
        a: "Enter the fraction — six months is 0.5 years. The formula is linear in time, so the result scales exactly.",
      },
    ],
    references: [
      { label: "Fair practices code for lenders", publisher: "Reserve Bank of India", url: "https://www.rbi.org.in/" },
    ],
    related: ["compound-interest-calculator", "emi-calculator", "fd-calculator"],
  },

  /* ----------------------------------------------------------------- CAGR */
  {
    slug: "cagr-calculator",
    name: "CAGR",
    category: "invest",
    title: "CAGR Calculator — Compound Annual Growth Rate Calculator | MyX",
    description:
      "Calculate compound annual growth rate from a starting value, an ending value and a term. Free CAGR calculator with the formula explained. No signup.",
    h1: "CAGR calculator",
    intro:
      "The single annual rate that would have taken you from where you started to where you ended. The fairest one-number summary of an investment's performance.",
    assumption:
      "CAGR smooths the path completely — it says nothing about volatility along the way, and assumes no money was added or withdrawn.",
    inputs: [
      { key: "begin", label: "Initial value", suffix: "₹", min: 1_000, max: 5_00_00_000, step: 1_000, initial: 1_00_000, money: true },
      { key: "end", label: "Final value", suffix: "₹", min: 1_000, max: 10_00_00_000, step: 1_000, initial: 2_50_000, money: true },
      { key: "years", label: "Duration", suffix: (v) => termLabel(v.years), min: 1, max: 40, step: 1, initial: 5 },
    ],
    compute: (v) => {
      const rate = cagr(v.begin, v.end, v.years);
      const gain = v.end - v.begin;
      const absolute = v.begin > 0 ? (gain / v.begin) * 100 : 0;
      return {
        outputs: [
          { label: "CAGR", value: rate === null ? "—" : pct(rate), primary: true },
          { label: "Absolute return", value: pct(absolute), hint: "Total growth, ignoring how long it took" },
          { label: "Gain", value: inr(gain) },
        ],
        split: { aLabel: "Initial", aValue: v.begin, bLabel: "Gain", bValue: Math.max(0, gain) },
      };
    },
    explainer: [
      {
        heading: "What CAGR is",
        body: [
          "CAGR = ((Final ÷ Initial)^(1 ÷ years) − 1) × 100. It is the constant annual rate that would have produced the same ending value — a way of comparing investments held for different lengths of time on the same scale.",
          "It is not the average of the yearly returns. An investment that gains 100% then loses 50% is exactly where it started: an arithmetic average of +25% a year, and a CAGR of 0%. The CAGR is the one that is telling the truth.",
        ],
      },
      {
        heading: "What CAGR hides",
        body: [
          "Everything about the journey. Two investments with an identical 12% CAGR can have wildly different experiences — one drifting steadily upward, the other halving in year three and recovering. If you might need the money at an unplanned moment, that difference is the only thing that matters, and CAGR is silent on it.",
          "It also assumes nothing was added or withdrawn. If you invested more along the way, CAGR is the wrong measure and XIRR is the right one.",
        ],
      },
    ],
    faqs: [
      {
        q: "What is a good CAGR?",
        a: "It depends entirely on the asset. Over long periods, Indian equity indices have delivered roughly 11–13%, debt around 6–8%, and inflation has run near 5–6%. A CAGR below inflation means the investment lost purchasing power however positive the number looks.",
      },
      {
        q: "CAGR or absolute return?",
        a: "Absolute return tells you how much you made; CAGR tells you how fast. A 150% absolute return is excellent over five years and mediocre over twenty — which is exactly the distinction CAGR exists to make, and why both are shown here.",
      },
      {
        q: "Can CAGR be negative?",
        a: "Yes, whenever the final value is lower than the initial one. The calculator reports it as a negative percentage rather than hiding it.",
      },
    ],
    references: [
      { label: "Mutual funds: investor education", publisher: "SEBI", url: "https://investor.sebi.gov.in/" },
    ],
    related: ["sip-calculator", "lumpsum-calculator", "inflation-calculator", "compound-interest-calculator"],
  },

  /* ------------------------------------------------------------------ GST */
  {
    slug: "gst-calculator",
    name: "GST",
    category: "plan",
    title: "GST Calculator — Add or Remove GST at 5%, 12%, 18% & 28% | MyX",
    description:
      "Free GST calculator. Add GST to a net amount or strip it out of an inclusive price, with the CGST and SGST split. Supports 5%, 12%, 18% and 28% slabs.",
    h1: "GST calculator",
    intro:
      "Add GST to a price, or work backwards from a price that already includes it. Both directions, with the CGST and SGST split.",
    assumption:
      "The CGST and SGST split shown applies to an intra-state supply. For an inter-state supply the same total is charged as a single IGST.",
    inputs: [
      { key: "amount", label: "Amount", suffix: "₹", min: 1, max: 1_00_00_000, step: 1, initial: 10_000, money: true },
      {
        key: "rate",
        label: "GST rate",
        suffix: "",
        min: 0,
        max: 28,
        step: 1,
        initial: 18,
        options: [
          { value: 3, label: "3%" },
          { value: 5, label: "5%" },
          { value: 12, label: "12%" },
          { value: 18, label: "18%" },
          { value: 28, label: "28%" },
        ],
      },
      {
        key: "mode",
        label: "The amount above is",
        suffix: "",
        min: 0,
        max: 1,
        step: 1,
        initial: 0,
        options: [
          { value: 0, label: "Before GST" },
          { value: 1, label: "GST inclusive" },
        ],
      },
    ],
    compute: (v) => {
      const rate = Math.round(v.rate);
      const mode = Math.round(v.mode) === 0 ? "exclusive" : "inclusive";
      const r = gst(v.amount, rate, mode as "exclusive" | "inclusive");
      return {
        outputs: [
          { label: mode === "exclusive" ? "Total price" : "Price before GST", value: inr(mode === "exclusive" ? r.total : r.base), primary: true },
          { label: `GST at ${rate}%`, value: inr(r.gst) },
          { label: "CGST + SGST", value: `${inr(r.cgst)} + ${inr(r.sgst)}` },
        ],
        split: {
          aLabel: "Net amount",
          aValue: r.base,
          bLabel: "GST",
          bValue: r.gst,
          caption: `GST is ${Math.round((r.gst / Math.max(1, r.total)) * 100)}% of the total price`,
        },
      };
    },
    explainer: [
      {
        heading: "Adding versus removing GST",
        body: [
          "These are not the same sum, and mixing them up is the most common error on GST calculators. Adding GST to ₹10,000 at 18% gives ₹11,800. Removing GST from ₹11,800 gives ₹10,000 back — but removing 18% of ₹11,800 gives ₹9,676, which is wrong.",
          "The correct reverse formula divides rather than subtracts: net = gross ÷ (1 + rate). This calculator makes you say which one you mean rather than guessing.",
        ],
      },
      {
        heading: "CGST, SGST and IGST",
        body: [
          "On a supply within a state, the total GST is split evenly between the centre (CGST) and the state (SGST) — 18% is 9% plus 9%. On a supply between states, the same total is charged once as IGST and later apportioned. The rate the customer pays is identical either way; only the labels on the invoice change.",
        ],
      },
    ],
    faqs: [
      {
        q: "Which GST slab applies to my product?",
        a: "The rate depends on the HSN or SAC code of what is being supplied, and the slabs are revised by the GST Council from time to time. The CBIC rate finder linked below is the authoritative source — this calculator does the arithmetic once you know the rate.",
      },
      {
        q: "Is GST charged on the discounted price or the list price?",
        a: "On the transaction value — that is, after any discount shown on the invoice. Discounts given after the sale only reduce the taxable value in specific circumstances.",
      },
      {
        q: "Does this handle the cess on luxury and sin goods?",
        a: "No. Items such as tobacco and large cars carry a compensation cess on top of the 28% slab, at rates specific to the item. Add it separately.",
      },
    ],
    references: [
      { label: "GST rate finder and notifications", publisher: "CBIC, Government of India", url: "https://cbic-gst.gov.in/" },
      { label: "GST portal", publisher: "Goods and Services Tax Network", url: "https://www.gst.gov.in/" },
    ],
    related: ["simple-interest-calculator", "inflation-calculator", "compound-interest-calculator"],
  },

  /* ------------------------------------------------------------ Inflation */
  {
    slug: "inflation-calculator",
    name: "Inflation",
    category: "plan",
    title: "Inflation Calculator — Future Cost & Value of Money in India | MyX",
    description:
      "See what today's money will be worth after inflation, and what today's expenses will cost in future. Free inflation calculator with a year-by-year curve.",
    h1: "Inflation calculator",
    intro:
      "What today's rupee is worth later, and what today's expense costs later. The same arithmetic, pointed in both directions.",
    assumption: "A constant annual inflation rate. Real inflation varies year to year and by what you actually buy.",
    inputs: [
      { key: "amount", label: "Amount today", suffix: "₹", min: 1_000, max: 10_00_00_000, step: 1_000, initial: 1_00_000, money: true },
      { key: "rate", label: "Inflation rate", suffix: "% per year", min: 1, max: 20, step: 0.25, initial: 6 },
      { key: "years", label: "Time period", suffix: (v) => termLabel(v.years), min: 1, max: 40, step: 1, initial: 10 },
    ],
    compute: (v) => {
      const r = inflation(v.amount, v.rate, v.years);
      return {
        outputs: [
          { label: `What ${inr(v.amount)} will cost`, value: inr(r.futureCost), primary: true },
          {
            label: `What ${inr(v.amount)} will be worth`,
            value: inr(r.futureValueOfToday),
            hint: "In today's purchasing power",
          },
          { label: "Purchasing power lost", value: inr(r.erosion) },
        ],
        split: {
          aLabel: "Still worth",
          aValue: r.futureValueOfToday,
          bLabel: "Eroded",
          bValue: r.erosion,
        },
        series: r.series.map((p) => ({ year: p.year, base: v.amount, total: p.cost })),
      };
    },
    explainer: [
      {
        heading: "Two questions, one formula",
        body: [
          "Future cost = today's cost × (1 + i)^t. Future value of today's money = today's money ÷ (1 + i)^t. They are the same relationship read in opposite directions, and both are shown because people mean both when they ask about inflation.",
          "At 6% a year, prices roughly double every twelve years. A ₹40,000-a-month household budget today needs about ₹72,000 a month in ten years to buy the same things.",
        ],
      },
      {
        heading: "Why this belongs next to every other calculator here",
        body: [
          "Every future figure on this site — SIP maturity, FD maturity, PPF balance — is in future rupees, and future rupees are smaller. A ₹1 crore corpus in 25 years at 6% inflation has the purchasing power of about ₹23 lakh today.",
          "That is not an argument against saving; it is an argument against celebrating the nominal number. The useful comparison is always the return minus inflation, and a guaranteed 7% deposit against 6% inflation is earning about 1% in the only terms that matter.",
        ],
      },
    ],
    faqs: [
      {
        q: "What inflation rate should I assume?",
        a: "India's Consumer Price Index inflation has mostly run between 4% and 7% in recent years, and the Reserve Bank's mandated target is 4% with a band of plus or minus two points. Six per cent is a reasonable planning default. Your personal rate differs — education and healthcare have historically inflated much faster than the headline index.",
      },
      {
        q: "Is this the same as the CPI?",
        a: "It uses a single flat rate rather than the actual index. For a specific historical period, the official CPI series from MoSPI is the accurate source.",
      },
      {
        q: "How do I compare a return against inflation?",
        a: "Subtract, roughly: a 12% return against 6% inflation is about 6% real. Strictly it is (1.12 ÷ 1.06) − 1 = 5.7%, and the difference between the two methods only matters at high rates.",
      },
    ],
    references: [
      { label: "Monetary policy and the inflation target", publisher: "Reserve Bank of India", url: "https://www.rbi.org.in/" },
      { label: "Consumer Price Index releases", publisher: "MoSPI, Government of India", url: "https://mospi.gov.in/" },
    ],
    related: ["sip-calculator", "lumpsum-calculator", "ppf-calculator", "cagr-calculator"],
  },
];

/* ------------------------------------------------------------ lookups */

export const CALCULATOR_BY_SLUG = new Map(CALCULATORS.map((c) => [c.slug, c]));

/**
 * The EMI calculator is a hand-built page rather than a registry entry — it has
 * an amortisation table and a split chart nothing else needs. It still has to
 * appear in the hub, the mega menu and the "related" lists, so it is described
 * here as a link.
 */
export const EMI_CARD = {
  slug: "emi-calculator",
  name: "EMI",
  category: "borrow" as CalculatorCategory,
  h1: "EMI calculator",
  intro:
    "Home, car and personal loan EMI on the reducing balance, with every instalment of the schedule.",
};

export interface CalculatorLink {
  slug: string;
  name: string;
  intro: string;
  category: CalculatorCategory;
}

/** Everything linkable, EMI included, in menu order. */
export const ALL_CALCULATOR_LINKS: CalculatorLink[] = [
  { slug: EMI_CARD.slug, name: EMI_CARD.name, intro: EMI_CARD.intro, category: EMI_CARD.category },
  ...CALCULATORS.map((c) => ({
    slug: c.slug,
    name: c.name,
    intro: c.intro,
    category: c.category,
  })),
];

export function linksByCategory(category: CalculatorCategory): CalculatorLink[] {
  return ALL_CALCULATOR_LINKS.filter((c) => c.category === category);
}

/** Resolve a "related" slug to something renderable, EMI included. */
export function linkFor(slug: string): CalculatorLink | undefined {
  return ALL_CALCULATOR_LINKS.find((c) => c.slug === slug);
}

/** Where a calculator lives. EMI keeps its original top-level URL. */
export function pathFor(slug: string): string {
  return slug === "emi-calculator" ? "/emi-calculator" : `/calculators/${slug}`;
}
