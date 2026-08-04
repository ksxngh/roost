import { NextResponse } from "next/server";

import { serverEnv } from "@/lib/env";
import { paymentsConfigured, stripeGateway } from "@/server/payments/stripe";
import { handleStripeEvent } from "@/server/payments/webhook";

/**
 * Stripe webhook endpoint.
 *
 * Unauthenticated by necessity — Stripe has no session — so the signature is
 * the only thing standing between this handler and an attacker marking their
 * own booking paid. Nothing is trusted before `constructEvent` succeeds.
 */
export async function POST(request: Request) {
  if (!paymentsConfigured(serverEnv())) {
    // Refuse rather than 200: silently accepting events we cannot verify
    // would hide a misconfigured deployment behind a healthy-looking log.
    return NextResponse.json(
      { error: "Payments are not configured." },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  // The raw body, byte for byte: the signature covers exactly what Stripe
  // sent, so parsing and re-serializing would invalidate it.
  const payload = await request.text();

  let event;
  try {
    event = stripeGateway().constructEvent(payload, signature);
  } catch (error) {
    console.warn("[stripe] rejected an unverified webhook:", error);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    const outcome = await handleStripeEvent(event);
    // Always 200 once verified: a non-2xx makes Stripe retry, and retrying
    // will not fix an event we simply do not act on.
    return NextResponse.json({ received: true, outcome });
  } catch (error) {
    console.error(`[stripe] failed to handle ${event.type}:`, error);
    // A genuine failure *should* be retried, so this one is a 500.
    return NextResponse.json(
      { error: "Failed to process event." },
      { status: 500 },
    );
  }
}
