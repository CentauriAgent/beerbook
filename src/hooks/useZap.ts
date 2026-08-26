import { useMutation } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';

export interface ZapTarget {
  pubkey: string;
  eventId?: string;
  amount: number; // sats
}

/**
 * Fetch a lightning invoice from the recipient's LNURL-pay endpoint (derived
 * from their lud16), with a signed NIP-57 zap request embedded.
 */
async function getZapInvoice(
  signer: { signEvent: (t: { kind: number; content: string; tags: string[][]; created_at: number }) => Promise<unknown> },
  target: ZapTarget,
  lud16: string,
): Promise<string> {
  const [name, domain] = lud16.split('@');
  if (!name || !domain) throw new Error('Invalid lud16 address');

  const payRes = await fetch(`https://${domain}/.well-known/lnurlp/${name}`);
  if (!payRes.ok) throw new Error('LNURL-pay endpoint unavailable');
  const pay = await payRes.json();
  if (pay.status === 'ERROR') throw new Error(pay.reason ?? 'LNURL error');
  const { callback, minSendable, maxSendable } = pay;
  const msats = target.amount * 1000;
  if (msats < minSendable || (maxSendable && msats > maxSendable)) {
    throw new Error('Amount out of range');
  }

  const zapRequest = await signer.signEvent({
    kind: 9734,
    content: '🍻 Cheers! Beerbook zap',
    tags: [
      ['p', target.pubkey],
      ['relays', 'wss://relay.ditto.pub/', 'wss://relay.primal.net/', 'wss://nos.lol/'],
      ['amount', String(msats)],
      ...(target.eventId ? [['e', target.eventId]] : []),
    ],
    created_at: Math.floor(Date.now() / 1000),
  }) as { id: string; pubkey: string; created_at: number; kind: number; tags: string[][]; content: string; sig: string };

  const nostrParam = encodeURIComponent(JSON.stringify(zapRequest));
  const invRes = await fetch(`${callback}?amount=${msats}&nostr=${nostrParam}`);
  const inv = await invRes.json();
  if (inv.status === 'ERROR') throw new Error(inv.reason ?? 'Invoice error');
  if (!inv.pr) throw new Error('No invoice returned');
  return inv.pr as string;
}

/** NIP-57 zap flow: lud16 → LNURL → signed zap request → invoice → webln or copy. */
export function useZap(onSuccessToast?: (msg: string) => void) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (target: ZapTarget) => {
      // 1. Get author's kind 0 profile → lud16
      const [profile] = await nostr.query([{ kinds: [0], authors: [target.pubkey], limit: 1 }], {
        signal: AbortSignal.timeout(5000),
      });
      let lud16: string | undefined;
      if (profile) {
        try {
          lud16 = JSON.parse(profile.content)?.lud16;
        } catch { /* ignore */ }
      }
      if (!lud16) throw new Error('Recipient has no lightning address');
      if (!user) throw new Error('Log in to zap');

      const invoice = await getZapInvoice(user.signer as never, target, lud16);
      // 2. Try webln, else return invoice for user to pay manually
      const webln = (window as { webln?: { sendPayment: (i: string) => Promise<unknown> } }).webln;
      if (webln) {
        await webln.sendPayment(invoice);
        return { paid: true, invoice };
      }
      return { paid: false, invoice };
    },
    onSuccess: (result, target) => {
      if (result.paid) {
        toast({ title: `⚡ Zapped ${target.amount} sats!` });
        onSuccessToast?.(`⚡ Zapped ${target.amount} sats!`);
      } else {
        toast({ title: '⚡ Invoice ready', description: 'Open your lightning wallet to pay.' });
        // Offer the invoice via a lightning: link the caller can render
        window.open(`lightning:${result.invoice}`, '_self');
      }
    },
    onError: (error: Error) => {
      toast({ title: 'Zap failed', description: error.message, variant: 'destructive' });
    },
  });
}
