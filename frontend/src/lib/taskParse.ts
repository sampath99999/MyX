// Natural-language quick-add parsing.
// Examples:
//   "Pay rent tomorrow !p1 #home"  -> title "Pay rent", due tomorrow, P1, label home
//   "Call mom monday"              -> due next Monday
//   "Review PR in 3 days !2"

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

function iso(d: Date): string {
  return d.toLocaleDateString("en-CA");
}

export interface ParsedQuickAdd {
  title: string;
  due_date: string | null;
  priority: number | null;
  labels: string[];
}

export function parseQuickAdd(input: string, todayISO: string): ParsedQuickAdd {
  let text = ` ${input} `;
  let due: string | null = null;
  let priority: number | null = null;
  const labels: string[] = [];
  const base = new Date(todayISO + "T00:00:00");

  const setDue = (offsetDays: number) => {
    const d = new Date(base);
    d.setDate(d.getDate() + offsetDays);
    due = iso(d);
  };

  // Priority: !p1..!p4 or !1..!4
  text = text.replace(/\s!p?([1-4])\b/i, (_m, n) => {
    priority = Number(n);
    return " ";
  });

  // Labels: #word
  text = text.replace(/\s#([\w-]+)/g, (_m, name) => {
    labels.push(String(name));
    return " ";
  });

  // Relative dates
  if (/\btoday\b/i.test(text)) {
    setDue(0);
    text = text.replace(/\btoday\b/i, " ");
  } else if (/\btomorrow\b|\btmr\b|\btmrw\b/i.test(text)) {
    setDue(1);
    text = text.replace(/\btomorrow\b|\btmr\b|\btmrw\b/i, " ");
  } else {
    const inDays = text.match(/\bin (\d{1,3}) days?\b/i);
    if (inDays) {
      setDue(Number(inDays[1]));
      text = text.replace(inDays[0], " ");
    } else {
      // "next monday" or "monday"
      const wd = text.match(/\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thurs|fri|sat)\b/i);
      if (wd) {
        const target = WEEKDAYS[wd[2].toLowerCase()];
        const cur = base.getDay();
        let delta = (target - cur + 7) % 7;
        if (delta === 0) delta = 7; // "monday" on a Monday means next Monday
        if (wd[1]) delta += 7; // "next monday"
        setDue(delta);
        text = text.replace(wd[0], " ");
      }
    }
  }

  const title = text.replace(/\s+/g, " ").trim();
  return { title, due_date: due, priority, labels };
}
