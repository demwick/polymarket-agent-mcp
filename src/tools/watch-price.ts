import { z } from "zod";
import { PriceStream } from "../services/price-stream.js";

export const watchPriceSchema = z.object({
  action: z.enum(["subscribe", "unsubscribe", "status"]).default("status"),
  token_id: z.string().optional(),
});

export function handleWatchPrice(priceStream: PriceStream, input: z.infer<typeof watchPriceSchema>): string {
  if (input.action === "status") {
    const connected = priceStream.isConnected();
    const subs = priceStream.getSubscriptionCount();

    let output = `## Price Stream Status\n\n`;
    output += `| Metric | Value |\n|--------|-------|\n`;
    output += `| Connected | ${connected ? "Yes" : "No"} |\n`;
    output += `| Subscriptions | ${subs} |\n`;

    return output;
  }

  if (!input.token_id) {
    return "Provide a `token_id` to subscribe or unsubscribe.";
  }

  if (input.action === "subscribe") {
    if (!priceStream.isConnected()) {
      priceStream.connect();
    }
    priceStream.subscribe(input.token_id, () => {});

    const last = priceStream.getLastPrice(input.token_id);
    let msg = `Subscribed to live price stream for ${input.token_id.slice(0, 12)}...`;
    if (last) msg += `\nLast price: $${last.price.toFixed(4)}`;

    return msg;
  }

  // unsubscribe
  priceStream.unsubscribe(input.token_id);
  return `Unsubscribed from ${input.token_id.slice(0, 12)}...`;
}
