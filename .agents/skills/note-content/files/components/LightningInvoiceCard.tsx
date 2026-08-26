import { cn } from '@/lib/utils';

interface LightningInvoiceCardProps {
  invoice: string;
  className?: string;
}

/**
 * Minimal Lightning invoice card — renders a `lightning:` link that
 * opens in any installed wallet.
 *
 * Ditto's richer `LightningInvoiceCard` decodes the BOLT11 invoice,
 * shows the amount, description, expiry, pays via WebLN/NWC, renders
 * a QR code, and tracks payment state. To replicate, pair with the
 * `nwc` skill's `useWallet` / `useZaps` hooks and a bolt11 decoder
 * such as `light-bolt11-decoder`.
 */
export function LightningInvoiceCard({ invoice, className }: LightningInvoiceCardProps) {
  return (
    <a
      href={`lightning:${invoice}`}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'block border rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors text-sm my-2.5',
        className,
      )}
    >
      <div className="font-medium">⚡ Lightning invoice</div>
      <div className="text-xs text-muted-foreground font-mono truncate">
        {invoice.slice(0, 24)}…
      </div>
    </a>
  );
}
