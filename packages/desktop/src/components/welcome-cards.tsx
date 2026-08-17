import { useState } from "react";
import { Lock, FileText, Combine, ShieldCheck, WifiOff } from "lucide-react";
import { motion } from "framer-motion";
import { useTheme } from "@/components/theme-provider";
import { VERSION_STRING } from "@/generated/version";

const SKIP_WELCOME_KEY = 'seQRets_skipWelcome';

type ActivePage = "create" | "plan" | "restore";

interface WelcomeCardsProps {
  onSelect: (tab: ActivePage) => void;
}

type CardPalette = {
  color: string;
  bgColor: string;
};

type CardDef = {
  value: ActivePage;
  label: string;
  description: string;
  icon: typeof Lock;
};

// Unified palettes — every action card uses the same tones so the welcome
// screen reads as one cohesive set rather than three competing colours.
// Light: bright gold icon on warm espresso badge.
// Dark: muted gold icon on a subtle gold-tinted badge, matching the rest of the dark theme.
const LIGHT_PALETTE: CardPalette = {
  color: "hsl(45 90% 65%)",
  bgColor: "#000",
};

const DARK_PALETTE: CardPalette = {
  color: "hsl(var(--primary))",
  bgColor: "#000",
};

const cards: CardDef[] = [
  { value: "create", label: "Secure a Secret", description: "Encrypt and split into Qards", icon: Lock },
  { value: "plan", label: "Inheritance Plan", description: "Prepare instructions for heirs", icon: FileText },
  { value: "restore", label: "Restore a Secret", description: "Rebuild a secret from Qards", icon: Combine },
];

export function WelcomeCards({ onSelect }: WelcomeCardsProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const palette = isDark ? DARK_PALETTE : LIGHT_PALETTE;
  const [skipNext, setSkipNext] = useState(() => {
    try { return localStorage.getItem(SKIP_WELCOME_KEY) === 'true'; } catch { return false; }
  });

  const handleSkipChange = (checked: boolean) => {
    setSkipNext(checked);
    try { localStorage.setItem(SKIP_WELCOME_KEY, checked ? 'true' : ''); } catch { /* ignore */ }
  };

  return (
    <motion.div
      className="space-y-8 w-full"
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3, ease: "easeIn" }}
    >
      {/* ── Action cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.button
              key={card.value}
              onClick={() => onSelect(card.value)}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.35, ease: "easeOut" }}
              whileHover={{ scale: 1.04, transition: { duration: 0.15 } }}
              whileTap={{ scale: 0.98, transition: { duration: 0.1 } }}
              className="flex flex-row sm:flex-col items-center justify-center gap-4 sm:aspect-square rounded-xl border-[3px] border-border/50 bg-card p-4 sm:p-8 text-center cursor-pointer hover:shadow-xl hover:bg-accent transition-[background-color,box-shadow] shadow-md dark:shadow-[0_8px_24px_rgba(0,0,0,0.8)] dark:hover:shadow-[0_12px_32px_rgba(0,0,0,0.95)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div
                className="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: palette.bgColor, color: palette.color }}
              >
                <Icon className="h-6 w-6 sm:h-7 sm:w-7" />
              </div>
              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-lg sm:text-xl font-bold text-[hsl(42_85%_45%)] dark:text-primary">{card.label}</span>
                <span className="text-xs text-muted-foreground">{card.description}</span>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* ── Inline security note ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.4 }}
        className="rounded-xl bg-[#cbc5ba] dark:bg-muted p-5 sm:p-6"
      >
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 text-sm">
          <div className="flex items-start gap-2.5 flex-1">
            <ShieldCheck className="h-5 w-5 shrink-0 mt-0.5 text-primary" />
            <p className="text-muted-foreground">
              <strong className="text-card-foreground">Native Rust crypto</strong> — runs entirely on this machine.
            </p>
          </div>
          <span aria-hidden="true" className="hidden sm:block w-px self-stretch bg-foreground/25 dark:bg-border" />
          <div className="flex items-start gap-2.5 flex-1">
            <WifiOff className="h-5 w-5 shrink-0 mt-0.5 text-primary" />
            <p className="text-muted-foreground">
              <strong className="text-card-foreground">Go offline first</strong> — app works with no internet.
            </p>
          </div>
          <span aria-hidden="true" className="hidden sm:block w-px self-stretch bg-foreground/25 dark:bg-border" />
          <div className="flex items-start gap-2.5 flex-1">
            <Lock className="h-5 w-5 shrink-0 mt-0.5 text-primary" />
            <p className="text-muted-foreground">
              <strong className="text-card-foreground">Zero knowledge</strong> — no KYC, no data collection.
            </p>
          </div>
        </div>
      </motion.div>

      {/* ── Skip preference + version footer ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.3 }}
        className="flex flex-col items-center gap-2"
      >
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={skipNext}
            onChange={(e) => handleSkipChange(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          <span className="text-sm text-muted-foreground">
            Don&rsquo;t show this screen on startup
          </span>
        </label>
        <p className="text-sm text-muted-foreground">{VERSION_STRING}</p>
      </motion.div>
    </motion.div>
  );
}
